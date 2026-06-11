import { useEffect, useState } from 'react'
import { formatCents } from '../hooks/useApi'
import BetCard from '../components/BetCard'
import SettlementModal from '../components/SettlementModal'
import type { Bet } from '../types'

type Filter = 'all' | 'pending' | 'won' | 'lost' | 'void' | 'cashed_out'

export default function BetsPage() {
  const [bets, setBets] = useState<Bet[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [settlingBet, setSettlingBet] = useState<Bet | null>(null)

  async function load(f: Filter = filter) {
    setLoading(true)
    const url = f === 'all' ? '/api/bets' : `/api/bets?status=${f}`
    const data = await fetch(url).then(r => r.json()) as Bet[]
    setBets(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [filter])

  async function reopenBet(bet: Bet) {
    if (!confirm(`Reopen bet "${bet.title}"?`)) return
    await fetch(`/api/bets/${bet.id}/reopen`, { method: 'POST' })
    load()
  }

  async function deleteBet(bet: Bet) {
    if (!confirm(`Delete "${bet.title}"?`)) return
    await fetch(`/api/bets/${bet.id}`, { method: 'DELETE' })
    load()
  }

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'won', label: 'Won' },
    { value: 'lost', label: 'Lost' },
    { value: 'void', label: 'Void' },
    { value: 'cashed_out', label: 'Cashed Out' },
  ]

  const totalStaked = bets.reduce((s, b) => s + b.stake_amount, 0)
  const totalReturned = bets.reduce((s, b) => s + (b.actual_return ?? 0), 0)
  const wonCount = bets.filter(b => b.settlement_status === 'won').length
  const lostCount = bets.filter(b => b.settlement_status === 'lost').length

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Bets</h1>
        <p className="page-subtitle">All bets placed on the kitty</p>
      </div>

      {/* Summary */}
      {filter === 'all' && bets.length > 0 && (
        <div className="grid-4 stats-strip mb-4">
          <div className="stat-card">
            <div className="stat-label">Total bets</div>
            <div className="stat-value">{bets.length}</div>
            <div className="stat-sub">{wonCount}W / {lostCount}L</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Staked</div>
            <div className="stat-value">{formatCents(totalStaked)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Returned</div>
            <div className="stat-value">{formatCents(totalReturned)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Net P&L</div>
            <div className={`stat-value ${totalReturned - totalStaked >= 0 ? 'positive' : 'negative'}`}>
              {totalReturned - totalStaked >= 0 ? '+' : ''}{formatCents(totalReturned - totalStaked)}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="tabs">
        {filters.map(f => {
          const count = f.value === 'all' ? bets.length : bets.filter(b => b.settlement_status === f.value).length
          return (
            <button
              key={f.value}
              className={`tab-btn ${filter === f.value ? 'active' : ''}`}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
              {f.value !== 'all' && filter === 'all' && count > 0 && (
                <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
      ) : bets.length === 0 ? (
        <div className="empty-state">
          <h3>No bets {filter !== 'all' ? `with status "${filter}"` : ''}</h3>
          <p>Go to a match day to place bets</p>
        </div>
      ) : (
        bets.map(bet => (
          <BetCard
            key={bet.id}
            bet={bet}
            onSettle={bet.settlement_status === 'pending' ? b => setSettlingBet(b) : undefined}
            onReopen={bet.settlement_status !== 'pending' ? reopenBet : undefined}
            onDelete={bet.settlement_status === 'pending' ? deleteBet : undefined}
          />
        ))
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
