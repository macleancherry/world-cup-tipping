import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { formatCents, formatDate } from '../hooks/useApi'
import FixtureRow from '../components/FixtureRow'
import BetCard from '../components/BetCard'
import BetForm from '../components/BetForm'
import SettlementModal from '../components/SettlementModal'
import type { Fixture, Bet, Participant } from '../types'

interface MatchDaySummary {
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

interface MatchDayDetail {
  id: number
  local_date: string
  stage: string | null
  assigned_participant_id: number | null
  assigned_participant_name: string | null
  budget_amount: number
  status: string
  fixtures: Fixture[]
  bets: (Bet & { participant_name?: string })[]
}

function stageBadge(stage: string | null) {
  if (!stage) return ''
  if (stage.includes('Group')) return 'badge-scheduled'
  if (stage.includes('Final') && !stage.includes('Third')) return 'badge-won'
  if (stage.includes('Semi') || stage.includes('Quarter')) return 'badge-in-progress'
  return 'badge-void'
}

export default function MatchDaysPage() {
  const [searchParams] = useSearchParams()
  const [days, setDays] = useState<MatchDaySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'complete'>('upcoming')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [details, setDetails] = useState<Map<number, MatchDayDetail>>(new Map())
  const [loadingDetail, setLoadingDetail] = useState<Set<number>>(new Set())
  const [participants, setParticipants] = useState<Participant[]>([])
  const [bettingDayId, setBettingDayId] = useState<number | null>(null)
  const [settlingBet, setSettlingBet] = useState<Bet | null>(null)

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Perth' })

  async function loadSummaries() {
    const data = await fetch('/api/match-days').then(r => r.json()) as MatchDaySummary[]
    setDays(data)
    return data
  }

  async function loadDetail(id: number) {
    setLoadingDetail(prev => new Set([...prev, id]))
    try {
      const data = await fetch(`/api/match-days/${id}`).then(r => r.json()) as MatchDayDetail
      setDetails(prev => new Map([...prev, [id, data]]))
    } finally {
      setLoadingDetail(prev => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  async function reload(id: number) {
    await Promise.all([loadSummaries(), loadDetail(id)])
  }

  function expandDay(id: number, allDays?: MatchDaySummary[]) {
    const day = (allDays ?? days).find(d => d.id === id)
    if (day && day.local_date < today) setFilter('all')
    setExpanded(prev => new Set([...prev, id]))
    loadDetail(id)
  }

  function toggleDay(id: number) {
    if (expanded.has(id)) {
      setExpanded(prev => { const s = new Set(prev); s.delete(id); return s })
    } else {
      expandDay(id)
    }
  }

  useEffect(() => {
    const targetId = searchParams.get('day') ? Number(searchParams.get('day')) : null
    Promise.all([
      loadSummaries(),
      fetch('/api/participants').then(r => r.json()) as Promise<Participant[]>,
    ]).then(([daysData, partsData]) => {
      setParticipants(partsData)
      setLoading(false)
      const idToExpand = targetId ?? daysData.find(d => d.local_date >= today)?.id ?? null
      if (idToExpand) expandDay(idToExpand, daysData)
    })
  }, [])

  async function deleteBet(bet: Bet) {
    if (!confirm(`Delete bet "${bet.title}"? The stake will be returned to the kitty.`)) return
    await fetch(`/api/bets/${bet.id}`, { method: 'DELETE' })
    reload(bet.match_day_id)
  }

  async function reopenBet(bet: Bet) {
    if (!confirm(`Reopen bet "${bet.title}"? This will reverse the settlement.`)) return
    await fetch(`/api/bets/${bet.id}/reopen`, { method: 'POST' })
    reload(bet.match_day_id)
  }

  const filtered = days.filter(d => {
    if (filter === 'upcoming') return d.status === 'upcoming' || d.status === 'in_progress'
    if (filter === 'complete') return d.status === 'complete' || d.status === 'settled'
    return true
  })

  const grouped = filtered.reduce<Record<string, MatchDaySummary[]>>((acc, d) => {
    const key = d.stage ?? 'Tournament'
    acc[key] = acc[key] ?? []
    acc[key].push(d)
    return acc
  }, {})

  const bettingDetail = bettingDayId != null ? details.get(bettingDayId) : null

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Schedule</h1>
        <p className="page-subtitle">Select a match day to view fixtures and place bets</p>
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
              const isExpanded = expanded.has(day.id)
              const detail = details.get(day.id)
              const isLoadingDetail = loadingDetail.has(day.id)
              const budgetPct = day.budget_amount > 0 ? Math.min(100, (day.total_staked / day.budget_amount) * 100) : 0
              const totalStaked = detail?.bets.reduce((s, b) => s + b.stake_amount, 0) ?? 0
              const pendingBets = detail?.bets.filter(b => b.settlement_status === 'pending') ?? []
              const settledBets = detail?.bets.filter(b => b.settlement_status !== 'pending') ?? []

              return (
                <div
                  key={day.id}
                  className={`match-day-card${isToday ? ' today' : ''}${isExpanded ? ' expanded' : ''}`}
                >
                  {/* Clickable summary header */}
                  <div onClick={() => toggleDay(day.id)} style={{ cursor: 'pointer' }}>
                    <div className="match-day-header">
                      <span className="match-day-date">
                        {isToday ? '📅 Today — ' : ''}{formatDate(day.local_date)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={`badge badge-${day.status}`}>{day.status}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1 }}>
                          {isExpanded ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>
                    <div className="match-day-meta">
                      <span>🏟 {day.fixture_count} fixture{day.fixture_count !== 1 ? 's' : ''}</span>
                      {day.assigned_participant_initials && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--socceroos-gold)', color: '#000',
                            fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
                          }}>{day.assigned_participant_initials}</span>
                          {day.assigned_participant_name}
                        </span>
                      )}
                      {day.total_staked > 0 && <span>Staked: {formatCents(day.total_staked)}</span>}
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
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                      {isLoadingDetail ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem 0' }}>
                          <div className="spinner" />
                        </div>
                      ) : detail ? (
                        <>
                          {/* Stats + Add Bet */}
                          <div style={{ marginBottom: '1rem' }}>
                            <div className="grid-3 stats-strip" style={{ margin: 0, marginBottom: '0.75rem' }}>
                              <div className="stat-card">
                                <div className="stat-label">Budget</div>
                                <div className="stat-value">{formatCents(detail.budget_amount)}</div>
                                {detail.assigned_participant_name && (
                                  <div className="stat-sub">👤 {detail.assigned_participant_name}</div>
                                )}
                              </div>
                              <div className="stat-card">
                                <div className="stat-label">Staked</div>
                                <div className="stat-value text-red">{formatCents(totalStaked)}</div>
                                <div className="stat-sub">{formatCents(Math.max(0, detail.budget_amount - totalStaked))} left</div>
                              </div>
                              <div className="stat-card">
                                <div className="stat-label">Bets</div>
                                <div className="stat-value">{detail.bets.length}</div>
                                <div className="stat-sub">{pendingBets.length} pending</div>
                              </div>
                            </div>
                            <button
                              className="btn btn-primary"
                              style={{ width: '100%' }}
                              onClick={() => setBettingDayId(day.id)}
                            >
                              + Add Bet
                            </button>
                          </div>

                          {/* Fixtures */}
                          {detail.fixtures.length > 0 && (
                            <div className="section" style={{ marginBottom: '1rem' }}>
                              <div className="section-title">Fixtures ({detail.fixtures.length})</div>
                              {detail.fixtures.map(f => <FixtureRow key={f.id} fixture={f} />)}
                            </div>
                          )}

                          {/* Pending bets */}
                          {pendingBets.length > 0 && (
                            <div className="section" style={{ marginBottom: '1rem' }}>
                              <div className="section-title">Pending Bets ({pendingBets.length})</div>
                              {pendingBets.map(bet => (
                                <BetCard
                                  key={bet.id}
                                  bet={bet}
                                  onSettle={b => setSettlingBet(b)}
                                  onDelete={deleteBet}
                                />
                              ))}
                            </div>
                          )}

                          {/* Settled bets */}
                          {settledBets.length > 0 && (
                            <div className="section" style={{ marginBottom: '0.5rem' }}>
                              <div className="section-title">Settled Bets ({settledBets.length})</div>
                              {settledBets.map(bet => (
                                <BetCard key={bet.id} bet={bet} onReopen={reopenBet} />
                              ))}
                            </div>
                          )}

                          {detail.bets.length === 0 && (
                            <div className="empty-state" style={{ padding: '1rem 0' }}>
                              <p>No bets yet — click Add Bet to get started</p>
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
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

      {bettingDayId != null && bettingDetail && (
        <BetForm
          matchDayId={bettingDayId}
          fixtures={bettingDetail.fixtures}
          participants={participants}
          budget={bettingDetail.budget_amount}
          staked={bettingDetail.bets.reduce((s, b) => s + b.stake_amount, 0)}
          assignedParticipantId={bettingDetail.assigned_participant_id ?? undefined}
          assignedParticipantName={bettingDetail.assigned_participant_name ?? undefined}
          onCreated={() => { const id = bettingDayId; setBettingDayId(null); reload(id) }}
          onCancel={() => setBettingDayId(null)}
        />
      )}

      {settlingBet && (
        <SettlementModal
          bet={settlingBet}
          onClose={() => setSettlingBet(null)}
          onSettled={() => { const bet = settlingBet; setSettlingBet(null); reload(bet.match_day_id) }}
        />
      )}
    </div>
  )
}
