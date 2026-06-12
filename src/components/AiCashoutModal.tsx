import { useState, useRef } from 'react'
import type { Fixture, Bet } from '../types'

interface Props {
  fixture: Fixture
  bets: Bet[]
  onClose: () => void
}

export default function AiCashoutModal({ fixture, bets, onClose }: Props) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const scoreStr = fixture.home_score != null && fixture.away_score != null
    ? `${fixture.home_score}–${fixture.away_score}`
    : 'Score updating…'

  async function fetchAdvice() {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setContent('')
    setError('')

    try {
      const r = await fetch('/api/ai/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: fixture.id,
          bets: bets.map(b => ({
            title: b.title,
            market_type: b.market_type,
            stake_amount: b.stake_amount,
            odds_decimal: b.odds_decimal,
            potential_return: b.potential_return,
          })),
        }),
        signal: abortRef.current.signal,
      })

      if (!r.ok) {
        const e = await r.json() as { error: string }
        throw new Error(e.error ?? `HTTP ${r.status}`)
      }

      const reader = r.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (payload === '[DONE]') break
          try {
            const chunk = JSON.parse(payload) as { response?: string }
            if (chunk.response) setContent(prev => prev + chunk.response)
          } catch { /* partial chunk */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '520px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">💰 Cash Out Advice</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="mb-3">
          <div className="font-semibold" style={{ fontSize: '0.95rem' }}>
            {fixture.home_team} vs {fixture.away_team}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <span className="badge badge-live">🔴 LIVE</span>
            <span className="font-semibold">{scoreStr}</span>
          </div>
        </div>

        <div style={{ marginBottom: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {bets.length} pending bet{bets.length !== 1 ? 's' : ''} on this game
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {!content && !loading && !error && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <p className="text-muted" style={{ marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                Get AI advice on whether to cash out or let these bets ride based on the current scoreline.
              </p>
              <button className="btn btn-primary" onClick={fetchAdvice}>💰 Get Cash Out Advice</button>
            </div>
          )}

          {loading && !content && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
              <p className="text-muted">Analysing game state…</p>
            </div>
          )}

          {error && (
            <div className="alert alert-error">
              {error}
              <button className="btn btn-sm btn-ghost" style={{ marginLeft: '0.5rem' }} onClick={fetchAdvice}>Retry</button>
            </div>
          )}

          {content && (
            <div style={{ fontSize: '0.875rem', lineHeight: '1.65' }}>
              <MarkdownText text={content} />
              {loading && <span className="text-muted">▋</span>}
              {!loading && (
                <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-sm btn-ghost" onClick={fetchAdvice}>↺ Refresh</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function MarkdownText({ text }: { text: string }) {
  const html = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br />')
  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
