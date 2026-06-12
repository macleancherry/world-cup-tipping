import { useState, useEffect } from 'react'
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

const MARKETS: { value: MarketType; label: string; homeLabel?: string; awayLabel?: string }[] = [
  { value: 'home_win',     label: 'Home Win',         homeLabel: '{home} Win' },
  { value: 'away_win',     label: 'Away Win',         awayLabel: '{away} Win' },
  { value: 'draw',         label: 'Draw' },
  { value: 'home_or_draw', label: 'Home or Draw',     homeLabel: '{home} or Draw' },
  { value: 'away_or_draw', label: 'Away or Draw',     awayLabel: '{away} or Draw' },
  { value: 'over_goals',   label: 'Over Goals' },
  { value: 'under_goals',  label: 'Under Goals' },
  { value: 'btts_yes',     label: 'Both Teams to Score' },
  { value: 'btts_no',      label: 'Both Teams NOT to Score' },
  { value: 'custom',       label: 'Other / Custom' },
]

function marketLabel(market: typeof MARKETS[number], homeTeam?: string, awayTeam?: string): string {
  if (homeTeam && market.homeLabel) return market.homeLabel.replace('{home}', homeTeam)
  if (awayTeam && market.awayLabel) return market.awayLabel.replace('{away}', awayTeam)
  return market.label
}

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
  const [oddsData, setOddsData] = useState<Record<string, number> | null>(null)
  const [oddsMeta, setOddsMeta] = useState<{ fetchCount: number; maxFetches: number; maxReached: boolean; fetchedAt: string; fromCache: boolean; stale?: boolean } | null>(null)
  const [oddsLoading, setOddsLoading] = useState(false)
  const [oddsError, setOddsError] = useState('')

  const stakeNum = parseFloat(stake) || 0
  const oddsNum = parseFloat(odds) || 0
  const potentialReturn = stakeNum > 0 && oddsNum >= 1.01 ? stakeNum * oddsNum : 0
  const potentialProfit = potentialReturn - stakeNum

  const remaining = budget != null ? budget - staked : null
  const overBudget = remaining != null && stakeNum * 100 > remaining
  const nearBudget = remaining != null && !overBudget && stakeNum * 100 > remaining * 0.8

  const now = new Date()
  const bettableFixtures = fixtures.filter(f =>
    f.status === 'scheduled' && new Date(f.kickoff_utc) > now
  )
  const hiddenCount = fixtures.length - bettableFixtures.length

  const singleFixture = selectedFixtures.length === 1
    ? bettableFixtures.find(x => x.id === selectedFixtures[0])
    : undefined

  // Auto-load odds whenever the selected single fixture changes
  useEffect(() => {
    if (singleFixture) {
      loadOdds(singleFixture.id)
    } else {
      setOddsData(null)
      setOddsMeta(null)
      setOddsError('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleFixture?.id])

  const autoTitle = singleFixture
    ? (() => {
        const mkt = MARKETS.find(m => m.value === marketType)
        const mktName = mkt ? marketLabel(mkt, singleFixture.home_team, singleFixture.away_team) : ''
        return `${singleFixture.home_team} vs ${singleFixture.away_team} — ${mktName}`
      })()
    : selectedFixtures.length > 1
      ? `Multi (${selectedFixtures.length} games)`
      : ''

  const aiFixtures = selectedFixtures.length > 0
    ? bettableFixtures.filter(f => selectedFixtures.includes(f.id))
    : bettableFixtures

  const goalsSelected = marketType === 'over_goals' || marketType === 'under_goals'

  function toggleFixture(id: number) {
    setSelectedFixtures(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function loadOdds(fixtureId: number) {
    setOddsLoading(true)
    setOddsError('')
    try {
      const r = await fetch(`/api/fixtures/${fixtureId}/odds`)
      const d = await r.json() as Record<string, number | boolean | string>
      if (!d.available) {
        setOddsError((d.reason as string) || 'Odds not available')
        setOddsData(null)
        setOddsMeta(null)
      } else {
        const nums: Record<string, number> = {}
        for (const [k, v] of Object.entries(d)) {
          if (typeof v === 'number') nums[k] = v
        }
        setOddsData(nums)
        setOddsMeta({
          fetchCount: d.fetch_count as number,
          maxFetches: d.max_fetches as number,
          maxReached: d.max_reached as boolean,
          fetchedAt: d.fetched_at as string,
          fromCache: d.from_cache as boolean,
          stale: d.stale as boolean | undefined,
        })
      }
    } catch {
      setOddsError('Failed to load odds')
    } finally {
      setOddsLoading(false)
    }
  }

  function applyOdds(market: MarketType, price: number, line?: number) {
    setMarketType(market)
    setOdds(price.toFixed(2))
    if (line != null) setGoalsLine(String(line))
  }

  async function submit() {
    setError('')
    if (selectedFixtures.length === 0) { setError('Select at least one game to bet on'); return }
    if (!stake || stakeNum <= 0) { setError('Enter a valid stake'); return }
    if (!odds || oddsNum < 1.01) { setError('Odds must be at least 1.01'); return }

    const effectiveMarket: MarketType = selectedFixtures.length === 1 ? marketType : 'custom'
    const marketParams = (effectiveMarket === 'over_goals' || effectiveMarket === 'under_goals')
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
          title: autoTitle,
          description: null,
          bet_type: selectedFixtures.length === 1 ? 'single' : 'multi',
          market_type: effectiveMarket,
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

          {/* AI tip — always available */}
          {bettableFixtures.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowAiTip(true)}
                style={{ width: '100%' }}
              >
                🤖 {selectedFixtures.length === 1
                  ? `Get AI Tip — ${singleFixture?.home_team} vs ${singleFixture?.away_team}`
                  : selectedFixtures.length > 1
                    ? `Get AI Tip — ${selectedFixtures.length} selected games`
                    : "Get AI Tip — today's games"}
              </button>
            </div>
          )}

          {/* Market & odds — single game only; auto-loaded */}
          {singleFixture && (
            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Market & Odds</label>
                {!oddsLoading && (oddsData || oddsError) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => loadOdds(singleFixture.id)}
                    disabled={oddsMeta?.maxReached === true}
                    title={oddsMeta?.maxReached ? 'Max refreshes reached for this game' : 'Refresh odds'}
                  >
                    {oddsMeta?.maxReached ? '🔒 Max reached' : '↺ Refresh'}
                  </button>
                )}
              </div>

              {oddsLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0' }}>
                  <div className="spinner" style={{ width: 16, height: 16 }} />
                  <span className="text-muted" style={{ fontSize: '0.82rem' }}>Loading odds…</span>
                </div>
              )}

              {oddsError && !oddsLoading && (
                <>
                  <p className="text-xs text-muted" style={{ marginBottom: '0.5rem' }}>{oddsError}</p>
                  <select className="form-select" value={marketType} onChange={e => setMarketType(e.target.value as MarketType)}>
                    {MARKETS.map(m => (
                      <option key={m.value} value={m.value}>
                        {marketLabel(m, singleFixture.home_team, singleFixture.away_team)}
                      </option>
                    ))}
                  </select>
                  {goalsSelected && (
                    <div className="form-group" style={{ marginTop: '0.75rem' }}>
                      <label className="form-label">Goals line</label>
                      <input type="number" className="form-input" value={goalsLine} onChange={e => setGoalsLine(e.target.value)} step="0.5" min="0.5" />
                    </div>
                  )}
                </>
              )}

              {oddsData && !oddsLoading && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {oddsData.home_win != null && (
                      <button type="button" className={`odds-chip ${marketType === 'home_win' ? 'selected' : ''}`}
                        onClick={() => applyOdds('home_win', oddsData.home_win)}>
                        {singleFixture.home_team} <strong>{oddsData.home_win.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.draw != null && (
                      <button type="button" className={`odds-chip ${marketType === 'draw' ? 'selected' : ''}`}
                        onClick={() => applyOdds('draw', oddsData.draw)}>
                        Draw <strong>{oddsData.draw.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.away_win != null && (
                      <button type="button" className={`odds-chip ${marketType === 'away_win' ? 'selected' : ''}`}
                        onClick={() => applyOdds('away_win', oddsData.away_win)}>
                        {singleFixture.away_team} <strong>{oddsData.away_win.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.over_goals != null && (
                      <button type="button" className={`odds-chip ${marketType === 'over_goals' ? 'selected' : ''}`}
                        onClick={() => applyOdds('over_goals', oddsData.over_goals, oddsData.goals_line ?? 2.5)}>
                        Over {oddsData.goals_line ?? 2.5} <strong>{oddsData.over_goals.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.under_goals != null && (
                      <button type="button" className={`odds-chip ${marketType === 'under_goals' ? 'selected' : ''}`}
                        onClick={() => applyOdds('under_goals', oddsData.under_goals, oddsData.goals_line ?? 2.5)}>
                        Under {oddsData.goals_line ?? 2.5} <strong>{oddsData.under_goals.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.btts_yes != null && (
                      <button type="button" className={`odds-chip ${marketType === 'btts_yes' ? 'selected' : ''}`}
                        onClick={() => applyOdds('btts_yes', oddsData.btts_yes)}>
                        BTTS Yes <strong>{oddsData.btts_yes.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.btts_no != null && (
                      <button type="button" className={`odds-chip ${marketType === 'btts_no' ? 'selected' : ''}`}
                        onClick={() => applyOdds('btts_no', oddsData.btts_no)}>
                        BTTS No <strong>{oddsData.btts_no.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.home_or_draw != null && (
                      <button type="button" className={`odds-chip ${marketType === 'home_or_draw' ? 'selected' : ''}`}
                        onClick={() => applyOdds('home_or_draw', oddsData.home_or_draw)}>
                        {singleFixture.home_team} or Draw <strong>{oddsData.home_or_draw.toFixed(2)}</strong>
                      </button>
                    )}
                    {oddsData.away_or_draw != null && (
                      <button type="button" className={`odds-chip ${marketType === 'away_or_draw' ? 'selected' : ''}`}
                        onClick={() => applyOdds('away_or_draw', oddsData.away_or_draw)}>
                        {singleFixture.away_team} or Draw <strong>{oddsData.away_or_draw.toFixed(2)}</strong>
                      </button>
                    )}
                  </div>
                  {goalsSelected && (
                    <div className="form-group" style={{ marginTop: '0.75rem' }}>
                      <label className="form-label">Goals line</label>
                      <input type="number" className="form-input" value={goalsLine} onChange={e => setGoalsLine(e.target.value)} step="0.5" min="0.5" />
                    </div>
                  )}
                  {oddsMeta && (
                    <p className="text-xs text-muted" style={{ marginTop: '0.35rem' }}>
                      {oddsMeta.stale ? 'Stale · ' : oddsMeta.fromCache ? 'Cached · ' : 'Live · '}
                      {Math.round((Date.now() - new Date(oddsMeta.fetchedAt).getTime()) / 60000)}m ago
                      {' · '}{oddsMeta.fetchCount}/{oddsMeta.maxFetches} refreshes used
                    </p>
                  )}
                </>
              )}
            </div>
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
      {showAiTip && aiFixtures.length > 0 && (
        <AiTipModal fixtures={aiFixtures} onClose={() => setShowAiTip(false)} />
      )}
    </>
  )
}
