import { useState } from 'react'
import type { Bet, SettlementStatus } from '../types'
import { formatCents } from '../hooks/useApi'

interface Props {
  bet: Bet
  onClose: () => void
  onSettled: () => void
}

export default function SettlementModal({ bet, onClose, onSettled }: Props) {
  const [status, setStatus] = useState<SettlementStatus>('won')
  const [actualReturn, setActualReturn] = useState(String(bet.potential_return / 100))
  const [cashoutAmount, setCashoutAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = { status, notes: notes || undefined }
      if (status === 'won') {
        body.actual_return = Math.round(parseFloat(actualReturn) * 100)
      }
      if (status === 'cashed_out') {
        const amt = parseFloat(cashoutAmount)
        if (!amt || amt < 0) { setError('Enter cashout amount'); setLoading(false); return }
        body.actual_return = Math.round(amt * 100)
      }
      const r = await fetch(`/api/bets/${bet.id}/settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const e = await r.json() as { error: string }
        throw new Error(e.error)
      }
      onSettled()
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Settle Bet</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="card" style={{ marginBottom: '1rem', background: 'var(--bg-elevated)' }}>
          <div className="font-semibold">{bet.title}</div>
          <div className="text-sm text-secondary mt-1">
            Stake: {formatCents(bet.stake_amount)} @ {bet.odds_decimal.toFixed(2)} = {formatCents(bet.potential_return)} potential
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Result</label>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {(['won', 'lost', 'void', 'cashed_out'] as SettlementStatus[]).map(s => (
              <button
                key={s}
                className={`btn btn-sm ${status === s ? (s === 'won' ? 'btn-success' : s === 'lost' ? 'btn-danger' : 'btn-primary') : 'btn-ghost'}`}
                onClick={() => setStatus(s)}
              >
                {s === 'cashed_out' ? 'Cashed Out' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {status === 'won' && (
          <div className="form-group">
            <label className="form-label">Actual return ($)</label>
            <input
              type="number"
              className="form-input"
              value={actualReturn}
              onChange={e => setActualReturn(e.target.value)}
              step="0.01"
              min="0"
            />
            <div className="form-hint">Default: {formatCents(bet.potential_return)}</div>
          </div>
        )}

        {status === 'cashed_out' && (
          <div className="form-group">
            <label className="form-label">Cashout amount ($)</label>
            <input
              type="number"
              className="form-input"
              value={cashoutAmount}
              onChange={e => setCashoutAmount(e.target.value)}
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>
        )}

        {status === 'lost' && (
          <div className="alert alert-error">Kitty impact: –{formatCents(bet.stake_amount)}</div>
        )}
        {status === 'void' && (
          <div className="alert alert-info">Stake returned: {formatCents(bet.stake_amount)}</div>
        )}
        {status === 'won' && (
          <div className="alert alert-success">
            Net profit: +{formatCents(Math.round((parseFloat(actualReturn) || 0) * 100) - bet.stake_amount)}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Notes (optional)</label>
          <input
            type="text"
            className="form-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any settlement notes..."
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Settling...' : 'Confirm Settlement'}
          </button>
        </div>
      </div>
    </div>
  )
}
