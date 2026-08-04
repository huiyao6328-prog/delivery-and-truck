'use client'
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Truck = { id: string; plate_no: string }
type Driver = { id: string; full_name: string }
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

const STATUS_LABEL: Record<string, string> = { ok: 'OK', issue: 'Issue', na: 'N/A' }
const STATUS_BADGE: Record<string, string> = { ok: 'badge-green', issue: 'badge-red', na: 'badge-gray' }

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'issues_found'>('all')
  const [truckFilter, setTruckFilter] = useState('')
  const [exporting, setExporting] = useState(false)

  const [detailId, setDetailId] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const [loadingResults, setLoadingResults] = useState(false)

  useEffect(() => { fetchAll() }, [filter, truckFilter])

  async function fetchAll() {
    setLoading(true)
    let query = supabase.from('inspections').select('*').order('inspection_date', { ascending: false }).limit(200)
    if (filter === 'issues_found') query = query.eq('overall_result', 'issues_found')
    if (truckFilter) query = query.eq('truck_id', truckFilter)
    const [{ data: insp }, { data: t }, { data: d }] = await Promise.all([
      query,
      supabase.from('trucks').select('id, plate_no'),
      supabase.from('employees').select('id, full_name'),
    ])
    setInspections(insp || [])
    setTrucks(t || [])
    setDrivers(d || [])
    setLoading(false)
  }

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

  function truckPlate(id: string) { return trucks.find((t) => t.id === id)?.plate_no || '—' }
  function driverName(id: string) { return drivers.find((d) => d.id === id)?.full_name || '—' }

  async function openDetail(id: string) {
    setDetailId(id)
    setLoadingResults(true)
    const { data } = await supabase.from('inspection_results').select('*').eq('inspection_id', id).order('created_at')
    setResults(data || [])
    setLoadingResults(false)
  }

  const detail = inspections.find((i) => i.id === detailId)
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
          <div className="page-sub">{inspections.length} submission(s) · most recent 200</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="form-select" style={{ width: 180 }} value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
            <option value="">All trucks</option>
            {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
          </select>
          <select className="form-select" style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value as 'all' | 'issues_found')}>
            <option value="all">All results</option>
            <option value="issues_found">Issues flagged only</option>
          </select>
          <button className="btn btn-primary" onClick={exportExcel} disabled={exporting || inspections.length === 0}>
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : inspections.length === 0 ? (
          <div className="empty-state">No inspections submitted yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Truck</th><th>Driver</th><th>Odometer (km)</th><th>Result</th><th>Submitted</th><th></th></tr></thead>
              <tbody>
                {inspections.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{i.inspection_date}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{truckPlate(i.truck_id)}</td>
                    <td>{driverName(i.driver_id)}</td>
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

      {detailId && detail && (
        <div className="modal-overlay" onClick={() => setDetailId(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{truckPlate(detail.truck_id)} · {detail.inspection_date}</div>
                <div style={{ fontSize: 12.5, color: '#93a4b6', marginTop: 2 }}>
                  {driverName(detail.driver_id)} · Odometer {detail.odometer_km ?? '—'} km
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
