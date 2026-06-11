export interface Participant {
  id: number;
  name: string;
  initials: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Fixture {
  id: number;
  match_number: number;
  external_provider_id: string | null;
  stage: string;
  group_name: string | null;
  round_name: string | null;
  home_team: string;
  away_team: string;
  kickoff_utc: string;
  kickoff_local_date: string;
  venue: string | null;
  city: string | null;
  status: 'scheduled' | 'in_progress' | 'finished' | 'postponed' | 'cancelled';
  home_score: number | null;
  away_score: number | null;
  winner: 'home' | 'away' | 'draw' | 'unknown' | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MatchDay {
  id: number;
  local_date: string;
  stage: string | null;
  assigned_participant_id: number | null;
  budget_amount: number;
  notes: string | null;
  status: 'upcoming' | 'in_progress' | 'complete' | 'settled';
  created_at: string;
  updated_at: string;
  assigned_participant?: Participant;
  fixtures?: Fixture[];
  total_staked?: number;
  bets_count?: number;
  assigned_participant_name?: string;
  assigned_participant_initials?: string;
  fixture_count?: number;
  pending_bets_count?: number;
}

export type BetType = 'single' | 'multi' | 'bet_builder' | 'futures' | 'custom';
export type MarketType =
  | 'home_win' | 'away_win' | 'draw'
  | 'home_or_draw' | 'away_or_draw'
  | 'over_goals' | 'under_goals'
  | 'btts_yes' | 'btts_no'
  | 'custom';

export type SettlementStatus = 'pending' | 'won' | 'lost' | 'void' | 'cashed_out';

export interface Bet {
  id: number;
  match_day_id: number;
  participant_id: number | null;
  title: string;
  description: string | null;
  bet_type: BetType;
  market_type: MarketType | null;
  market_params_json: string | null;
  stake_amount: number;
  odds_decimal: number;
  potential_return: number;
  potential_profit: number;
  settlement_status: SettlementStatus;
  actual_return: number | null;
  cashout_amount: number | null;
  settled_at: string | null;
  bookmaker: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  participant?: Participant;
  fixtures?: Fixture[];
  match_day?: MatchDay;
  participant_name?: string;
  match_day_date?: string;
}

export interface KittyTransaction {
  id: number;
  type: 'initial_contribution' | 'stake_placed' | 'bet_return' | 'bet_void_refund' | 'manual_adjustment' | 'correction' | 'final_payout' | 'cashout_return';
  bet_id: number | null;
  participant_id: number | null;
  amount: number;
  description: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  bet_title?: string;
}

export interface KittySummary {
  balance: number;
  starting_kitty: number;
  total_staked: number;
  total_returned: number;
  net_profit_loss: number;
  pending_bets_count: number;
  unsettled_completed_count: number;
}

export interface DashboardData {
  kitty: KittySummary;
  today_match_day: (MatchDay & { today_staked: number; today_budget: number }) | null;
  today_fixtures: Fixture[];
  pending_bets: Bet[];
  needs_settlement: Bet[];
}

export interface Settings {
  starting_kitty: number;
  contribution_per_person: number;
  num_participants: number;
  currency: string;
  timezone: string;
  group_stage_daily_budget: number;
  r32_daily_budget: number;
  r16_daily_budget: number;
  qf_daily_budget: number;
  sf_daily_budget: number;
  tp_daily_budget: number;
  final_daily_budget: number;
}
