import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { formatCents, formatDate } from '../hooks/useApi'
import FixtureRow from '../components/FixtureRow'
import BetCard from '../components/BetCard'
import BetForm from '../components/BetForm'
import SettlementModal from '../components/SettlementModal'
import type { Fixture, Bet, Participant } from '../types'

interface MatchDayDetail {
  id: number
  local_date: string
  stage: string | null
  assigned_participant_id: number | null
  assigned_participant_name: string | null
  budget_amount: number
  notes: string | null
  status: string
  fixtures: Fixture[]
  bets: (Bet & { participant_name?: string })[]
}

export default function MatchDayDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [day, setDay] = useState<MatchDayDetail | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [showBetForm, setShowBetForm] = useState(false)
  const [settlingBet, setSettlingBet] = useState<Bet | null>(null)

  async function load() {
    const [dayRes, partsRes] = await Promise.all([
      fetch(`/api/match-days/${id}`),
      fetch('/api/participants'),
    ])
    const dayData = await dayRes.json() as MatchDayDetail
    const partsData = await partsRes.json() as Participant[]
    setDay(dayData)
    setParticipants(partsData)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function deleteBet(bet: Bet) {
    if (!confirm(`Delete bet "${bet.title}"? The stake will be returned to the kitty.`)) return
    await fetch(`/api/bets/${bet.id}`, { method: 'DELETE' })
    load()
  }

  async function reopenBet(bet: Bet) {
    if (!confirm(`Reopen bet "${bet.title}"? This will reverse the settlement.`)) return
    await fetch(`/api/bets/${bet.id}/reopen`, { method: 'POST' })
    load()
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>
  if (!day) return <div className="alert alert-error">Match day not found</div>

  const totalStaked = day.bets.reduce((s, b) => s + b.stake_amount, 0)
  const pendingBets = day.bets.filter(b => b.settlement_status === 'pending')
  const settledBets = day.bets.filter(b => b.settlement_status !== 'pending')

  return (
    <div>
      <div className="page-header">
        <Link to="/match-days" className="btn btn-ghost btn-sm" style={{ marginBottom: '0.75rem' }}>← Match Days</Link>
        <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 className="page-title">{formatDate(day.local_date)}</h1>
            {day.stage && <p className="page-subtitle">{day.stage}</p>}
          </div>
          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            <span className="deadline-chip">📋 Submit by 9pm AEST</span>
            <button className="btn btn-primary" onClick={() => setShowBetForm(true)}>+ Add Bet</button>
          </div>
        </div>
      </div>

      <div className="matchday-layout">
      {/* Day summary */}
      <div className="grid-3 stats-strip mb-4 matchday-stats">
        <div className="stat-card">
          <div className="stat-label">Budget</div>
          <div className="stat-value">{formatCents(day.budget_amount)}</div>
          {day.assigned_participant_name && <div className="stat-sub">👤 {day.assigned_participant_name}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">Staked</div>
          <div className="stat-value text-red">{formatCents(totalStaked)}</div>
          <div className="stat-sub">{formatCents(Math.max(0, day.budget_amount - totalStaked))} remaining</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Bets</div>
          <div className="stat-value">{day.bets.length}</div>
          <div className="stat-sub">{pendingBets.length} pending · {settledBets.length} settled</div>
        </div>
      </div>

      {/* Fixtures */}
      <div className="section matchday-fixtures">
        <div className="section-title">Fixtures ({day.fixtures.length})</div>
        {day.fixtures.length === 0 ? (
          <div className="empty-state"><p>No fixtures on this day</p></div>
        ) : (
          day.fixtures.map(f => <FixtureRow key={f.id} fixture={f} />)
        )}
      </div>

      {/* Pending bets */}
      {pendingBets.length > 0 && (
        <div className="section matchday-bets">
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
        <div className="section matchday-bets">
          <div className="section-title">Settled Bets ({settledBets.length})</div>
          {settledBets.map(bet => (
            <BetCard key={bet.id} bet={bet} onReopen={reopenBet} />
          ))}
        </div>
      )}

      {day.bets.length === 0 && (
        <div className="empty-state">
          <h3>No bets yet</h3>
          <p>Place a bet on this day's fixtures</p>
          <button className="btn btn-primary mt-3" onClick={() => setShowBetForm(true)}>+ Add Bet</button>
        </div>
      )}
      </div>

      {showBetForm && (
        <BetForm
          matchDayId={day.id}
          fixtures={day.fixtures}
          participants={participants}
          onCreated={() => { setShowBetForm(false); load() }}
          onCancel={() => setShowBetForm(false)}
        />
      )}

      {settlingBet && (
        <SettlementModal
          bet={settlingBet}
          onClose={() => setSettlingBet(null)}
          onSettled={() => { setSettlingBet(null); load() }}
        />
      )}
    </div>
  )
}
