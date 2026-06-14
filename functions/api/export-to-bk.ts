import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from './_middleware';

// One-shot migration: exports all WCT data and pushes it to betting-kitty.
// Protected by the standard WCT session middleware (user must be logged in).
// The deployed Worker can reach betting-kitty.pages.dev; only the dev container cannot.

const BK_URL = 'https://betting-kitty.pages.dev';
const BK_ADMIN_PASSWORD = 'Sunshine49Street!';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const db = ctx.env.DB;

  // Export everything from WCT
  const [pRow, fRow, mdRow, bRow, blRow, txRow] = await Promise.all([
    db.prepare('SELECT * FROM participants       ORDER BY id').all(),
    db.prepare('SELECT * FROM fixtures           ORDER BY id').all(),
    db.prepare('SELECT * FROM match_days         ORDER BY id').all(),
    db.prepare('SELECT * FROM bets               ORDER BY id').all(),
    db.prepare('SELECT * FROM bet_fixture_links  ORDER BY id').all(),
    db.prepare('SELECT * FROM kitty_transactions ORDER BY id').all(),
  ]);

  // Lazily-created tables — only query if they exist
  const [contribExists, oracleExists] = await Promise.all([
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='contributions'").first(),
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='oracle_picks'").first(),
  ]);
  const [contributions, oracle_picks, settings] = await Promise.all([
    contribExists
      ? db.prepare('SELECT * FROM contributions ORDER BY id').all().then(r => r.results)
      : Promise.resolve([]),
    oracleExists
      ? db.prepare('SELECT * FROM oracle_picks ORDER BY id').all().then(r => r.results)
      : Promise.resolve([]),
    db.prepare('SELECT * FROM settings').all().then(r => r.results),
  ]);

  const payload = {
    participants:       pRow.results,
    fixtures:           fRow.results,
    match_days:         mdRow.results,
    bets:               bRow.results,
    bet_fixture_links:  blRow.results,
    kitty_transactions: txRow.results,
    contributions,
    oracle_picks,
    settings,
  };

  // Authenticate with BK admin
  const authRes = await fetch(`${BK_URL}/api/admin/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: BK_ADMIN_PASSWORD }),
  });
  if (!authRes.ok) {
    const err = await authRes.text().catch(() => authRes.status.toString());
    return json({ error: `BK admin auth failed: ${err}` }, 502);
  }

  const setCookie = authRes.headers.get('Set-Cookie') ?? '';
  const adminCookie = setCookie.split(';')[0]; // "admin_session=..."
  if (!adminCookie.startsWith('admin_session=')) {
    return json({ error: 'No admin_session cookie returned by BK' }, 502);
  }

  // Push to BK
  const importRes = await fetch(`${BK_URL}/api/admin/import-from-wct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify(payload),
  });

  const result = await importRes.json() as Record<string, unknown>;
  return json({ ...result, exported: { participants: pRow.results.length, bets: bRow.results.length } }, importRes.status);
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
