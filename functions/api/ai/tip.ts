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

interface OddsRow {
  fixture_id: number;
  odds_json: string;
}

interface OddsData {
  available?: boolean;
  home_win?: number;
  draw?: number;
  away_win?: number;
  over_goals?: number;
  under_goals?: number;
  goals_line?: number;
  home_spread?: number;
  away_spread?: number;
  home_spread_line?: number;
  away_spread_line?: number;
  btts_yes?: number;
  btts_no?: number;
  home_or_draw?: number;
  away_or_draw?: number;
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

function formatOdds(odds: OddsData, homeTeam: string, awayTeam: string): string {
  const lines: string[] = [];
  if (odds.home_win)   lines.push(`${homeTeam} win @ ${odds.home_win.toFixed(2)}`);
  if (odds.draw)       lines.push(`Draw @ ${odds.draw.toFixed(2)}`);
  if (odds.away_win)   lines.push(`${awayTeam} win @ ${odds.away_win.toFixed(2)}`);
  if (odds.over_goals)  lines.push(`Over ${odds.goals_line ?? 2.5} goals @ ${odds.over_goals.toFixed(2)}`);
  if (odds.under_goals) lines.push(`Under ${odds.goals_line ?? 2.5} goals @ ${odds.under_goals.toFixed(2)}`);
  if (odds.home_spread != null && odds.home_spread_line != null)
    lines.push(`${homeTeam} ${odds.home_spread_line >= 0 ? '+' : ''}${odds.home_spread_line} @ ${odds.home_spread.toFixed(2)}`);
  if (odds.away_spread != null && odds.away_spread_line != null)
    lines.push(`${awayTeam} ${odds.away_spread_line >= 0 ? '+' : ''}${odds.away_spread_line} @ ${odds.away_spread.toFixed(2)}`);
  if (odds.btts_yes)   lines.push(`BTTS Yes @ ${odds.btts_yes.toFixed(2)}`);
  if (odds.btts_no)    lines.push(`BTTS No @ ${odds.btts_no.toFixed(2)}`);
  return lines.length ? lines.join(' | ') : 'No Sportsbet odds available yet';
}

function buildPrompt(fixtures: FixtureRow[], tz: string, formMap: Map<string, string>, oddsMap: Map<number, OddsData>): string {
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
    const odds = oddsMap.get(f.id);
    const oddsLine = odds ? formatOdds(odds, f.home_team, f.away_team) : 'No Sportsbet odds available yet';

    return [
      `${fixtures.length > 1 ? `Match ${i + 1}: ` : ''}**${f.home_team} vs ${f.away_team}**${stage}${venue}, ${kickoff}${hostNote}`,
      `2026 WC form — ${f.home_team}: ${homeForm} | ${f.away_team}: ${awayForm}`,
      `Sportsbet odds: ${oddsLine}`,
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
**Recommended bets** — top 2–3 specific suggestions using the ACTUAL Sportsbet odds listed above. Reference the real prices (e.g. "Canada to win @ 2.10"). Prioritise bets where you see value relative to the true probability. Use actual team names, not "home" or "away".
**Confidence** — High / Medium / Low and why.

Keep it concise and practical. We're a group of mates sharing a betting kitty.`;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  const body = await ctx.request.json() as { fixture_ids: number[] };

  if (!body.fixture_ids?.length) {
    return new Response(JSON.stringify({ error: 'fixture_ids required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const placeholders = body.fixture_ids.map(() => '?').join(',');
  const result = await db.prepare(
    `SELECT id, home_team, away_team, kickoff_utc, stage, group_name, venue, city FROM fixtures WHERE id IN (${placeholders}) ORDER BY kickoff_utc`
  ).bind(...body.fixture_ids).all<FixtureRow>();

  if (!result.results.length) {
    return new Response(JSON.stringify({ error: 'No fixtures found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const teams = [...new Set(result.results.flatMap(f => [f.home_team, f.away_team]))];
  const formMap = await fetchTeamForms(db, teams);

  // Load Sportsbet odds for each fixture — fetch live if not cached
  const oddsMap = new Map<number, OddsData>();
  await db.prepare(`CREATE TABLE IF NOT EXISTS odds_cache (
    fixture_id INTEGER PRIMARY KEY, odds_json TEXT NOT NULL,
    fetch_count INTEGER NOT NULL DEFAULT 0, fetched_at TEXT NOT NULL
  )`).run();

  for (const f of result.results) {
    // Try cache first
    const row = await db.prepare('SELECT odds_json FROM odds_cache WHERE fixture_id = ?')
      .bind(f.id).first<{ odds_json: string }>();
    if (row) {
      try {
        const parsed = JSON.parse(row.odds_json) as OddsData;
        if (parsed.available) { oddsMap.set(f.id, parsed); continue; }
      } catch { /* fall through to live fetch */ }
    }
    // Nothing usable in cache — call the odds endpoint to fetch and cache
    try {
      const oddsUrl = new URL(`/api/fixtures/${f.id}/odds`, ctx.request.url);
      const r = await fetch(oddsUrl.toString());
      if (r.ok) {
        const data = await r.json() as OddsData;
        if (data.available) oddsMap.set(f.id, data);
      }
    } catch { /* odds unavailable — AI will note this */ }
  }

  const tz = ctx.env.TIMEZONE || 'Australia/Perth';
  const prompt = buildPrompt(result.results, tz, formMap, oddsMap);

  try {
    const stream = await ctx.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as Parameters<Ai['run']>[0], {
      messages: [
        { role: 'system', content: 'You are a concise football betting analyst. Give practical, specific advice using the real Sportsbet odds provided. Always cite the actual odds price when recommending a bet. Use markdown bold for section headers.' },
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
