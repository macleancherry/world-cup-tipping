import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from './_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as Record<string, unknown>;
  if (!body.version || !Array.isArray(body.bets)) {
    return json({ error: 'Invalid backup format' }, 400);
  }
  const db = ctx.env.DB;
  await db.batch([
    db.prepare('DELETE FROM kitty_transactions'),
    db.prepare('DELETE FROM bet_fixture_links'),
    db.prepare('DELETE FROM bets'),
    db.prepare('DELETE FROM match_days'),
    db.prepare('DELETE FROM fixtures'),
    db.prepare('DELETE FROM participants'),
  ]);

  const counts = { participants: 0, fixtures: 0, match_days: 0, bets: 0, transactions: 0 };

  for (const p of (body.participants as Record<string, unknown>[])) {
    await db.prepare('INSERT INTO participants (id, name, initials, active, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?)').bind(p.id, p.name, p.initials, p.active, p.sort_order, p.created_at, p.updated_at).run();
    counts.participants++;
  }
  for (const f of (body.fixtures as Record<string, unknown>[])) {
    await db.prepare('INSERT INTO fixtures (id, match_number, external_provider_id, stage, group_name, round_name, home_team, away_team, kickoff_utc, kickoff_local_date, venue, city, status, home_score, away_score, winner, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(f.id, f.match_number, f.external_provider_id, f.stage, f.group_name, f.round_name, f.home_team, f.away_team, f.kickoff_utc, f.kickoff_local_date, f.venue, f.city, f.status, f.home_score, f.away_score, f.winner, f.created_at, f.updated_at).run();
    counts.fixtures++;
  }

  return json({ ok: true, counts });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
