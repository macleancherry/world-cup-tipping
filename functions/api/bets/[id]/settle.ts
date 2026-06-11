import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const betId = ctx.params.id;
  const bet = await ctx.env.DB.prepare('SELECT * FROM bets WHERE id = ?').bind(betId).first() as Record<string, unknown> | null;
  if (!bet) return json({ error: 'Not found' }, 404);
  if (bet.settlement_status !== 'pending') return json({ error: 'Bet already settled' }, 400);

  const body = await ctx.request.json() as {
    status: 'won' | 'lost' | 'void' | 'cashed_out';
    actual_return?: number;
    notes?: string;
  };

  if (!['won', 'lost', 'void', 'cashed_out'].includes(body.status)) {
    return json({ error: 'Invalid status' }, 400);
  }
  if (body.status === 'cashed_out' && body.actual_return === undefined) {
    return json({ error: 'actual_return required for cashed_out' }, 400);
  }

  let actualReturn = 0;
  let txType = 'bet_return';
  let txDesc = '';

  if (body.status === 'won') {
    actualReturn = body.actual_return ?? (bet.potential_return as number);
    txType = 'bet_return';
    txDesc = `Win return: ${bet.title}`;
  } else if (body.status === 'lost') {
    actualReturn = 0;
    txType = 'bet_return';
    txDesc = `Loss: ${bet.title}`;
  } else if (body.status === 'void') {
    actualReturn = bet.stake_amount as number;
    txType = 'bet_void_refund';
    txDesc = `Void refund: ${bet.title}`;
  } else if (body.status === 'cashed_out') {
    actualReturn = body.actual_return!;
    txType = 'cashout_return';
    txDesc = `Cashout return: ${bet.title}`;
  }

  await ctx.env.DB.prepare(`
    UPDATE bets SET settlement_status = ?, actual_return = ?, settled_at = datetime('now'), notes = COALESCE(?, notes), updated_at = datetime('now')
    WHERE id = ?
  `).bind(body.status, actualReturn, body.notes ?? null, betId).run();

  await ctx.env.DB.prepare(`
    INSERT INTO kitty_transactions (type, bet_id, amount, description, created_by)
    VALUES (?, ?, ?, ?, 'system')
  `).bind(txType, betId, actualReturn, txDesc).run();

  const updated = await ctx.env.DB.prepare('SELECT * FROM bets WHERE id = ?').bind(betId).first();
  return json(updated);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
