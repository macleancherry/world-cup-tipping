# World Cup Kitty Tracker ⚽

A private, mobile-friendly web app for tracking a mates' World Cup 2026 betting kitty. Built on Cloudflare Pages + D1.

## Features

- All 104 World Cup 2026 fixtures, grouped by Australia/Perth match day
- Bet entry with stake, decimal odds, and automatic kitty calculations
- Linked bets (single/multi/bet-builder) and custom bets
- Settlement: Won / Lost / Void / Cashed Out
- Auto-settlement for simple structured markets (home win, away win, draw, etc.)
- Kitty ledger — every dollar tracked as a transaction
- Check Results button (manual mode or external API)
- Leaderboard by participant
- JSON export/import backup
- Password-protected, mobile-first dark UI
- PWA installable

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend**: Cloudflare Pages Functions
- **Database**: Cloudflare D1 (SQLite)
- **Local dev**: Wrangler

---

## Local Development

### 1. Prerequisites

```bash
npm install -g wrangler
node -v  # requires Node 18+
```

### 2. Install dependencies

```bash
cd world-cup-tipping
npm install
```

### 3. Create the D1 database (local)

Wrangler creates a local SQLite file automatically. First, create the production DB (needed for the database_id in wrangler.toml):

```bash
wrangler d1 create world-cup-tipping
```

Copy the `database_id` output into `wrangler.toml`.

### 4. Run migrations

```bash
# Local (creates .wrangler/state/v3/d1/...)
wrangler d1 execute world-cup-tipping --local --file=./migrations/0001_initial.sql
```

### 5. Set up environment variables

Copy `.env.example` to `.dev.vars`:

```bash
cp .env.example .dev.vars
```

Edit `.dev.vars`:

```ini
ADMIN_PASSWORD_HASH=5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8
SESSION_SECRET=local-dev-secret-change-me
RESULTS_PROVIDER=manual
TIMEZONE=Australia/Perth
```

> **Generating a password hash**: The hash is SHA-256 of your password.
>
> ```bash
> echo -n "yourpassword" | sha256sum
> # or on Mac:
> echo -n "yourpassword" | shasum -a 256
> ```
>
> The default hash above is SHA-256 of `password`.

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The default password is `password`.

### 7. Seed fixtures and data

After the dev server is running:

```bash
ADMIN_PASSWORD=password npx ts-node --esm scripts/seed.ts
```

Or use the UI: go to **Import/Export → First-Time Setup** and click "Import Fixtures" then "Seed Kitty".

---

## Database Schema

The migration at `migrations/0001_initial.sql` creates:

| Table | Purpose |
|-------|---------|
| `participants` | The 10 mates in the group |
| `fixtures` | All 104 World Cup matches |
| `match_days` | One row per Perth calendar day with fixtures |
| `bets` | All bets placed against the kitty |
| `bet_fixture_links` | Many-to-many: bets ↔ fixtures |
| `kitty_transactions` | Ledger of every dollar in/out |
| `settings` | Key/value app config |
| `sessions` | Auth session tokens (hashed) |

> Money is stored as **integers in cents**. $5.00 = 500.

---

## API Routes

All routes are under `/api/` via Cloudflare Pages Functions.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Password login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/dashboard` | Dashboard summary |
| GET/POST | `/api/participants` | List / create participants |
| GET | `/api/fixtures` | List fixtures (optional `?date=` filter) |
| POST | `/api/fixtures/import` | Bulk import fixture JSON |
| POST | `/api/fixtures/manual-update` | Manually set score/status |
| GET | `/api/match-days` | List all match days |
| GET/PUT | `/api/match-days/:id` | Get/update a match day |
| GET/POST | `/api/bets` | List / create bets |
| GET/PUT/DELETE | `/api/bets/:id` | Get / edit / delete a bet |
| POST | `/api/bets/:id/settle` | Settle a bet |
| POST | `/api/bets/:id/reopen` | Reopen a settled bet |
| POST | `/api/results/sync` | Check results + auto-settle |
| GET | `/api/kitty` | Kitty balance summary |
| GET | `/api/kitty/ledger` | Full transaction ledger |
| POST | `/api/kitty/manual-adjustment` | Add manual kitty entry |
| GET | `/api/export` | Export full JSON backup |
| POST | `/api/import` | Restore from JSON backup |

---

## Deploying to Cloudflare Pages

### 1. Create the D1 database (production)

```bash
wrangler d1 create world-cup-tipping
```

Update `wrangler.toml` with the returned `database_id`.

### 2. Run migrations on production

```bash
wrangler d1 execute world-cup-tipping --file=./migrations/0001_initial.sql
```

### 3. Build the frontend

```bash
npm run build
```

### 4. Deploy

```bash
wrangler pages deploy ./dist
```

### 5. Set production secrets

In the Cloudflare dashboard (Pages → Settings → Environment Variables), set:

| Variable | Value |
|----------|-------|
| `ADMIN_PASSWORD_HASH` | SHA-256 hash of your chosen password |
| `SESSION_SECRET` | A random 32+ character string |
| `RESULTS_PROVIDER` | `manual` or `api-football` |
| `RESULTS_API_KEY` | Your API key (if using api-football) |
| `TIMEZONE` | `Australia/Perth` |

Or set them via wrangler:

```bash
wrangler pages secret put ADMIN_PASSWORD_HASH
wrangler pages secret put SESSION_SECRET
```

### 6. Bind the D1 database

In the Cloudflare Pages dashboard under Settings → Functions → D1 database bindings:

- **Variable name**: `DB`
- **D1 database**: `world-cup-tipping`

---

## Result Sync

### Manual mode (default)

Set `RESULTS_PROVIDER=manual`. The "Check Results" button does nothing automatically — use **Results → click a fixture → Update Result** to manually enter scores.

### api-football provider

Set `RESULTS_PROVIDER=api-football` and `RESULTS_API_KEY=your-key`.

The app uses [api-sports.io](https://www.api-football.com/) (API Football v3). The World Cup 2026 league ID is `1`.

You must first map your local fixtures to external provider IDs. This can be done via the admin UI (manual mapping) or by ensuring the fixture seed data includes `externalProviderId` values.

---

## Kitty Calculation Rules

| Event | Kitty impact |
|-------|-------------|
| Bet placed | –stake |
| Bet wins | +return (stake × odds) |
| Bet loses | nothing (stake already deducted) |
| Bet voided | +stake (refunded) |
| Cashed out | +cashout amount |

The balance is always computed as `SUM(kitty_transactions.amount)`, never stored as a single field.

---

## Running Tests

```bash
npm test
```

Tests cover kitty calculation logic in `tests/kitty.test.ts`.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD_HASH` | Yes | — | SHA-256 hex of the group password |
| `SESSION_SECRET` | Yes | — | Random string for session security |
| `RESULTS_PROVIDER` | No | `manual` | `manual` or `api-football` |
| `RESULTS_API_KEY` | No | — | API key for result provider |
| `TIMEZONE` | No | `Australia/Perth` | Timezone for local date grouping |
| `ALLOW_PUBLIC_READONLY` | No | `false` | Allow unauthenticated GET requests |
| `ENABLE_AUTO_SETTLEMENT` | No | `true` | Auto-settle simple structured bets |
| `DEFAULT_CURRENCY` | No | `AUD` | Display currency |

---

## Project Structure

```
world-cup-tipping/
├── functions/api/          # Cloudflare Pages Functions (backend)
│   ├── _middleware.ts      # Auth check on all /api/* routes
│   ├── auth/               # Login / logout / me
│   ├── bets/               # CRUD + settle/reopen
│   ├── fixtures/           # List, import, manual update
│   ├── match-days/         # List and edit match days
│   ├── kitty/              # Balance, ledger, adjustments
│   ├── results/sync.ts     # Check results + auto-settle
│   ├── export.ts           # Full JSON export
│   └── import.ts           # Restore from backup
├── migrations/
│   └── 0001_initial.sql    # D1 schema
├── scripts/
│   └── seed.ts             # Seed fixtures + kitty via API
├── src/
│   ├── components/         # Reusable UI components
│   ├── pages/              # Route-level page components
│   ├── hooks/              # useAuth, useApi
│   ├── types/              # TypeScript types
│   ├── lib/providers/      # Result provider abstraction
│   └── data/
│       └── world-cup-2026-fixtures.json   # All 104 fixtures
├── tests/
│   └── kitty.test.ts       # Kitty calculation unit tests
├── wrangler.toml
├── .env.example
└── README.md
```
