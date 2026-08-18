'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useSession, clearSession, hasAnyBackOfficeAccess } from '@/lib/useSession'

type Inspection = {
  id: string
  truck_id: string
  inspection_date: string
  overall_result: string
  submitted_at: string | null
}
type Truck = { id: string; plate_no: string }

export default function HomePage() {
  const router = useRouter()
  const { session, loading } = useSession()
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loadingList, setLoadingList] = useState(true)

  useEffect(() => {
    if (session) fetchRecent()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  async function fetchRecent() {
    if (!session) return
    const [{ data: insp }, { data: t }] = await Promise.all([
      supabase.from('inspections').select('id, truck_id, inspection_date, overall_result, submitted_at')
        .eq('driver_id', session.employee.id).order('inspection_date', { ascending: false }).limit(10),
      supabase.from('trucks').select('id, plate_no'),
    ])
    setInspections(insp || [])
    setTrucks(t || [])
    setLoadingList(false)
  }

  function truckPlate(id: string) { return trucks.find((t) => t.id === id)?.plate_no || '—' }

  function handleLogout() {
    clearSession()
    router.push('/login')
  }

  if (loading || !session) {
    return <div style={styles.loadingPage}>Loading…</div>
  }

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.brand}>Delivery&nbsp;&amp;&nbsp;<span style={{ color: '#c85a26' }}>Truck</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/account" style={styles.logout}>Account</Link>
          <button onClick={handleLogout} style={styles.logout}>Log Out</button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.greeting}>Hi, {session.employee.full_name}</div>

        <Link href="/inspection/new" style={styles.primaryCard}>
          <div style={styles.cardIconWrap}>
            <ClipboardIcon />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.primaryCardTitle}>Daily Inspection</div>
            <div style={styles.primaryCardSub}>Pre-trip checklist — fluids, tires, lights, brakes &amp; safety gear</div>
          </div>
          <div style={styles.arrow}>→</div>
        </Link>

        <Link href="/dispatches" style={styles.settingsCard}>
          <div style={{ ...styles.cardIconWrap, background: 'rgba(255,255,255,0.08)' }}>
            <TruckIcon />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.primaryCardTitle}>My Dispatches</div>
            <div style={styles.primaryCardSub}>Start your trip and record your return</div>
          </div>
          <div style={styles.arrow}>→</div>
        </Link>

        <Link href="/improvement" style={styles.settingsCard}>
          <div style={{ ...styles.cardIconWrap, background: 'rgba(255,255,255,0.08)' }}>
            <WrenchIcon />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.primaryCardTitle}>Improvement Progress</div>
            <div style={styles.primaryCardSub}>Track defects found during inspections through to fix &amp; sign-off</div>
          </div>
          <div style={styles.arrow}>→</div>
        </Link>

        {hasAnyBackOfficeAccess(session) && (
          <Link href="/admin" style={styles.settingsCard}>
            <div style={{ ...styles.cardIconWrap, background: 'rgba(255,255,255,0.08)' }}>
              <GearIcon />
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.primaryCardTitle}>Settings</div>
              <div style={styles.primaryCardSub}>Employees, trucks, dispatches &amp; back-office setup</div>
            </div>
            <div style={styles.arrow}>→</div>
          </Link>
        )}

        <div style={styles.sectionTitle}>Recent Inspections</div>
        {loadingList ? (
          <div style={{ color: '#64798d', fontSize: 13.5, padding: '12px 0' }}>Loading…</div>
        ) : inspections.length === 0 ? (
          <div style={{ color: '#64798d', fontSize: 13.5, padding: '12px 0' }}>No inspections submitted yet.</div>
        ) : (
          <div style={styles.list}>
            {inspections.map((i) => (
              <Link href={`/inspection/${i.id}`} key={i.id} style={styles.listRow}>
                <div>
                  <div style={styles.listPlate}>{truckPlate(i.truck_id)}</div>
                  <div style={styles.listDate}>{i.inspection_date}</div>
                </div>
                <span style={i.overall_result === 'issues_found' ? styles.badgeIssue : styles.badgeOk}>
                  {i.overall_result === 'issues_found' ? 'Issue Found' : 'All OK'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ClipboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" />
      <path d="M9 12.5 11 14.5 15 10.5" />
    </svg>
  )
}

function TruckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 3h15v13H1z" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  )
}

function WrenchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a4 4 0 0 0-5.6 4.9L2 18.3 5.7 22l7.1-7.1a4 4 0 0 0 4.9-5.6l-2.5 2.5-2.6-2.6z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loadingPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93a4b6', fontSize: 14 },
  page: { minHeight: '100vh', background: '#0f1b28' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 20px', background: '#16232f', borderBottom: '1px solid #26374a',
    position: 'sticky', top: 0,
  },
  brand: { fontSize: 16, fontWeight: 800, color: '#e9eef3' },
  logout: { background: 'none', border: '1px solid #28394a', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, color: '#93a4b6', cursor: 'pointer' },
  main: { maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' },
  greeting: { fontSize: 14, color: '#93a4b6', marginBottom: 16 },
  primaryCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: '#0a141e', color: '#fff', borderRadius: 14, padding: '20px', textDecoration: 'none',
    marginBottom: 12, border: '1px solid #26374a',
  },
  settingsCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: '#1c2b3a', color: '#fff', borderRadius: 14, padding: '20px', textDecoration: 'none',
    marginBottom: 24, border: '1px solid #2e4053',
  },
  cardIconWrap: {
    flexShrink: 0, width: 40, height: 40, borderRadius: 10,
    background: 'rgba(232,112,58,0.18)', color: '#e37a42',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  primaryCardTitle: { fontSize: 17, fontWeight: 700 },
  primaryCardSub: { fontSize: 12.5, color: '#93a4b6', marginTop: 4, maxWidth: 280 },
  arrow: { fontSize: 22, color: '#ec7f43', flexShrink: 0 },
  sectionTitle: { fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64798d', marginBottom: 10 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  listRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: '#16232f', border: '1px solid #26374a', borderRadius: 10, padding: '12px 14px', textDecoration: 'none',
  },
  listPlate: { fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: '#e9eef3' },
  listDate: { fontSize: 12, color: '#64798d', marginTop: 2 },
  badgeOk: { fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#e3efe4', color: '#26592c' },
  badgeIssue: { fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100, background: '#f8e2da', color: '#9c3719' },
}
