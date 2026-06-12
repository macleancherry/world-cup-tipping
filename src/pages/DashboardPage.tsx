import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCents, formatDate, formatKickoff } from '../hooks/useApi'
import type { Bet, Fixture } from '../types'
import AiCashoutModal from '../components/AiCashoutModal'

type LiveFixture = Fixture & { pending_bets: Bet[] }

interface DashboardData {
  kitty: {
    balance: number
    starting_kitty: number
    total_staked: number
    total_returned: number
    net_profit_loss: number
    pending_bets_count: number
    unsettled_completed_count: number
  }
  today_match_day: {
    id: number
    local_date: string
    assigned_participant_name: string | null
    budget_amount: number
    today_staked: number
    today_budget: number
  } | null
  next_bettable_match_day_id: number | null
  upcoming_fixtures: Fixture[]
  recent_fixtures: Fixture[]
  live_fixtures: LiveFixture[]
  pending_bets: (Bet & { participant_name?: string })[]
  needs_settlement: Bet[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [cashoutFixture, setCashoutFixture] = useState<LiveFixture | null>(null)

  async function loadData() {
    const d = await fetch('/api/dashboard').then(r => r.json())
    setData(d as DashboardData)
  }

  async function syncThenRefresh() {
    try {
      await fetch('/api/results/sync', { method: 'POST' })
    } catch { /* ignore sync errors — stale data is fine */ }
    await loadData()
  }

  useEffect(() => {
    // Load from DB immediately so the page is usable right away
    loadData().finally(() => setLoading(false))
    // Sync in background without blocking the initial render
    syncThenRefresh()
    const id = setInterval(syncThenRefresh, 60_000)
    return () => clearInterval(id)
  }, [])

  async function syncScores() {
    setSyncing(true)
    try {
      await syncThenRefresh()
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!data) return <div className="alert alert-error">Failed to load dashboard</div>

  const { kitty, today_match_day: today, next_bettable_match_day_id, upcoming_fixtures, recent_fixtures, live_fixtures = [], pending_bets, needs_settlement } = data
  const addBetPath = next_bettable_match_day_id
    ? `/match-days/${next_bettable_match_day_id}`
    : '/match-days'
  const pnl = kitty.balance - kitty.starting_kitty

  return (
    <div>
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">⚽ World Cup 2026</h1>
          <p className="page-subtitle">Betting Kitty Dashboard</p>
        </div>
        <Link to={addBetPath} className="btn btn-primary btn-lg">
          + Add Bet
        </Link>
      </div>

      {/* Live games section — shown at top when games are in progress */}
      {live_fixtures.length > 0 && (
        <div className="section mb-4">
          <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="live-pulse-dot" />
            <span>Live Now</span>
            <span className="badge badge-live">{live_fixtures.length}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={syncScores}
                disabled={syncing}
                title="Sync latest scores from football-data.org"
              >
                {syncing ? 'Syncing…' : '↺ Sync scores'}
              </button>
            </div>
          </div>

          {live_fixtures.map(f => {
            const scoreStr = f.home_score != null && f.away_score != null
              ? `${f.home_score} – ${f.away_score}`
              : 'vs'
            const minuteStr = f.current_minute != null
              ? (f.injury_time ? `${f.current_minute}+${f.injury_time}'` : `${f.current_minute}'`)
              : null
            const hasBets = f.pending_bets.length > 0

            return (
              <div key={f.id} className="card live-fixture-card">
                <div className="live-fixture-header">
                  <div className="live-fixture-teams">
                    <span className="live-team">{f.home_team}</span>
                    <span className="live-score">{scoreStr}</span>
                    <span className="live-team">{f.away_team}</span>
                  </div>
                  <span className="badge badge-live">🔴 {minuteStr ?? 'LIVE'}</span>
                </div>

                {hasBets && (
                  <div className="live-bets">
                    <div className="live-bets-label">Pending bets on this game</div>
                    {f.pending_bets.map(b => (
                      <div key={b.id} className="live-bet-row">
                        <span className="live-bet-title">{b.title}</span>
                        <span className="live-bet-meta text-muted">
                          {formatCents(b.stake_amount)} @ {b.odds_decimal.toFixed(2)} → {formatCents(b.potential_return)}
                        </span>
                      </div>
                    ))}
                    <div style={{ marginTop: '0.6rem' }}>
                      <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setCashoutFixture(f)}
                      >
                        🤖 Cash Out Advice
                      </button>
                    </div>
                  </div>
                )}

                {!hasBets && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => setCashoutFixture(f)}
                    >
                      🤖 AI Game Analysis
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          <p className="text-xs text-muted" style={{ marginTop: '0.4rem' }}>
            Scores sync automatically every minute.
          </p>
        </div>
      )}

      {/* Kitty hero */}
      <div className="kitty-hero">
        <div className="kitty-hero-label">Current Kitty Balance</div>
        <div className={`kitty-hero-amount ${pnl >= 0 ? 'positive' : 'negative'}`}>
          {formatCents(kitty.balance)}
        </div>
        <div className="kitty-hero-sub">
          {pnl >= 0 ? '▲' : '▼'} {formatCents(Math.abs(pnl))} {pnl >= 0 ? 'up' : 'down'} from starting {formatCents(kitty.starting_kitty)}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-4 stats-strip mb-4">
        <div className="stat-card">
          <div className="stat-label">Total Staked</div>
          <div className="stat-value text-red">{formatCents(kitty.total_staked)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total Returned</div>
          <div className="stat-value text-green">{formatCents(kitty.total_returned)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Net P&amp;L</div>
          <div className={`stat-value ${pnl >= 0 ? 'positive' : 'negative'}`}>
            {pnl >= 0 ? '+' : ''}{formatCents(pnl)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Bets</div>
          <div className="stat-value">{kitty.pending_bets_count}</div>
          {kitty.unsettled_completed_count > 0 && (
            <div className="stat-sub text-yellow">{kitty.unsettled_completed_count} need settlement</div>
          )}
        </div>
      </div>

      <div className="grid-2 dashboard-today-grid">
        {/* Upcoming games */}
        <div className="card dashboard-fixtures-card">
          <div className="card-header">
            <span className="card-title">Upcoming Games</span>
            <span className="badge badge-scheduled">{upcoming_fixtures.length}</span>
          </div>
          {upcoming_fixtures.length === 0 ? (
            <div className="empty-state"><p>No upcoming games in the next 36 hours</p></div>
          ) : (
            upcoming_fixtures.map(f => (
              <div key={f.id} className="fixture-row" style={{ marginBottom: '0.5rem' }}>
                <div className="fixture-time">{formatKickoff(f.kickoff_utc)}</div>
                <div className="fixture-teams">
                  <span className="fixture-team home">{f.home_team}</span>
                  <div className="fixture-score">
                    <span className="fixture-score-sep" style={{ fontSize: '0.8rem' }}>vs</span>
                  </div>
                  <span className="fixture-team away">{f.away_team}</span>
                </div>
              </div>
            ))
          )}
          {today && (
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted">Today's budget used</span>
                <span>{formatCents(today.today_staked)} / {formatCents(today.today_budget)}</span>
              </div>
              <div className="progress-bar">
                <div
                  className={`progress-fill ${today.today_staked / today.today_budget > 0.8 ? 'danger' : today.today_staked / today.today_budget > 0.5 ? 'warning' : ''}`}
                  style={{ width: `${Math.min(100, (today.today_staked / today.today_budget) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted mt-1">
                <span>{formatCents(Math.max(0, today.today_budget - today.today_staked))} remaining</span>
                {today.assigned_participant_name && <span>Bettor: {today.assigned_participant_name}</span>}
              </div>
              {upcoming_fixtures.length > 0 && (
                <Link
                  to={addBetPath}
                  className="btn btn-primary btn-block"
                  style={{ marginTop: '0.75rem' }}
                >
                  + Add a Bet on Upcoming Games
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Recent results */}
        <div className="card dashboard-matchday-card">
          <div className="card-header">
            <span className="card-title">Recent Results</span>
            <span className="badge badge-scheduled">{recent_fixtures.length}</span>
          </div>
          {recent_fixtures.length === 0 ? (
            <div className="empty-state"><p>No games in the last 48 hours</p></div>
          ) : (
            recent_fixtures.map(f => (
              <div key={f.id} className="fixture-row" style={{ marginBottom: '0.5rem' }}>
                <div className="fixture-time">{formatKickoff(f.kickoff_utc)}</div>
                <div className="fixture-teams">
                  <span className="fixture-team home">{f.home_team}</span>
                  <div className="fixture-score">
                    {f.status === 'finished' ? (
                      <>{f.home_score ?? 0}<span className="fixture-score-sep">–</span>{f.away_score ?? 0}</>
                    ) : (
                      <span className="fixture-score-sep" style={{ fontSize: '0.8rem' }}>vs</span>
                    )}
                  </div>
                  <span className="fixture-team away">{f.away_team}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Needs settlement */}
      {needs_settlement.length > 0 && (
        <div className="section mt-4">
          <div className="section-title">
            ⚠️ Bets Needing Settlement
            <span className="badge badge-pending">{needs_settlement.length}</span>
          </div>
          {needs_settlement.map(bet => (
            <div key={bet.id} className="bet-card">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{bet.title}</div>
                  <div className="text-sm text-muted">Stake: {formatCents(bet.stake_amount)} @ {bet.odds_decimal.toFixed(2)}</div>
                </div>
                <Link to="/bets" className="btn btn-sm btn-primary">Settle</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent pending bets */}
      {pending_bets.length > 0 && (
        <div className="section mt-4">
          <div className="section-title">
            Pending Bets
            <Link to="/bets" className="btn btn-sm btn-ghost">View all</Link>
          </div>
          {pending_bets.slice(0, 5).map(bet => (
            <div key={bet.id} className="bet-card">
              <div className="flex justify-between items-center">
                <div>
                  <div className="font-semibold">{bet.title}</div>
                  <div className="text-sm text-muted">
                    {formatCents(bet.stake_amount)} @ {bet.odds_decimal.toFixed(2)} → {formatCents(bet.potential_return)}
                    {bet.participant_name && <span> · {bet.participant_name}</span>}
                  </div>
                </div>
                <span className="badge badge-pending">pending</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {cashoutFixture && (
        <AiCashoutModal
          fixture={cashoutFixture}
          bets={cashoutFixture.pending_bets}
          onClose={() => setCashoutFixture(null)}
        />
      )}
    </div>
  )
}
