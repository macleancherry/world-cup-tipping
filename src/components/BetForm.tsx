import { useState, useEffect } from 'react'
import type { Fixture, Participant, BetType, MarketType } from '../types'
import { formatCents } from '../hooks/useApi'

interface Props {
  matchDayId: number
  fixtures: Fixture[]
  participants: Participant[]
  onCreated: () => void
  onCancel: () => void
}

const BET_TYPES: { value: BetType; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'multi', label: 'Multi / Accumulator' },
  { value: 'bet_builder', label: 'Bet Builder' },
  { value: 'futures', label: 'Futures / Outright' },
  { value: 'custom', label: 'Custom' },
]

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
  { value: 'custom', label: 'Custom (manual settle)' },
]

export default function BetForm({ matchDayId, fixtures, participants, onCreated, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [betType, setBetType] = useState<BetType>('single')
  const [marketType, setMarketType] = useState<MarketType>('home_win')
  const [goalsLine, setGoalsLine] = useState('2.5')
  const [stake, setStake] = useState('')
  const [odds, setOdds] = useState('')
  const [bookmaker, setBookmaker] = useState('')
  const [notes, setNotes] = useState('')
  const [participantId, setParticipantId] = useState<number | ''>('')
  const [selectedFixtures, setSelectedFixtures] = useState<number[]>([])
  const [customBet, setCustomBet] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const stakeNum = parseFloat(stake) || 0
  const oddsNum = parseFloat(odds) || 0
  const potentialReturn = stakeNum > 0 && oddsNum >= 1.01 ? stakeNum * oddsNum : 0
  const potentialProfit = potentialReturn - stakeNum

  function toggleFixture(id: number) {
    setSelectedFixtures(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  // Auto-fill title from selected fixture
  useEffect(() => {
    if (!customBet && selectedFixtures.length === 1 && !title) {
      const f = fixtures.find(x => x.id === selectedFixtures[0])
      if (f) {
        const mktLabel = MARKETS.find(m => m.value === marketType)?.label ?? ''
        setTitle(`${f.home_team} vs ${f.away_team} — ${mktLabel}`)
      }
    }
  }, [selectedFixtures, marketType])

  async function submit() {
    setError('')
    if (!title.trim()) { setError('Title is required'); return }
    if (customBet && !description.trim()) { setError('Description required for custom bets'); return }
    if (!stake || stakeNum <= 0) { setError('Enter a valid stake'); return }
    if (!odds || oddsNum < 1.01) { setError('Odds must be ≥ 1.01'); return }
    if (!customBet && selectedFixtures.length === 0) { setError('Select at least one fixture, or choose Custom bet'); return }

    const marketParams = (marketType === 'over_goals' || marketType === 'under_goals')
      ? JSON.stringify({ line: parseFloat(goalsLine) || 2.5 })
      : null

    setLoading(true)
    try {
      const r = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match_day_id: matchDayId,
          participant_id: participantId || null,
          title: title.trim(),
          description: description.trim() || null,
          bet_type: betType,
          market_type: customBet ? 'custom' : marketType,
          market_params_json: marketParams,
          stake_amount: Math.round(stakeNum * 100),
          odds_decimal: oddsNum,
          bookmaker: bookmaker.trim() || null,
          notes: notes.trim() || null,
          fixture_ids: customBet ? [] : selectedFixtures,
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

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add Bet</h2>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Custom vs fixture */}
        <div className="form-group">
          <label className="form-label">Bet type</label>
          <div className="flex gap-2">
            <button
              className={`btn btn-sm ${!customBet ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCustomBet(false)}
            >Linked to fixture(s)</button>
            <button
              className={`btn btn-sm ${customBet ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCustomBet(true)}
            >Custom / No fixture</button>
          </div>
        </div>

        {!customBet && (
          <>
            <div className="form-group">
              <label className="form-label">Select fixture(s)</label>
              {fixtures.length === 0 ? (
                <div className="text-sm text-muted">No fixtures on this day</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {fixtures.map(f => (
                    <label
                      key={f.id}
                      className="fixture-row"
                      style={{ cursor: 'pointer', borderColor: selectedFixtures.includes(f.id) ? 'var(--accent-blue)' : undefined, borderWidth: '1px', borderStyle: 'solid' }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFixtures.includes(f.id)}
                        onChange={() => toggleFixture(f.id)}
                      />
                      <div className="fixture-teams">
                        <span className="fixture-team home">{f.home_team}</span>
                        <span className="fixture-score-sep text-muted">vs</span>
                        <span className="fixture-team away">{f.away_team}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={betType} onChange={e => setBetType(e.target.value as BetType)}>
                  {BET_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Market</label>
                <select className="form-select" value={marketType} onChange={e => setMarketType(e.target.value as MarketType)}>
                  {MARKETS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            {(marketType === 'over_goals' || marketType === 'under_goals') && (
              <div className="form-group">
                <label className="form-label">Goals line</label>
                <input type="number" className="form-input" value={goalsLine} onChange={e => setGoalsLine(e.target.value)} step="0.5" min="0.5" />
              </div>
            )}
          </>
        )}

        {customBet && (
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={betType} onChange={e => setBetType(e.target.value as BetType)}>
              {BET_TYPES.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Bet title *</label>
          <input
            type="text"
            className="form-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. France to win Group F"
          />
        </div>

        {customBet && (
          <div className="form-group">
            <label className="form-label">Description * (required for custom bets)</label>
            <textarea
              className="form-textarea"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the bet in detail..."
            />
          </div>
        )}

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
            />
          </div>
          <div className="form-group">
            <label className="form-label">Decimal odds *</label>
            <input
              type="number"
              className="form-input"
              value={odds}
              onChange={e => setOdds(e.target.value)}
              step="0.01"
              min="1.01"
              placeholder="2.50"
            />
          </div>
        </div>

        {stakeNum > 0 && oddsNum >= 1.01 && (
          <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
            Potential return: <strong>{formatCents(Math.round(potentialReturn * 100))}</strong>
            {' '}(profit: <strong className={potentialProfit >= 0 ? 'text-green' : 'text-red'}>{formatCents(Math.round(potentialProfit * 100))}</strong>)
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Bookmaker</label>
            <input type="text" className="form-input" value={bookmaker} onChange={e => setBookmaker(e.target.value)} placeholder="e.g. Sportsbet" />
          </div>
          <div className="form-group">
            <label className="form-label">Bettor</label>
            <select className="form-select" value={participantId} onChange={e => setParticipantId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">— select —</option>
              {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Notes</label>
          <input type="text" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Placing...' : 'Place Bet'}
          </button>
        </div>
      </div>
    </div>
  )
}
