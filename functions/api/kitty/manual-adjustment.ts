import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as { amount: number; description: string; notes?: string };
  if (!body.description) return json({ error: 'description required' }, 400);
  if (typeof body.amount !== 'number') return json({ error: 'amount required' }, 400);
  const r = await ctx.env.DB.prepare(`INSERT INTO kitty_transactions (type, amount, description, notes, created_by) VALUES ('manual_adjustment', ?, ?, ?, 'admin') RETURNING *`).bind(body.amount, body.description, body.notes ?? null).first();
  return json(r, 201);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
