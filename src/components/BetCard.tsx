import type { Bet } from '../types'
import { formatCents } from '../hooks/useApi'

interface Props {
  bet: Bet
  onSettle?: (bet: Bet) => void
  onReopen?: (bet: Bet) => void
  onDelete?: (bet: Bet) => void
  onTogglePlaced?: (bet: Bet) => void
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'badge-pending',
    won: 'badge-won',
    lost: 'badge-lost',
    void: 'badge-void',
    cashed_out: 'badge-cashed-out',
  }
  return map[status] ?? 'badge-pending'
}

function netImpact(bet: Bet): number {
  if (bet.settlement_status === 'pending') return -bet.stake_amount
  if (bet.settlement_status === 'won') return (bet.actual_return ?? bet.potential_return) - bet.stake_amount
  if (bet.settlement_status === 'lost') return -bet.stake_amount
  if (bet.settlement_status === 'void') return 0
  if (bet.settlement_status === 'cashed_out') return (bet.actual_return ?? 0) - bet.stake_amount
  return 0
}

export default function BetCard({ bet, onSettle, onReopen, onDelete, onTogglePlaced }: Props) {
  const impact = netImpact(bet)
  const isPending = bet.settlement_status === 'pending'
  const isPlaced = Boolean(bet.placed)

  return (
    <div className="bet-card">
      <div className="bet-card-header">
        <div>
          <div className="bet-card-title">{bet.title}</div>
          {bet.description && (
            <div className="text-xs text-muted mt-1">{bet.description}</div>
          )}
          {(bet as any).participant_name && (
            <div className="text-xs text-secondary mt-1">👤 {(bet as any).participant_name}</div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
          <span className={`badge ${statusBadge(bet.settlement_status)}`}>
            {bet.settlement_status.replace('_', ' ')}
          </span>
          {isPending && (
            <span style={{ fontSize: '0.65rem', color: isPlaced ? 'var(--accent-green)' : 'var(--text-muted)', fontWeight: 600 }}>
              {isPlaced ? '✓ on Sportsbet' : '○ not placed'}
            </span>
          )}
        </div>
      </div>

      {(bet.fixtures as any[])?.length > 0 && (
        <div className="mb-3">
          {(bet.fixtures as any[]).map((f: any) => (
            <div key={f.id} className="text-xs text-secondary" style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--border)' }}>
              {f.home_team} vs {f.away_team}
              {f.status === 'finished' && ` — ${f.home_score}:${f.away_score}`}
            </div>
          ))}
        </div>
      )}

      <div className="bet-card-body">
        <div className="bet-stat">
          <div className="bet-stat-label">Stake</div>
          <div className="bet-stat-value">{formatCents(bet.stake_amount)}</div>
        </div>
        <div className="bet-stat">
          <div className="bet-stat-label">Odds</div>
          <div className="bet-stat-value">{bet.odds_decimal.toFixed(2)}</div>
        </div>
        <div className="bet-stat">
          <div className="bet-stat-label">Potential return</div>
          <div className="bet-stat-value">{formatCents(bet.potential_return)}</div>
        </div>
        {!isPending && (
          <div className="bet-stat">
            <div className="bet-stat-label">Actual return</div>
            <div className="bet-stat-value">{formatCents(bet.actual_return ?? 0)}</div>
          </div>
        )}
        <div className="bet-stat">
          <div className="bet-stat-label">Net impact</div>
          <div className={`bet-stat-value ${impact > 0 ? 'text-green' : impact < 0 ? 'text-red' : 'text-muted'}`}>
            {impact >= 0 ? '+' : ''}{formatCents(impact)}
          </div>
        </div>
        {bet.bookmaker && (
          <div className="bet-stat">
            <div className="bet-stat-label">Bookmaker</div>
            <div className="bet-stat-value">{bet.bookmaker}</div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-3" style={{ justifyContent: 'flex-end' }}>
        {isPending && onTogglePlaced && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: isPlaced ? 'var(--accent-green)' : 'var(--text-muted)' }}
            onClick={() => onTogglePlaced(bet)}
          >
            {isPlaced ? '✓ Placed' : '○ Mark placed'}
          </button>
        )}
        {isPending && onSettle && (
          <button className="btn btn-primary btn-sm" onClick={() => onSettle(bet)}>Settle</button>
        )}
        {!isPending && onReopen && (
          <button className="btn btn-ghost btn-sm" onClick={() => onReopen(bet)}>Reopen</button>
        )}
        {isPending && onDelete && (
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => onDelete(bet)}>Delete</button>
        )}
      </div>
    </div>
  )
}
