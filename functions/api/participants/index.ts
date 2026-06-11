import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const rows = await ctx.env.DB.prepare('SELECT * FROM participants ORDER BY sort_order, name').all();
  return json(rows.results);
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as { name: string; initials?: string; sort_order?: number };
  if (!body.name) return json({ error: 'Name required' }, 400);
  const initials = body.initials || body.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 3);
  const r = await ctx.env.DB.prepare(
    'INSERT INTO participants (name, initials, sort_order) VALUES (?, ?, ?) RETURNING *'
  ).bind(body.name, initials, body.sort_order ?? 0).first();
  return json(r, 201);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
