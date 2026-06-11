import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

interface FixtureSeed {
  matchNumber: number;
  stage: string;
  groupName: string | null;
  roundName: string | null;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string;
  venue: string | null;
  city: string | null;
  externalProviderId: string | null;
}

function toLocalDate(utcString: string, tz = 'Australia/Perth'): string {
  const d = new Date(utcString);
  return d.toLocaleDateString('en-CA', { timeZone: tz });
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as { fixtures: FixtureSeed[] };
  if (!Array.isArray(body.fixtures)) return json({ error: 'fixtures array required' }, 400);

  const tz = ctx.env.TIMEZONE || 'Australia/Perth';
  let inserted = 0;
  let skipped = 0;

  for (const f of body.fixtures) {
    const localDate = toLocalDate(f.kickoffUtc, tz);
    try {
      await ctx.env.DB.prepare(`
        INSERT OR IGNORE INTO fixtures (match_number, external_provider_id, stage, group_name, round_name, home_team, away_team, kickoff_utc, kickoff_local_date, venue, city)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(f.matchNumber, f.externalProviderId, f.stage, f.groupName, f.roundName, f.homeTeam, f.awayTeam, f.kickoffUtc, localDate, f.venue, f.city).run();

      await ctx.env.DB.prepare(`INSERT OR IGNORE INTO match_days (local_date, stage, budget_amount) VALUES (?, ?, 500)`)
        .bind(localDate, f.stage).run();

      inserted++;
    } catch {
      skipped++;
    }
  }

  return json({ inserted, skipped });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
