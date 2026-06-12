import { useState } from 'react'
import type { Fixture, Participant, MarketType } from '../types'
import { formatCents } from '../hooks/useApi'
import AiTipModal from './AiTipModal'

interface Props {
  matchDayId: number
  fixtures: Fixture[]
  participants: Participant[]
  budget?: number
  staked?: number
  onCreated: () => void
  onCancel: () => void
}

const MARKETS: { value: MarketType; label: string }[] = [
  { value: 'home_win', label: 'Home Win' },
  { value: 'away_win', label: 'Away Win' },
  { value: 'draw', label: 'Draw' },
  { value: 'home_or_draw', label: 'Home or Draw' },
  { value: 'away_or_draw', label: 'Away or Draw' },
  { value: 'over_goals', label: 'Over Goals' },
  { value: 'under_goals', label: 'Under Goals' },
  { value: 'btts_yes', label: 'Both Teams to Score' },
  { value: 'btts_no', label: 'Both Teams NOT to Score' },
  { value: 'custom', label: 'Other / Custom' },
]

export default function BetForm({ matchDayId, fixtures, participants, budget, staked = 0, onCreated, onCancel }: Props) {
  const [marketType, setMarketType] = useState<MarketType>('home_win')
  const [goalsLine, setGoalsLine] = useState('2.5')
  const [stake, setStake] = useState('')
  const [odds, setOdds] = useState('')
  const [participantId, setParticipantId] = useState<number | ''>('')
  const [selectedFixtures, setSelectedFixtures] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAiTip, setShowAiTip] = useState(false)

  const stakeNum = parseFloat(stake) || 0
  const oddsNum = parseFloat(odds) || 0
  const potentialReturn = stakeNum > 0 && oddsNum >= 1.01 ? stakeNum * oddsNum : 0
  const potentialProfit = potentialReturn - stakeNum

  const remaining = budget != null ? budget - staked : null
  const overBudget = remaining != null && stakeNum * 100 > remaining
  const nearBudget = remaining != null && !overBudget && stakeNum * 100 > remaining * 0.8

  const bettableFixtures = fixtures.filter(f => f.status === 'scheduled' || f.status === 'in_progress')
  const hiddenCount = fixtures.length - bettableFixtures.length

  // Derive title automatically — no manual input
  const autoTitle = selectedFixtures.length === 1
    ? (() => {
        const f = bettableFixtures.find(x => x.id === selectedFixtures[0])
        const mkt = MARKETS.find(m => m.value === marketType)?.label ?? ''
        return f ? `${f.home_team} vs ${f.away_team} — ${mkt}` : ''
      })()
    : selectedFixtures.length > 1
      ? `Multi (${selectedFixtures.length} games)`
      : ''

  function toggleFixture(id: number) {
    setSelectedFixtures(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function submit() {
    setError('')
    if (selectedFixtures.length === 0) { setError('Select at least one game to bet on'); return }
    if (!stake || stakeNum <= 0) { setError('Enter a valid stake'); return }
    if (!odds || oddsNum < 1.01) { setError('Odds must be at least 1.01'); return }

    const marketParams = (marketType === 'over_goals' || marketType === 'under_goals')
      ? JSON.stringify({ line: parseFloat(goalsLine) || 2.5 })
      : null

    const betType = selectedFixtures.length === 1 ? 'single' : 'multi'

    setLoading(true)
    try {
      const r = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_day_id: matchDayId,
          participant_id: participantId || null,
          title: autoTitle,
          description: null,
          bet_type: betType,
          market_type: marketType,
          market_params_json: marketParams,
          stake_amount: Math.round(stakeNum * 100),
          odds_decimal: oddsNum,
          bookmaker: 'Sportsbet',
          notes: null,
          fixture_ids: selectedFixtures,
        }),
      })
      if (!r.ok) {
        const e = await r.json() as { error: string }
        throw new Error(e.error)
      }
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const aiFixture = selectedFixtures.length === 1 ? bettableFixtures.find(x => x.id === selectedFixtures[0]) : undefined

  return (
    <>
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2 className="modal-title">Add Bet</h2>
            <button className="modal-close" onClick={onCancel}>✕</button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {remaining != null && (
            <div className={`alert ${overBudget ? 'alert-error' : nearBudget ? 'alert-warn' : 'alert-info'}`} style={{ marginBottom: '1rem' }}>
              {overBudget
                ? `Over budget — only ${formatCents(remaining)} remaining of ${formatCents(budget!)}`
                : `${formatCents(remaining)} remaining of ${formatCents(budget!)} daily budget`}
            </div>
          )}

          {/* Game picker */}
          <div className="form-group">
            <label className="form-label">
              Select game{selectedFixtures.length > 1 ? 's' : ''} *
              {hiddenCount > 0 && (
                <span className="text-muted" style={{ fontWeight: 400, marginLeft: '0.4rem', fontSize: '0.75rem' }}>
                  · {hiddenCount} finished game{hiddenCount !== 1 ? 's' : ''} hidden
                </span>
              )}
            </label>
            {bettableFixtures.length === 0 ? (
              <p className="text-muted" style={{ fontSize: '0.875rem' }}>No upcoming games on this day.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {bettableFixtures.map(f => (
                  <button
                    key={f.id}
                    type="button"
                    className={`fixture-row fixture-picker-btn ${selectedFixtures.includes(f.id) ? 'selected' : ''}`}
                    onClick={() => toggleFixture(f.id)}
                  >
                    <div className="fixture-teams">
                      <span className="fixture-team home">{f.home_team}</span>
                      <span className="fixture-score-sep text-muted">vs</span>
                      <span className="fixture-team away">{f.away_team}</span>
                    </div>
                    {selectedFixtures.includes(f.id) && <span className="fixture-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* AI tip — single game only */}
          {selectedFixtures.length === 1 && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAiTip(true)}
                style={{ width: '100%' }}
              >
                🤖 Get AI Tip for this match
              </button>
            </div>
          )}

          {/* Market */}
          {selectedFixtures.length > 0 && (
            <>
              <div className="form-group">
                <label className="form-label">Market</label>
                <select className="form-select" value={marketType} onChange={e => setMarketType(e.target.value as MarketType)}>
                  {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {(marketType === 'over_goals' || marketType === 'under_goals') && (
                <div className="form-group">
                  <label className="form-label">Goals line</label>
                  <input type="number" className="form-input" value={goalsLine} onChange={e => setGoalsLine(e.target.value)} step="0.5" min="0.5" />
                </div>
              )}
            </>
          )}

          {/* Stake + odds */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Stake ($) *</label>
              <input
                type="number"
                className="form-input"
                value={stake}
                onChange={e => setStake(e.target.value)}
                step="0.50"
                min="0.01"
                placeholder="5.00"
                inputMode="decimal"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Odds *</label>
              <input
                type="number"
                className="form-input"
                value={odds}
                onChange={e => setOdds(e.target.value)}
                step="0.01"
                min="1.01"
                placeholder="2.50"
                inputMode="decimal"
              />
            </div>
          </div>

          {stakeNum > 0 && oddsNum >= 1.01 && (
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              Return: <strong>{formatCents(Math.round(potentialReturn * 100))}</strong>
              {' '}· Profit: <strong className={potentialProfit >= 0 ? 'text-green' : 'text-red'}>{formatCents(Math.round(potentialProfit * 100))}</strong>
            </div>
          )}

          {participants.length > 0 && (
            <div className="form-group">
              <label className="form-label">Suggested by</label>
              <select className="form-select" value={participantId} onChange={e => setParticipantId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">— anyone —</option>
                {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          <p className="text-xs text-muted" style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
            📋 Bets must be submitted by <strong>9pm AEST</strong> so the kitty manager can place them on Sportsbet.
          </p>

          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={loading || overBudget}>
              {loading ? 'Saving...' : 'Add Bet'}
            </button>
          </div>
        </div>
      </div>
      {showAiTip && aiFixture && (
        <AiTipModal fixture={aiFixture} onClose={() => setShowAiTip(false)} />
      )}
    </>
  )
}
