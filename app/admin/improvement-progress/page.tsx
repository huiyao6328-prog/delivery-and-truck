'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Action = {
  id: string
  inspection_result_id: string
  truck_id: string
  status: 'pending' | 'in_progress' | 'pending_review' | 'closed'
  severity: 'critical' | 'moderate' | 'minor' | null
  inspection_date: string | null
  deadline: string | null
  assigned_to: string | null
  created_at: string
}
type Result = { id: string; label_snapshot: string; photo_url: string | null }
type Truck = { id: string; plate_no: string; owner_id: string | null; truck_type_id: string | null }
type Employee = { id: string; full_name: string }
type TruckType = { id: string; name: string }

const STATUS_LABEL: Record<Action['status'], string> = {
  pending: 'Awaiting Assignment', in_progress: 'In Progress', pending_review: 'Pending Review', closed: 'Closed',
}
const STATUS_BADGE: Record<Action['status'], string> = {
  pending: 'badge-red', in_progress: 'badge-orange', pending_review: 'badge-orange', closed: 'badge-green',
}
const SEVERITY_BADGE: Record<string, string> = { critical: 'badge-red', moderate: 'badge-orange', minor: 'badge-gray' }

export default function ImprovementProgressAdminPage() {
  const [actions, setActions] = useState<Action[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [trucks, setTrucks] = useState<Record<string, Truck>>({})
  const [employees, setEmployees] = useState<Record<string, Employee>>({})
  const [defaultTruckIds, setDefaultTruckIds] = useState<Set<string>>(new Set())
  const [truckTypes, setTruckTypes] = useState<TruckType[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | Action['status']>('open')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [truckTypeFilter, setTruckTypeFilter] = useState('')
  const [truckFilter, setTruckFilter] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sortKey, setSortKey] = useState<'inspection_date' | 'truck' | 'defect' | 'severity' | 'assigned' | 'deadline' | 'status'>('deadline')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [exporting, setExporting] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: a } = await supabase.from('improvement_actions').select('*').order('created_at', { ascending: false })
    const list = a || []
    setActions(list)
    const [{ data: t }, { data: owners }, { data: types }] = await Promise.all([
      supabase.from('trucks').select('id, plate_no, owner_id, truck_type_id'),
      supabase.from('truck_owners').select('id, is_default'),
      supabase.from('truck_types').select('id, name').order('name'),
    ])
    const defaultOwnerIds = new Set((owners || []).filter((o) => o.is_default).map((o) => o.id))
    setTrucks(Object.fromEntries((t || []).map((x) => [x.id, x])))
    setDefaultTruckIds(new Set((t || []).filter((x) => x.owner_id && defaultOwnerIds.has(x.owner_id)).map((x) => x.id)))
    setTruckTypes(types || [])
    if (list.length) {
      const [{ data: r }, { data: emp }] = await Promise.all([
        supabase.from('inspection_results').select('id, label_snapshot, photo_url').in('id', list.map((x) => x.inspection_result_id)),
        supabase.from('employees').select('id, full_name'),
      ])
      setResults(Object.fromEntries((r || []).map((x) => [x.id, x])))
      setEmployees(Object.fromEntries((emp || []).map((x) => [x.id, x])))
    }
    setLoading(false)
  }

  function inspectionDateFor(a: Action) {
    return a.inspection_date || ''
  }

  const fleetActions = actions.filter((a) => defaultTruckIds.has(a.truck_id))

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    const withValue = (a: Action) => {
      switch (sortKey) {
        case 'inspection_date': return inspectionDateFor(a)
        case 'truck': return (trucks[a.truck_id]?.plate_no || '').toLowerCase()
        case 'defect': return (results[a.inspection_result_id]?.label_snapshot || '').toLowerCase()
        case 'severity': return a.severity || ''
        case 'assigned': return (a.assigned_to ? employees[a.assigned_to]?.full_name : '') || ''
        case 'deadline': return a.deadline || ''
        case 'status': return a.status
      }
    }
    const list = fleetActions.filter((a) => {
      if (statusFilter === 'all') { /* no-op */ } else if (statusFilter === 'open') { if (a.status === 'closed') return false } else if (a.status !== statusFilter) return false
      const inspDate = inspectionDateFor(a)
      if (dateFrom && (!inspDate || inspDate < dateFrom)) return false
      if (dateTo && (!inspDate || inspDate > dateTo)) return false
      if (truckTypeFilter && trucks[a.truck_id]?.truck_type_id !== truckTypeFilter) return false
      if (truckFilter && a.truck_id !== truckFilter) return false
      if (q) {
        const hay = `${trucks[a.truck_id]?.plate_no || ''} ${results[a.inspection_result_id]?.label_snapshot || ''} ${a.assigned_to ? employees[a.assigned_to]?.full_name || '' : ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const sorted = [...list].sort((a, b) => {
      const va = withValue(a)
      const vb = withValue(b)
      if (va < vb) return -1
      if (va > vb) return 1
      return 0
    })
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleetActions, statusFilter, dateFrom, dateTo, truckTypeFilter, truckFilter, searchText, sortKey, sortDir, trucks, results, employees])

  function SortHeader({ label, sortKeyName }: { label: string; sortKeyName: typeof sortKey }) {
    const active = sortKey === sortKeyName
    return (
      <th onClick={() => toggleSort(sortKeyName)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  function daysLeft(a: Action) {
    if (!a.deadline || a.status === 'closed') return '—'
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(a.deadline + 'T00:00:00')
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (diff < 0) return <span style={{ color: '#f2977e', fontWeight: 700 }}>{Math.abs(diff)}d overdue</span>
    if (diff <= 1) return <span style={{ color: '#f2977e', fontWeight: 700 }}>{diff === 0 ? 'Due today' : 'Due tomorrow'}</span>
    return <span>{diff}d left</span>
  }

  function truckTypeName(id: string | null) {
    return truckTypes.find((t) => t.id === id)?.name || '—'
  }

  function exportExcel() {
    if (filtered.length === 0) return
    setExporting(true)
    try {
      const rows = filtered.map((a, idx) => ({
        '#': idx + 1,
        'Inspection Date': inspectionDateFor(a) || '',
        'Truck': trucks[a.truck_id]?.plate_no || '',
        'Vehicle Type': truckTypeName(trucks[a.truck_id]?.truck_type_id ?? null),
        'Defect': results[a.inspection_result_id]?.label_snapshot || '',
        'Severity': a.severity ? a.severity[0].toUpperCase() + a.severity.slice(1) : '',
        'Assigned': a.assigned_to ? employees[a.assigned_to]?.full_name || '' : 'Unassigned',
        'Deadline': a.deadline || '',
        'Status': STATUS_LABEL[a.status],
      }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Improvement Progress')
      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `improvement_progress_${today}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Improvement Progress</div>
          <div className="page-sub">{filtered.length} of {fleetActions.length} case(s) · defects found during daily inspections, tracked to close-out</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={exportExcel} disabled={exporting || filtered.length === 0}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
          <select className="form-select" style={{ width: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="open">Open cases</option>
            <option value="all">All statuses</option>
            <option value="pending">Awaiting Assignment</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_review">Pending Review</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input type="date" className="form-input" style={{ width: 150 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="form-input" style={{ width: 150 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="form-select" style={{ width: 170 }} value={truckTypeFilter} onChange={(e) => setTruckTypeFilter(e.target.value)}>
          <option value="">All truck types</option>
          {truckTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="form-select" style={{ width: 170 }} value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
          <option value="">All trucks</option>
          {Object.values(trucks).filter((t) => defaultTruckIds.has(t.id)).sort((a, b) => a.plate_no.localeCompare(b.plate_no)).map((t) => (
            <option key={t.id} value={t.id}>{t.plate_no}</option>
          ))}
        </select>
        <input
          className="form-input"
          style={{ width: 240 }}
          placeholder="Search truck, defect, assigned…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No cases match this filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <SortHeader label="Inspection Date" sortKeyName="inspection_date" />
                  <SortHeader label="Truck" sortKeyName="truck" />
                  <th>Photo</th>
                  <SortHeader label="Defect" sortKeyName="defect" />
                  <SortHeader label="Severity" sortKeyName="severity" />
                  <SortHeader label="Assigned" sortKeyName="assigned" />
                  <SortHeader label="Deadline" sortKeyName="deadline" />
                  <SortHeader label="Status" sortKeyName="status" />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, idx) => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#64798d' }}>{idx + 1}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{inspectionDateFor(a) || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{trucks[a.truck_id]?.plate_no || '—'}</td>
                    <td>
                      {results[a.inspection_result_id]?.photo_url ? (
                        <img
                          src={results[a.inspection_result_id].photo_url!}
                          alt=""
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #26374a' }}
                        />
                      ) : '—'}
                    </td>
                    <td>{results[a.inspection_result_id]?.label_snapshot || '—'}</td>
                    <td>{a.severity ? <span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{a.severity}</span> : '—'}</td>
                    <td>{a.assigned_to ? employees[a.assigned_to]?.full_name : <span style={{ color: '#64798d' }}>Unassigned</span>}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{daysLeft(a)}</td>
                    <td><span className={`badge ${STATUS_BADGE[a.status]}`}>{STATUS_LABEL[a.status]}</span></td>
                    <td><Link className="action-btn action-edit" href={`/improvement/${a.id}`}>Open</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
