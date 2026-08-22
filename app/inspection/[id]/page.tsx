'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import HelpButton from '@/components/HelpButton'

type Inspection = {
  id: string
  truck_id: string
  driver_id: string
  inspection_date: string
  odometer_km: number | null
  overall_result: string
  submitted_at: string | null
}
type Result = { id: string; category_snapshot: string; label_snapshot: string; status: string; note: string | null }

const STATUS_LABEL: Record<string, string> = { ok: 'OK', issue: 'Issue', na: 'N/A' }

export default function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, loading: sessionLoading } = useSession()
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [truckPlate, setTruckPlate] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (session) fetchData() }, [session])

  async function fetchData() {
    const { data: insp } = await supabase.from('inspections').select('*').eq('id', id).single()
    if (insp) {
      setInspection(insp)
      const { data: truck } = await supabase.from('trucks').select('plate_no').eq('id', insp.truck_id).single()
      setTruckPlate(truck?.plate_no || '')
      const { data: res } = await supabase.from('inspection_results').select('*').eq('inspection_id', id).order('created_at')
      setResults(res || [])
    }
    setLoading(false)
  }

  if (sessionLoading || !session || loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b96a3' }}>Loading…</div>
  }
  if (!inspection) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b96a3' }}>Inspection not found.</div>
  }

  const grouped: Record<string, Result[]> = {}
  results.forEach((r) => {
    grouped[r.category_snapshot] = grouped[r.category_snapshot] || []
    grouped[r.category_snapshot].push(r)
  })

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', minHeight: '100vh', background: '#0f1b28' }}>
      <header style={{ background: '#16232f', borderBottom: '1px solid #26374a', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          <Link href="/" style={{ fontSize: 12.5, color: '#64798d', textDecoration: 'none' }} aria-label="Back to Home">🏠 Home</Link>
          <HelpButton title="Inspection Detail">
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Read-only record of what you submitted for this inspection, grouped by category.</li>
            </ul>
          </HelpButton>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#e9eef3', marginTop: 6 }}>
          {truckPlate} · {inspection.inspection_date}
        </div>
        <div style={{ fontSize: 12.5, color: '#93a4b6', marginTop: 2 }}>
          Odometer {inspection.odometer_km ?? '—'} km ·{' '}
          <span style={{
            fontWeight: 700,
            color: inspection.overall_result === 'issues_found' ? '#f2977e' : '#7fd28f',
          }}>
            {inspection.overall_result === 'issues_found' ? 'Issues Found' : 'All OK'}
          </span>
        </div>
      </header>

      <main style={{ padding: '16px' }}>
        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e9eef3', marginBottom: 8 }}>{category}</div>
            <div style={{ background: '#16232f', border: '1px solid #26374a', borderRadius: 10, overflow: 'hidden' }}>
              {items.map((r, idx) => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
                  padding: '10px 14px', borderTop: idx > 0 ? '1px solid #1e2c3a' : 'none',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13.5, color: '#e9eef3' }}>{r.label_snapshot}</div>
                    {r.note && <div style={{ fontSize: 12.5, color: '#f2977e', marginTop: 2 }}>{r.note}</div>}
                  </div>
                  <span style={{
                    fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                    background: r.status === 'ok' ? '#e3efe4' : r.status === 'issue' ? '#f8e2da' : '#ece9df',
                    color: r.status === 'ok' ? '#26592c' : r.status === 'issue' ? '#9c3719' : '#6b6252',
                  }}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  )
}
