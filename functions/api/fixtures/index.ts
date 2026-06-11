import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const date = url.searchParams.get('date');
  const stage = url.searchParams.get('stage');

  let query = 'SELECT * FROM fixtures WHERE 1=1';
  const params: unknown[] = [];
  if (date) { query += ' AND kickoff_local_date = ?'; params.push(date); }
  if (stage) { query += ' AND stage = ?'; params.push(stage); }
  query += ' ORDER BY kickoff_utc';

  const rows = await ctx.env.DB.prepare(query).bind(...params).all();
  return json(rows.results);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
