import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const row = await ctx.env.DB.prepare('SELECT * FROM fixtures WHERE id = ?').bind(ctx.params.id).first();
  if (!row) return json({ error: 'Not found' }, 404);
  return json(row);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
