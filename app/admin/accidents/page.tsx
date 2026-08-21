'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Report = {
  id: string
  truck_id: string
  driver_id: string
  occurred_at: string
  reported_at: string
  severity_level: 'L1' | 'L2' | 'L3' | 'L4' | null
  status: 'pending' | 'in_progress' | 'pending_review' | 'closed'
  description: string
}
type Truck = { id: string; plate_no: string }
type Employee = { id: string; full_name: string }

const STATUS_LABEL: Record<Report['status'], string> = {
  pending: 'Reported', in_progress: 'Investigating', pending_review: 'Pending Review', closed: 'Closed',
}
const STATUS_BADGE: Record<Report['status'], string> = {
  pending: 'badge-red', in_progress: 'badge-orange', pending_review: 'badge-orange', closed: 'badge-green',
}
const SEVERITY_BADGE: Record<string, string> = { L1: 'badge-gray', L2: 'badge-orange', L3: 'badge-orange', L4: 'badge-red' }

function latencyMinutes(r: Report) {
  return Math.round((new Date(r.reported_at).getTime() - new Date(r.occurred_at).getTime()) / 60000)
}
function latencyScore(min: number) {
  if (min <= 15) return { label: `${min} min`, tone: '#86d494' }
  if (min <= 30) return { label: `${min} min`, tone: '#e9eef3' }
  if (min <= 60) return { label: `${min} min`, tone: '#f0c674' }
  return { label: `${min} min`, tone: '#f2977e' }
}

export default function AccidentsAdminPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [trucks, setTrucks] = useState<Record<string, Truck>>({})
  const [employees, setEmployees] = useState<Record<string, Employee>>({})
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | Report['status']>('open')
  const [severityFilter, setSeverityFilter] = useState('')
  const [truckFilter, setTruckFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState<'date' | 'truck' | 'severity' | 'latency' | 'status'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: r } = await supabase.from('accident_reports').select('*').order('occurred_at', { ascending: false })
    setReports(r || [])
    const [{ data: t }, { data: emp }] = await Promise.all([
      supabase.from('trucks').select('id, plate_no'),
      supabase.from('employees').select('id, full_name'),
    ])
    setTrucks(Object.fromEntries((t || []).map((x) => [x.id, x])))
    setEmployees(Object.fromEntries((emp || []).map((x) => [x.id, x])))
    setLoading(false)
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const withValue = (r: Report) => {
      switch (sortKey) {
        case 'date': return r.occurred_at
        case 'truck': return trucks[r.truck_id]?.plate_no?.toLowerCase() || ''
        case 'severity': return r.severity_level || ''
        case 'latency': return latencyMinutes(r)
        case 'status': return r.status
      }
    }
    const list = reports.filter((r) => {
      if (statusFilter === 'all') { /* no-op */ } else if (statusFilter === 'open') { if (r.status === 'closed') return false } else if (r.status !== statusFilter) return false
      if (severityFilter && r.severity_level !== severityFilter) return false
      if (truckFilter && r.truck_id !== truckFilter) return false
      const date = r.occurred_at.slice(0, 10)
      if (dateFrom && date < dateFrom) return false
      if (dateTo && date > dateTo) return false
      if (q) {
        const hay = `${trucks[r.truck_id]?.plate_no || ''} ${employees[r.driver_id]?.full_name || ''} ${r.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const sorted = [...list].sort((a, b) => {
      const va = withValue(a), vb = withValue(b)
      if (va < vb) return -1
      if (va > vb) return 1
      return 0
    })
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports, statusFilter, severityFilter, truckFilter, dateFrom, dateTo, searchText, sortKey, sortDir, trucks, employees])

  function SortHeader({ label, sortKeyName }: { label: string; sortKeyName: typeof sortKey }) {
    const active = sortKey === sortKeyName
    return (
      <th onClick={() => toggleSort(sortKeyName)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Accidents</div>
          <div className="page-sub">{filtered.length} of {reports.length} report(s) · separate from routine vehicle defects (see Improvement Progress)</div>
        </div>
        <select className="form-select" style={{ width: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="open">Open cases</option>
          <option value="all">All statuses</option>
          <option value="pending">Reported</option>
          <option value="in_progress">Investigating</option>
          <option value="pending_review">Pending Review</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input type="date" className="form-input" style={{ width: 150 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="form-input" style={{ width: 150 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="form-select" style={{ width: 150 }} value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="">All severities</option>
          <option value="L1">L1</option>
          <option value="L2">L2</option>
          <option value="L3">L3</option>
          <option value="L4">L4</option>
        </select>
        <select className="form-select" style={{ width: 170 }} value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
          <option value="">All trucks</option>
          {Object.values(trucks).sort((a, b) => a.plate_no.localeCompare(b.plate_no)).map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
        </select>
        <input className="form-input" style={{ width: 220 }} placeholder="Search truck, driver, description…" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No accident reports match this filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Occurred" sortKeyName="date" />
                  <SortHeader label="Truck" sortKeyName="truck" />
                  <th>Driver</th>
                  <SortHeader label="Severity" sortKeyName="severity" />
                  <SortHeader label="Report Latency" sortKeyName="latency" />
                  <SortHeader label="Status" sortKeyName="status" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const latency = latencyScore(latencyMinutes(r))
                  return (
                    <tr key={r.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{new Date(r.occurred_at).toLocaleString()}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{trucks[r.truck_id]?.plate_no || '—'}</td>
                      <td>{employees[r.driver_id]?.full_name || '—'}</td>
                      <td>{r.severity_level ? <span className={`badge ${SEVERITY_BADGE[r.severity_level]}`}>{r.severity_level}</span> : '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', color: latency.tone, fontWeight: 700 }}>{latency.label}</td>
                      <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                      <td><Link className="action-btn action-edit" href={`/admin/accidents/${r.id}`}>Open</Link></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
