import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

interface FixtureRow {
  id: number;
  home_team: string;
  away_team: string;
  kickoff_utc: string;
  stage: string | null;
  group_name: string | null;
  venue: string | null;
  city: string | null;
}

interface ResultRow {
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  kickoff_utc: string;
}

const HOST_NATIONS = ['United States', 'USA', 'United States of America', 'Canada', 'Mexico'];

function isHostNation(team: string): boolean {
  return HOST_NATIONS.some(h => team.toLowerCase().includes(h.toLowerCase()));
}

async function fetchTeamForms(db: D1Database, teams: string[]): Promise<Map<string, string>> {
  const formMap = new Map<string, string>();
  for (const team of teams) {
    const rows = await db.prepare(`
      SELECT home_team, away_team, home_score, away_score, kickoff_utc
      FROM fixtures
      WHERE status = 'finished' AND (home_team = ? OR away_team = ?)
      ORDER BY kickoff_utc DESC LIMIT 4
    `).bind(team, team).all<ResultRow>();

    if (!rows.results.length) {
      formMap.set(team, 'No results yet in this tournament');
    } else {
      const lines = rows.results.map(r => {
        const isHome = r.home_team === team;
        const opp = isHome ? r.away_team : r.home_team;
        const gs = isHome ? (r.home_score ?? '?') : (r.away_score ?? '?');
        const ga = isHome ? (r.away_score ?? '?') : (r.home_score ?? '?');
        const won = typeof gs === 'number' && typeof ga === 'number' && gs > ga;
        const drew = typeof gs === 'number' && typeof ga === 'number' && gs === ga;
        const tag = won ? 'W' : drew ? 'D' : 'L';
        return `${tag} ${gs}–${ga} vs ${opp}`;
      });
      formMap.set(team, lines.join(', '));
    }
  }
  return formMap;
}

function buildPrompt(fixtures: FixtureRow[], tz: string, formMap: Map<string, string>): string {
  const matchLines = fixtures.map((f, i) => {
    const kickoff = new Date(f.kickoff_utc).toLocaleString('en-AU', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
      timeZone: tz,
    });
    const homeIsHost = isHostNation(f.home_team);
    const awayIsHost = isHostNation(f.away_team);
    const hostNote = homeIsHost
      ? ` (${f.home_team} have genuine home advantage as a host nation)`
      : awayIsHost
        ? ` (${f.away_team} have crowd support as a host nation)`
        : ' (neither team has home advantage — "home" is scheduling order only)';

    const venue = f.city ? ` at ${f.city}` : '';
    const stage = f.stage ? ` — ${f.stage}${f.group_name ? ` ${f.group_name}` : ''}` : '';

    const homeForm = formMap.get(f.home_team) ?? 'Unknown';
    const awayForm = formMap.get(f.away_team) ?? 'Unknown';

    return [
      `${fixtures.length > 1 ? `Match ${i + 1}: ` : ''}**${f.home_team} vs ${f.away_team}**${stage}${venue}, ${kickoff}${hostNote}`,
      `2026 WC form — ${f.home_team}: ${homeForm} | ${f.away_team}: ${awayForm}`,
    ].join('\n');
  }).join('\n\n');

  const matchWord = fixtures.length === 1 ? 'this match' : 'these matches';

  return `You are a football betting analyst for a group of mates betting on the 2026 FIFA World Cup.

KEY CONTEXT — 2026 World Cup hosting:
The 2026 FIFA World Cup is co-hosted by the United States, Canada, and Mexico. ALL games are played at host nation venues. The "home team" label in fixtures is purely a scheduling designation — it does NOT mean home advantage. ONLY the three host nations have genuine crowd support.

Analyse ${matchWord}:

${matchLines}

For each match provide:
**Head-to-head** — recent meetings, patterns.
**Form & key players** — squad quality, notable names. Use the tournament form above as a starting point.
**Injury / suspension concerns** — any known absences.
**Recommended bets** — top 2–3 specific suggestions (match result, over/under goals, BTTS, etc.) with brief reasoning and rough odds guidance. Use actual team names, not "home" or "away".
**Confidence** — High / Medium / Low and why.

Keep it concise and practical. We're a group of mates sharing a betting kitty.`;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as { fixture_ids: number[] };

  if (!body.fixture_ids?.length) {
    return new Response(JSON.stringify({ error: 'fixture_ids required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const placeholders = body.fixture_ids.map(() => '?').join(',');
  const result = await ctx.env.DB.prepare(
    `SELECT id, home_team, away_team, kickoff_utc, stage, group_name, venue, city FROM fixtures WHERE id IN (${placeholders}) ORDER BY kickoff_utc`
  ).bind(...body.fixture_ids).all<FixtureRow>();

  if (!result.results.length) {
    return new Response(JSON.stringify({ error: 'No fixtures found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const teams = [...new Set(result.results.flatMap(f => [f.home_team, f.away_team]))];
  const formMap = await fetchTeamForms(ctx.env.DB, teams);

  const tz = ctx.env.TIMEZONE || 'Australia/Perth';
  const prompt = buildPrompt(result.results, tz, formMap);

  try {
    const stream = await ctx.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as Parameters<Ai['run']>[0], {
      messages: [
        { role: 'system', content: 'You are a concise football betting analyst. Give practical, specific advice. Use markdown bold for section headers.' },
        { role: 'user', content: prompt },
      ],
      stream: true,
      max_tokens: 2048,
    } as AiTextGenerationInput);

    return new Response(stream as ReadableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
