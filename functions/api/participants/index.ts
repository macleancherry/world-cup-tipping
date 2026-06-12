import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';
import { recalculateRoster } from '../_roster';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const rows = await ctx.env.DB.prepare('SELECT * FROM participants ORDER BY sort_order, created_at').all();
  return json(rows.results);
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  const body = await ctx.request.json() as { name: string; initials?: string };
  if (!body.name) return json({ error: 'Name required' }, 400);
  const initials = body.initials || body.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 3);
  // New participants go at the end of the rotation
  const maxRow = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) as m FROM participants').first<{ m: number }>();
  const sortOrder = (maxRow?.m ?? 0) + 1;
  const r = await db.prepare(
    'INSERT INTO participants (name, initials, sort_order) VALUES (?, ?, ?) RETURNING *'
  ).bind(body.name, initials, sortOrder).first();
  await recalculateRoster(db);
  return json(r, 201);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
