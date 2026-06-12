import { useState, useRef } from 'react'
import type { Fixture } from '../types'

interface Props {
  fixture: Fixture
  onClose: () => void
}

type Mode = 'workers' | 'pick'

interface AiProvider {
  name: string
  by: string
  dot: string
  buildUrl: (encoded: string) => string
}

const PROVIDERS: AiProvider[] = [
  { name: 'ChatGPT',    by: 'OpenAI',      dot: '#10a37f', buildUrl: q => `https://chatgpt.com/?q=${q}` },
  { name: 'Claude',     by: 'Anthropic',   dot: '#c67f3c', buildUrl: q => `https://claude.ai/new?q=${q}` },
  { name: 'Gemini',     by: 'Google',      dot: '#4285f4', buildUrl: q => `https://gemini.google.com/app?q=${q}` },
  { name: 'Copilot',    by: 'Microsoft',   dot: '#0078d4', buildUrl: q => `https://copilot.microsoft.com/?q=${q}` },
  { name: 'Perplexity', by: 'Perplexity',  dot: '#20b2aa', buildUrl: q => `https://www.perplexity.ai/?q=${q}` },
  { name: 'Grok',       by: 'xAI',         dot: '#111111', buildUrl: q => `https://x.com/i/grok?text=${q}` },
  { name: 'Meta AI',    by: 'Meta',        dot: '#0866ff', buildUrl: q => `https://www.meta.ai/?q=${q}` },
  { name: 'DeepSeek',   by: 'DeepSeek',    dot: '#3b82f6', buildUrl: q => `https://chat.deepseek.com/?q=${q}` },
]

function buildPrompt(homeTeam: string, awayTeam: string): string {
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

  const prompt = buildPrompt(fixture.home_team, fixture.away_team)
  const encodedPrompt = encodeURIComponent(prompt)

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
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: '520px', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">AI Betting Tip</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="mb-3 font-semibold" style={{ fontSize: '0.95rem' }}>
          {fixture.home_team} vs {fixture.away_team}
        </div>

        <div className="tabs" style={{ marginBottom: '1rem' }}>
          <button className={`tab-btn ${mode === 'workers' ? 'active' : ''}`} onClick={() => setMode('workers')}>
            ⚡ Quick Tip
          </button>
          <button className={`tab-btn ${mode === 'pick' ? 'active' : ''}`} onClick={() => setMode('pick')}>
            🌐 Open in your AI
          </button>
        </div>

        {/* Workers AI tab */}
        {mode === 'workers' && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {!content && !loading && !error && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <p className="text-muted" style={{ marginBottom: '1.25rem' }}>
                  Free analysis via Cloudflare Workers AI — built into the app, no account needed.
                </p>
                <button className="btn btn-primary" onClick={fetchTip}>⚡ Get AI Tip</button>
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
                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-sm btn-ghost" onClick={fetchTip}>↺ Refresh</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Provider picker tab */}
        {mode === 'pick' && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <p className="text-muted" style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>
              Pick your preferred AI — the prompt opens pre-loaded and ready to go.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {PROVIDERS.map(p => (
                <a
                  key={p.name}
                  href={p.buildUrl(encodedPrompt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '0.5rem',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: p.dot,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>by {p.by}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>↗</span>
                </a>
              ))}
            </div>

            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Prompt not pre-filling? Copy and paste manually.
              </span>
              <button className="btn btn-ghost btn-sm" onClick={copyPrompt} style={{ flexShrink: 0 }}>
                {copied ? '✓ Copied!' : '📋 Copy prompt'}
              </button>
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
