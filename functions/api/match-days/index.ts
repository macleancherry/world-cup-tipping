import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const rows = await ctx.env.DB.prepare(`
    SELECT md.*, p.name as assigned_participant_name, p.initials as assigned_participant_initials,
      COUNT(DISTINCT f.id) as fixture_count,
      COALESCE(SUM(CASE WHEN b.settlement_status = 'pending' THEN 1 ELSE 0 END), 0) as pending_bets_count,
      COALESCE((SELECT SUM(ABS(kt.amount)) FROM kitty_transactions kt JOIN bets bb ON kt.bet_id = bb.id WHERE kt.type = 'stake_placed' AND bb.match_day_id = md.id), 0) as total_staked
    FROM match_days md
    LEFT JOIN participants p ON md.assigned_participant_id = p.id
    LEFT JOIN fixtures f ON f.kickoff_local_date = md.local_date
    LEFT JOIN bets b ON b.match_day_id = md.id
    GROUP BY md.id
    ORDER BY md.local_date
  `).all();
  return json(rows.results);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
