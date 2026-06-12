import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from './_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  const tz = ctx.env.TIMEZONE || 'Australia/Perth';

  const perthNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const todayDate = perthNow.toISOString().split('T')[0];

  const kittyRow = await db.prepare('SELECT COALESCE(SUM(amount),0) as total FROM kitty_transactions').first<{ total: number }>();
  const balance = kittyRow?.total ?? 0;

  const settingsRows = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const settings: Record<string, string> = {};
  for (const r of settingsRows.results) settings[r.key] = r.value;

  const startingKitty = parseInt(settings.starting_kitty ?? '20000');

  const stakeRow = await db.prepare(`SELECT COALESCE(SUM(ABS(amount)),0) as total FROM kitty_transactions WHERE type = 'stake_placed'`).first<{ total: number }>();
  const returnRow = await db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM kitty_transactions WHERE type IN ('bet_return','bet_void_refund','cashout_return')`).first<{ total: number }>();
  const totalStaked = stakeRow?.total ?? 0;
  const totalReturned = returnRow?.total ?? 0;

  const pendingBets = await db.prepare(`SELECT b.*, p.name as participant_name FROM bets b LEFT JOIN participants p ON b.participant_id = p.id WHERE b.settlement_status = 'pending' ORDER BY b.created_at DESC LIMIT 20`).all();

  const needsSettlement = await db.prepare(`
    SELECT DISTINCT b.* FROM bets b
    JOIN bet_fixture_links bfl ON bfl.bet_id = b.id
    JOIN fixtures f ON f.id = bfl.fixture_id
    WHERE b.settlement_status = 'pending' AND f.status = 'finished'
    LIMIT 20
  `).all();

  const todayMD = await db.prepare(`SELECT md.*, p.name as assigned_participant_name FROM match_days md LEFT JOIN participants p ON md.assigned_participant_id = p.id WHERE md.local_date = ?`).bind(todayDate).first();

  const now = new Date().toISOString();
  const plus36h = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
  const minus48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Unplayed games — scheduled only, next 36h covers today + overnight
  const upcomingFixtures = await db.prepare(
    "SELECT * FROM fixtures WHERE status = 'scheduled' AND kickoff_utc > ? AND kickoff_utc <= ? ORDER BY kickoff_utc LIMIT 20"
  ).bind(now, plus36h).all();

  // Played games — finished or live, last 48h
  const recentFixtures = await db.prepare(
    "SELECT * FROM fixtures WHERE status IN ('finished', 'in_progress') AND kickoff_utc >= ? AND kickoff_utc < ? ORDER BY kickoff_utc DESC LIMIT 10"
  ).bind(minus48h, now).all();

  const todayStakedRow = todayMD ? await db.prepare(`SELECT COALESCE(SUM(ABS(kt.amount)),0) as total FROM kitty_transactions kt JOIN bets b ON kt.bet_id = b.id WHERE kt.type = 'stake_placed' AND b.match_day_id = ?`).bind((todayMD as Record<string, unknown>).id).first<{ total: number }>() : null;

  const todayStaked = todayStakedRow?.total ?? 0;
  const todayBudget = (todayMD as Record<string, unknown> | null)?.budget_amount ?? 500;

  // Live (in-progress) fixtures with any pending bets attached
  const liveFixtures = await db.prepare(
    "SELECT * FROM fixtures WHERE status = 'in_progress' ORDER BY kickoff_utc"
  ).all<Record<string, unknown>>();

  const liveWithBets: Record<string, unknown>[] = [];
  for (const f of liveFixtures.results) {
    const betsResult = await db.prepare(`
      SELECT DISTINCT b.* FROM bets b
      JOIN bet_fixture_links bfl ON bfl.bet_id = b.id
      WHERE bfl.fixture_id = ? AND b.settlement_status = 'pending'
    `).bind(f.id).all<Record<string, unknown>>();
    liveWithBets.push({ ...f, pending_bets: betsResult.results });
  }

  // Next match day that still has at least one game that can be bet on
  const nextBettableMD = await db.prepare(`
    SELECT md.id, md.local_date
    FROM match_days md
    JOIN fixtures f ON f.kickoff_local_date = md.local_date
    WHERE f.status = 'scheduled' AND f.kickoff_utc > datetime('now')
    ORDER BY f.kickoff_utc ASC
    LIMIT 1
  `).first<{ id: number; local_date: string }>();

  return new Response(JSON.stringify({
    kitty: {
      balance,
      starting_kitty: startingKitty,
      total_staked: totalStaked,
      total_returned: totalReturned,
      net_profit_loss: balance - startingKitty,
      pending_bets_count: pendingBets.results.length,
      unsettled_completed_count: needsSettlement.results.length,
    },
    today_match_day: todayMD ? { ...todayMD, today_staked: todayStaked, today_budget: todayBudget } : null,
    next_bettable_match_day_id: nextBettableMD?.id ?? null,
    upcoming_fixtures: upcomingFixtures.results,
    recent_fixtures: recentFixtures.results,
    live_fixtures: liveWithBets,
    pending_bets: pendingBets.results,
    needs_settlement: needsSettlement.results,
  }), { headers: { 'Content-Type': 'application/json' } });
};
