import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';
import { ensureContributionsTable } from '../_roster';

// POST { participant_id, amount, note? }
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  await ensureContributionsTable(db);
  const body = await ctx.request.json() as { participant_id: number; amount: number; note?: string };
  if (!body.participant_id || !body.amount) return json({ error: 'participant_id and amount required' }, 400);
  const row = await db.prepare(
    'INSERT INTO contributions (participant_id, amount, note) VALUES (?, ?, ?) RETURNING *'
  ).bind(body.participant_id, body.amount, body.note ?? null).first();
  return json(row, 201);
};

// DELETE ?id=X
export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  const id = new URL(ctx.request.url).searchParams.get('id');
  if (!id) return json({ error: 'id required' }, 400);
  await db.prepare('DELETE FROM contributions WHERE id = ?').bind(Number(id)).run();
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
