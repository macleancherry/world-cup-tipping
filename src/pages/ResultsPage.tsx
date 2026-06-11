import { useEffect, useState } from 'react'
import FixtureRow from '../components/FixtureRow'
import type { Fixture } from '../types'

interface SyncResult {
  fixtures_fetched: number
  fixtures_updated: number
  fixtures_not_matched: number
  bets_auto_settled: number
  bets_needing_settlement: number
  provider: string
  api_debug: string
  errors: string[]
}

export default function ResultsPage() {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [filter, setFilter] = useState<'all' | 'finished' | 'scheduled' | 'in_progress'>('all')
  const [manualFixture, setManualFixture] = useState<Fixture | null>(null)
  const [manualForm, setManualForm] = useState({ homeScore: '', awayScore: '', status: 'finished' as string })
  const [saving, setSaving] = useState(false)

  async function load() {
    const data = await fetch('/api/fixtures').then(r => r.json()) as Fixture[]
    setFixtures(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function sync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await fetch('/api/results/sync', { method: 'POST' })
      const d = await r.json() as SyncResult
      setSyncResult(d)
      load()
    } finally {
      setSyncing(false)
    }
  }

  async function saveManual() {
    if (!manualFixture) return
    setSaving(true)
    const home = parseInt(manualForm.homeScore)
    const away = parseInt(manualForm.awayScore)
    let winner: string | null = null
    if (!isNaN(home) && !isNaN(away)) {
      winner = home > away ? 'home' : away > home ? 'away' : 'draw'
    }
    await fetch('/api/fixtures/manual-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: manualFixture.id,
        status: manualForm.status,
        home_score: isNaN(home) ? null : home,
        away_score: isNaN(away) ? null : away,
        winner,
      }),
    })
    setSaving(false)
    setManualFixture(null)
    load()
  }

  const filtered = fixtures.filter(f => {
    if (filter === 'all') return true
    return f.status === filter
  })

  const byDate = filtered.reduce<Record<string, Fixture[]>>((acc, f) => {
    acc[f.kickoff_local_date] = acc[f.kickoff_local_date] ?? []
    acc[f.kickoff_local_date].push(f)
    return acc
  }, {})

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Results</h1>
        <p className="page-subtitle">Fixture scores and match results — click a fixture to manually update</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={sync} disabled={syncing}>
            {syncing ? '⟳ Syncing...' : '🔄 Check Results'}
          </button>
        </div>
      </div>

      {syncResult && (
        <div className={`alert ${syncResult.errors.length > 0 ? 'alert-warn' : syncResult.fixtures_updated > 0 ? 'alert-success' : 'alert-info'}`}>
          <div>Provider: <strong>{syncResult.provider}</strong> · Fetched: <strong>{syncResult.fixtures_fetched}</strong> · Updated: <strong>{syncResult.fixtures_updated}</strong> · Unmatched: <strong>{syncResult.fixtures_not_matched}</strong></div>
          <div className="mt-1">Bets settled: <strong>{syncResult.bets_auto_settled}</strong> · Need manual: <strong>{syncResult.bets_needing_settlement}</strong></div>
          {syncResult.api_debug && <div className="mt-1 text-xs text-muted">{syncResult.api_debug}</div>}
          {syncResult.errors.length > 0 && <div className="mt-1 text-xs">{syncResult.errors.join(', ')}</div>}
        </div>
      )}

      {/* Filters */}
      <div className="tabs">
        {(['all', 'scheduled', 'in_progress', 'finished'] as const).map(f => (
          <button
            key={f}
            className={`tab-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'in_progress' ? 'Live' : f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ marginLeft: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {f === 'all' ? fixtures.length : fixtures.filter(x => x.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {Object.entries(byDate).sort().map(([date, dayFixtures]) => (
        <div key={date} className="section">
          <div className="section-title" style={{ fontSize: '0.875rem' }}>
            {new Date(date + 'T00:00:00+08:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          {dayFixtures.map(f => (
            <div
              key={f.id}
              onClick={() => {
                setManualFixture(f)
                setManualForm({
                  homeScore: f.home_score != null ? String(f.home_score) : '',
                  awayScore: f.away_score != null ? String(f.away_score) : '',
                  status: f.status,
                })
              }}
              style={{ cursor: 'pointer' }}
            >
              <FixtureRow fixture={f} />
            </div>
          ))}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="empty-state">
          <h3>No fixtures</h3>
          <p>Import fixtures first via Import/Export</p>
        </div>
      )}

      {/* Manual update modal */}
      {manualFixture && (
        <div className="modal-overlay" onClick={() => setManualFixture(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Update Result</h2>
              <button className="modal-close" onClick={() => setManualFixture(null)}>✕</button>
            </div>
            <div className="mb-3 font-semibold">{manualFixture.home_team} vs {manualFixture.away_team}</div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={manualForm.status}
                onChange={e => setManualForm(f => ({ ...f, status: e.target.value }))}
              >
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="finished">Finished</option>
                <option value="postponed">Postponed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{manualFixture.home_team} score</label>
                <input
                  type="number"
                  className="form-input"
                  value={manualForm.homeScore}
                  onChange={e => setManualForm(f => ({ ...f, homeScore: e.target.value }))}
                  min="0"
                />
              </div>
              <div className="form-group">
                <label className="form-label">{manualFixture.away_team} score</label>
                <input
                  type="number"
                  className="form-input"
                  value={manualForm.awayScore}
                  onChange={e => setManualForm(f => ({ ...f, awayScore: e.target.value }))}
                  min="0"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setManualFixture(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveManual} disabled={saving}>
                {saving ? 'Saving...' : 'Save Result'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
