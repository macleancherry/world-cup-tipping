import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const betId = ctx.params.id;
  const bet = await ctx.env.DB.prepare('SELECT * FROM bets WHERE id = ?').bind(betId).first() as Record<string, unknown> | null;
  if (!bet) return json({ error: 'Not found' }, 404);
  if (bet.settlement_status === 'pending') return json({ error: 'Bet is not settled' }, 400);

  await ctx.env.DB.prepare(`
    UPDATE kitty_transactions SET amount = -amount, description = '[REVERSED] ' || description
    WHERE bet_id = ? AND type IN ('bet_return', 'bet_void_refund', 'cashout_return') AND amount >= 0
  `).bind(betId).run();

  await ctx.env.DB.prepare(`
    UPDATE bets SET settlement_status = 'pending', actual_return = NULL, settled_at = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).bind(betId).run();

  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
