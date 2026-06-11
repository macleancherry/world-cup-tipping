import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(password)
      navigate('/')
    } catch {
      setError('Invalid password. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="socceroos-badge">🦘</div>
          <div className="southern-cross">★ ★ ★ ★ ★</div>
          <h1>Socceroos Kitty</h1>
          <p>World Cup 2026 · Betting Pool</p>
          <div className="mascot-row" title="Maple · Zayu · Clutch — WC26 Mascots">
            🦌 <span className="mascot-divider">·</span>
            🐆 <span className="mascot-divider">·</span>
            🦅
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter group password"
              autoFocus
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-xs text-muted" style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          Private — for the group only
        </p>
      </div>
    </div>
  )
}
