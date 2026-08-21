'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

type Report = {
  id: string
  truck_id: string
  occurred_at: string
  reported_at: string
  location: string | null
  description: string
  photo_url: string | null
  stopped_safely: boolean
  ensured_safety: boolean
  notified_manager: boolean
  severity_level: 'L1' | 'L2' | 'L3' | 'L4' | null
  status: 'pending' | 'in_progress' | 'pending_review' | 'closed'
  assigned_to: string | null
  notified_insurance: boolean
  notified_customer: boolean
  root_cause: string | null
  corrective_action: string | null
  verification_result: 'pass' | 'fail' | null
}
type Truck = { plate_no: string }
type Employee = { full_name: string }

const STATUS_LABEL: Record<Report['status'], string> = {
  pending: 'Reported — awaiting classification', in_progress: 'Investigating', pending_review: 'Pending Verification', closed: 'Closed',
}

export default function AccidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, loading: sessionLoading } = useSession()
  const [report, setReport] = useState<Report | null>(null)
  const [truck, setTruck] = useState<Truck | null>(null)
  const [assignee, setAssignee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (session) fetchAll() }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const { data: r } = await supabase.from('accident_reports').select('*').eq('id', id).single()
    if (!r) { setLoading(false); return }
    setReport(r)
    const [{ data: t }, { data: emp }] = await Promise.all([
      supabase.from('trucks').select('plate_no').eq('id', r.truck_id).single(),
      r.assigned_to ? supabase.from('employees').select('full_name').eq('id', r.assigned_to).single() : Promise.resolve({ data: null }),
    ])
    setTruck(t || null)
    setAssignee(emp || null)
    setLoading(false)
  }

  if (sessionLoading || !session || loading) {
    return <div className="ad-loading">Loading…</div>
  }
  if (!report) {
    return <div className="ad-loading">Report not found. <Link href="/accident" style={{ color: '#7fb2ff' }}>Back to list</Link></div>
  }

  const latencyMin = Math.round((new Date(report.reported_at).getTime() - new Date(report.occurred_at).getTime()) / 60000)

  return (
    <div className="ad-app">
      <header className="ad-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/accident" className="ad-back">← Accident Reports</Link>
          <a href={`/api/accidents/${report.id}/export-word`} style={{ fontSize: 12, color: '#93a4b6', textDecoration: 'none' }}>⬇ Export Word</a>
        </div>
      </header>

      <main className="ad-main">
        <div className="ad-card">
          <div className="ad-top">
            <div>
              <div className="ad-plate">{truck?.plate_no || '—'}</div>
              <div className="ad-date">{new Date(report.occurred_at).toLocaleString()}</div>
            </div>
            <span className="ad-status">{STATUS_LABEL[report.status]}</span>
          </div>
          <div className="ad-desc">{report.description}</div>
          {report.location && <div className="ad-location">📍 {report.location}</div>}
          {report.photo_url && <img src={report.photo_url} alt="" className="ad-photo" />}
          <div className="ad-meta-grid">
            <div><div className="ad-eyebrow">Severity</div><div className="ad-val">{report.severity_level || 'Not yet classified'}</div></div>
            <div><div className="ad-eyebrow">Report Latency</div><div className="ad-val mono">{latencyMin} min</div></div>
            <div><div className="ad-eyebrow">Assigned</div><div className="ad-val">{assignee?.full_name || '—'}</div></div>
          </div>
        </div>

        <div className="ad-card">
          <div className="ad-section-title">At the scene</div>
          <div className="ad-check-row"><span>{report.stopped_safely ? '✅' : '❌'}</span> Stopped the vehicle safely</div>
          <div className="ad-check-row"><span>{report.ensured_safety ? '✅' : '❌'}</span> Made sure everyone was safe</div>
          <div className="ad-check-row"><span>{report.notified_manager ? '✅' : '❌'}</span> Notified supervisor</div>
        </div>

        {(report.root_cause || report.corrective_action || report.verification_result) && (
          <div className="ad-card">
            <div className="ad-section-title">Investigation</div>
            {report.root_cause && <div className="ad-field"><div className="ad-eyebrow">Root Cause</div><p>{report.root_cause}</p></div>}
            {report.corrective_action && <div className="ad-field"><div className="ad-eyebrow">Corrective Action</div><p>{report.corrective_action}</p></div>}
            {report.verification_result && <div className="ad-field"><div className="ad-eyebrow">Verification</div><p>{report.verification_result === 'pass' ? 'Passed — closed' : 'Failed — sent back'}</p></div>}
          </div>
        )}
      </main>

      <style jsx>{`
        .ad-app { max-width: 560px; margin: 0 auto; min-height: 100vh; background: #0f1b28; }
        .ad-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #93a4b6; font-size: 14px; }
        .ad-header { position: sticky; top: 0; z-index: 20; background: #16232f; border-bottom: 1px solid #26374a; padding: 14px 16px; }
        .ad-back { font-size: 12.5px; color: #93a4b6; text-decoration: none; }
        .ad-back:hover { color: #e9eef3; }
        .ad-main { padding: 14px 12px 32px; display: flex; flex-direction: column; gap: 12px; }
        .ad-card { background: #16232f; border: 1px solid #26374a; border-radius: 12px; padding: 16px; }
        .ad-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ad-plate { font-family: var(--font-mono); font-size: 18px; font-weight: 700; color: #e9eef3; }
        .ad-date { font-size: 12px; color: #64798d; margin-top: 2px; }
        .ad-status { font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 100px; background: #332711; color: #f0c674; white-space: nowrap; }
        .ad-desc { font-size: 13.5px; color: #e9eef3; margin-top: 12px; }
        .ad-location { font-size: 12.5px; color: #93a4b6; margin-top: 8px; }
        .ad-photo { width: 100%; max-width: 240px; border-radius: 8px; margin-top: 10px; border: 1px solid #26374a; }
        .ad-meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; border-top: 1px solid #26374a; margin-top: 14px; padding-top: 12px; }
        .ad-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64798d; margin-bottom: 3px; }
        .ad-val { font-size: 13px; font-weight: 600; color: #e9eef3; }
        .mono { font-family: var(--font-mono); }
        .ad-section-title { font-size: 13.5px; font-weight: 700; color: #e9eef3; margin-bottom: 10px; }
        .ad-check-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #cdd8e3; padding: 5px 0; }
        .ad-field { margin-bottom: 10px; }
        .ad-field p { margin: 2px 0 0; font-size: 13px; color: #cdd8e3; }
      `}</style>
    </div>
  )
}
