import { useState, useRef } from 'react'
import type { Fixture } from '../types'

interface Props {
  fixture: Fixture
  onClose: () => void
}

type Mode = 'workers' | 'copy'

function buildCopyPrompt(homeTeam: string, awayTeam: string): string {
  return `Betting analysis for this 2026 FIFA World Cup match: ${homeTeam} vs ${awayTeam}.

Please provide:
1. Head-to-head history between these teams
2. Current form and squad strengths going into the World Cup
3. Any notable injuries or key absences
4. Top 2-3 recommended bets (match result, over/under goals, BTTS, etc.) with reasoning and rough odds guidance
5. Overall confidence level (High / Medium / Low) and why

Keep it concise and practical — we're a group of mates betting from a shared kitty.`
}

export default function AiTipModal({ fixture, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('workers')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function fetchTip() {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setContent('')
    setError('')

    try {
      const r = await fetch(`/api/fixtures/${fixture.id}/ai-tip`, {
        method: 'POST',
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
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function copyPrompt() {
    const prompt = buildCopyPrompt(fixture.home_team, fixture.away_team)
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const copyPromptText = buildCopyPrompt(fixture.home_team, fixture.away_team)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">AI Betting Tip</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="mb-3 font-semibold" style={{ fontSize: '0.95rem' }}>
          {fixture.home_team} vs {fixture.away_team}
        </div>

        {/* Mode tabs */}
        <div className="tabs" style={{ marginBottom: '1rem' }}>
          <button
            className={`tab-btn ${mode === 'workers' ? 'active' : ''}`}
            onClick={() => setMode('workers')}
          >
            ⚡ AI Quick Tip
          </button>
          <button
            className={`tab-btn ${mode === 'copy' ? 'active' : ''}`}
            onClick={() => setMode('copy')}
          >
            📋 Copy for ChatGPT / Claude
          </button>
        </div>

        {mode === 'workers' && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!content && !loading && !error && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <p className="text-muted" style={{ marginBottom: '1.25rem' }}>
                  Get an AI-generated analysis using Cloudflare Workers AI (free, built-in).
                </p>
                <button className="btn btn-primary" onClick={fetchTip}>
                  ⚡ Get AI Tip
                </button>
              </div>
            )}

            {loading && !content && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                <p className="text-muted">Analysing match...</p>
              </div>
            )}

            {error && (
              <div className="alert alert-error">
                {error}
                <button className="btn btn-sm btn-ghost" style={{ marginLeft: '0.5rem' }} onClick={fetchTip}>Retry</button>
              </div>
            )}

            {content && (
              <div style={{ fontSize: '0.875rem', lineHeight: '1.65' }}>
                <MarkdownText text={content} />
                {loading && <span className="text-muted">▋</span>}
                {!loading && (
                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-sm btn-ghost" onClick={fetchTip}>↺ Refresh</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mode === 'copy' && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <p className="text-muted" style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
              Copy this prompt and paste it into ChatGPT, Claude, Gemini, or any AI you like.
            </p>
            <textarea
              readOnly
              value={copyPromptText}
              style={{
                width: '100%',
                minHeight: '200px',
                fontFamily: 'inherit',
                fontSize: '0.8rem',
                lineHeight: '1.5',
                padding: '0.75rem',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                color: 'var(--text-primary)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={copyPrompt}>
                {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
              </button>
              <a
                href="https://chat.openai.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                Open ChatGPT ↗
              </a>
              <a
                href="https://claude.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-ghost"
              >
                Open Claude ↗
              </a>
            </div>
          </div>
        )}
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
