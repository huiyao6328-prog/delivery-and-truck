'use client'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Truck = { id: string; plate_no: string; owner_id: string | null }
type Driver = { id: string; full_name: string; department_id: string | null }
type Department = { id: string; name: string }
type TruckOwner = { id: string; name: string }
type Inspection = {
  id: string
  truck_id: string
  driver_id: string
  inspection_date: string
  odometer_km: number | null
  overall_result: string
  submitted_at: string | null
}
type Result = {
  id: string
  category_snapshot: string
  label_snapshot: string
  status: string
  note: string | null
  photo_url: string | null
}
type DefectRow = Result & {
  inspection_id: string
  truck_id: string
  driver_id: string
  inspection_date: string
}

const STATUS_LABEL: Record<string, string> = { ok: 'OK', issue: 'Issue', na: 'N/A' }
const STATUS_BADGE: Record<string, string> = { ok: 'badge-green', issue: 'badge-red', na: 'badge-gray' }

export default function InspectionsPage() {
  const [activeTab, setActiveTab] = useState<'all' | 'defects'>('all')

  const [inspections, setInspections] = useState<Inspection[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [owners, setOwners] = useState<TruckOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  const [defects, setDefects] = useState<DefectRow[]>([])
  const [loadingDefects, setLoadingDefects] = useState(false)
  const [defectsLoaded, setDefectsLoaded] = useState(false)

  const [ownerFilter, setOwnerFilter] = useState('')
  const [truckFilter, setTruckFilter] = useState('')
  const [resultFilter, setResultFilter] = useState<'all' | 'issues_found'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchText, setSearchText] = useState('')

  const [detailId, setDetailId] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [loadingResults, setLoadingResults] = useState(false)

  useEffect(() => { fetchLookups() }, [])
  useEffect(() => { fetchInspections() }, [truckFilter, resultFilter, ownerFilter, dateFrom, dateTo, trucks])
  useEffect(() => {
    if (activeTab === 'defects' && !defectsLoaded) fetchDefects()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  async function fetchLookups() {
    const [{ data: t }, { data: d }, { data: dep }, { data: own }] = await Promise.all([
      supabase.from('trucks').select('id, plate_no, owner_id'),
      supabase.from('employees').select('id, full_name, department_id'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('truck_owners').select('id, name').order('name'),
    ])
    setTrucks(t || [])
    setDrivers(d || [])
    setDepartments(dep || [])
    setOwners(own || [])
  }

  async function fetchInspections() {
    setLoading(true)
    let query = supabase.from('inspections').select('*').order('inspection_date', { ascending: false }).limit(200)
    if (resultFilter === 'issues_found') query = query.eq('overall_result', 'issues_found')
    if (truckFilter) query = query.eq('truck_id', truckFilter)
    if (dateFrom) query = query.gte('inspection_date', dateFrom)
    if (dateTo) query = query.lte('inspection_date', dateTo)
    if (ownerFilter) {
      const ids = trucks.filter((t) => t.owner_id === ownerFilter).map((t) => t.id)
      query = query.in('truck_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
    }
    const { data } = await query
    setInspections(data || [])
    setLoading(false)
  }

  async function fetchDefects() {
    setLoadingDefects(true)
    const { data: items } = await supabase
      .from('inspection_results')
      .select('*')
      .eq('status', 'issue')
      .order('created_at', { ascending: false })
      .limit(500)
    const list = items || []
    if (list.length === 0) {
      setDefects([])
      setLoadingDefects(false)
      setDefectsLoaded(true)
      return
    }
    const inspectionIds = [...new Set(list.map((r) => r.inspection_id))]
    const { data: insp } = await supabase.from('inspections').select('id, truck_id, driver_id, inspection_date').in('id', inspectionIds)
    const inspMap = Object.fromEntries((insp || []).map((i) => [i.id, i]))
    const merged = list
      .map((r) => {
        const i = inspMap[r.inspection_id]
        return i ? { ...r, truck_id: i.truck_id, driver_id: i.driver_id, inspection_date: i.inspection_date } : null
      })
      .filter((r): r is DefectRow => r !== null)
    setDefects(merged)
    setLoadingDefects(false)
    setDefectsLoaded(true)
  }

  function truckPlate(id: string) { return trucks.find((t) => t.id === id)?.plate_no || '—' }
  function driverName(id: string) { return drivers.find((d) => d.id === id)?.full_name || '—' }
  function departmentName(id: string | null) { return departments.find((d) => d.id === id)?.name || '—' }
  function ownerName(truckId: string) {
    const ownerId = trucks.find((t) => t.id === truckId)?.owner_id
    return owners.find((o) => o.id === ownerId)?.name || '—'
  }

  const searchedInspections = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return inspections
    return inspections.filter((i) => {
      const hay = `${truckPlate(i.truck_id)} ${driverName(i.driver_id)}`.toLowerCase()
      return hay.includes(q)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspections, trucks, drivers, searchText])

  const filteredDefects = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return defects.filter((d) => {
      if (truckFilter && d.truck_id !== truckFilter) return false
      if (dateFrom && d.inspection_date < dateFrom) return false
      if (dateTo && d.inspection_date > dateTo) return false
      if (ownerFilter && trucks.find((t) => t.id === d.truck_id)?.owner_id !== ownerFilter) return false
      if (q) {
        const hay = `${truckPlate(d.truck_id)} ${driverName(d.driver_id)} ${d.label_snapshot} ${d.category_snapshot} ${d.note || ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defects, truckFilter, dateFrom, dateTo, ownerFilter, searchText, drivers, trucks])

  async function exportExcel() {
    if (inspections.length === 0) return
    setExporting(true)
    try {
      const ids = inspections.map((i) => i.id)
      const { data: allResults } = await supabase.from('inspection_results').select('*').in('inspection_id', ids)
      const resultsByInspection: Record<string, Result[]> = {}
      ;(allResults || []).forEach((r) => {
        resultsByInspection[r.inspection_id] = resultsByInspection[r.inspection_id] || []
        resultsByInspection[r.inspection_id].push(r)
      })

      const overviewRows = inspections.map((i) => ({
        Date: i.inspection_date,
        Truck: truckPlate(i.truck_id),
        Driver: driverName(i.driver_id),
        'Odometer (km)': i.odometer_km ?? '',
        Result: i.overall_result === 'issues_found' ? 'Issues Found' : 'All OK',
        Submitted: i.submitted_at ? new Date(i.submitted_at).toLocaleString() : '',
      }))

      const detailRows: Record<string, string | number>[] = []
      inspections.forEach((i) => {
        (resultsByInspection[i.id] || []).forEach((r) => {
          detailRows.push({
            Date: i.inspection_date,
            Truck: truckPlate(i.truck_id),
            Driver: driverName(i.driver_id),
            Category: r.category_snapshot,
            Item: r.label_snapshot,
            Status: STATUS_LABEL[r.status] || r.status,
            Note: r.note || '',
          })
        })
      })

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), 'Overview')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Item Details')

      const label = truckFilter ? truckPlate(truckFilter) : 'all_trucks'
      const safe = label.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
      XLSX.writeFile(wb, `daily_inspections_${safe}.xlsx`)
    } finally {
      setExporting(false)
    }
  }

  async function openDetail(id: string) {
    setDetailId(id)
    setLoadingResults(true)
    const { data } = await supabase.from('inspection_results').select('*').eq('inspection_id', id).order('created_at')
    setResults(data || [])
    setLoadingResults(false)
  }

  const detail = inspections.find((i) => i.id === detailId) || (activeTab === 'defects' ? defects.find((d) => d.inspection_id === detailId) : undefined)
  const grouped: Record<string, Result[]> = {}
  results.forEach((r) => {
    grouped[r.category_snapshot] = grouped[r.category_snapshot] || []
    grouped[r.category_snapshot].push(r)
  })

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Daily Inspections</div>
          <div className="page-sub">
            {activeTab === 'all'
              ? `${searchedInspections.length} submission(s) · most recent 200`
              : `${filteredDefects.length} defect item(s)`}
          </div>
        </div>
        {activeTab === 'all' && (
          <button className="btn btn-primary" onClick={exportExcel} disabled={exporting || inspections.length === 0}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="form-select" style={{ width: 170 }} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">All truck owners</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <select className="form-select" style={{ width: 170 }} value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
          <option value="">All trucks</option>
          {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
        </select>
        {activeTab === 'all' && (
          <select className="form-select" style={{ width: 180 }} value={resultFilter} onChange={(e) => setResultFilter(e.target.value as 'all' | 'issues_found')}>
            <option value="all">All results</option>
            <option value="issues_found">Issues flagged only</option>
          </select>
        )}
        <input type="date" className="form-input" style={{ width: 150 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="form-input" style={{ width: 150 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <input
          className="form-input"
          style={{ width: 220 }}
          placeholder="Search truck, driver, item…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid #1e2c3a' }}>
        <button
          onClick={() => setActiveTab('all')}
          style={{
            padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5,
            fontWeight: 600, color: activeTab === 'all' ? '#e9eef3' : '#93a4b6',
            borderBottom: activeTab === 'all' ? '2px solid #e07a3f' : '2px solid transparent',
          }}
        >
          All Inspections
        </button>
        <button
          onClick={() => setActiveTab('defects')}
          style={{
            padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13.5,
            fontWeight: 600, color: activeTab === 'defects' ? '#e9eef3' : '#93a4b6',
            borderBottom: activeTab === 'defects' ? '2px solid #e07a3f' : '2px solid transparent',
          }}
        >
          Defect Items
        </button>
      </div>

      {activeTab === 'all' ? (
        <div className="card">
          {loading ? (
            <div className="loading"><div className="spinner" /><span>Loading…</span></div>
          ) : searchedInspections.length === 0 ? (
            <div className="empty-state">No inspections match this filter.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Truck</th><th>Truck Owner</th><th>Driver</th><th>Department</th><th>Odometer (km)</th><th>Result</th><th>Submitted</th><th></th></tr></thead>
                <tbody>
                  {searchedInspections.map((i) => (
                    <tr key={i.id}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{i.inspection_date}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{truckPlate(i.truck_id)}</td>
                      <td style={{ color: '#93a4b6' }}>{ownerName(i.truck_id)}</td>
                      <td>{driverName(i.driver_id)}</td>
                      <td style={{ color: '#93a4b6' }}>{departmentName(drivers.find((d) => d.id === i.driver_id)?.department_id ?? null)}</td>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{i.odometer_km ?? '—'}</td>
                      <td>
                        {i.overall_result === 'issues_found'
                          ? <span className="badge badge-red">Issues Found</span>
                          : <span className="badge badge-green">All OK</span>}
                      </td>
                      <td style={{ color: '#93a4b6', fontSize: 12.5 }}>{i.submitted_at ? new Date(i.submitted_at).toLocaleString() : '—'}</td>
                      <td><button className="action-btn action-edit" onClick={() => openDetail(i.id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          {loadingDefects ? (
            <div className="loading"><div className="spinner" /><span>Loading…</span></div>
          ) : filteredDefects.length === 0 ? (
            <div className="empty-state">No defect items match this filter.</div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Truck</th><th>Truck Owner</th><th>Driver</th><th>Department</th><th>Category</th><th>Item</th><th>Note</th><th></th></tr></thead>
                <tbody>
                  {filteredDefects.map((d) => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'var(--font-mono)' }}>{d.inspection_date}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{truckPlate(d.truck_id)}</td>
                      <td style={{ color: '#93a4b6' }}>{ownerName(d.truck_id)}</td>
                      <td>{driverName(d.driver_id)}</td>
                      <td style={{ color: '#93a4b6' }}>{departmentName(drivers.find((dr) => dr.id === d.driver_id)?.department_id ?? null)}</td>
                      <td>{d.category_snapshot}</td>
                      <td>{d.label_snapshot}</td>
                      <td style={{ color: '#f2977e', fontSize: 12.5 }}>{d.note || '—'}</td>
                      <td><button className="action-btn action-edit" onClick={() => openDetail(d.inspection_id)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {detailId && detail && (
        <div className="modal-overlay" onClick={() => setDetailId(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{truckPlate(detail.truck_id)} · {detail.inspection_date}</div>
                <div style={{ fontSize: 12.5, color: '#93a4b6', marginTop: 2 }}>
                  {driverName(detail.driver_id)}
                  {'odometer_km' in detail ? ` · Odometer ${detail.odometer_km ?? '—'} km` : ''}
                </div>
              </div>
              <button className="modal-close" onClick={() => setDetailId(null)}>×</button>
            </div>
            <div className="modal-body">
              {loadingResults ? (
                <div className="loading"><div className="spinner" /><span>Loading…</span></div>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category} style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e9eef3', marginBottom: 8 }}>{category}</div>
                    {items.map((r) => (
                      <div key={r.id} style={{
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
                        padding: '8px 0', borderTop: '1px solid #1e2c3a',
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, color: '#e9eef3' }}>{r.label_snapshot}</div>
                          {r.note && <div style={{ fontSize: 12.5, color: '#f2977e', marginTop: 2 }}>{r.note}</div>}
                        </div>
                        <span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
