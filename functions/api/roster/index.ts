import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';
import { ensureContributionsTable } from '../_roster';

interface RosterRow {
  id: number;
  name: string;
  initials: string;
  sort_order: number;
  active: number;
  next_day: string | null;
  days_assigned: number;
  contribution_paid: number;
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  await ensureContributionsTable(db);

  const rows = await db.prepare(`
    SELECT
      p.id, p.name, p.initials, p.sort_order, p.active,
      (SELECT md.local_date
       FROM match_days md
       WHERE md.assigned_participant_id = p.id AND md.status = 'upcoming'
       ORDER BY md.local_date LIMIT 1) as next_day,
      (SELECT COUNT(*) FROM match_days md
       WHERE md.assigned_participant_id = p.id AND md.status = 'upcoming') as days_assigned,
      COALESCE(
        (SELECT SUM(c.amount) FROM contributions c WHERE c.participant_id = p.id), 0
      ) as contribution_paid
    FROM participants p
    WHERE p.active = 1
    ORDER BY p.sort_order, p.created_at
  `).all<RosterRow>();

  const settingsRows = await db.prepare(
    "SELECT value FROM settings WHERE key = 'contribution_per_person'"
  ).first<{ value: string }>();
  const contributionOwed = parseInt(settingsRows?.value ?? '2000');

  return json({ roster: rows.results, contribution_owed: contributionOwed });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
