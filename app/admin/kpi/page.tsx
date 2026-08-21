'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ROLE_LEVEL_LABEL: Record<number, string> = { 1: 'L1 主管', 2: 'L2 副主管', 3: 'L3 司機', 4: 'L4 幫手' }

const EXCUSED_REASONS = new Set(['customer_change', 'weather', 'road_closure', 'production_delay'])

type Employee = { id: string; full_name: string; role_level: number | null; is_driver: boolean }
type Row = {
  employee: Employee
  dispatchedDays: number
  inspectionsSubmitted: number
  inspectionRate: number | null
  readinessTotal: number
  readinessPassRate: number | null
  disciplineRate: number | null
  accidentCount: number
  worstSeverity: string | null
  openDefects: number
  repairCost: number
  fuelCost: number
  complaintCount: number
  vehicleScore: number | null
  assignedTruckCount: number
  onTimeRate: number | null
  scheduledCount: number
}

export default function KpiDashboardPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [roleFilter, setRoleFilter] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const monthRange = useMemo(() => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDay = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    return { start, end }
  }, [year, month])

  useEffect(() => { fetchAll() }, [year, month])

  async function fetchAll() {
    setLoading(true)
    const { start, end } = monthRange

    const [
      { data: employees },
      { data: dispatches },
      { data: inspections },
      { data: readiness },
      { data: accidents },
      { data: complaints },
      { data: actions },
      { data: assignments },
      { data: fuelTx },
      { data: openActions },
    ] = await Promise.all([
      supabase.from('employees').select('id, full_name, role_level, is_driver').eq('is_active', true),
      supabase.from('dispatches').select('id, truck_id, driver_id, helper_id, dispatch_date, departure_time, scheduled_departure_time, delay_reason').gte('dispatch_date', start).lte('dispatch_date', end),
      supabase.from('inspections').select('id, driver_id, inspection_date').gte('inspection_date', start).lte('inspection_date', end),
      supabase.from('driver_readiness_checks').select('driver_id, overall_result, check_date').gte('check_date', start).lte('check_date', end),
      supabase.from('accident_reports').select('driver_id, severity_level, occurred_at').gte('occurred_at', start).lte('occurred_at', end + 'T23:59:59'),
      supabase.from('customer_complaints').select('driver_id, complaint_date').gte('complaint_date', start).lte('complaint_date', end),
      supabase.from('improvement_actions').select('assigned_to, status, repair_cost, inspection_date').gte('inspection_date', start).lte('inspection_date', end),
      supabase.from('truck_maintenance_assignments').select('truck_id, employee_id'),
      supabase.from('fuel_transactions').select('truck_id, amount_inc_vat, transaction_date').gte('transaction_date', start).lte('transaction_date', end),
      supabase.from('improvement_actions').select('truck_id, severity, status').neq('status', 'closed'),
    ])

    const empList = employees || []
    const dispatchList = dispatches || []
    const fuelByTruck: Record<string, number> = {}
    ;(fuelTx || []).forEach((f) => {
      if (!f.truck_id) return
      fuelByTruck[f.truck_id] = (fuelByTruck[f.truck_id] || 0) + f.amount_inc_vat
    })

    const computed: Row[] = empList.map((emp) => {
      const myDispatches = dispatchList.filter((d) => d.driver_id === emp.id)
      const dispatchedDays = new Set(myDispatches.map((d) => d.dispatch_date)).size
      const inspectionsSubmitted = (inspections || []).filter((i) => i.driver_id === emp.id).length
      const inspectionRate = dispatchedDays > 0 ? Math.min(100, Math.round((inspectionsSubmitted / dispatchedDays) * 100)) : null

      const myReadiness = (readiness || []).filter((r) => r.driver_id === emp.id)
      const readinessPassRate = myReadiness.length > 0 ? Math.round((myReadiness.filter((r) => r.overall_result === 'ok').length / myReadiness.length) * 100) : null
      // Discipline (工作紀律): 每天雙表完成率 — did they submit both the
      // Daily Inspection and the Driver Readiness check on days they were
      // dispatched. Proxy metric, no attendance system exists.
      const readinessRate = dispatchedDays > 0 ? Math.min(100, Math.round((myReadiness.length / dispatchedDays) * 100)) : null
      const disciplineRate = inspectionRate != null && readinessRate != null ? Math.round((inspectionRate + readinessRate) / 2)
        : inspectionRate ?? readinessRate

      // On-Time Delivery: among this driver's dispatches with a scheduled
      // departure time, what fraction departed within 15 min of it, or had
      // an excused delay reason.
      const myScheduled = myDispatches.filter((d) => d.scheduled_departure_time && d.departure_time)
      const onTimeCount = myScheduled.filter((d) => {
        const lateMin = Math.round((new Date(d.departure_time!).getTime() - new Date(d.scheduled_departure_time!).getTime()) / 60000)
        return lateMin <= 15 || (d.delay_reason && EXCUSED_REASONS.has(d.delay_reason))
      }).length
      const onTimeRate = myScheduled.length > 0 ? Math.round((onTimeCount / myScheduled.length) * 100) : null

      // Vehicle score (0-100), bound to standing maintenance assignments —
      // not to driving activity. 100 = ready, 50 = under maintenance
      // (already being worked on), 0 = defective (open critical issue,
      // nothing started yet). Averaged across every truck this person is
      // responsible for.
      const myTruckIds = (assignments || []).filter((a) => a.employee_id === emp.id).map((a) => a.truck_id)
      const vehicleScore = myTruckIds.length > 0 ? Math.round(
        myTruckIds.reduce((sum, tid) => {
          const truckActions = (openActions || []).filter((a) => a.truck_id === tid)
          const defective = truckActions.some((a) => a.severity === 'critical' && a.status === 'pending')
          const underMaintenance = truckActions.some((a) => a.status === 'in_progress' || a.status === 'pending_review')
          return sum + (defective ? 0 : underMaintenance ? 50 : 100)
        }, 0) / myTruckIds.length
      ) : null

      const myAccidents = (accidents || []).filter((a) => a.driver_id === emp.id)
      const severityRank: Record<string, number> = { L1: 1, L2: 2, L3: 3, L4: 4 }
      const worstSeverity = myAccidents.reduce<string | null>((worst, a) => {
        if (!a.severity_level) return worst
        if (!worst || severityRank[a.severity_level] > severityRank[worst]) return a.severity_level
        return worst
      }, null)

      const myActions = (actions || []).filter((a) => a.assigned_to === emp.id)
      const openDefects = myActions.filter((a) => a.status !== 'closed').length
      const repairCost = myActions.reduce((sum, a) => sum + (a.repair_cost || 0), 0)

      const complaintCount = (complaints || []).filter((c) => c.driver_id === emp.id).length

      // Fuel cost approximation: trucks this person drove in the period, plus
      // trucks they're a standing maintenance-assignee for. A shared truck's
      // fuel cost gets attributed to every associated person — approximate,
      // not a precise per-person allocation.
      const drivenTruckIds = new Set(myDispatches.map((d) => d.truck_id))
      ;(assignments || []).filter((a) => a.employee_id === emp.id).forEach((a) => drivenTruckIds.add(a.truck_id))
      const fuelCost = [...drivenTruckIds].reduce((sum, tid) => sum + (fuelByTruck[tid] || 0), 0)

      return {
        employee: emp, dispatchedDays, inspectionsSubmitted, inspectionRate,
        readinessTotal: myReadiness.length, readinessPassRate, disciplineRate,
        accidentCount: myAccidents.length, worstSeverity,
        openDefects, repairCost, fuelCost, complaintCount,
        vehicleScore, assignedTruckCount: myTruckIds.length,
        onTimeRate, scheduledCount: myScheduled.length,
      }
    })

    setRows(computed)
    setLoading(false)
  }

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => !roleFilter || String(r.employee.role_level) === roleFilter)
      .filter((r) => r.dispatchedDays > 0 || r.readinessTotal > 0 || r.openDefects > 0 || r.complaintCount > 0 || r.assignedTruckCount > 0 || r.employee.role_level != null)
      .sort((a, b) => (a.employee.role_level || 99) - (b.employee.role_level || 99) || a.employee.full_name.localeCompare(b.employee.full_name))
  }, [rows, roleFilter])

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">KPI Dashboard</div>
          <div className="page-sub">Per-employee metrics for the selected month · rolled up from Daily Inspections, Driver Readiness, Accidents, Improvement Progress, Fuel & Cost, Customer Complaints</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
        <select className="form-select" style={{ width: 110 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 4 + i).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => setMonth(i + 1)}
              className="btn"
              style={{
                padding: '6px 12px', fontSize: 12.5,
                background: month === i + 1 ? '#c85a26' : '#101a24',
                color: month === i + 1 ? 'white' : '#93a4b6',
                border: month === i + 1 ? 'none' : '1px solid #28394a',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <select className="form-select" style={{ width: 160 }} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All role levels</option>
          <option value="1">L1 主管</option>
          <option value="2">L2 副主管</option>
          <option value="3">L3 司機</option>
          <option value="4">L4 幫手</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : filteredRows.length === 0 ? (
          <div className="empty-state">No employee activity in this period.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th><th>Role</th>
                  <th>車輛 Vehicle Score</th>
                  <th>紀律 Discipline</th>
                  <th>安全 Readiness Pass %</th>
                  <th>安全 Accidents</th>
                  <th>準時 On-Time</th>
                  <th>車輛 Open Defects</th>
                  <th>成本 Fuel (₱)</th>
                  <th>成本 Repair (₱)</th>
                  <th>客戶 Complaints</th>
                  <th>正確率 Delivery Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.employee.id}>
                    <td style={{ fontWeight: 600 }}>{r.employee.full_name}</td>
                    <td>{r.employee.role_level ? <span className="badge badge-orange">{ROLE_LEVEL_LABEL[r.employee.role_level]}</span> : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {r.vehicleScore != null ? (
                        <span className={r.vehicleScore >= 90 ? 'badge badge-green' : r.vehicleScore >= 50 ? 'badge badge-orange' : 'badge badge-red'}>{r.vehicleScore}</span>
                      ) : '—'}
                      {r.assignedTruckCount > 0 && <span style={{ color: '#64798d', fontSize: 11 }}> ({r.assignedTruckCount} truck{r.assignedTruckCount > 1 ? 's' : ''})</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.disciplineRate != null ? `${r.disciplineRate}%` : '—'} <span style={{ color: '#64798d', fontSize: 11 }}>(insp {r.inspectionsSubmitted}/{r.dispatchedDays}, ready {r.readinessTotal}/{r.dispatchedDays})</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.readinessPassRate != null ? `${r.readinessPassRate}%` : '—'}</td>
                    <td>
                      {r.accidentCount > 0 ? (
                        <span className={`badge ${r.worstSeverity === 'L4' || r.worstSeverity === 'L3' ? 'badge-red' : 'badge-orange'}`}>{r.accidentCount} ({r.worstSeverity})</span>
                      ) : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>
                      {r.onTimeRate != null ? `${r.onTimeRate}%` : '—'}
                      {r.scheduledCount > 0 && <span style={{ color: '#64798d', fontSize: 11 }}> ({r.scheduledCount})</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.openDefects || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.fuelCost > 0 ? r.fuelCost.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{r.repairCost > 0 ? r.repairCost.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: r.complaintCount > 0 ? '#f2977e' : undefined }}>{r.complaintCount || '—'}</td>
                    <td style={{ color: '#64798d', fontStyle: 'italic' }}>Not available</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: '#64798d', marginTop: 10, maxWidth: 760 }}>
        Delivery Accuracy still has no data source (deferred to kf-erp). Vehicle Score only shows for standing maintenance-assignees (Employees → Maintenance Responsible For) — 100 = all assigned trucks ready, 50 = one or more under active repair, 0 = one or more defective with nothing started yet. On-Time % only counts dispatches with a scheduled departure time set; the count in parentheses is how many such dispatches were scheduled. Fuel cost is an approximation: a shared truck&apos;s cost is attributed to every driver who used it and every maintenance-assignee in the period, not split precisely per person.
      </div>
    </AdminLayout>
  )
}
