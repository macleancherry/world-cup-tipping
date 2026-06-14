import { useState, useRef } from 'react'
import fixtures from '../data/world-cup-2026-fixtures.json'

export default function ImportExportPage() {
  const [importing, setImporting] = useState(false)
  const [seedingFixtures, setSeedingFixtures] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function showMsg(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function exportData() {
    const r = await fetch('/api/export')
    const blob = await r.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kitty-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importData(file: File) {
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.version) throw new Error('Invalid backup file format')
      const r = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await r.json() as { ok: boolean; counts: Record<string, number>; error?: string }
      if (!r.ok) throw new Error(result.error ?? 'Import failed')
      showMsg('success', `Imported successfully: ${JSON.stringify(result.counts)}`)
    } catch (e) {
      showMsg('error', (e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  async function seedFixtures() {
    setSeedingFixtures(true)
    try {
      const r = await fetch('/api/fixtures/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixtures }),
      })
      const result = await r.json() as { inserted: number; skipped: number }
      showMsg('success', `Imported ${result.inserted} fixtures (${result.skipped} already existed)`)
    } catch (e) {
      showMsg('error', (e as Error).message)
    } finally {
      setSeedingFixtures(false)
    }
  }

  async function migrateTooBettingKitty() {
    setMigrating(true)
    try {
      const r = await fetch('/api/export-to-bk', { method: 'POST' })
      const result = await r.json() as { ok?: boolean; counts?: Record<string, number>; error?: string; exported?: Record<string, number> }
      if (!r.ok) throw new Error(result.error ?? `Migration failed (${r.status})`)
      const c = result.counts ?? {}
      showMsg('success', `Migrated to betting-kitty ✓ — ${c.participants} participants, ${c.match_days} match days, ${c.bets} bets, ${c.kitty_transactions} transactions`)
    } catch (e) {
      showMsg('error', (e as Error).message)
    } finally {
      setMigrating(false)
    }
  }

  async function seedKitty() {
    const r = await fetch('/api/kitty/manual-adjustment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 20000, description: 'Initial kitty contribution — 10 × $20' }),
    })
    if (r.ok) showMsg('success', 'Initial kitty of $200 added to ledger')
    else showMsg('error', 'Failed to seed kitty')
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Import / Export</h1>
        <p className="page-subtitle">Backup your data or restore from a backup</p>
      </div>

      {message && (
        <div className={`alert alert-${message.type}`}>{message.text}</div>
      )}

      {/* First-time setup */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">First-Time Setup</span>
        </div>
        <p className="text-sm text-secondary mb-3">
          If you've just deployed the app, run these steps to populate the database.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div className="flex items-center gap-3">
            <span className="badge badge-scheduled" style={{ minWidth: '24px', justifyContent: 'center' }}>1</span>
            <div>
              <div className="font-semibold text-sm">Import World Cup 2026 fixtures</div>
              <div className="text-xs text-muted">Loads all 104 matches and creates match days</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={seedFixtures} disabled={seedingFixtures} style={{ marginLeft: 'auto' }}>
              {seedingFixtures ? 'Importing...' : 'Import Fixtures'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge badge-scheduled" style={{ minWidth: '24px', justifyContent: 'center' }}>2</span>
            <div>
              <div className="font-semibold text-sm">Seed initial kitty ($200)</div>
              <div className="text-xs text-muted">Creates the opening ledger entry for 10 × $20</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={seedKitty} style={{ marginLeft: 'auto' }}>
              Seed Kitty
            </button>
          </div>
          <div className="flex items-center gap-3">
            <span className="badge badge-scheduled" style={{ minWidth: '24px', justifyContent: 'center' }}>3</span>
            <div>
              <div className="font-semibold text-sm">Add participants</div>
              <div className="text-xs text-muted">Go to Settings → Participants to add your mates</div>
            </div>
            <a href="/settings" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Settings →</a>
          </div>
        </div>
      </div>

      {/* Migrate to betting-kitty */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Migrate to Betting Kitty</span>
        </div>
        <p className="text-sm text-secondary mb-3">
          One-tap migration: exports all data from this app and imports it into the
          multi-tenant <strong>Audere est Suffer</strong> group on betting-kitty.
          Safe to run multiple times — each run overwrites the previous import.
        </p>
        <button className="btn btn-primary" onClick={migrateTooBettingKitty} disabled={migrating}>
          {migrating ? 'Migrating…' : 'Migrate to Betting Kitty →'}
        </button>
      </div>

      {/* Export */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Export Backup</span>
        </div>
        <p className="text-sm text-secondary mb-3">
          Download a full JSON backup of all participants, fixtures, match days, bets, and the kitty ledger.
        </p>
        <button className="btn btn-primary" onClick={exportData}>
          ⬇ Download Backup JSON
        </button>
      </div>

      {/* Import */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Import Backup</span>
        </div>
        <div className="alert alert-warn mb-3">
          ⚠️ Importing will overwrite ALL existing data. Make sure to export first!
        </div>
        <p className="text-sm text-secondary mb-3">
          Restore from a previously exported backup JSON file.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) importData(file)
          }}
        />
        <button
          className="btn btn-danger"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? 'Importing...' : '⬆ Restore from Backup'}
        </button>
      </div>

      {/* Info */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">About This App</span>
        </div>
        <div className="text-sm text-secondary" style={{ lineHeight: '1.8' }}>
          <p><strong style={{ color: 'var(--text-primary)' }}>World Cup Kitty Tracker</strong></p>
          <p>A private app for tracking a mates' World Cup betting kitty.</p>
          <p className="mt-2">Money is stored as cents and calculated from the transaction ledger — every stake deduction and return is auditable.</p>
          <p className="mt-2">All 104 World Cup 2026 fixtures are included. Results can be updated manually or via an external API (see Settings).</p>
        </div>
      </div>
    </div>
  )
}
