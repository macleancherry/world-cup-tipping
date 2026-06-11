import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCents, formatDate, formatKickoff } from '../hooks/useApi'
import type { Bet, Fixture } from '../types'

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
  today_fixtures: Fixture[]
  pending_bets: (Bet & { participant_name?: string })[]
  needs_settlement: Bet[]
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => { setData(d as DashboardData); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function checkResults() {
    setSyncLoading(true)
    setSyncResult(null)
    try {
      const r = await fetch('/api/results/sync', { method: 'POST' })
      const d = await r.json() as { fixtures_updated: number; bets_auto_settled: number; bets_needing_settlement: number; errors: string[] }
      setSyncResult(`Updated ${d.fixtures_updated} fixtures. Auto-settled ${d.bets_auto_settled} bets. ${d.bets_needing_settlement} need manual settlement.`)
      // Refresh dashboard
      fetch('/api/dashboard').then(r => r.json()).then(d => setData(d as DashboardData))
    } catch {
      setSyncResult('Sync failed. Check your connection.')
    } finally {
      setSyncLoading(false)
    }
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!data) return <div className="alert alert-error">Failed to load dashboard</div>

  const { kitty, today_match_day: today, today_fixtures, pending_bets, needs_settlement } = data
  const pnl = kitty.balance - kitty.starting_kitty

  return (
    <div>
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">⚽ World Cup 2026</h1>
          <p className="page-subtitle">Betting Kitty Dashboard</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={checkResults} disabled={syncLoading}>
            {syncLoading ? '⟳ Checking...' : '🔄 Check Results'}
          </button>
          <Link to="/match-days" className="btn btn-ghost">+ Add Bet</Link>
        </div>
      </div>

      {syncResult && (
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>{syncResult}</div>
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
      <div className="grid-4 mb-4">
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

      <div className="grid-2">
        {/* Today's match day */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Today's Match Day</span>
            {today && <Link to={`/match-days/${today.id}`} className="btn btn-sm btn-primary">+ Add Bet</Link>}
          </div>
          {today ? (
            <>
              <div className="font-bold text-lg">{formatDate(today.local_date)}</div>
              {today.assigned_participant_name && (
                <div className="text-sm text-secondary mt-1">Bettor: <strong>{today.assigned_participant_name}</strong></div>
              )}
              <div className="mt-3">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted">Budget used</span>
                  <span>{formatCents(today.today_staked)} / {formatCents(today.today_budget)}</span>
                </div>
                <div className="progress-bar">
                  <div
                    className={`progress-fill ${today.today_staked / today.today_budget > 0.8 ? 'danger' : today.today_staked / today.today_budget > 0.5 ? 'warning' : ''}`}
                    style={{ width: `${Math.min(100, (today.today_staked / today.today_budget) * 100)}%` }}
                  />
                </div>
                <div className="text-xs text-muted mt-1">
                  {formatCents(Math.max(0, today.today_budget - today.today_staked))} remaining
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <p>No match day today</p>
            </div>
          )}
        </div>

        {/* Today's fixtures */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Today's Fixtures</span>
            <span className="badge badge-scheduled">{today_fixtures.length}</span>
          </div>
          {today_fixtures.length === 0 ? (
            <div className="empty-state"><p>No fixtures today</p></div>
          ) : (
            today_fixtures.map(f => (
              <div key={f.id} className="fixture-row" style={{ marginBottom: '0.5rem' }}>
                <div className="fixture-time">{formatKickoff(f.kickoff_utc)}</div>
                <div className="fixture-teams">
                  <span className="fixture-team home">{f.home_team}</span>
                  <div className="fixture-score">
                    {f.status !== 'scheduled' ? (
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
    </div>
  )
}
