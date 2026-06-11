import type { Fixture } from '../types'
import { formatKickoff } from '../hooks/useApi'

interface Props {
  fixture: Fixture
  selectable?: boolean
  selected?: boolean
  onToggle?: (id: number) => void
}

export function statusBadge(status: Fixture['status']) {
  const map: Record<string, string> = {
    scheduled: 'badge-scheduled',
    in_progress: 'badge-in-progress',
    finished: 'badge-finished',
    postponed: 'badge-void',
    cancelled: 'badge-lost',
  }
  return map[status] ?? 'badge-scheduled'
}

export default function FixtureRow({ fixture, selectable, selected, onToggle }: Props) {
  const finished = fixture.status === 'finished'
  const live = fixture.status === 'in_progress'

  return (
    <div
      className={`fixture-row${selectable ? ' selectable' : ''}${selected ? ' selected' : ''}`}
      onClick={selectable && onToggle ? () => onToggle(fixture.id) : undefined}
      style={selectable ? { cursor: 'pointer', borderColor: selected ? 'var(--accent-blue)' : undefined, borderWidth: '1px', borderStyle: 'solid' } : undefined}
    >
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle?.(fixture.id)}
          onClick={e => e.stopPropagation()}
          style={{ flexShrink: 0 }}
        />
      )}

      <div className="fixture-time">
        {live ? (
          <span className="text-green" style={{ fontWeight: 700 }}>LIVE</span>
        ) : (
          <span>{formatKickoff(fixture.kickoff_utc)}</span>
        )}
      </div>

      <div className="fixture-teams">
        <span className="fixture-team home">{fixture.home_team}</span>
        <div className="fixture-score">
          {finished || live ? (
            <>
              <span style={{ color: fixture.winner === 'home' ? 'var(--accent-green)' : 'inherit' }}>
                {fixture.home_score ?? 0}
              </span>
              <span className="fixture-score-sep">–</span>
              <span style={{ color: fixture.winner === 'away' ? 'var(--accent-green)' : 'inherit' }}>
                {fixture.away_score ?? 0}
              </span>
            </>
          ) : (
            <span className="fixture-score-sep" style={{ fontSize: '0.8rem' }}>vs</span>
          )}
        </div>
        <span className="fixture-team away">{fixture.away_team}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.2rem', flexShrink: 0 }}>
        <span className={`badge ${statusBadge(fixture.status)}`}>{fixture.status.replace('_', ' ')}</span>
        {fixture.group_name && (
          <span className="fixture-meta">{fixture.group_name}</span>
        )}
        {fixture.round_name && !fixture.group_name && (
          <span className="fixture-meta">{fixture.round_name}</span>
        )}
      </div>
    </div>
  )
}
