import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const bet = await ctx.env.DB.prepare(`SELECT b.*, p.name as participant_name FROM bets b LEFT JOIN participants p ON b.participant_id = p.id WHERE b.id = ?`).bind(ctx.params.id).first();
  if (!bet) return json({ error: 'Not found' }, 404);
  const fixtures = await ctx.env.DB.prepare('SELECT f.* FROM bet_fixture_links bfl JOIN fixtures f ON f.id = bfl.fixture_id WHERE bfl.bet_id = ?').bind(ctx.params.id).all();
  return json({ ...bet, fixtures: fixtures.results });
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const bet = await ctx.env.DB.prepare('SELECT * FROM bets WHERE id = ?').bind(ctx.params.id).first() as Record<string, unknown> | null;
  if (!bet) return json({ error: 'Not found' }, 404);
  if (bet.settlement_status !== 'pending') return json({ error: 'Cannot edit settled bet' }, 400);

  const body = await ctx.request.json() as Record<string, unknown>;
  const fields: string[] = [];
  const values: unknown[] = [];
  const editable = ['title', 'description', 'bet_type', 'market_type', 'market_params_json', 'bookmaker', 'notes'];
  for (const k of editable) {
    if (body[k] !== undefined) { fields.push(`${k} = ?`); values.push(body[k]); }
  }

  let newStake = bet.stake_amount as number;
  let newOdds = bet.odds_decimal as number;
  if (body.stake_amount !== undefined) {
    newStake = body.stake_amount as number;
    fields.push('stake_amount = ?'); values.push(newStake);
    const diff = newStake - (bet.stake_amount as number);
    if (diff !== 0) {
      await ctx.env.DB.prepare(`UPDATE kitty_transactions SET amount = amount + ? WHERE bet_id = ? AND type = 'stake_placed'`).bind(-diff, ctx.params.id).run();
    }
  }
  if (body.odds_decimal !== undefined) { newOdds = body.odds_decimal as number; fields.push('odds_decimal = ?'); values.push(newOdds); }

  if (body.stake_amount !== undefined || body.odds_decimal !== undefined) {
    const pr = Math.round(newStake * newOdds);
    fields.push('potential_return = ?'); values.push(pr);
    fields.push('potential_profit = ?'); values.push(pr - newStake);
  }

  if (!fields.length) return json({ error: 'Nothing to update' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(ctx.params.id);
  const updated = await ctx.env.DB.prepare(`UPDATE bets SET ${fields.join(', ')} WHERE id = ? RETURNING *`).bind(...values).first();
  return json(updated);
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const bet = await ctx.env.DB.prepare('SELECT * FROM bets WHERE id = ?').bind(ctx.params.id).first() as Record<string, unknown> | null;
  if (!bet) return json({ error: 'Not found' }, 404);
  if (bet.settlement_status !== 'pending') return json({ error: 'Cannot delete settled bet' }, 400);

  await ctx.env.DB.prepare(`UPDATE kitty_transactions SET amount = ?, description = '[REVERSED] ' || description WHERE bet_id = ? AND type = 'stake_placed'`).bind(bet.stake_amount, ctx.params.id).run();
  await ctx.env.DB.prepare('DELETE FROM bets WHERE id = ?').bind(ctx.params.id).run();
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
