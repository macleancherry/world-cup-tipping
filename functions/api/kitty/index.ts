import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  const balanceRow = await db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM kitty_transactions').first<{ total: number }>();
  const settings = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const s: Record<string, string> = {};
  for (const r of settings.results) s[r.key] = r.value;

  const stakeRow = await db.prepare("SELECT COALESCE(SUM(ABS(amount)),0) as total FROM kitty_transactions WHERE type='stake_placed'").first<{ total: number }>();
  const returnRow = await db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM kitty_transactions WHERE type IN ('bet_return','bet_void_refund','cashout_return')").first<{ total: number }>();
  const pendingRow = await db.prepare("SELECT COUNT(*) as cnt FROM bets WHERE settlement_status='pending'").first<{ cnt: number }>();

  return json({
    balance: balanceRow?.total ?? 0,
    starting_kitty: parseInt(s.starting_kitty ?? '20000'),
    total_staked: stakeRow?.total ?? 0,
    total_returned: returnRow?.total ?? 0,
    pending_bets_count: pendingRow?.cnt ?? 0,
  });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
