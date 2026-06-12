import type { D1Database } from '@cloudflare/workers-types';

export async function recalculateRoster(db: D1Database): Promise<void> {
  const participants = await db.prepare(
    'SELECT id FROM participants WHERE active = 1 ORDER BY sort_order, created_at'
  ).all<{ id: number }>();

  const N = participants.results.length;
  if (N === 0) return;

  // "Played" days = everything that isn't upcoming (anchors the rotation position)
  const playedRow = await db.prepare(
    "SELECT COUNT(*) as cnt FROM match_days WHERE status != 'upcoming'"
  ).first<{ cnt: number }>();
  const playedCount = playedRow?.cnt ?? 0;

  const upcoming = await db.prepare(
    "SELECT id FROM match_days WHERE status = 'upcoming' ORDER BY local_date"
  ).all<{ id: number }>();

  for (let i = 0; i < upcoming.results.length; i++) {
    const participantId = participants.results[(playedCount + i) % N].id;
    await db.prepare(
      'UPDATE match_days SET assigned_participant_id = ? WHERE id = ?'
    ).bind(participantId, upcoming.results[i].id).run();
  }
}

export async function ensureContributionsTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS contributions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      amount      INTEGER NOT NULL,
      note        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();
}
