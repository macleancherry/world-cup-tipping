import { useState, useEffect } from 'react'
import { formatKickoff } from '../hooks/useApi'

interface OraclePick {
  id: number
  fixture_id: number
  oracle_name: string
  predicted_winner: 'home' | 'away'
  notes: string | null
  source_url: string | null
  home_team: string
  away_team: string
  kickoff_utc: string
  status: string
  stage: string
  group_name: string | null
}

interface UnpickedFixture {
  id: number
  home_team: string
  away_team: string
  kickoff_utc: string
  status: string
  stage: string
  group_name: string | null
}

interface ExtractResult {
  fixture_id: number
  home_team: string
  away_team: string
  kickoff_utc: string
  predicted_winner: 'home' | 'away'
  predicted_team: string
  confidence: string
  source_used: string
}

interface PickFormState {
  fixtureId: number
  homeTeam: string
  awayTeam: string
  predicted_winner: 'home' | 'away'
  notes: string
  source_url: string
}

export default function OraclePage() {
  const [picks, setPicks] = useState<OraclePick[]>([])
  const [unpicked, setUnpicked] = useState<UnpickedFixture[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<PickFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Extractor state
  const [extractInput, setExtractInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState('')
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [picksRes, fixturesRes] = await Promise.all([
        fetch('/api/oracle/picks').then(r => r.json()) as Promise<OraclePick[]>,
        fetch('/api/fixtures').then(r => r.json()) as Promise<UnpickedFixture[]>,
      ])
      const pickedIds = new Set(picksRes.map(p => p.fixture_id))
      setPicks(picksRes.sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime()))
      setUnpicked(
        fixturesRes
          .filter(f => !pickedIds.has(f.id) && (f.status === 'scheduled' || f.status === 'in_progress'))
          .sort((a, b) => new Date(a.kickoff_utc).getTime() - new Date(b.kickoff_utc).getTime())
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function openForm(f: UnpickedFixture | OraclePick, existing?: OraclePick) {
    setError('')
    setForm({
      fixtureId: f.id,
      homeTeam: f.home_team,
      awayTeam: f.away_team,
      predicted_winner: existing?.predicted_winner ?? 'home',
      notes: existing?.notes ?? '',
      source_url: existing?.source_url ?? 'https://www.instagram.com/2oceansaquarium/',
    })
  }

  async function save() {
    if (!form) return
    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/oracle/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: form.fixtureId,
          predicted_winner: form.predicted_winner,
          notes: form.notes || null,
          source_url: form.source_url || null,
        }),
      })
      if (!r.ok) {
        const e = await r.json() as { error: string }
        throw new Error(e.error)
      }
      setForm(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function extract() {
    setExtracting(true)
    setExtractError('')
    setExtractResult(null)
    const isUrl = extractInput.startsWith('http://') || extractInput.startsWith('https://')
    try {
      const r = await fetch('/api/oracle/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isUrl ? { url: extractInput } : { text: extractInput }),
      })
      const d = await r.json() as ExtractResult & { error?: string; fallback?: boolean }
      if (!r.ok) {
        setExtractError(d.error ?? `HTTP ${r.status}`)
        // If URL was blocked, prompt to paste text instead
        if (d.fallback) setExtractInput('')
      } else {
        setExtractResult(d)
      }
    } catch (e) {
      setExtractError((e as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  async function applyExtracted() {
    if (!extractResult) return
    setSaving(true)
    setExtractError('')
    try {
      const r = await fetch('/api/oracle/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fixture_id: extractResult.fixture_id,
          predicted_winner: extractResult.predicted_winner,
          notes: null,
          source_url: extractResult.source_used.startsWith('http') ? extractResult.source_used : null,
        }),
      })
      if (!r.ok) {
        const e = await r.json() as { error: string }
        throw new Error(e.error)
      }
      setExtractResult(null)
      setExtractInput('')
      await load()
    } catch (e) {
      setExtractError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function deletePick(fixtureId: number) {
    if (!confirm('Remove Cherry\'s pick for this game?')) return
    await fetch(`/api/oracle/picks?fixture_id=${fixtureId}`, { method: 'DELETE' })
    await load()
  }

  const predictedTeam = (p: OraclePick | PickFormState) => {
    const winner = 'predicted_winner' in p ? p.predicted_winner : (p as PickFormState).predicted_winner
    const home = 'homeTeam' in p ? (p as PickFormState).homeTeam : (p as OraclePick).home_team
    const away = 'homeTeam' in p ? (p as PickFormState).awayTeam : (p as OraclePick).away_team
    return winner === 'home' ? home : away
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 className="page-title">🐙 Cherry's Oracle Picks</h1>
          <p className="page-subtitle">Cape Town's favourite octopus predicts the World Cup</p>
        </div>
        <a
          href="https://www.instagram.com/2oceansaquarium/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm"
        >
          @2oceansaquarium ↗
        </a>
      </div>

      {/* Extractor */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title">🔍 Extract Cherry's Pick</span>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Paste an article URL <em>or</em> copy-paste the text from Instagram / a news article. The AI will find the prediction and match it to a fixture.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <textarea
            className="form-input"
            value={extractInput}
            onChange={e => { setExtractInput(e.target.value); setExtractResult(null); setExtractError('') }}
            placeholder={'Paste a URL (e.g. https://www.news24.com/…)\nor paste the text directly:\n"Cherry the octopus has chosen Mexico to beat South Africa…"'}
            rows={3}
            style={{ flex: 1, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={extract}
            disabled={extracting || !extractInput.trim()}
          >
            {extracting ? 'Extracting…' : '🔍 Extract pick'}
          </button>
          <a
            href="https://www.instagram.com/2oceansaquarium/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            Open @2oceansaquarium ↗
          </a>
        </div>

        {extractError && (
          <div className="alert alert-error" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
            {extractError}
          </div>
        )}

        {extractResult && (
          <div style={{
            marginTop: '0.75rem', padding: '0.75rem', borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.06)',
          }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Found prediction · confidence: {extractResult.confidence}
            </div>
            <div className="font-semibold" style={{ marginBottom: '0.2rem' }}>
              {extractResult.home_team} vs {extractResult.away_team}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.9rem' }}>🐙 Cherry picks:</span>
              <span className="badge badge-oracle">{extractResult.predicted_team} to win</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-primary btn-sm" onClick={applyExtracted} disabled={saving}>
                {saving ? 'Saving…' : '✓ Apply this pick'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => { setExtractResult(null); setExtractInput('') }}>
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unpicked upcoming fixtures */}
      {unpicked.length > 0 && (
        <div className="section mb-4">
          <div className="section-title">Awaiting Cherry's Verdict</div>
          {unpicked.map(f => (
            <div key={f.id} className="card" style={{ marginBottom: '0.5rem' }}>
              <div className="flex items-center justify-between" style={{ gap: '1rem' }}>
                <div>
                  <div className="font-semibold" style={{ fontSize: '0.9rem' }}>
                    {f.home_team} vs {f.away_team}
                  </div>
                  <div className="text-xs text-muted">
                    {formatKickoff(f.kickoff_utc)} · {f.stage}{f.group_name ? ` ${f.group_name}` : ''}
                  </div>
                </div>
                <button className="btn btn-sm btn-primary" onClick={() => openForm(f)}>
                  Record pick
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Existing picks */}
      {picks.length > 0 && (
        <div className="section mb-4">
          <div className="section-title">Cherry's Picks</div>
          {picks.map(p => {
            const team = p.predicted_winner === 'home' ? p.home_team : p.away_team
            const correct = p.status === 'finished'
              ? undefined // would need winner field, skip for now
              : undefined
            return (
              <div key={p.id} className="card" style={{ marginBottom: '0.5rem' }}>
                <div className="flex items-center justify-between" style={{ gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>
                      {formatKickoff(p.kickoff_utc)} · {p.stage}{p.group_name ? ` ${p.group_name}` : ''}
                    </div>
                    <div className="font-semibold" style={{ fontSize: '0.9rem' }}>
                      {p.home_team} vs {p.away_team}
                    </div>
                    <div style={{ marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.82rem' }}>🐙 Cherry picks:</span>
                      <span className="badge badge-oracle">{team}</span>
                    </div>
                    {p.notes && <div className="text-xs text-muted" style={{ marginTop: '0.2rem' }}>{p.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => openForm(p, p)}>Edit</button>
                    <button className="btn btn-sm btn-ghost" style={{ color: 'var(--accent-red)' }} onClick={() => deletePick(p.fixture_id)}>✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {picks.length === 0 && unpicked.length === 0 && (
        <div className="empty-state"><p>No fixtures found. Make sure fixtures are imported.</p></div>
      )}

      {/* Pick form modal */}
      {form && (
        <div className="modal-overlay" onClick={() => setForm(null)}>
          <div className="modal" style={{ maxWidth: '400px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">🐙 Record Cherry's Pick</h2>
              <button className="modal-close" onClick={() => setForm(null)}>✕</button>
            </div>

            <div className="mb-3 font-semibold" style={{ fontSize: '0.95rem' }}>
              {form.homeTeam} vs {form.awayTeam}
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label className="form-label">Cherry picks…</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`btn flex-1 ${form.predicted_winner === 'home' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setForm(f => f ? { ...f, predicted_winner: 'home' } : f)}
                >
                  {form.homeTeam}
                </button>
                <button
                  type="button"
                  className={`btn flex-1 ${form.predicted_winner === 'away' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setForm(f => f ? { ...f, predicted_winner: 'away' } : f)}
                >
                  {form.awayTeam}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes (optional)</label>
              <input
                type="text"
                className="form-input"
                value={form.notes}
                onChange={e => setForm(f => f ? { ...f, notes: e.target.value } : f)}
                placeholder="e.g. Chose the Mexico bucket over the Bafana bucket"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Source URL (optional)</label>
              <input
                type="url"
                className="form-input"
                value={form.source_url}
                onChange={e => setForm(f => f ? { ...f, source_url: e.target.value } : f)}
                placeholder="https://www.instagram.com/..."
              />
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : `Save — ${predictedTeam(form)} to win`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
