import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCents, formatDate } from '../hooks/useApi'

interface MatchDay {
  id: number
  local_date: string
  stage: string | null
  assigned_participant_name: string | null
  assigned_participant_initials: string | null
  budget_amount: number
  total_staked: number
  pending_bets_count: number
  fixture_count: number
  status: string
}

function stageBadge(stage: string | null) {
  if (!stage) return ''
  if (stage.includes('Group')) return 'badge-scheduled'
  if (stage.includes('Final') && !stage.includes('Third')) return 'badge-won'
  if (stage.includes('Semi')) return 'badge-in-progress'
  if (stage.includes('Quarter')) return 'badge-in-progress'
  return 'badge-void'
}

export default function MatchDaysPage() {
  const [days, setDays] = useState<MatchDay[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'complete'>('all')

  useEffect(() => {
    fetch('/api/match-days')
      .then(r => r.json())
      .then(d => { setDays(d as MatchDay[]); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Perth' })

  const filtered = days.filter(d => {
    if (filter === 'upcoming') return d.local_date >= today
    if (filter === 'complete') return d.local_date < today
    return true
  })

  // Group by stage
  const grouped = filtered.reduce<Record<string, MatchDay[]>>((acc, d) => {
    const key = d.stage ?? 'Tournament'
    acc[key] = acc[key] ?? []
    acc[key].push(d)
    return acc
  }, {})

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Match Days</h1>
        <p className="page-subtitle">All tournament match days — click to view fixtures and manage bets</p>
        <div className="page-actions">
          {(['all', 'upcoming', 'complete'] as const).map(f => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {Object.entries(grouped).map(([stage, stageDays]) => (
        <div key={stage} className="section">
          <div className="section-title">
            <span className={`badge ${stageBadge(stage)}`}>{stage}</span>
            <span className="text-muted text-sm">({stageDays.length} days)</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {stageDays.map(day => {
              const isToday = day.local_date === today
              const budgetPct = day.budget_amount > 0 ? Math.min(100, (day.total_staked / day.budget_amount) * 100) : 0

              return (
                <Link
                  key={day.id}
                  to={`/match-days/${day.id}`}
                  className={`match-day-card${isToday ? ' today' : ''}`}
                >
                  <div className="match-day-header">
                    <span className="match-day-date">
                      {isToday ? '📅 Today — ' : ''}{formatDate(day.local_date)}
                    </span>
                    <span className={`badge badge-${day.status}`}>{day.status}</span>
                  </div>
                  <div className="match-day-meta">
                    <span>🏟 {day.fixture_count} fixture{day.fixture_count !== 1 ? 's' : ''}</span>
                    {day.assigned_participant_name && (
                      <span>👤 {day.assigned_participant_name}</span>
                    )}
                    <span>Budget: {formatCents(day.budget_amount)}</span>
                    {day.total_staked > 0 && (
                      <span>Staked: {formatCents(day.total_staked)}</span>
                    )}
                    {day.pending_bets_count > 0 && (
                      <span className="text-yellow">{day.pending_bets_count} pending bet{day.pending_bets_count !== 1 ? 's' : ''}</span>
                    )}
                  </div>
                  {day.total_staked > 0 && (
                    <div className="progress-bar mt-2">
                      <div
                        className={`progress-fill ${budgetPct > 80 ? 'danger' : budgetPct > 50 ? 'warning' : ''}`}
                        style={{ width: `${budgetPct}%` }}
                      />
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>No match days found</h3>
          <p>Import fixtures to populate match days</p>
        </div>
      )}
    </div>
  )
}
