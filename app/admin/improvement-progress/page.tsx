'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Action = {
  id: string
  inspection_result_id: string
  truck_id: string
  status: 'pending' | 'in_progress' | 'pending_review' | 'closed'
  severity: 'critical' | 'moderate' | 'minor' | null
  deadline: string | null
  assigned_to: string | null
  created_at: string
}
type Result = { id: string; label_snapshot: string }
type Truck = { id: string; plate_no: string }
type Employee = { id: string; full_name: string }

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
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | Action['status']>('open')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data: a } = await supabase.from('improvement_actions').select('*').order('created_at', { ascending: false })
    const list = a || []
    setActions(list)
    if (list.length) {
      const [{ data: r }, { data: t }, { data: emp }] = await Promise.all([
        supabase.from('inspection_results').select('id, label_snapshot').in('id', list.map((x) => x.inspection_result_id)),
        supabase.from('trucks').select('id, plate_no'),
        supabase.from('employees').select('id, full_name'),
      ])
      setResults(Object.fromEntries((r || []).map((x) => [x.id, x])))
      setTrucks(Object.fromEntries((t || []).map((x) => [x.id, x])))
      setEmployees(Object.fromEntries((emp || []).map((x) => [x.id, x])))
    }
    setLoading(false)
  }

  const filtered = actions.filter((a) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'open') return a.status !== 'closed'
    return a.status === statusFilter
  })

  function daysLeft(a: Action) {
    if (!a.deadline || a.status === 'closed') return '—'
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(a.deadline + 'T00:00:00')
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (diff < 0) return <span style={{ color: '#f2977e', fontWeight: 700 }}>{Math.abs(diff)}d overdue</span>
    if (diff <= 1) return <span style={{ color: '#f2977e', fontWeight: 700 }}>{diff === 0 ? 'Due today' : 'Due tomorrow'}</span>
    return <span>{diff}d left</span>
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Improvement Progress</div>
          <div className="page-sub">{filtered.length} of {actions.length} case(s) · defects found during daily inspections, tracked to close-out</div>
        </div>
        <select className="form-select" style={{ width: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="open">Open cases</option>
          <option value="all">All statuses</option>
          <option value="pending">Awaiting Assignment</option>
          <option value="in_progress">In Progress</option>
          <option value="pending_review">Pending Review</option>
          <option value="closed">Closed</option>
        </select>
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
                <tr><th>Truck</th><th>Defect</th><th>Severity</th><th>Assigned</th><th>Deadline</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{trucks[a.truck_id]?.plate_no || '—'}</td>
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
