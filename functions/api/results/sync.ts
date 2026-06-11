import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

interface ProviderFixture {
  externalProviderId: string;
  kickoffUtc: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: string;
}

async function fetchFromProvider(env: Env): Promise<ProviderFixture[]> {
  if (env.RESULTS_PROVIDER === 'manual' || !env.RESULTS_API_KEY) return [];

  const res = await fetch(`https://v3.football.api-sports.io/fixtures?league=1&season=2026`, {
    headers: { 'x-apisports-key': env.RESULTS_API_KEY },
  });
  if (!res.ok) throw new Error(`Provider API error: ${res.status}`);
  const data = await res.json() as { response: Array<{
    fixture: { id: number; date: string; status: { short: string } };
    goals: { home: number | null; away: number | null };
    teams: { home: { winner: boolean | null }; away: { winner: boolean | null } };
  }> };

  return data.response.map(f => {
    const statusMap: Record<string, string> = {
      FT: 'finished', AET: 'finished', PEN: 'finished',
      '1H': 'in_progress', HT: 'in_progress', '2H': 'in_progress', ET: 'in_progress',
      PST: 'postponed', CANC: 'cancelled',
    };
    const s = statusMap[f.fixture.status.short] ?? 'scheduled';
    let winner = 'unknown';
    if (s === 'finished') {
      if (f.teams.home.winner === true) winner = 'home';
      else if (f.teams.away.winner === true) winner = 'away';
      else winner = 'draw';
    }
    return {
      externalProviderId: String(f.fixture.id),
      kickoffUtc: new Date(f.fixture.date).toISOString(),
      status: s,
      homeScore: f.goals.home,
      awayScore: f.goals.away,
      winner,
    };
  });
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
  let fixturesUpdated = 0;
  let betsAutoSettled = 0;
  let betsNeedingSettlement = 0;
  const errors: string[] = [];

  let providerFixtures: ProviderFixture[] = [];
  try {
    providerFixtures = await fetchFromProvider(ctx.env);
  } catch (e) {
    errors.push(`Provider error: ${(e as Error).message}`);
  }

  for (const pf of providerFixtures) {
    try {
      // Try matching by external ID first (fast), fall back to kickoff time (first sync)
      let existing = await db.prepare('SELECT id FROM fixtures WHERE external_provider_id = ?')
        .bind(pf.externalProviderId).first<{ id: number }>();

      if (!existing) {
        existing = await db.prepare('SELECT id FROM fixtures WHERE kickoff_utc = ?')
          .bind(pf.kickoffUtc).first<{ id: number }>();
      }

      if (!existing) continue;

      await db.prepare(`
        UPDATE fixtures
        SET status = ?, home_score = ?, away_score = ?, winner = ?,
            external_provider_id = ?,
            last_synced_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).bind(pf.status, pf.homeScore, pf.awayScore, pf.winner, pf.externalProviderId, existing.id).run();
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

  return json({ fixtures_updated: fixturesUpdated, bets_auto_settled: betsAutoSettled, bets_needing_settlement: betsNeedingSettlement, errors });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
