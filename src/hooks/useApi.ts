import { useState, useCallback } from 'react'

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>() {
  const [state, setState] = useState<ApiState<T>>({ data: null, loading: false, error: null })

  const request = useCallback(async (url: string, options?: RequestInit): Promise<T | null> => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const r = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: r.statusText })) as { error: string }
        throw new Error(err.error || r.statusText)
      }
      const data = await r.json() as T
      setState({ data, loading: false, error: null })
      return data
    } catch (e) {
      const msg = (e as Error).message
      setState(s => ({ ...s, loading: false, error: msg }))
      return null
    }
  }, [])

  return { ...state, request }
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00+08:00').toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

export function formatKickoff(utcStr: string): string {
  return new Date(utcStr).toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Perth',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}
