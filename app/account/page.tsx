'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

export default function AccountPage() {
  const { session, loading } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!session) return
    supabase.from('employees').select('username').eq('id', session.employee.id).single()
      .then(({ data }) => setUsername(data?.username || session.employee.code))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.employee.id])

  if (loading || !session) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93a4b6' }}>Loading…</div>
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setError('')
    setSaved(false)

    const newUsername = username.trim() || session.employee.code
    if (password || confirmPassword) {
      if (password.length < 4) {
        setError('Password must be at least 4 characters')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = { username: newUsername }
      if (password) {
        const res = await fetch('/api/auth/hash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })
        const { hashed } = await res.json()
        payload.password_hash = hashed
      }

      const { error: err } = await supabase.from('employees').update(payload).eq('id', session.employee.id)
      if (err) {
        setError(err.message)
        return
      }

      setUsername(newUsername)
      setPassword('')
      setConfirmPassword('')
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Link href="/" style={styles.back}>← Back</Link>
        <div style={styles.brand}>My Account</div>
      </header>

      <main style={styles.main}>
        <div style={styles.card}>
          <div style={styles.label}>Name</div>
          <div style={styles.staticValue}>{session.employee.full_name}</div>
          <div style={{ ...styles.label, marginTop: 14 }}>Employee Code</div>
          <div style={styles.staticValue}>{session.employee.code}</div>
        </div>

        <form style={styles.card} onSubmit={handleSave}>
          <label style={styles.label} htmlFor="username">Login Username</label>
          <input
            id="username"
            style={styles.input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />

          <label style={{ ...styles.label, marginTop: 16 }} htmlFor="password">New Password</label>
          <input
            id="password"
            type="password"
            style={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
            autoComplete="new-password"
          />

          <label style={{ ...styles.label, marginTop: 16 }} htmlFor="confirmPassword">Confirm New Password</label>
          <input
            id="confirmPassword"
            type="password"
            style={styles.input}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />

          {error && <div style={styles.error}>{error}</div>}
          {saved && <div style={styles.success}>✓ Saved</div>}

          <button type="submit" style={styles.button} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0f1b28' },
  header: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 20px', background: '#16232f', borderBottom: '1px solid #26374a',
  },
  back: { fontSize: 13, color: '#93a4b6', textDecoration: 'none' },
  brand: { fontSize: 16, fontWeight: 800, color: '#e9eef3' },
  main: { maxWidth: 420, margin: '0 auto', padding: '20px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 },
  card: { background: '#16232f', border: '1px solid #26374a', borderRadius: 12, padding: 20 },
  label: {
    display: 'block', fontSize: 12, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
    color: '#93a4b6', marginBottom: 6,
  },
  staticValue: { fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: '#e9eef3' },
  input: {
    width: '100%', padding: '10px 12px', border: '1px solid #28394a', borderRadius: 8,
    fontSize: 15, background: '#101a24', color: '#e9eef3', outline: 'none',
  },
  error: { marginTop: 14, padding: '8px 10px', background: '#34201a', color: '#f2977e', borderRadius: 8, fontSize: 13 },
  success: { marginTop: 14, padding: '8px 10px', background: '#17301f', color: '#86d494', borderRadius: 8, fontSize: 13 },
  button: {
    width: '100%', marginTop: 20, padding: '11px', border: 'none', borderRadius: 9,
    background: '#c85a26', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
  },
}
