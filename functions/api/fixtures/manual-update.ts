import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as {
    id: number;
    status?: string;
    home_score?: number | null;
    away_score?: number | null;
    winner?: string | null;
  };

  if (!body.id) return json({ error: 'id required' }, 400);

  const fields: string[] = ["last_synced_at = datetime('now')", "updated_at = datetime('now')"];
  const values: unknown[] = [];
  if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
  if (body.home_score !== undefined) { fields.push('home_score = ?'); values.push(body.home_score); }
  if (body.away_score !== undefined) { fields.push('away_score = ?'); values.push(body.away_score); }
  if (body.winner !== undefined) { fields.push('winner = ?'); values.push(body.winner); }

  values.push(body.id);
  await ctx.env.DB.prepare(`UPDATE fixtures SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

  const updated = await ctx.env.DB.prepare('SELECT * FROM fixtures WHERE id = ?').bind(body.id).first();
  return json(updated);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
