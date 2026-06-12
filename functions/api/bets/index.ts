import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const status = url.searchParams.get('status');
  const matchDayId = url.searchParams.get('match_day_id');

  let q = `SELECT b.*, p.name as participant_name, md.local_date as match_day_date FROM bets b LEFT JOIN participants p ON b.participant_id = p.id LEFT JOIN match_days md ON b.match_day_id = md.id WHERE 1=1`;
  const params: unknown[] = [];
  if (status) { q += ' AND b.settlement_status = ?'; params.push(status); }
  if (matchDayId) { q += ' AND b.match_day_id = ?'; params.push(matchDayId); }
  q += ' ORDER BY b.created_at DESC';

  const rows = await ctx.env.DB.prepare(q).bind(...params).all();

  const bets = rows.results as Record<string, unknown>[];
  for (const bet of bets) {
    const links = await ctx.env.DB.prepare('SELECT f.* FROM bet_fixture_links bfl JOIN fixtures f ON f.id = bfl.fixture_id WHERE bfl.bet_id = ?').bind(bet.id).all();
    bet.fixtures = links.results;
  }

  return json(bets);
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as {
    match_day_id: number;
    participant_id?: number;
    title: string;
    description?: string;
    bet_type?: string;
    market_type?: string;
    market_params_json?: string;
    stake_amount: number;
    odds_decimal: number;
    bookmaker?: string;
    notes?: string;
    fixture_ids?: number[];
  };

  if (!body.match_day_id) return json({ error: 'match_day_id required' }, 400);
  if (!body.title) return json({ error: 'title required' }, 400);
  if (!body.stake_amount || body.stake_amount <= 0) return json({ error: 'stake_amount must be > 0' }, 400);
  if (!body.odds_decimal || body.odds_decimal < 1.01) return json({ error: 'odds_decimal must be >= 1.01' }, 400);

  // Reject bets on games that have started or are no longer available
  if (body.fixture_ids?.length) {
    const placeholders = body.fixture_ids.map(() => '?').join(',');
    const badFixtures = await ctx.env.DB.prepare(
      `SELECT id FROM fixtures WHERE id IN (${placeholders})
        AND (status IN ('finished','cancelled','postponed','in_progress') OR kickoff_utc <= datetime('now'))`
    ).bind(...body.fixture_ids).all<{ id: number }>();
    if (badFixtures.results.length > 0) {
      return json({ error: 'One or more selected games have already started or are no longer available for betting.' }, 422);
    }
  }

  // Budget check — sum non-void stakes for this match day
  const budgetRow = await ctx.env.DB.prepare(`
    SELECT md.budget_amount,
      COALESCE((
        SELECT SUM(ABS(kt.amount))
        FROM kitty_transactions kt
        JOIN bets b2 ON kt.bet_id = b2.id
        WHERE b2.match_day_id = md.id
          AND kt.type = 'stake_placed'
          AND b2.settlement_status != 'void'
      ), 0) AS total_staked
    FROM match_days md WHERE md.id = ?
  `).bind(body.match_day_id).first<{ budget_amount: number; total_staked: number }>();

  if (budgetRow) {
    const remaining = budgetRow.budget_amount - budgetRow.total_staked;
    if (body.stake_amount > remaining) {
      const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;
      return json({
        error: `Stake of ${fmt(body.stake_amount)} exceeds the remaining daily budget of ${fmt(remaining)} (limit ${fmt(budgetRow.budget_amount)}).`,
      }, 422);
    }
  }

  const potential_return = Math.round(body.stake_amount * body.odds_decimal);
  const potential_profit = potential_return - body.stake_amount;

  const bet = await ctx.env.DB.prepare(`
    INSERT INTO bets (match_day_id, participant_id, title, description, bet_type, market_type, market_params_json, stake_amount, odds_decimal, potential_return, potential_profit, settlement_status, bookmaker, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    RETURNING *
  `).bind(
    body.match_day_id,
    body.participant_id ?? null,
    body.title,
    body.description ?? null,
    body.bet_type ?? 'single',
    body.market_type ?? null,
    body.market_params_json ?? null,
    body.stake_amount,
    body.odds_decimal,
    potential_return,
    potential_profit,
    body.bookmaker ?? null,
    body.notes ?? null,
  ).first() as Record<string, unknown>;

  if (body.fixture_ids?.length) {
    for (const fid of body.fixture_ids) {
      await ctx.env.DB.prepare('INSERT INTO bet_fixture_links (bet_id, fixture_id) VALUES (?, ?)').bind(bet.id, fid).run();
    }
  }

  await ctx.env.DB.prepare(`
    INSERT INTO kitty_transactions (type, bet_id, amount, description, created_by)
    VALUES ('stake_placed', ?, ?, ?, 'system')
  `).bind(bet.id, -body.stake_amount, `Stake: ${body.title}`).run();

  return json(bet, 201);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
