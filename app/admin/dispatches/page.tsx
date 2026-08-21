'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Truck = { id: string; plate_no: string }
type Driver = { id: string; full_name: string }
type Dispatch = {
  id: string
  truck_id: string
  driver_id: string | null
  helper_id: string | null
  dispatch_date: string
  status: string
  destination: string | null
  purpose: string | null
  start_mileage_km: number | null
  end_mileage_km: number | null
  departure_time: string | null
  return_time: string | null
  scheduled_departure_time: string | null
  scheduled_arrival_time: string | null
  delay_reason: string | null
  fuel_level_on_return: string | null
  has_issue: boolean
  issue_note: string | null
  note: string | null
}

const FUEL_LABEL: Record<string, string> = {
  full: 'Full', three_quarter: '3/4', half: '1/2', quarter: '1/4', empty: 'Empty',
}
const DELAY_REASON_LABEL: Record<string, string> = {
  customer_change: 'Customer changed time', weather: 'Weather', road_closure: 'Road closure',
  production_delay: 'Production delay', traffic: 'Traffic', other: 'Other',
}

type Form = {
  truck_id: string; driver_id: string; helper_id: string; dispatch_date: string; status: string
  destination: string; purpose: string; start_mileage_km: string; end_mileage_km: string; note: string
  scheduled_departure_time: string; scheduled_arrival_time: string
}
const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = (): Form => ({
  truck_id: '', driver_id: '', helper_id: '', dispatch_date: today(), status: 'pending',
  destination: '', purpose: '', start_mileage_km: '', end_mileage_km: '', note: '',
  scheduled_departure_time: '', scheduled_arrival_time: '',
})

function toLocalInput(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
}
const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-gray', in_progress: 'badge-blue', completed: 'badge-green', cancelled: 'badge-red',
}

export default function DispatchesPage() {
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [helpers, setHelpers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: d }, { data: t }, { data: e }, { data: h }] = await Promise.all([
      supabase.from('dispatches').select('*').order('dispatch_date', { ascending: false }).limit(200),
      supabase.from('trucks').select('id, plate_no').eq('is_active', true).order('plate_no'),
      supabase.from('employees').select('id, full_name').eq('is_driver', true).eq('is_active', true).order('full_name'),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setDispatches(d || [])
    setTrucks(t || [])
    setDrivers(e || [])
    setHelpers(h || [])
    setLoading(false)
  }

  function truckPlate(id: string) { return trucks.find((t) => t.id === id)?.plate_no || '—' }
  function driverName(id: string | null) { return drivers.find((d) => d.id === id)?.full_name || '—' }
  function helperName(id: string | null) { return id ? helpers.find((h) => h.id === id)?.full_name || '—' : '—' }

  const EXCUSED_REASONS = new Set(['customer_change', 'weather', 'road_closure', 'production_delay'])
  function onTimeStatus(d: Dispatch) {
    if (!d.scheduled_departure_time || !d.departure_time) return null
    const lateMin = Math.round((new Date(d.departure_time).getTime() - new Date(d.scheduled_departure_time).getTime()) / 60000)
    if (lateMin <= 15) return { label: 'On Time', tone: 'badge-green' }
    if (d.delay_reason && EXCUSED_REASONS.has(d.delay_reason)) return { label: `Excused (${DELAY_REASON_LABEL[d.delay_reason]})`, tone: 'badge-gray' }
    return { label: `${lateMin}m late`, tone: 'badge-red' }
  }

  function openAdd() {
    setForm(emptyForm())
    setEditId(null)
    setModal('add')
  }

  function openEdit(d: Dispatch) {
    setForm({
      truck_id: d.truck_id,
      driver_id: d.driver_id || '',
      helper_id: d.helper_id || '',
      dispatch_date: d.dispatch_date,
      status: d.status,
      destination: d.destination || '',
      purpose: d.purpose || '',
      start_mileage_km: d.start_mileage_km?.toString() || '',
      end_mileage_km: d.end_mileage_km?.toString() || '',
      note: d.note || '',
      scheduled_departure_time: toLocalInput(d.scheduled_departure_time),
      scheduled_arrival_time: toLocalInput(d.scheduled_arrival_time),
    })
    setEditId(d.id)
    setModal('edit')
  }

  async function save() {
    if (!form.truck_id || !form.dispatch_date) return
    setSaving(true)
    try {
      const payload = {
        truck_id: form.truck_id,
        driver_id: form.driver_id || null,
        helper_id: form.helper_id || null,
        dispatch_date: form.dispatch_date,
        status: form.status,
        destination: form.destination.trim() || null,
        purpose: form.purpose.trim() || null,
        scheduled_departure_time: form.scheduled_departure_time ? new Date(form.scheduled_departure_time).toISOString() : null,
        scheduled_arrival_time: form.scheduled_arrival_time ? new Date(form.scheduled_arrival_time).toISOString() : null,
        start_mileage_km: form.start_mileage_km ? Number(form.start_mileage_km) : null,
        end_mileage_km: form.end_mileage_km ? Number(form.end_mileage_km) : null,
        note: form.note.trim() || null,
      }
      if (modal === 'add') await supabase.from('dispatches').insert([payload])
      else await supabase.from('dispatches').update(payload).eq('id', editId)
      setModal(null)
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('dispatches').delete().eq('id', id)
    setDeleteId(null)
    fetchAll()
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Dispatch Records</div>
          <div className="page-sub">{dispatches.length} record(s) · most recent 200</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Dispatch</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : dispatches.length === 0 ? (
          <div className="empty-state">No dispatch records yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Truck</th><th>Driver</th><th>Helper</th><th>Destination</th><th>Out / Back</th><th>On-Time</th><th>Status</th><th>Issue</th><th>Actions</th></tr></thead>
              <tbody>
                {dispatches.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{d.dispatch_date}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{truckPlate(d.truck_id)}</td>
                    <td>{driverName(d.driver_id)}</td>
                    <td style={{ color: '#93a4b6' }}>{helperName(d.helper_id)}</td>
                    <td style={{ color: '#93a4b6' }}>{d.destination || '—'}</td>
                    <td style={{ fontSize: 12, color: '#93a4b6' }}>
                      {d.departure_time ? new Date(d.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {' / '}
                      {d.return_time ? new Date(d.return_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {d.fuel_level_on_return && <div style={{ marginTop: 2 }}>Fuel: {FUEL_LABEL[d.fuel_level_on_return]}</div>}
                    </td>
                    <td>{onTimeStatus(d) ? <span className={`badge ${onTimeStatus(d)!.tone}`}>{onTimeStatus(d)!.label}</span> : '—'}</td>
                    <td><span className={`badge ${STATUS_BADGE[d.status]}`}>{STATUS_LABEL[d.status]}</span></td>
                    <td>{d.has_issue ? <span className="badge badge-red" title={d.issue_note || ''}>Issue</span> : '—'}</td>
                    <td>
                      <div className="actions">
                        <button className="action-btn action-edit" onClick={() => openEdit(d)}>Edit</button>
                        <button className="action-btn action-delete" onClick={() => setDeleteId(d.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">{modal === 'add' ? 'Add Dispatch' : 'Edit Dispatch'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Truck *</label>
                  <select className="form-select" value={form.truck_id} onChange={(e) => setForm({ ...form, truck_id: e.target.value })}>
                    <option value="">Select a truck</option>
                    {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Driver</label>
                  <select className="form-select" value={form.driver_id} onChange={(e) => setForm({ ...form, driver_id: e.target.value })}>
                    <option value="">—</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Helper</label>
                <select className="form-select" value={form.helper_id} onChange={(e) => setForm({ ...form, helper_id: e.target.value })}>
                  <option value="">—</option>
                  {helpers.filter((h) => h.id !== form.driver_id).map((h) => <option key={h.id} value={h.id}>{h.full_name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date *</label>
                  <input type="date" className="form-input" value={form.dispatch_date} onChange={(e) => setForm({ ...form, dispatch_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Scheduled Departure</label>
                  <input type="datetime-local" className="form-input" value={form.scheduled_departure_time} onChange={(e) => setForm({ ...form, scheduled_departure_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Scheduled Arrival</label>
                  <input type="datetime-local" className="form-input" value={form.scheduled_arrival_time} onChange={(e) => setForm({ ...form, scheduled_arrival_time: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Destination</label>
                <input className="form-input" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Purpose</label>
                <input className="form-input" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Mileage (km)</label>
                  <input type="number" className="form-input" value={form.start_mileage_km} onChange={(e) => setForm({ ...form, start_mileage_km: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Mileage (km)</label>
                  <input type="number" className="form-input" value={form.end_mileage_km} onChange={(e) => setForm({ ...form, end_mileage_km: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header"><div className="modal-title">Delete Dispatch</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this dispatch record?</p>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => remove(deleteId)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
