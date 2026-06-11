CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  initials TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_number INTEGER NOT NULL,
  external_provider_id TEXT,
  stage TEXT NOT NULL,
  group_name TEXT,
  round_name TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_utc TEXT NOT NULL,
  kickoff_local_date TEXT NOT NULL,
  venue TEXT,
  city TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  home_score INTEGER,
  away_score INTEGER,
  winner TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS match_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  local_date TEXT NOT NULL UNIQUE,
  stage TEXT,
  assigned_participant_id INTEGER REFERENCES participants(id),
  budget_amount INTEGER NOT NULL DEFAULT 500,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_day_id INTEGER NOT NULL REFERENCES match_days(id),
  participant_id INTEGER REFERENCES participants(id),
  title TEXT NOT NULL,
  description TEXT,
  bet_type TEXT NOT NULL DEFAULT 'single',
  market_type TEXT,
  market_params_json TEXT,
  stake_amount INTEGER NOT NULL,
  odds_decimal REAL NOT NULL,
  potential_return INTEGER NOT NULL,
  potential_profit INTEGER NOT NULL,
  settlement_status TEXT NOT NULL DEFAULT 'pending',
  actual_return INTEGER,
  cashout_amount INTEGER,
  settled_at TEXT,
  bookmaker TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bet_fixture_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bet_id INTEGER NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id)
);

CREATE TABLE IF NOT EXISTS kitty_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  bet_id INTEGER REFERENCES bets(id),
  participant_id INTEGER REFERENCES participants(id),
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fixtures_local_date ON fixtures(kickoff_local_date);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
CREATE INDEX IF NOT EXISTS idx_bets_match_day ON bets(match_day_id);
CREATE INDEX IF NOT EXISTS idx_bets_status ON bets(settlement_status);
CREATE INDEX IF NOT EXISTS idx_kitty_type ON kitty_transactions(type);
CREATE INDEX IF NOT EXISTS idx_bet_fixture_links_bet ON bet_fixture_links(bet_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token_hash);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('starting_kitty', '20000'),
  ('contribution_per_person', '2000'),
  ('num_participants', '10'),
  ('currency', 'AUD'),
  ('timezone', 'Australia/Perth'),
  ('group_stage_daily_budget', '500'),
  ('r32_daily_budget', '500'),
  ('r16_daily_budget', '500'),
  ('qf_daily_budget', '1000'),
  ('sf_daily_budget', '1000'),
  ('tp_daily_budget', '500'),
  ('final_daily_budget', '1000');
