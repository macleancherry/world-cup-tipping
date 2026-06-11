import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const md = await ctx.env.DB.prepare(`
    SELECT md.*, p.name as assigned_participant_name FROM match_days md
    LEFT JOIN participants p ON md.assigned_participant_id = p.id
    WHERE md.id = ?
  `).bind(ctx.params.id).first();
  if (!md) return json({ error: 'Not found' }, 404);

  const fixtures = await ctx.env.DB.prepare('SELECT * FROM fixtures WHERE kickoff_local_date = ? ORDER BY kickoff_utc').bind((md as Record<string, unknown>).local_date).all();
  const bets = await ctx.env.DB.prepare(`SELECT b.*, p.name as participant_name FROM bets b LEFT JOIN participants p ON b.participant_id = p.id WHERE b.match_day_id = ? ORDER BY b.created_at DESC`).bind(ctx.params.id).all();

  return json({ ...md, fixtures: fixtures.results, bets: bets.results });
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as Record<string, unknown>;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.assigned_participant_id !== undefined) { fields.push('assigned_participant_id = ?'); values.push(body.assigned_participant_id); }
  if (body.budget_amount !== undefined) { fields.push('budget_amount = ?'); values.push(body.budget_amount); }
  if (body.notes !== undefined) { fields.push('notes = ?'); values.push(body.notes); }
  if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
  if (!fields.length) return json({ error: 'Nothing to update' }, 400);
  fields.push("updated_at = datetime('now')");
  values.push(ctx.params.id);
  const r = await ctx.env.DB.prepare(`UPDATE match_days SET ${fields.join(', ')} WHERE id = ? RETURNING *`).bind(...values).first();
  return json(r);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
