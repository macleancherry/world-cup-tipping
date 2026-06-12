import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

interface ProviderFixture {
  externalProviderId: string;
  kickoffUtc: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: string;
  currentMinute: number | null;
  injuryTime: number | null;
}

async function ensureMinuteColumns(db: D1Database) {
  try { await db.prepare('ALTER TABLE fixtures ADD COLUMN current_minute INTEGER').run(); } catch { /* already exists */ }
  try { await db.prepare('ALTER TABLE fixtures ADD COLUMN injury_time INTEGER').run(); } catch { /* already exists */ }
}

async function fetchFromProvider(env: Env): Promise<{ fixtures: ProviderFixture[]; debug: string }> {
  if (env.RESULTS_PROVIDER === 'manual' || !env.RESULTS_API_KEY) {
    return { fixtures: [], debug: 'provider=manual or no API key' };
  }

  // football-data.org — free tier, covers WC 2026
  const url = `https://api.football-data.org/v4/competitions/WC/matches`;
  const res = await fetch(url, {
    headers: { 'X-Auth-Token': env.RESULTS_API_KEY },
  });
  if (!res.ok) throw new Error(`API returned HTTP ${res.status}`);

  const data = await res.json() as {
    matches: Array<{
      id: number;
      utcDate: string;
      status: string;
      minute?: number | null;
      injuryTime?: number | null;
      score: {
        winner: string | null;
        fullTime: { home: number | null; away: number | null };
      };
    }>;
  };

  const debug = `HTTP ${res.status} · matches=${data.matches?.length ?? 0}`;

  const statusMap: Record<string, string> = {
    FINISHED: 'finished',
    IN_PLAY: 'in_progress', LIVE: 'in_progress', PAUSED: 'in_progress',
    POSTPONED: 'postponed', CANCELLED: 'cancelled', SUSPENDED: 'cancelled',
  };

  const liveStatuses = new Set(['IN_PLAY', 'LIVE', 'PAUSED']);

  return {
    debug,
    fixtures: (data.matches ?? []).map(m => ({
      externalProviderId: String(m.id),
      kickoffUtc: m.utcDate,
      status: statusMap[m.status] ?? 'scheduled',
      homeScore: m.score.fullTime.home,
      awayScore: m.score.fullTime.away,
      winner: m.score.winner === 'HOME_TEAM' ? 'home'
            : m.score.winner === 'AWAY_TEAM' ? 'away'
            : m.score.winner === 'DRAW' ? 'draw'
            : 'unknown',
      currentMinute: liveStatuses.has(m.status) ? (m.minute ?? null) : null,
      injuryTime: liveStatuses.has(m.status) ? (m.injuryTime ?? null) : null,
    })),
  };
}

function canAutoSettle(bet: Record<string, unknown>, fixture: Record<string, unknown>): { canSettle: boolean; result: string } {
  if (bet.bet_type !== 'single') return { canSettle: false, result: '' };
  if (!bet.market_type || bet.market_type === 'custom') return { canSettle: false, result: '' };
  if (fixture.status !== 'finished') return { canSettle: false, result: '' };

  const { winner, home_score, away_score } = fixture as { winner: string; home_score: number; away_score: number };
  const market = bet.market_type as string;
  const params = bet.market_params_json ? JSON.parse(bet.market_params_json as string) : {};

  let wonBet = false;
  if (market === 'home_win') wonBet = winner === 'home';
  else if (market === 'away_win') wonBet = winner === 'away';
  else if (market === 'draw') wonBet = winner === 'draw';
  else if (market === 'home_or_draw') wonBet = winner === 'home' || winner === 'draw';
  else if (market === 'away_or_draw') wonBet = winner === 'away' || winner === 'draw';
  else if (market === 'over_goals') wonBet = (home_score + away_score) > (params.line ?? 2.5);
  else if (market === 'under_goals') wonBet = (home_score + away_score) < (params.line ?? 2.5);
  else if (market === 'btts_yes') wonBet = home_score > 0 && away_score > 0;
  else if (market === 'btts_no') wonBet = home_score === 0 || away_score === 0;
  else return { canSettle: false, result: '' };

  return { canSettle: true, result: wonBet ? 'won' : 'lost' };
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  await ensureMinuteColumns(db);
  let fixturesUpdated = 0;
  let fixturesNotMatched = 0;
  let betsAutoSettled = 0;
  let betsNeedingSettlement = 0;
  const errors: string[] = [];

  let providerFixtures: ProviderFixture[] = [];
  let providerDebug = '';
  try {
    const result = await fetchFromProvider(ctx.env);
    providerFixtures = result.fixtures;
    providerDebug = result.debug;
  } catch (e) {
    errors.push(`Provider error: ${(e as Error).message}`);
  }

  for (const pf of providerFixtures) {
    try {
      // Try matching by external ID first (fast), fall back to kickoff time (first sync)
      let existing = await db.prepare('SELECT id, status, home_score, away_score, winner, external_provider_id FROM fixtures WHERE external_provider_id = ?')
        .bind(pf.externalProviderId).first<{ id: number; status: string; home_score: number | null; away_score: number | null; winner: string | null; external_provider_id: string | null }>();

      if (!existing) {
        // Normalise both sides via SQLite datetime() to ignore sub-second differences
        existing = await db.prepare("SELECT id, status, home_score, away_score, winner, external_provider_id FROM fixtures WHERE datetime(kickoff_utc) = datetime(?)")
          .bind(pf.kickoffUtc).first<{ id: number; status: string; home_score: number | null; away_score: number | null; winner: string | null; external_provider_id: string | null }>();
      }

      if (!existing) { fixturesNotMatched++; continue; }

      const changed =
        existing.status !== pf.status ||
        existing.home_score !== pf.homeScore ||
        existing.away_score !== pf.awayScore ||
        existing.winner !== pf.winner ||
        existing.external_provider_id !== pf.externalProviderId ||
        (existing as Record<string, unknown>).current_minute !== pf.currentMinute ||
        (existing as Record<string, unknown>).injury_time !== pf.injuryTime;

      if (!changed) continue;

      await db.prepare(`
        UPDATE fixtures
        SET status = ?, home_score = ?, away_score = ?, winner = ?,
            external_provider_id = ?,
            current_minute = ?, injury_time = ?,
            last_synced_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).bind(pf.status, pf.homeScore, pf.awayScore, pf.winner, pf.externalProviderId,
              pf.currentMinute, pf.injuryTime, existing.id).run();
      fixturesUpdated++;
    } catch (e) {
      errors.push(`Fixture ${pf.externalProviderId}: ${(e as Error).message}`);
    }
  }

  const pendingBets = await db.prepare(`
    SELECT DISTINCT b.* FROM bets b
    JOIN bet_fixture_links bfl ON bfl.bet_id = b.id
    JOIN fixtures f ON f.id = bfl.fixture_id
    WHERE b.settlement_status = 'pending' AND f.status = 'finished'
  `).all() as { results: Record<string, unknown>[] };

  const enableAutoSettle = ctx.env.ENABLE_AUTO_SETTLEMENT !== 'false';

  for (const bet of pendingBets.results) {
    const linkedFixtures = await db.prepare('SELECT f.* FROM bet_fixture_links bfl JOIN fixtures f ON f.id = bfl.fixture_id WHERE bfl.bet_id = ?').bind(bet.id).all() as { results: Record<string, unknown>[] };

    if (!enableAutoSettle || linkedFixtures.results.length !== 1 || bet.bet_type !== 'single') {
      betsNeedingSettlement++;
      continue;
    }

    const fixture = linkedFixtures.results[0];
    const { canSettle, result } = canAutoSettle(bet, fixture);
    if (!canSettle) { betsNeedingSettlement++; continue; }

    const actualReturn = result === 'won' ? Math.round((bet.stake_amount as number) * (bet.odds_decimal as number)) : 0;
    await db.prepare(`UPDATE bets SET settlement_status = ?, actual_return = ?, settled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).bind(result, actualReturn, bet.id).run();
    await db.prepare(`INSERT INTO kitty_transactions (type, bet_id, amount, description, created_by) VALUES ('bet_return', ?, ?, ?, 'auto-settle')`).bind(bet.id, actualReturn, `Auto-settled ${result}: ${bet.title}`).run();
    betsAutoSettled++;
  }

  return json({
    fixtures_updated: fixturesUpdated,
    bets_auto_settled: betsAutoSettled,
    bets_needing_settlement: betsNeedingSettlement,
    errors,
  });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
