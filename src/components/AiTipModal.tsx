import { useState, useRef, useEffect } from 'react'
import type { Fixture } from '../types'

interface Props {
  fixtures: Fixture[]
  onClose: () => void
}

type Mode = 'oracle' | 'pick'

interface AiProvider {
  name: string
  by: string
  dot: string
  buildUrl: (encoded: string) => string
}

const PROVIDERS: AiProvider[] = [
  { name: 'ChatGPT',    by: 'OpenAI',     dot: '#10a37f', buildUrl: q => `https://chatgpt.com/?q=${q}` },
  { name: 'Claude',     by: 'Anthropic',  dot: '#c67f3c', buildUrl: q => `https://claude.ai/new?q=${q}` },
  { name: 'Gemini',     by: 'Google',     dot: '#4285f4', buildUrl: q => `https://gemini.google.com/app?q=${q}` },
  { name: 'Copilot',    by: 'Microsoft',  dot: '#0078d4', buildUrl: q => `https://copilot.microsoft.com/?q=${q}` },
  { name: 'Perplexity', by: 'Perplexity', dot: '#20b2aa', buildUrl: q => `https://www.perplexity.ai/?q=${q}` },
  { name: 'Grok',       by: 'xAI',        dot: '#111111', buildUrl: q => `https://x.com/i/grok?text=${q}` },
  { name: 'Meta AI',    by: 'Meta',       dot: '#0866ff', buildUrl: q => `https://www.meta.ai/?q=${q}` },
  { name: 'DeepSeek',   by: 'DeepSeek',   dot: '#3b82f6', buildUrl: q => `https://chat.deepseek.com/?q=${q}` },
]

const HOST_NATIONS = ['united states', 'usa', 'canada', 'mexico']
function isHost(team: string) { return HOST_NATIONS.some(h => team.toLowerCase().includes(h)) }

function buildPrompt(fixtures: Fixture[]): string {
  const matchLines = fixtures.map((f, i) => {
    const hostNote = isHost(f.home_team)
      ? ` (${f.home_team} have genuine home advantage as a 2026 World Cup host nation)`
      : isHost(f.away_team)
        ? ` (${f.away_team} have crowd support as a host nation)`
        : ' (neither team has home advantage — "home" is scheduling order only in this tournament)'
    return `${fixtures.length > 1 ? `${i + 1}. ` : ''}${f.home_team} vs ${f.away_team}${hostNote}`
  }).join('\n')

  const matchWord = fixtures.length === 1 ? 'this 2026 FIFA World Cup match' : `these ${fixtures.length} 2026 FIFA World Cup matches`

  return `Betting analysis for ${matchWord}.

IMPORTANT: The 2026 World Cup is co-hosted by USA, Canada, and Mexico. All games are at host nation venues. "Home team" is just a scheduling label — it does NOT mean home advantage. Only USA, Canada, and Mexico have genuine crowd/home support.

${matchLines}

Please provide for each match:
1. Head-to-head history
2. Current form and key players
3. Injury/suspension concerns
4. Top 2-3 recommended bets with reasoning and rough odds (use team names, not "home"/"away")
5. Confidence level (High / Medium / Low) and why

Keep it concise and practical — we're a group of mates betting from a shared kitty.`
}

export default function AiTipModal({ fixtures, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('oracle')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const fixtureLabel = fixtures.length === 1
    ? `${fixtures[0].home_team} vs ${fixtures[0].away_team}`
    : `${fixtures.length} games`

  const promptText = buildPrompt(fixtures)
  const encodedPrompt = encodeURIComponent(promptText)

  async function fetchTip() {
    if (abortRef.current) abortRef.current.abort()
    abortRef.current = new AbortController()
    setLoading(true)
    setContent('')
    setError('')

    try {
      const r = await fetch('/api/ai/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixture_ids: fixtures.map(f => f.id) }),
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

  // Auto-consult the Oracle when the modal opens
  useEffect(() => {
    fetchTip()
    return () => { abortRef.current?.abort() }
  }, [])

  async function copyPrompt() {
    await navigator.clipboard.writeText(promptText)
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
          <div>
            <h2 className="modal-title">🐙 The Oracle</h2>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
              Cherry's prediction · {fixtureLabel}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="tabs" style={{ marginBottom: '1rem' }}>
          <button className={`tab-btn ${mode === 'oracle' ? 'active' : ''}`} onClick={() => setMode('oracle')}>
            🐙 Oracle Tip
          </button>
          <button className={`tab-btn ${mode === 'pick' ? 'active' : ''}`} onClick={() => setMode('pick')}>
            🌐 Open in your AI
          </button>
        </div>

        {mode === 'oracle' && (
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            {loading && !content && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🐙</div>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                <p className="text-muted" style={{ fontSize: '0.875rem' }}>Cherry is reading the signs…</p>
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
                    <button className="btn btn-sm btn-ghost" onClick={fetchTip}>🐙 Consult again</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.65rem 0.85rem', borderRadius: '0.5rem',
                    border: '1px solid var(--border)', background: 'var(--bg-surface)',
                    color: 'var(--text-primary)', textDecoration: 'none', transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.dot, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }}>{p.name}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>by {p.by}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>↗</span>
                </a>
              ))}
            </div>
            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Prompt not pre-filling? Copy and paste manually.</span>
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
