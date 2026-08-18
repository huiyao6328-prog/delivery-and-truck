'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type ListItem = { key: string; primary: string; secondary?: string; badge?: { text: string; className: string } }

export default function DashboardPage() {
  const [truckItems, setTruckItems] = useState<ListItem[]>([])
  const [driverItems, setDriverItems] = useState<ListItem[]>([])
  const [dispatchItems, setDispatchItems] = useState<ListItem[]>([])
  const [issueItems, setIssueItems] = useState<ListItem[]>([])
  const [koufuDefectItems, setKoufuDefectItems] = useState<ListItem[]>([])
  const [inspectionsToday, setInspectionsToday] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  async function fetchStats() {
    const today = new Date().toISOString().slice(0, 10)
    const [truckTypesRes, trucksRes, inspectionsRes, dispatchesRes, employeesRes, ownersRes] = await Promise.all([
      supabase.from('truck_types').select('id, name'),
      supabase.from('trucks').select('id, plate_no, truck_type_id, owner_id'),
      supabase.from('inspections').select('id, truck_id, driver_id, overall_result').eq('inspection_date', today),
      supabase.from('dispatches').select('id, truck_id, driver_id, destination, purpose').eq('dispatch_date', today),
      supabase.from('employees').select('id, full_name'),
      supabase.from('truck_owners').select('id, name'),
    ])

    const truckTypeName = (id: string | null) => truckTypesRes.data?.find((t) => t.id === id)?.name
    const truck = (id: string) => trucksRes.data?.find((t) => t.id === id)
    const employeeName = (id: string | null) => employeesRes.data?.find((e) => e.id === id)?.full_name

    const inspections = inspectionsRes.data || []
    const dispatches = dispatchesRes.data || []

    // Active Trucks: trucks that had an inspection today
    const inspectedTruckIds = [...new Set(inspections.map((i) => i.truck_id))]
    setTruckItems(inspectedTruckIds.map((id) => {
      const t = truck(id)
      return { key: id, primary: t?.plate_no || '—', secondary: truckTypeName(t?.truck_type_id || null) }
    }))

    // Active Drivers: anyone who checked a truck and/or was dispatched today
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

    // Dispatches Today: trucks that went out
    setDispatchItems(dispatches.map((d) => {
      const t = truck(d.truck_id)
      return { key: d.id, primary: t?.plate_no || '—', secondary: d.destination || d.purpose || undefined }
    }))

    // Issues Flagged: trucks with an issue found today
    setIssueItems(
      inspections
        .filter((i) => i.overall_result === 'issues_found')
        .map((i) => {
          const t = truck(i.truck_id)
          return { key: i.id, primary: t?.plate_no || '—', secondary: employeeName(i.driver_id) || undefined, badge: { text: 'Issue', className: 'badge-red' } }
        })
    )

    setInspectionsToday(inspections.length)

    // Koufu Trucks — Open Defects
    const koufuOwnerId = ownersRes.data?.find((o) => o.name === 'Koufu')?.id
    const koufuTrucks = (trucksRes.data || []).filter((t) => t.owner_id === koufuOwnerId)
    if (koufuOwnerId && koufuTrucks.length) {
      const koufuTruckIds = koufuTrucks.map((t) => t.id)
      const { data: openActions } = await supabase
        .from('improvement_actions')
        .select('id, truck_id, inspection_result_id')
        .in('truck_id', koufuTruckIds)
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
      setKoufuDefectItems(
        koufuTrucks
          .filter((t) => byTruck[t.id]?.length)
          .map((t) => ({
            key: t.id,
            primary: t.plate_no,
            secondary: byTruck[t.id].join(', '),
            badge: { text: `${byTruck[t.id].length} open`, className: 'badge-red' },
          }))
      )
    } else {
      setKoufuDefectItems([])
    }

    setLoading(false)
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Fleet overview for today</div>
        </div>
      </div>
      {loading ? (
        <div className="loading"><div className="spinner" /><span>Loading…</span></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <ListCard title="Active Trucks" subtitle="Inspected today" items={truckItems} emptyText="No trucks inspected yet today." />
          <ListCard title="Active Drivers" subtitle="Checked or dispatched today" items={driverItems} emptyText="No driver activity yet today." />
          <ListCard title="Dispatches Today" subtitle="Trucks sent out" items={dispatchItems} emptyText="No dispatches recorded today." />
          <ListCard title="Issues Flagged" subtitle="Trucks with a problem today" items={issueItems} emptyText="No issues flagged today." />
          <ListCard title="Koufu Trucks — Open Defects" subtitle="Unresolved issues by plate no." items={koufuDefectItems} emptyText="No open defects on Koufu-owned trucks." />
          <div className="stat-card">
            <div className="stat-label">Inspections Today</div>
            <div className="stat-value">{inspectionsToday}</div>
          </div>
        </div>
      )}
    </AdminLayout>
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
