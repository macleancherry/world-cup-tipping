import { Outlet, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function AppShell() {
  const { logout } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <a href="/" className="logo">
          <div className="logo-badge">🦘</div>
          <span>
            <span className="logo-text-main">Socceroos</span>{' '}
            <span className="logo-text-sub">Kitty</span>
          </span>
        </a>
        <nav className="app-nav desktop-nav">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/match-days">Schedule</NavLink>
          <NavLink to="/bets">Bets</NavLink>
          <NavLink to="/results">Results</NavLink>
          <NavLink to="/leaderboard">Ladder</NavLink>
          <NavLink to="/oracle">🐙 Oracle</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Logout</button>
        </nav>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <nav className="mobile-nav">
        <NavLink to="/" end title="Dashboard">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          Home
        </NavLink>
        <NavLink to="/match-days" title="Schedule">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Schedule
        </NavLink>
        <NavLink to="/bets" title="Bets">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          Bets
        </NavLink>
        <NavLink to="/results" title="Results">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          Results
        </NavLink>
        <NavLink to="/leaderboard" title="Ladder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          Ladder
        </NavLink>
        <NavLink to="/oracle" title="Oracle">
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>🐙</span>
          Oracle
        </NavLink>
        <NavLink to="/settings" title="Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
          More
        </NavLink>
      </nav>
    </div>
  )
}
