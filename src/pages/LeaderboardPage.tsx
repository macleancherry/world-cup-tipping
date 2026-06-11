import { useEffect, useState } from 'react'
import { formatCents } from '../hooks/useApi'
import type { Participant } from '../types'

interface ParticipantStats {
  id: number
  name: string
  initials: string
  bets_placed: number
  total_staked: number
  total_returned: number
  won: number
  lost: number
  void: number
  net_pl: number
  win_rate: number
}

export default function LeaderboardPage() {
  const [stats, setStats] = useState<ParticipantStats[]>([])
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/participants').then(r => r.json()) as Promise<Participant[]>,
      fetch('/api/bets').then(r => r.json()) as Promise<any[]>,
    ]).then(([parts, bets]) => {
      setParticipants(parts)
      const map = new Map<number, ParticipantStats>()
      for (const p of parts) {
        map.set(p.id, { id: p.id, name: p.name, initials: p.initials, bets_placed: 0, total_staked: 0, total_returned: 0, won: 0, lost: 0, void: 0, net_pl: 0, win_rate: 0 })
      }
      for (const bet of bets) {
        if (!bet.participant_id) continue
        const s = map.get(bet.participant_id)
        if (!s) continue
        s.bets_placed++
        s.total_staked += bet.stake_amount
        s.total_returned += bet.actual_return ?? 0
        if (bet.settlement_status === 'won') s.won++
        if (bet.settlement_status === 'lost') s.lost++
        if (bet.settlement_status === 'void') s.void++
      }
      const rows = [...map.values()].map(s => ({
        ...s,
        net_pl: s.total_returned - s.total_staked,
        win_rate: (s.won + s.lost) > 0 ? Math.round((s.won / (s.won + s.lost)) * 100) : 0,
      })).sort((a, b) => b.net_pl - a.net_pl)
      setStats(rows)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-screen"><div className="spinner" /></div>

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Leaderboard</h1>
        <p className="page-subtitle">Performance by bettor</p>
      </div>

      {stats.length === 0 ? (
        <div className="empty-state">
          <h3>No data yet</h3>
          <p>Assign bettors to bets to see stats here</p>
        </div>
      ) : (
        <>
          {/* Top 3 podium */}
          <div className="grid-3 mb-4">
            {stats.slice(0, 3).map((s, i) => (
              <div key={s.id} className="stat-card" style={{ textAlign: 'center', borderColor: i === 0 ? 'var(--accent-yellow)' : undefined }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{medals[i] ?? ''}</div>
                <div className="font-bold text-lg">{s.name}</div>
                <div className={`stat-value mt-2 ${s.net_pl >= 0 ? 'positive' : 'negative'}`}>
                  {s.net_pl >= 0 ? '+' : ''}{formatCents(s.net_pl)}
                </div>
                <div className="stat-sub">{s.bets_placed} bets · {s.win_rate}% win rate</div>
              </div>
            ))}
          </div>

          {/* Full table */}
          <div className="card">
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Net P&L</th>
                    <th>W / L</th>
                    <th>Win %</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr key={s.id}>
                      <td>{medals[i] ?? i + 1}</td>
                      <td className="font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</td>
                      <td className={s.net_pl >= 0 ? 'text-green' : 'text-red'}>
                        {s.net_pl >= 0 ? '+' : ''}{formatCents(s.net_pl)}
                      </td>
                      <td>
                        <span className="text-green">{s.won}</span>
                        <span className="text-muted"> / </span>
                        <span className="text-red">{s.lost}</span>
                      </td>
                      <td>{s.win_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Participants without bets */}
      {participants.filter(p => !stats.find(s => s.id === p.id && s.bets_placed > 0)).length > 0 && (
        <div className="section mt-4">
          <div className="section-title text-muted">No bets yet</div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {participants.filter(p => !stats.find(s => s.id === p.id && s.bets_placed > 0)).map(p => (
              <div key={p.id} className="badge badge-void">{p.name}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
