import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_middleware';

interface OddsEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Array<{
    key: string;
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price: number; point?: number }>;
    }>;
  }>;
}

// Normalise team names for fuzzy matching across data sources
const ALIASES: Record<string, string> = {
  'usa': 'united states',
  'united states of america': 'united states',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'ir iran': 'iran',
  'ivory coast': 'cote divoire',
  "cote d'ivoire": 'cote divoire',
  'côte divoire': 'cote divoire',
  'china pr': 'china',
  'trinidad & tobago': 'trinidad and tobago',
}

function norm(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
  return ALIASES[n] ?? n
}

function teamsMatch(a: string, b: string): boolean {
  const na = norm(a)
  const nb = norm(b)
  if (na === nb) return true
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  return shorter.length >= 4 && longer.includes(shorter)
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.ODDS_API_KEY) {
    return json({ available: false, reason: 'ODDS_API_KEY not configured' });
  }

  const id = ctx.params.id as string;
  const fixture = await ctx.env.DB.prepare(
    'SELECT id, home_team, away_team, kickoff_utc FROM fixtures WHERE id = ?'
  ).bind(id).first<{ id: number; home_team: string; away_team: string; kickoff_utc: string }>();

  if (!fixture) return json({ available: false, reason: 'Fixture not found' }, 404);

  // Fetch odds in a ±3h window around kickoff to limit credits used
  const kickoff = new Date(fixture.kickoff_utc);
  const from = new Date(kickoff.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const to   = new Date(kickoff.getTime() + 3 * 60 * 60 * 1000).toISOString();

  const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds` +
    `?apiKey=${ctx.env.ODDS_API_KEY}` +
    `&regions=au&markets=h2h,totals&bookmakers=sportsbet` +
    `&commenceTimeFrom=${from}&commenceTimeTo=${to}`;

  let events: OddsEvent[];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      return json({ available: false, reason: `Odds API error ${res.status}: ${body}` });
    }
    events = await res.json() as OddsEvent[];
  } catch (e) {
    return json({ available: false, reason: `Network error: ${(e as Error).message}` });
  }

  // Find the matching event
  const event = events.find(e =>
    (teamsMatch(e.home_team, fixture.home_team) && teamsMatch(e.away_team, fixture.away_team)) ||
    (teamsMatch(e.home_team, fixture.away_team) && teamsMatch(e.away_team, fixture.home_team))
  );

  if (!event) {
    return json({ available: false, reason: 'No Sportsbet odds found for this fixture yet' });
  }

  const sb = event.bookmakers.find(b => b.key === 'sportsbet');
  if (!sb) return json({ available: false, reason: 'Sportsbet not offering this game yet' });

  // Determine if teams are flipped (The Odds API may list home/away differently)
  const flipped = teamsMatch(event.home_team, fixture.away_team);

  const result: Record<string, number | string | boolean> = { available: true };

  const h2h = sb.markets.find(m => m.key === 'h2h');
  if (h2h) {
    for (const o of h2h.outcomes) {
      if (teamsMatch(o.name, 'draw')) {
        result.draw = o.price;
      } else if (teamsMatch(o.name, event.home_team)) {
        result[flipped ? 'away_win' : 'home_win'] = o.price;
      } else if (teamsMatch(o.name, event.away_team)) {
        result[flipped ? 'home_win' : 'away_win'] = o.price;
      }
    }
  }

  const totals = sb.markets.find(m => m.key === 'totals');
  if (totals) {
    const over  = totals.outcomes.find(o => o.name === 'Over');
    const under = totals.outcomes.find(o => o.name === 'Under');
    if (over)  { result.over_goals  = over.price;  result.goals_line = over.point ?? 2.5; }
    if (under) { result.under_goals = under.price; }
  }

  return json(result);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
