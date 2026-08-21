'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type ListItem = { key: string; primary: string; secondary?: string; badge?: { text: string; className: string } }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type Kpis = {
  totalVehicles: number
  readyToDispatch: number
  inspectionDue: number
  defectiveVehicles: number
  underMaintenance: number
  criticalIssues: number
  registrationExpiring: number
  insuranceExpiring: number
  driverIssues: number
  inspectionCompliance: number
}

const emptyKpis: Kpis = {
  totalVehicles: 0, readyToDispatch: 0, inspectionDue: 0, defectiveVehicles: 0, underMaintenance: 0,
  criticalIssues: 0, registrationExpiring: 0, insuranceExpiring: 0, driverIssues: 0, inspectionCompliance: 0,
}

export default function DashboardPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-12

  const [kpis, setKpis] = useState<Kpis>(emptyKpis)
  const [kpiLoading, setKpiLoading] = useState(true)

  const [truckItems, setTruckItems] = useState<ListItem[]>([])
  const [driverItems, setDriverItems] = useState<ListItem[]>([])
  const [dispatchItems, setDispatchItems] = useState<ListItem[]>([])
  const [issueItems, setIssueItems] = useState<ListItem[]>([])
  const [defectFleetItems, setDefectFleetItems] = useState<ListItem[]>([])
  const [inspectionsToday, setInspectionsToday] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchToday() }, [])
  useEffect(() => { fetchKpis() }, [year, month])

  const monthRange = useMemo(() => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).getDate()
    const end = `${year}-${String(month).padStart(2, '0')}-${String(endDate).padStart(2, '0')}`
    return { start, end }
  }, [year, month])

  async function fetchKpis() {
    setKpiLoading(true)
    const { start, end } = monthRange
    const today = new Date().toISOString().slice(0, 10)

    const [{ data: owners }, { data: allTrucks }] = await Promise.all([
      supabase.from('truck_owners').select('id, is_default'),
      supabase.from('trucks').select('id, is_active, owner_id, registration_expiry, insurance_expiry'),
    ])
    const defaultOwnerIds = new Set((owners || []).filter((o) => o.is_default).map((o) => o.id))
    const fleet = (allTrucks || []).filter((t) => t.is_active && t.owner_id && defaultOwnerIds.has(t.owner_id))
    const fleetIds = fleet.map((t) => t.id)
    const totalVehicles = fleet.length

    if (fleetIds.length === 0) {
      setKpis(emptyKpis)
      setKpiLoading(false)
      return
    }

    const [{ data: openActions }, { data: todayInspections }, { data: monthInspections }, { data: monthDriverChecks }] = await Promise.all([
      supabase.from('improvement_actions').select('truck_id, severity, status').in('truck_id', fleetIds).neq('status', 'closed'),
      supabase.from('inspections').select('truck_id').in('truck_id', fleetIds).eq('inspection_date', today),
      supabase.from('inspections').select('truck_id').in('truck_id', fleetIds).gte('inspection_date', start).lte('inspection_date', end),
      supabase.from('driver_readiness_checks').select('id').gte('check_date', start).lte('check_date', end).eq('overall_result', 'issues_found'),
    ])

    const actions = openActions || []
    const defectiveTruckIds = new Set(actions.filter((a) => a.severity === 'critical' && a.status === 'pending').map((a) => a.truck_id))
    const maintenanceTruckIds = new Set(
      actions.filter((a) => (a.status === 'in_progress' || a.status === 'pending_review') && !defectiveTruckIds.has(a.truck_id)).map((a) => a.truck_id)
    )
    const criticalIssues = actions.filter((a) => a.severity === 'critical').length

    const inspectedTodayIds = new Set((todayInspections || []).map((i) => i.truck_id))
    const inspectionDue = fleetIds.filter((id) => !inspectedTodayIds.has(id)).length

    const readyToDispatch = fleetIds.filter((id) => !defectiveTruckIds.has(id) && !maintenanceTruckIds.has(id)).length

    const registrationExpiring = fleet.filter((t) => t.registration_expiry && t.registration_expiry >= start && t.registration_expiry <= end).length
    const insuranceExpiring = fleet.filter((t) => t.insurance_expiry && t.insurance_expiry >= start && t.insurance_expiry <= end).length

    const inspectedThisMonthIds = new Set((monthInspections || []).map((i) => i.truck_id))
    const inspectionCompliance = totalVehicles > 0 ? Math.round((fleetIds.filter((id) => inspectedThisMonthIds.has(id)).length / totalVehicles) * 100) : 0

    setKpis({
      totalVehicles,
      readyToDispatch,
      inspectionDue,
      defectiveVehicles: defectiveTruckIds.size,
      underMaintenance: maintenanceTruckIds.size,
      criticalIssues,
      registrationExpiring,
      insuranceExpiring,
      driverIssues: (monthDriverChecks || []).length,
      inspectionCompliance,
    })
    setKpiLoading(false)
  }

  async function fetchToday() {
    const today = new Date().toISOString().slice(0, 10)
    const [truckTypesRes, trucksRes, inspectionsRes, dispatchesRes, employeesRes, ownersRes] = await Promise.all([
      supabase.from('truck_types').select('id, name'),
      supabase.from('trucks').select('id, plate_no, truck_type_id, owner_id'),
      supabase.from('inspections').select('id, truck_id, driver_id, overall_result').eq('inspection_date', today),
      supabase.from('dispatches').select('id, truck_id, driver_id, destination, purpose').eq('dispatch_date', today),
      supabase.from('employees').select('id, full_name'),
      supabase.from('truck_owners').select('id, name, is_default'),
    ])

    const defaultOwnerIds = new Set((ownersRes.data || []).filter((o) => o.is_default).map((o) => o.id))
    const inDefaultFleet = (truckId: string) => {
      const t = trucksRes.data?.find((tr) => tr.id === truckId)
      return !!t?.owner_id && defaultOwnerIds.has(t.owner_id)
    }

    const truckTypeName = (id: string | null) => truckTypesRes.data?.find((t) => t.id === id)?.name
    const truck = (id: string) => trucksRes.data?.find((t) => t.id === id)
    const employeeName = (id: string | null) => employeesRes.data?.find((e) => e.id === id)?.full_name

    const inspections = (inspectionsRes.data || []).filter((i) => inDefaultFleet(i.truck_id))
    const dispatches = (dispatchesRes.data || []).filter((d) => inDefaultFleet(d.truck_id))

    const inspectedTruckIds = [...new Set(inspections.map((i) => i.truck_id))]
    setTruckItems(inspectedTruckIds.map((id) => {
      const t = truck(id)
      return { key: id, primary: t?.plate_no || '—', secondary: truckTypeName(t?.truck_type_id || null) }
    }))

    const checkedDriverIds = new Set(inspections.map((i) => i.driver_id))
    const dispatchedDriverIds = new Set(dispatches.map((d) => d.driver_id).filter((id): id is string => !!id))
    const allDriverIds = [...new Set([...checkedDriverIds, ...dispatchedDriverIds])]
    setDriverItems(allDriverIds.map((id) => {
      const checked = checkedDriverIds.has(id)
      const dispatched = dispatchedDriverIds.has(id)
      const label = checked && dispatched ? 'Checked & Dispatched' : checked ? 'Checked Truck' : 'Dispatched'
      const cls = checked && dispatched ? 'badge-orange' : checked ? 'badge-green' : 'badge-blue'
      return { key: id, primary: employeeName(id) || '—', badge: { text: label, className: cls } }
    }))

    setDispatchItems(dispatches.map((d) => {
      const t = truck(d.truck_id)
      return { key: d.id, primary: t?.plate_no || '—', secondary: d.destination || d.purpose || undefined }
    }))

    setIssueItems(
      inspections
        .filter((i) => i.overall_result === 'issues_found')
        .map((i) => {
          const t = truck(i.truck_id)
          return { key: i.id, primary: t?.plate_no || '—', secondary: employeeName(i.driver_id) || undefined, badge: { text: 'Issue', className: 'badge-red' } }
        })
    )

    setInspectionsToday(inspections.length)

    // Default fleet — open defects
    const fleetTrucks = (trucksRes.data || []).filter((t) => t.owner_id && defaultOwnerIds.has(t.owner_id))
    if (fleetTrucks.length) {
      const fleetTruckIds = fleetTrucks.map((t) => t.id)
      const { data: openActions } = await supabase
        .from('improvement_actions')
        .select('id, truck_id, inspection_result_id')
        .in('truck_id', fleetTruckIds)
        .neq('status', 'closed')
      const resultIds = (openActions || []).map((a) => a.inspection_result_id)
      const { data: results } = resultIds.length
        ? await supabase.from('inspection_results').select('id, label_snapshot').in('id', resultIds)
        : { data: [] }
      const labelById = Object.fromEntries((results || []).map((r) => [r.id, r.label_snapshot]))

      const byTruck: Record<string, string[]> = {}
      ;(openActions || []).forEach((a) => {
        byTruck[a.truck_id] = byTruck[a.truck_id] || []
        byTruck[a.truck_id].push(labelById[a.inspection_result_id] || 'Unspecified issue')
      })
      setDefectFleetItems(
        fleetTrucks
          .filter((t) => byTruck[t.id]?.length)
          .map((t) => ({
            key: t.id,
            primary: t.plate_no,
            secondary: byTruck[t.id].join(', '),
            badge: { text: `${byTruck[t.id].length} open`, className: 'badge-red' },
          }))
      )
    } else {
      setDefectFleetItems([])
    }

    setLoading(false)
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Default fleet overview</div>
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
      </div>

      {kpiLoading ? (
        <div className="loading"><div className="spinner" /><span>Loading…</span></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 24 }}>
          <KpiGroup title="Fleet Overview" items={[
            { label: '🚚 Total Vehicles', value: kpis.totalVehicles },
            { label: '🟢 Ready to Dispatch', value: kpis.readyToDispatch },
            { label: '🟡 Inspection Due', value: kpis.inspectionDue },
            { label: '🔴 Defective Vehicles', value: kpis.defectiveVehicles },
            { label: '📅 Registration Expiring', value: kpis.registrationExpiring },
            { label: '📅 Insurance Expiring', value: kpis.insuranceExpiring },
          ]} />
          <KpiGroup title="Issues & Maintenance" items={[
            { label: '👨‍🔧 Driver Issues', value: kpis.driverIssues },
            { label: '⚠️ Critical Issues', value: kpis.criticalIssues },
            { label: '🔧 Under Maintenance', value: kpis.underMaintenance },
            { label: '📊 Inspection Compliance', value: `${kpis.inspectionCompliance}%` },
          ]} />
        </div>
      )}

      <div className="page-sub" style={{ margin: '4px 0 14px' }}>Today&apos;s activity</div>
      {loading ? (
        <div className="loading"><div className="spinner" /><span>Loading…</span></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <ListCard title="Active Trucks" subtitle="Inspected today" items={truckItems} emptyText="No trucks inspected yet today." />
          <ListCard title="Active Drivers" subtitle="Checked or dispatched today" items={driverItems} emptyText="No driver activity yet today." />
          <ListCard title="Dispatches Today" subtitle="Trucks sent out" items={dispatchItems} emptyText="No dispatches recorded today." />
          <ListCard title="Issues Flagged" subtitle="Trucks with a problem today" items={issueItems} emptyText="No issues flagged today." />
          <ListCard title="Default Fleet — Open Defects" subtitle="Unresolved issues by plate no." items={defectFleetItems} emptyText="No open defects on default-fleet trucks." />
          <div className="stat-card">
            <div className="stat-label">Inspections Today</div>
            <div className="stat-value">{inspectionsToday}</div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

function KpiGroup({ title, items }: { title: string; items: { label: string; value: number | string }[] }) {
  return (
    <div className="card">
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #26374a', fontSize: 13.5, fontWeight: 700, color: '#e9eef3' }}>
        {title}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 18, padding: 18 }}>
        {items.map((item) => (
          <div key={item.label}>
            <div className="stat-label">{item.label}</div>
            <div className="stat-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ListCard({ title, subtitle, items, emptyText }: { title: string; subtitle: string; items: ListItem[]; emptyText: string }) {
  return (
    <div className="card">
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #26374a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: '#e9eef3' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: '#64798d', marginTop: 2 }}>{subtitle}</div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: '#e37a42' }}>{items.length}</div>
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '22px 16px', fontSize: 12.5 }}>{emptyText}</div>
        ) : items.map((item) => (
          <div key={item.key} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '9px 16px', borderBottom: '1px solid #1e2c3a',
          }}>
            <div>
              <div style={{ fontSize: 13.5, color: '#e9eef3', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{item.primary}</div>
              {item.secondary && <div style={{ fontSize: 11.5, color: '#64798d', marginTop: 1 }}>{item.secondary}</div>}
            </div>
            {item.badge && <span className={`badge ${item.badge.className}`} style={{ whiteSpace: 'nowrap' }}>{item.badge.text}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
