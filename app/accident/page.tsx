'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

type Report = {
  id: string
  truck_id: string
  occurred_at: string
  severity_level: 'L1' | 'L2' | 'L3' | 'L4' | null
  status: 'pending' | 'in_progress' | 'pending_review' | 'closed'
  description: string
}
type Truck = { id: string; plate_no: string }

const STATUS_LABEL: Record<Report['status'], string> = {
  pending: 'Reported', in_progress: 'Investigating', pending_review: 'Pending Review', closed: 'Closed',
}
const STATUS_TONE: Record<Report['status'], string> = {
  pending: 'danger', in_progress: 'warn', pending_review: 'warn', closed: 'ok',
}

export default function AccidentListPage() {
  const { session, loading: sessionLoading } = useSession()
  const [reports, setReports] = useState<Report[]>([])
  const [trucks, setTrucks] = useState<Record<string, Truck>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (session) fetchAll() }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    if (!session) return
    setLoading(true)
    const { data: r } = await supabase
      .from('accident_reports')
      .select('id, truck_id, occurred_at, severity_level, status, description')
      .eq('driver_id', session.employee.id)
      .order('occurred_at', { ascending: false })
    setReports(r || [])
    if (r?.length) {
      const { data: t } = await supabase.from('trucks').select('id, plate_no')
      setTrucks(Object.fromEntries((t || []).map((x) => [x.id, x])))
    }
    setLoading(false)
  }

  if (sessionLoading || !session) {
    return <div className="ac-loading">Loading…</div>
  }

  return (
    <div className="ac-app">
      <header className="ac-header">
        <Link href="/" className="ac-back">← Home</Link>
        <div className="ac-header-row">
          <div className="ac-title">Accident Reports</div>
          <Link href="/accident/new" className="ac-report-btn">+ Report</Link>
        </div>
      </header>

      <main className="ac-main">
        {loading ? (
          <div className="ac-empty">Loading…</div>
        ) : reports.length === 0 ? (
          <div className="ac-empty">No accident reports — hopefully it stays that way.</div>
        ) : (
          <div className="ac-list">
            {reports.map((r) => (
              <Link href={`/accident/${r.id}`} key={r.id} className="ac-row">
                <div className="ac-row-main">
                  <div className="ac-plate">{trucks[r.truck_id]?.plate_no || '—'}</div>
                  <div className="ac-desc">{r.description}</div>
                  <div className="ac-date">{new Date(r.occurred_at).toLocaleString()}</div>
                </div>
                <div className="ac-row-side">
                  <span className={`ac-status ac-status-${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  {r.severity_level && <span className="ac-severity">{r.severity_level}</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <style jsx>{`
        .ac-app { max-width: 560px; margin: 0 auto; min-height: 100vh; background: #0f1b28; }
        .ac-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #93a4b6; font-size: 14px; }
        .ac-header { position: sticky; top: 0; z-index: 20; background: #16232f; border-bottom: 1px solid #26374a; padding: 14px 16px; }
        .ac-back { font-size: 12.5px; color: #93a4b6; text-decoration: none; }
        .ac-back:hover { color: #e9eef3; }
        .ac-header-row { display: flex; align-items: center; justify-content: space-between; margin-top: 6px; }
        .ac-title { font-size: 18px; font-weight: 700; color: #e9eef3; }
        .ac-report-btn { font-size: 12.5px; font-weight: 700; padding: 7px 13px; border-radius: 100px; background: #c85a26; color: #fff; text-decoration: none; }
        .ac-main { padding: 14px 12px 32px; }
        .ac-empty { text-align: center; padding: 48px 16px; color: #64798d; font-size: 13.5px; }
        .ac-list { display: flex; flex-direction: column; gap: 8px; }
        .ac-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #16232f; border: 1px solid #26374a; border-radius: 10px; padding: 12px 14px; text-decoration: none; }
        .ac-row-main { min-width: 0; }
        .ac-plate { font-family: var(--font-mono); font-weight: 700; font-size: 14px; color: #e9eef3; }
        .ac-desc { font-size: 12.5px; color: #93a4b6; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
        .ac-date { font-size: 11px; color: #64798d; margin-top: 4px; }
        .ac-row-side { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .ac-status { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; }
        .ac-status-danger { background: #34201a; color: #f2977e; }
        .ac-status-warn { background: #332711; color: #f0c674; }
        .ac-status-ok { background: #17301f; color: #86d494; }
        .ac-severity { font-family: var(--font-mono); font-size: 11px; font-weight: 700; color: #f2977e; }
      `}</style>
    </div>
  )
}
