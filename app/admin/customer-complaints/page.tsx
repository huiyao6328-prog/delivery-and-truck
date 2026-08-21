'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { useSession } from '@/lib/useSession'

type Complaint = {
  id: string
  complaint_date: string
  truck_id: string | null
  driver_id: string | null
  complaint_type: 'attitude' | 'late' | 'shortage' | 'damage' | 'paperwork' | 'driver' | 'company' | 'other'
  description: string
  status: 'open' | 'resolved'
  resolution: string | null
  resolved_at: string | null
}
type Truck = { id: string; plate_no: string }
type Employee = { id: string; full_name: string }

const TYPE_LABEL: Record<Complaint['complaint_type'], string> = {
  attitude: 'Attitude', late: 'Late Delivery', shortage: 'Shortage', damage: 'Damage',
  paperwork: 'Paperwork', driver: 'Driver Issue', company: 'Company/Production', other: 'Other',
}

type Form = {
  complaint_date: string; truck_id: string; driver_id: string; complaint_type: Complaint['complaint_type']
  description: string; status: Complaint['status']; resolution: string; resolved_at: string
}
const emptyForm = (): Form => ({
  complaint_date: new Date().toISOString().slice(0, 10), truck_id: '', driver_id: '', complaint_type: 'other',
  description: '', status: 'open', resolution: '', resolved_at: '',
})

export default function CustomerComplaintsPage() {
  const { session } = useSession()
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [truckFilter, setTruckFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'resolved'>('open')

  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: t }, { data: d }] = await Promise.all([
      supabase.from('customer_complaints').select('*').order('complaint_date', { ascending: false }),
      supabase.from('trucks').select('id, plate_no').order('plate_no'),
      supabase.from('employees').select('id, full_name').eq('is_driver', true).order('full_name'),
    ])
    setComplaints(c || [])
    setTrucks(t || [])
    setDrivers(d || [])
    setLoading(false)
  }

  function truckPlate(id: string | null) { return trucks.find((t) => t.id === id)?.plate_no || '—' }
  function driverName(id: string | null) { return drivers.find((d) => d.id === id)?.full_name || '—' }

  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (dateFrom && c.complaint_date < dateFrom) return false
      if (dateTo && c.complaint_date > dateTo) return false
      if (truckFilter && c.truck_id !== truckFilter) return false
      if (typeFilter && c.complaint_type !== typeFilter) return false
      return true
    })
  }, [complaints, statusFilter, dateFrom, dateTo, truckFilter, typeFilter])

  function openAdd() {
    setForm(emptyForm())
    setEditId(null)
    setModal('add')
  }
  function openEdit(c: Complaint) {
    setForm({
      complaint_date: c.complaint_date, truck_id: c.truck_id || '', driver_id: c.driver_id || '',
      complaint_type: c.complaint_type, description: c.description, status: c.status,
      resolution: c.resolution || '', resolved_at: c.resolved_at || '',
    })
    setEditId(c.id)
    setModal('edit')
  }

  async function save() {
    if (!form.description.trim()) return
    setSaving(true)
    try {
      const payload = {
        complaint_date: form.complaint_date,
        truck_id: form.truck_id || null,
        driver_id: form.driver_id || null,
        complaint_type: form.complaint_type,
        description: form.description.trim(),
        status: form.status,
        resolution: form.resolution.trim() || null,
        resolved_at: form.resolved_at || null,
        created_by: session?.employee.id || null,
      }
      if (modal === 'add') await supabase.from('customer_complaints').insert([payload])
      else await supabase.from('customer_complaints').update(payload).eq('id', editId)
      setModal(null)
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('customer_complaints').delete().eq('id', id)
    setDeleteId(null)
    fetchAll()
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Customer Complaints</div>
          <div className="page-sub">{filtered.length} of {complaints.length} complaint(s)</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Log Complaint</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input type="date" className="form-input" style={{ width: 150 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="form-input" style={{ width: 150 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="form-select" style={{ width: 170 }} value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
          <option value="">All trucks</option>
          {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
        </select>
        <select className="form-select" style={{ width: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="form-select" style={{ width: 150 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No complaints match this filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Truck</th><th>Driver</th><th>Type</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{c.complaint_date}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{truckPlate(c.truck_id)}</td>
                    <td>{driverName(c.driver_id)}</td>
                    <td><span className="badge badge-orange">{TYPE_LABEL[c.complaint_type]}</span></td>
                    <td style={{ color: '#93a4b6', fontSize: 13, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description}</td>
                    <td>{c.status === 'open' ? <span className="badge badge-red">Open</span> : <span className="badge badge-green">Resolved</span>}</td>
                    <td>
                      <div className="actions">
                        <button className="action-btn action-edit" onClick={() => openEdit(c)}>Edit</button>
                        <button className="action-btn action-delete" onClick={() => setDeleteId(c.id)}>Delete</button>
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
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">{modal === 'add' ? 'Log Complaint' : 'Edit Complaint'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input type="date" className="form-input" value={form.complaint_date} onChange={(e) => setForm({ ...form, complaint_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-select" value={form.complaint_type} onChange={(e) => setForm({ ...form, complaint_type: e.target.value as Complaint['complaint_type'] })}>
                    {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Truck</label>
                  <select className="form-select" value={form.truck_id} onChange={(e) => setForm({ ...form, truck_id: e.target.value })}>
                    <option value="">—</option>
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
                <label className="form-label">Description *</label>
                <textarea className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Complaint['status'] })}>
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              {form.status === 'resolved' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Resolution</label>
                    <textarea className="form-textarea" value={form.resolution} onChange={(e) => setForm({ ...form, resolution: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Resolved Date</label>
                    <input type="date" className="form-input" value={form.resolved_at} onChange={(e) => setForm({ ...form, resolved_at: e.target.value })} />
                  </div>
                </>
              )}
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
            <div className="modal-header"><div className="modal-title">Delete Complaint</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this complaint?</p>
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
