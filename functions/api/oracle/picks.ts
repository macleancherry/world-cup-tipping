import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

interface OraclePick {
  id: number;
  fixture_id: number;
  oracle_name: string;
  predicted_winner: 'home' | 'away';
  notes: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  home_team?: string;
  away_team?: string;
  kickoff_utc?: string;
  status?: string;
  stage?: string;
  group_name?: string | null;
}

async function ensureTable(db: D1Database) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS oracle_picks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      fixture_id   INTEGER NOT NULL UNIQUE,
      oracle_name  TEXT    NOT NULL DEFAULT 'Cherry',
      predicted_winner TEXT NOT NULL CHECK (predicted_winner IN ('home','away')),
      notes        TEXT,
      source_url   TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}

// GET /api/oracle/picks?fixture_id=X  (optional filter)
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  await ensureTable(db);

  const url = new URL(ctx.request.url);
  const fixtureId = url.searchParams.get('fixture_id');

  if (fixtureId) {
    const row = await db.prepare(`
      SELECT op.*, f.home_team, f.away_team, f.kickoff_utc, f.status, f.stage, f.group_name
      FROM oracle_picks op
      JOIN fixtures f ON f.id = op.fixture_id
      WHERE op.fixture_id = ?
    `).bind(Number(fixtureId)).first<OraclePick>();
    return json(row ?? null);
  }

  const rows = await db.prepare(`
    SELECT op.*, f.home_team, f.away_team, f.kickoff_utc, f.status, f.stage, f.group_name
    FROM oracle_picks op
    JOIN fixtures f ON f.id = op.fixture_id
    ORDER BY f.kickoff_utc ASC
  `).all<OraclePick>();
  return json(rows.results);
};

// POST /api/oracle/picks  { fixture_id, predicted_winner, notes?, source_url? }
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  await ensureTable(db);

  const body = await ctx.request.json() as {
    fixture_id: number;
    predicted_winner: 'home' | 'away';
    notes?: string;
    source_url?: string;
  };

  if (!body.fixture_id) return json({ error: 'fixture_id required' }, 400);
  if (body.predicted_winner !== 'home' && body.predicted_winner !== 'away') {
    return json({ error: 'predicted_winner must be "home" or "away"' }, 400);
  }

  const row = await db.prepare(`
    INSERT INTO oracle_picks (fixture_id, predicted_winner, notes, source_url)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (fixture_id) DO UPDATE SET
      predicted_winner = excluded.predicted_winner,
      notes            = excluded.notes,
      source_url       = excluded.source_url,
      updated_at       = datetime('now')
    RETURNING *
  `).bind(body.fixture_id, body.predicted_winner, body.notes ?? null, body.source_url ?? null)
    .first<OraclePick>();

  return json(row, 201);
};

// DELETE /api/oracle/picks?fixture_id=X
export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  const url = new URL(ctx.request.url);
  const fixtureId = url.searchParams.get('fixture_id');
  if (!fixtureId) return json({ error: 'fixture_id required' }, 400);

  await db.prepare('DELETE FROM oracle_picks WHERE fixture_id = ?').bind(Number(fixtureId)).run();
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
