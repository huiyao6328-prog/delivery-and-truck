'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export type AccessLevel = 'none' | 'read' | 'edit'

export type GroupFunction = { function_code: string; access_level: AccessLevel }

export type SessionEmployee = {
  id: string
  code: string
  full_name: string
  department_id: string | null
  group_id: string | null
  is_driver: boolean
}

export type Session = {
  expiresAt: number
  employee: SessionEmployee
  groupFunctions: GroupFunction[]
}

const STORAGE_KEY = 'truck_session'
const SESSION_HOURS = 12

export function saveSession(employee: SessionEmployee, groupFunctions: GroupFunction[]) {
  const session: Session = {
    expiresAt: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
    employee,
    groupFunctions,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  return session
}

export function clearSession() {
  localStorage.removeItem(STORAGE_KEY)
  document.cookie = 'truck_auth=; path=/; max-age=0'
}

// Mirrors the localStorage session with a plain marker cookie so
// middleware.ts can gate /admin/* before a page ever renders. The cookie
// carries no data, just presence — the real permissions stay in
// localStorage and are checked client-side.
export function setAuthCookie() {
  document.cookie = `truck_auth=1; path=/; max-age=${SESSION_HOURS * 60 * 60}`
}

export function readSession(): Session | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as Session
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return session
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

// Highest access level this session has across all functions — used to decide
// whether the back office is reachable at all. Per-page checks should still
// call access() for the specific function they render.
export function hasAnyBackOfficeAccess(session: Session | null): boolean {
  if (!session) return false
  return session.groupFunctions.some((f) => f.access_level !== 'none')
}

export function access(session: Session | null, functionCode: string): AccessLevel {
  if (!session) return 'none'
  return session.groupFunctions.find((f) => f.function_code === functionCode)?.access_level ?? 'none'
}

// requireBackOffice: redirects to /login if not signed in, or to / if signed
// in but the employee's permission group grants no back-office function at
// all. Every /admin page renders through AdminLayout, which calls this —
// that is the single enforcement point for the whole back office.
export function useSession(options?: { requireBackOffice?: boolean }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const current = readSession()
    if (!current) {
      router.push('/login')
      return
    }
    if (options?.requireBackOffice && !hasAnyBackOfficeAccess(current)) {
      router.push('/')
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(current)
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { session, loading }
}
