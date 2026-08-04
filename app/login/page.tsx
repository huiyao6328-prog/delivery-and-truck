'use client'
import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { saveSession, setAuthCookie } from '@/lib/useSession'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }
      saveSession(data.employee, data.groupFunctions)
      setAuthCookie()
      router.push(params.get('redirect') || '/')
    } catch {
      setError('Could not reach the server — check your connection and try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <form style={styles.card} onSubmit={handleSubmit}>
        <div style={styles.brand}>
          Delivery&nbsp;&amp;&nbsp;<span style={{ color: '#c85a26' }}>Truck</span>
        </div>
        <p style={styles.sub}>Sign in to continue</p>

        <label style={styles.label} htmlFor="username">Username</label>
        <input
          id="username"
          style={styles.input}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <label style={styles.label} htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          style={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <div style={styles.error}>{error}</div>}

        <button type="submit" style={styles.button} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f1b28',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    background: '#16232f',
    borderRadius: 14,
    padding: '32px 28px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
    border: '1px solid #26374a',
  },
  brand: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: '0.01em',
    color: '#e9eef3',
  },
  sub: {
    fontSize: 13,
    color: '#93a4b6',
    margin: '4px 0 24px',
  },
  label: {
    display: 'block',
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    color: '#93a4b6',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #28394a',
    borderRadius: 8,
    fontSize: 15,
    background: '#101a24',
    color: '#e9eef3',
    outline: 'none',
  },
  error: {
    marginTop: 14,
    padding: '8px 10px',
    background: '#f8e2da',
    color: '#9c3719',
    borderRadius: 8,
    fontSize: 13,
  },
  button: {
    width: '100%',
    marginTop: 22,
    padding: '11px',
    border: 'none',
    borderRadius: 9,
    background: '#c85a26',
    color: '#fff',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
}
