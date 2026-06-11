import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const id = ctx.params.id;
  const body = await ctx.request.json() as Record<string, unknown>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.initials !== undefined) { fields.push('initials = ?'); values.push(body.initials); }
  if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0); }
  if (body.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(body.sort_order); }
  if (!fields.length) return json({ error: 'Nothing to update' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(id);
  const r = await ctx.env.DB.prepare(`UPDATE participants SET ${fields.join(', ')} WHERE id = ? RETURNING *`).bind(...values).first();
  return json(r);
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const id = ctx.params.id;
  await ctx.env.DB.prepare('DELETE FROM participants WHERE id = ?').bind(id).run();
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
