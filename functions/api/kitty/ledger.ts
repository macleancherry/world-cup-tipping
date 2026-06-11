import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const rows = await ctx.env.DB.prepare('SELECT kt.*, b.title as bet_title FROM kitty_transactions kt LEFT JOIN bets b ON kt.bet_id = b.id ORDER BY kt.created_at DESC LIMIT 200').all();
  return json(rows.results);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
