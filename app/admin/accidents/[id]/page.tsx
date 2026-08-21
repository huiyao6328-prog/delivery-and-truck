'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Report = {
  id: string
  truck_id: string
  driver_id: string
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
  verified_by: string | null
  verified_at: string | null
  verification_notes: string | null
}
type Truck = { plate_no: string }
type Employee = { id: string; full_name: string }

export default function AccidentDetailAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [report, setReport] = useState<Report | null>(null)
  const [truck, setTruck] = useState<Truck | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [driverName, setDriverName] = useState('—')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const { data: r } = await supabase.from('accident_reports').select('*').eq('id', id).single()
    if (!r) { setLoading(false); return }
    setReport(r)
    const [{ data: t }, { data: emp }, { data: drv }] = await Promise.all([
      supabase.from('trucks').select('plate_no').eq('id', r.truck_id).single(),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
      supabase.from('employees').select('full_name').eq('id', r.driver_id).single(),
    ])
    setTruck(t || null)
    setEmployees(emp || [])
    setDriverName(drv?.full_name || '—')
    setLoading(false)
  }

  function update<K extends keyof Report>(key: K, value: Report[K]) {
    setReport((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function saveClassification() {
    if (!report) return
    setSaving(true)
    await supabase.from('accident_reports').update({
      severity_level: report.severity_level,
      assigned_to: report.assigned_to,
      status: report.status === 'pending' ? 'in_progress' : report.status,
    }).eq('id', report.id)
    await fetchAll()
    setSaving(false)
  }

  async function saveInvestigation() {
    if (!report) return
    setSaving(true)
    await supabase.from('accident_reports').update({
      notified_insurance: report.notified_insurance,
      notified_customer: report.notified_customer,
      root_cause: report.root_cause,
      corrective_action: report.corrective_action,
      status: report.status === 'in_progress' ? 'pending_review' : report.status,
    }).eq('id', report.id)
    await fetchAll()
    setSaving(false)
  }

  async function saveVerification() {
    if (!report) return
    setSaving(true)
    const nextStatus = report.verification_result === 'pass' ? 'closed' : 'in_progress'
    await supabase.from('accident_reports').update({
      verification_result: report.verification_result,
      verified_by: report.verified_by,
      verified_at: report.verified_at,
      verification_notes: report.verification_notes,
      status: nextStatus,
    }).eq('id', report.id)
    await fetchAll()
    setSaving(false)
  }

  if (loading) {
    return <AdminLayout><div className="loading"><div className="spinner" /><span>Loading…</span></div></AdminLayout>
  }
  if (!report) {
    return <AdminLayout><div className="empty-state">Report not found. <Link href="/admin/accidents">Back to list</Link></div></AdminLayout>
  }

  const latencyMin = Math.round((new Date(report.reported_at).getTime() - new Date(report.occurred_at).getTime()) / 60000)

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <Link href="/admin/accidents" style={{ color: '#93a4b6', fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 6 }}>← Accidents</Link>
          <div className="page-title">{truck?.plate_no || '—'} · {new Date(report.occurred_at).toLocaleString()}</div>
          <div className="page-sub">Reported by {driverName} · report latency {latencyMin} min</div>
        </div>
        <a className="btn btn-secondary" href={`/api/accidents/${report.id}/export-word`}>⬇ Export Word</a>
      </div>

      <div style={{ display: 'grid', gap: 16, maxWidth: 640 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e9eef3', marginBottom: 10 }}>Report</div>
          <p style={{ fontSize: 13.5, color: '#cdd8e3', margin: '0 0 10px' }}>{report.description}</p>
          {report.location && <div style={{ fontSize: 12.5, color: '#93a4b6', marginBottom: 10 }}>📍 {report.location}</div>}
          {report.photo_url && <img src={report.photo_url} alt="" style={{ width: '100%', maxWidth: 260, borderRadius: 8, border: '1px solid #26374a', marginBottom: 10 }} />}
          <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: '#93a4b6', borderTop: '1px solid #26374a', paddingTop: 10 }}>
            <div>{report.stopped_safely ? '✅' : '❌'} Stopped safely</div>
            <div>{report.ensured_safety ? '✅' : '❌'} Ensured safety</div>
            <div>{report.notified_manager ? '✅' : '❌'} Notified manager</div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e9eef3', marginBottom: 14 }}>Classification & Assignment</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Severity</label>
              <select className="form-select" value={report.severity_level || ''} onChange={(e) => update('severity_level', (e.target.value || null) as Report['severity_level'])}>
                <option value="">—</option>
                <option value="L1">L1 — Minor</option>
                <option value="L2">L2 — General</option>
                <option value="L3">L3 — Serious</option>
                <option value="L4">L4 — Major</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Assigned To</label>
              <select className="form-select" value={report.assigned_to || ''} onChange={(e) => update('assigned_to', e.target.value || null)}>
                <option value="">—</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" disabled={saving} onClick={saveClassification}>{saving ? 'Saving…' : 'Save'}</button>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e9eef3', marginBottom: 14 }}>Investigation & Notifications</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label"><input type="checkbox" checked={report.notified_insurance} onChange={(e) => update('notified_insurance', e.target.checked)} style={{ marginRight: 8 }} />Notified insurance</label>
            </div>
            <div className="form-group">
              <label className="form-label"><input type="checkbox" checked={report.notified_customer} onChange={(e) => update('notified_customer', e.target.checked)} style={{ marginRight: 8 }} />Notified customer</label>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Root Cause</label>
            <textarea className="form-textarea" value={report.root_cause || ''} onChange={(e) => update('root_cause', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Corrective Action</label>
            <textarea className="form-textarea" value={report.corrective_action || ''} onChange={(e) => update('corrective_action', e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={saving} onClick={saveInvestigation}>{saving ? 'Saving…' : 'Save'}</button>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e9eef3', marginBottom: 14 }}>Verification & Close</div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Result</label>
              <select className="form-select" value={report.verification_result || ''} onChange={(e) => update('verification_result', (e.target.value || null) as Report['verification_result'])}>
                <option value="">—</option>
                <option value="pass">Passed — case closed</option>
                <option value="fail">Failed — send back</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Verified By</label>
              <input className="form-input" value={report.verified_by || ''} onChange={(e) => update('verified_by', e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Closed Date</label>
            <input type="date" className="form-input" value={report.verified_at || ''} onChange={(e) => update('verified_at', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={report.verification_notes || ''} onChange={(e) => update('verification_notes', e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={saving} onClick={saveVerification}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </AdminLayout>
  )
}
