import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Participant } from '../types'

interface Settings {
  starting_kitty: string
  contribution_per_person: string
  num_participants: string
  currency: string
  group_stage_daily_budget: string
  r32_daily_budget: string
  r16_daily_budget: string
  qf_daily_budget: string
  sf_daily_budget: string
  tp_daily_budget: string
  final_daily_budget: string
}

function centsToDisplay(cents: string): string {
  return (parseInt(cents) / 100).toFixed(2)
}
export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [newParticipant, setNewParticipant] = useState('')
  const [addingParticipant, setAddingParticipant] = useState(false)

  async function load() {
    const partsRes = await fetch('/api/participants').then(r => r.json()) as Participant[]
    setParticipants(partsRes)

    // Load settings from the DB
    const exp = await fetch('/api/export').then(r => r.json()) as { settings: { key: string; value: string }[] }
    const s: Record<string, string> = {}
    for (const row of exp.settings) s[row.key] = row.value
    setSettings({
      starting_kitty: centsToDisplay(s.starting_kitty ?? '20000'),
      contribution_per_person: centsToDisplay(s.contribution_per_person ?? '2000'),
      num_participants: s.num_participants ?? '10',
      currency: s.currency ?? 'AUD',
      group_stage_daily_budget: centsToDisplay(s.group_stage_daily_budget ?? '500'),
      r32_daily_budget: centsToDisplay(s.r32_daily_budget ?? '500'),
      r16_daily_budget: centsToDisplay(s.r16_daily_budget ?? '500'),
      qf_daily_budget: centsToDisplay(s.qf_daily_budget ?? '1000'),
      sf_daily_budget: centsToDisplay(s.sf_daily_budget ?? '1000'),
      tp_daily_budget: centsToDisplay(s.tp_daily_budget ?? '500'),
      final_daily_budget: centsToDisplay(s.final_daily_budget ?? '1000'),
    })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveSettings() {
    if (!settings) return
    setSaving(true)
    const tocents = (v: string) => String(Math.round(parseFloat(v) * 100))
    const calculated_kitty = tocents(String(parseFloat(settings.contribution_per_person) * parseInt(settings.num_participants)))
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        starting_kitty: calculated_kitty,
        contribution_per_person: tocents(settings.contribution_per_person),
        num_participants: settings.num_participants,
        group_stage_daily_budget: tocents(settings.group_stage_daily_budget),
        r32_daily_budget: tocents(settings.r32_daily_budget),
        r16_daily_budget: tocents(settings.r16_daily_budget),
        qf_daily_budget: tocents(settings.qf_daily_budget),
        sf_daily_budget: tocents(settings.sf_daily_budget),
        tp_daily_budget: tocents(settings.tp_daily_budget),
        final_daily_budget: tocents(settings.final_daily_budget),
      }),
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function addParticipant() {
    if (!newParticipant.trim()) return
    setAddingParticipant(true)
    await fetch('/api/participants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newParticipant.trim() }),
    })
    setNewParticipant('')
    setAddingParticipant(false)
    load()
  }

  async function toggleParticipant(p: Participant) {
    await fetch(`/api/participants/${p.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    load()
  }

  async function deleteParticipant(p: Participant) {
    if (!confirm(`Remove ${p.name}?`)) return
    await fetch(`/api/participants/${p.id}`, { method: 'DELETE' })
    load()
  }

  async function addManualAdjustment() {
    const amt = prompt('Amount (positive to add, negative to remove, in $):')
    if (!amt) return
    const desc = prompt('Description:') ?? 'Manual adjustment'
    await fetch('/api/kitty/manual-adjustment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(parseFloat(amt) * 100), description: desc }),
    })
    alert('Adjustment added to ledger')
  }

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure the kitty, participants, and budgets</p>
      </div>

      {saved && <div className="alert alert-success">Settings saved!</div>}

      {/* Quick links — visible on mobile where these aren't in the nav bar */}
      <div className="card mb-4" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <Link to="/oracle" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>🐙 Oracle Picks</Link>
        <Link to="/import-export" className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }}>📦 Import / Export</Link>
      </div>

      {/* Participants */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">Participants</span>
          <span className="badge badge-scheduled">{participants.filter(p => p.active).length} active</span>
        </div>

        {participants.map(p => (
          <div key={p.id} className="flex items-center justify-between" style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2">
              <div
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: p.active ? 'var(--accent-blue)' : 'var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                }}
              >
                {p.initials}
              </div>
              <span className={p.active ? '' : 'text-muted'}>{p.name}</span>
              {!p.active && <span className="badge badge-void text-xs">inactive</span>}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost btn-sm" onClick={() => toggleParticipant(p)}>
                {p.active ? 'Deactivate' : 'Activate'}
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => deleteParticipant(p)}>
                Remove
              </button>
            </div>
          </div>
        ))}

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            className="form-input"
            value={newParticipant}
            onChange={e => setNewParticipant(e.target.value)}
            placeholder="Add participant name..."
            onKeyDown={e => e.key === 'Enter' && addParticipant()}
          />
          <button className="btn btn-primary" onClick={addParticipant} disabled={addingParticipant}>
            Add
          </button>
        </div>
      </div>

      {/* Kitty settings */}
      {settings && (
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">Kitty Settings</span>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Contribution per person ($)</label>
              <input
                type="number"
                className="form-input"
                value={settings.contribution_per_person}
                onChange={e => setSettings(s => s ? { ...s, contribution_per_person: e.target.value } : s)}
                step="1"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Number of participants</label>
              <input
                type="number"
                className="form-input"
                value={settings.num_participants}
                onChange={e => setSettings(s => s ? { ...s, num_participants: e.target.value } : s)}
                min="1"
              />
            </div>
          </div>
          <div className="form-hint mb-3">
            Starting kitty = ${(parseFloat(settings.contribution_per_person) * parseInt(settings.num_participants)).toFixed(2)}
          </div>

          <button className="btn btn-ghost btn-sm" onClick={addManualAdjustment}>
            + Manual kitty adjustment
          </button>
        </div>
      )}

      {/* Daily budgets */}
      {settings && (
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">Daily Budgets by Stage</span>
          </div>
          <div className="form-row">
            {[
              { key: 'group_stage_daily_budget' as const, label: 'Group Stage' },
              { key: 'r32_daily_budget' as const, label: 'Round of 32' },
              { key: 'r16_daily_budget' as const, label: 'Round of 16' },
              { key: 'qf_daily_budget' as const, label: 'Quarter-finals' },
              { key: 'sf_daily_budget' as const, label: 'Semi-finals' },
              { key: 'tp_daily_budget' as const, label: 'Third-place' },
              { key: 'final_daily_budget' as const, label: 'Final' },
            ].map(({ key, label }) => (
              <div key={key} className="form-group">
                <label className="form-label">{label} ($)</label>
                <input
                  type="number"
                  className="form-input"
                  value={settings[key]}
                  onChange={e => setSettings(s => s ? { ...s, [key]: e.target.value } : s)}
                  step="1"
                  min="0"
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>
              {saving ? 'Saving...' : 'Save Budgets'}
            </button>
            <p className="form-hint mt-2">Note: budget changes here update defaults for new match days. Existing match days can be edited individually.</p>
          </div>
        </div>
      )}

      {/* Kitty ledger link */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Kitty Ledger</span>
        </div>
        <KittyLedger />
      </div>
    </div>
  )
}

function KittyLedger() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/kitty/ledger').then(r => r.json()).then(d => {
      setTransactions(d as any[])
      setLoading(false)
    })
  }, [])

  if (loading) return <div className="spinner" style={{ margin: '1rem auto' }} />

  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t: any) => (
            <tr key={t.id}>
              <td className="text-xs">{new Date(t.created_at).toLocaleDateString('en-AU')}</td>
              <td><span className="badge badge-void text-xs">{t.type.replace(/_/g, ' ')}</span></td>
              <td className="text-xs">{t.description}</td>
              <td className={t.amount >= 0 ? 'text-green' : 'text-red'}>
                {t.amount >= 0 ? '+' : ''}${(t.amount / 100).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {transactions.length === 0 && (
        <div className="empty-state"><p>No transactions yet</p></div>
      )}
    </div>
  )
}
