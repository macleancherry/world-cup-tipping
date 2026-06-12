import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_middleware';

const CACHE_TTL_MS   = 60 * 60 * 1000;  // 1 hour
const MAX_FETCHES    = 5;                // per fixture, lifetime

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

interface CacheRow {
  fixture_id: number;
  odds_json: string;
  fetch_count: number;
  fetched_at: string;
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
  const db = ctx.env.DB;

  // Ensure cache table exists (self-initialising, no manual migration needed)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS odds_cache (
      fixture_id  INTEGER PRIMARY KEY,
      odds_json   TEXT    NOT NULL,
      fetch_count INTEGER NOT NULL DEFAULT 0,
      fetched_at  TEXT    NOT NULL
    )
  `).run();

  if (!ctx.env.ODDS_API_KEY) {
    return json({ available: false, reason: 'ODDS_API_KEY not configured' });
  }

  const id = ctx.params.id as string;
  const fixture = await db.prepare(
    'SELECT id, home_team, away_team, kickoff_utc FROM fixtures WHERE id = ?'
  ).bind(id).first<{ id: number; home_team: string; away_team: string; kickoff_utc: string }>();

  if (!fixture) return json({ available: false, reason: 'Fixture not found' }, 404);

  // Check cache
  const cached = await db.prepare('SELECT * FROM odds_cache WHERE fixture_id = ?')
    .bind(fixture.id).first<CacheRow>();

  const now = Date.now();
  const ageMs = cached ? now - new Date(cached.fetched_at).getTime() : Infinity;
  const isFresh = ageMs < CACHE_TTL_MS;
  const maxReached = cached != null && cached.fetch_count >= MAX_FETCHES;

  // Return cache if still fresh, or if we've hit the fetch cap
  if (cached && (isFresh || maxReached)) {
    return json({
      ...JSON.parse(cached.odds_json),
      fetch_count: cached.fetch_count,
      max_fetches: MAX_FETCHES,
      max_reached: maxReached,
      fetched_at: cached.fetched_at,
      from_cache: true,
    });
  }

  // --- Live fetch ---
  const kickoff = new Date(fixture.kickoff_utc);
  const isoZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const from = isoZ(new Date(kickoff.getTime() - 3 * 60 * 60 * 1000));
  const to   = isoZ(new Date(kickoff.getTime() + 3 * 60 * 60 * 1000));

  const url = `https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds` +
    `?apiKey=${ctx.env.ODDS_API_KEY}` +
    `&regions=au&markets=h2h,totals&bookmakers=sportsbet` +
    `&commenceTimeFrom=${from}&commenceTimeTo=${to}`;

  let events: OddsEvent[];
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      // If we have a stale cache, better to return it than an error
      if (cached) {
        return json({
          ...JSON.parse(cached.odds_json),
          fetch_count: cached.fetch_count,
          max_fetches: MAX_FETCHES,
          max_reached: maxReached,
          fetched_at: cached.fetched_at,
          from_cache: true,
          stale: true,
        });
      }
      const msg = (() => { try { return (JSON.parse(body) as { message?: string }).message ?? body } catch { return body } })()
      return json({ available: false, reason: `Odds unavailable (${res.status}): ${msg}` });
    }
    events = await res.json() as OddsEvent[];
  } catch (e) {
    if (cached) {
      return json({
        ...JSON.parse(cached.odds_json),
        fetch_count: cached.fetch_count,
        max_fetches: MAX_FETCHES,
        fetched_at: cached.fetched_at,
        from_cache: true,
        stale: true,
      });
    }
    return json({ available: false, reason: `Network error: ${(e as Error).message}` });
  }

  const event = events.find(e =>
    (teamsMatch(e.home_team, fixture.home_team) && teamsMatch(e.away_team, fixture.away_team)) ||
    (teamsMatch(e.home_team, fixture.away_team) && teamsMatch(e.away_team, fixture.home_team))
  );

  if (!event) {
    if (cached) {
      return json({
        ...JSON.parse(cached.odds_json),
        fetch_count: cached.fetch_count,
        max_fetches: MAX_FETCHES,
        fetched_at: cached.fetched_at,
        from_cache: true,
        stale: true,
      });
    }
    return json({ available: false, reason: 'No Sportsbet odds found for this fixture yet' });
  }

  const sb = event.bookmakers.find(b => b.key === 'sportsbet');
  if (!sb) {
    if (cached) {
      return json({
        ...JSON.parse(cached.odds_json),
        fetch_count: cached.fetch_count,
        max_fetches: MAX_FETCHES,
        fetched_at: cached.fetched_at,
        from_cache: true,
        stale: true,
      });
    }
    return json({ available: false, reason: 'Sportsbet not offering this game yet' });
  }

  const flipped = teamsMatch(event.home_team, fixture.away_team);
  const oddsPayload: Record<string, number | boolean> = { available: true };

  const h2h = sb.markets.find(m => m.key === 'h2h');
  if (h2h) {
    for (const o of h2h.outcomes) {
      if (teamsMatch(o.name, 'draw')) {
        oddsPayload.draw = o.price;
      } else if (teamsMatch(o.name, event.home_team)) {
        oddsPayload[flipped ? 'away_win' : 'home_win'] = o.price;
      } else if (teamsMatch(o.name, event.away_team)) {
        oddsPayload[flipped ? 'home_win' : 'away_win'] = o.price;
      }
    }
  }

  const totals = sb.markets.find(m => m.key === 'totals');
  if (totals) {
    const over  = totals.outcomes.find(o => o.name === 'Over');
    const under = totals.outcomes.find(o => o.name === 'Under');
    if (over)  { oddsPayload.over_goals  = over.price;  oddsPayload.goals_line = over.point ?? 2.5; }
    if (under) { oddsPayload.under_goals = under.price; }
  }

  // btts: outcomes named "Yes" / "No"
  const btts = sb.markets.find(m => m.key === 'btts');
  if (btts) {
    const yes = btts.outcomes.find(o => o.name.toLowerCase() === 'yes');
    const no  = btts.outcomes.find(o => o.name.toLowerCase() === 'no');
    if (yes) oddsPayload.btts_yes = yes.price;
    if (no)  oddsPayload.btts_no  = no.price;
  }

  // double_chance: outcome name matches a team = that team wins or draws;
  // "No Draw" = either team wins (not a market we track, skip it)
  const dc = sb.markets.find(m => m.key === 'double_chance');
  if (dc) {
    for (const o of dc.outcomes) {
      if (o.name.toLowerCase() === 'no draw') continue;
      if (teamsMatch(o.name, event.home_team)) {
        oddsPayload[flipped ? 'away_or_draw' : 'home_or_draw'] = o.price;
      } else if (teamsMatch(o.name, event.away_team)) {
        oddsPayload[flipped ? 'home_or_draw' : 'away_or_draw'] = o.price;
      }
    }
  }

  // Upsert cache
  const newCount = (cached?.fetch_count ?? 0) + 1;
  const fetchedAt = new Date().toISOString();
  await db.prepare(`
    INSERT INTO odds_cache (fixture_id, odds_json, fetch_count, fetched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (fixture_id) DO UPDATE SET
      odds_json = excluded.odds_json,
      fetch_count = excluded.fetch_count,
      fetched_at = excluded.fetched_at
  `).bind(fixture.id, JSON.stringify(oddsPayload), newCount, fetchedAt).run();

  return json({
    ...oddsPayload,
    fetch_count: newCount,
    max_fetches: MAX_FETCHES,
    max_reached: newCount >= MAX_FETCHES,
    fetched_at: fetchedAt,
    from_cache: false,
  });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
