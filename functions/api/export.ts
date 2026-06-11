import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from './_middleware';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;
  const [participants, fixtures, matchDays, bets, betLinks, transactions, settings] = await Promise.all([
    db.prepare('SELECT * FROM participants').all(),
    db.prepare('SELECT * FROM fixtures').all(),
    db.prepare('SELECT * FROM match_days').all(),
    db.prepare('SELECT * FROM bets').all(),
    db.prepare('SELECT * FROM bet_fixture_links').all(),
    db.prepare('SELECT * FROM kitty_transactions').all(),
    db.prepare('SELECT * FROM settings').all(),
  ]);
  const data = {
    exported_at: new Date().toISOString(),
    version: 1,
    participants: participants.results,
    fixtures: fixtures.results,
    match_days: matchDays.results,
    bets: bets.results,
    bet_fixture_links: betLinks.results,
    kitty_transactions: transactions.results,
    settings: settings.results,
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="kitty-backup-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
};
