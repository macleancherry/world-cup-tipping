import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface AuthCtx {
  authenticated: boolean;
  loading: boolean;
  login: (pw: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  authenticated: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => {
        setAuthenticated(r.ok)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const login = async (password: string) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!r.ok) throw new Error('Invalid password')
    setAuthenticated(true)
  }

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setAuthenticated(false)
  }

  return (
    <Ctx.Provider value={{ authenticated, loading, login, logout }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
