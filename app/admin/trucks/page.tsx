'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type TruckType = { id: string; name: string }
type Truck = {
  id: string
  plate_no: string
  truck_type_id: string | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  max_load_kg: number | null
  note: string | null
  is_active: boolean
  kf_erp_synced_at: string | null
}

type Form = {
  plate_no: string; truck_type_id: string
  length_cm: string; width_cm: string; height_cm: string; max_load_kg: string
  note: string; is_active: boolean
}
const emptyForm: Form = {
  plate_no: '', truck_type_id: '', length_cm: '', width_cm: '', height_cm: '', max_load_kg: '', note: '', is_active: true,
}

export default function TrucksPage() {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [types, setTypes] = useState<TruckType[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: t }, { data: ty }] = await Promise.all([
      supabase.from('trucks').select('*').order('plate_no'),
      supabase.from('truck_types').select('id, name').order('name'),
    ])
    setTrucks(t || [])
    setTypes(ty || [])
    setLoading(false)
  }

  function typeName(id: string | null) {
    return types.find((t) => t.id === id)?.name || '—'
  }

  function openAdd() {
    setForm(emptyForm)
    setEditId(null)
    setModal('add')
  }

  function openEdit(t: Truck) {
    setForm({
      plate_no: t.plate_no,
      truck_type_id: t.truck_type_id || '',
      length_cm: t.length_cm?.toString() || '',
      width_cm: t.width_cm?.toString() || '',
      height_cm: t.height_cm?.toString() || '',
      max_load_kg: t.max_load_kg?.toString() || '',
      note: t.note || '',
      is_active: t.is_active,
    })
    setEditId(t.id)
    setModal('edit')
  }

  async function save() {
    if (!form.plate_no.trim()) return
    setSaving(true)
    try {
      const payload = {
        plate_no: form.plate_no.trim(),
        truck_type_id: form.truck_type_id || null,
        length_cm: form.length_cm ? Number(form.length_cm) : null,
        width_cm: form.width_cm ? Number(form.width_cm) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        max_load_kg: form.max_load_kg ? Number(form.max_load_kg) : null,
        note: form.note.trim() || null,
        is_active: form.is_active,
      }
      if (modal === 'add') await supabase.from('trucks').insert([payload])
      else await supabase.from('trucks').update(payload).eq('id', editId)
      setModal(null)
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('trucks').delete().eq('id', id)
    setDeleteId(null)
    fetchAll()
  }

  async function syncFromKfErp() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync/kf-erp-trucks', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncResult(`Sync failed: ${data.error || 'unknown error'}`)
        return
      }
      const failureNote = data.failures?.length ? ` · ${data.failures.length} row(s) failed` : ''
      const dimsNote = data.dimensionsIncomplete ? ` · ${data.dimensionsIncomplete} missing dimensions (fill in manually)` : ''
      setSyncResult(
        `Checked ${data.considered} active kf-erp truck(s), added ${data.inserted} and updated ${data.updated}${dimsNote}${failureNote}`
      )
      fetchAll()
    } catch {
      setSyncResult('Sync failed: could not reach the server')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Trucks</div>
          <div className="page-sub">{trucks.length} truck(s)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={syncFromKfErp} disabled={syncing}>
            {syncing ? 'Syncing…' : '⟳ Sync from kf-erp'}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Truck</button>
        </div>
      </div>

      {syncResult && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: syncResult.startsWith('Sync failed') ? '#34201a' : '#17301f',
          color: syncResult.startsWith('Sync failed') ? '#f2977e' : '#86d494',
          border: `1px solid ${syncResult.startsWith('Sync failed') ? '#4a2e25' : '#274734'}`,
        }}>
          {syncResult}
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : trucks.length === 0 ? (
          <div className="empty-state">No trucks yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Plate No.</th><th>Type</th><th>Box (L×W×H cm)</th><th>Max Load (kg)</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {trucks.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{t.plate_no}</td>
                    <td>{typeName(t.truck_type_id)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>
                      {t.length_cm && t.width_cm && t.height_cm ? `${t.length_cm} × ${t.width_cm} × ${t.height_cm}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{t.max_load_kg ?? '—'}</td>
                    <td>{t.kf_erp_synced_at ? <span className="badge badge-blue">kf-erp</span> : <span className="badge badge-gray">Local</span>}</td>
                    <td>{t.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    <td>
                      <div className="actions">
                        <Link className="action-btn" style={{ background: '#e3efe4', color: '#26592c' }} href={`/admin/trucks/${t.id}/checklist`}>Checklist</Link>
                        <button className="action-btn action-edit" onClick={() => openEdit(t)}>Edit</button>
                        <button className="action-btn action-delete" onClick={() => setDeleteId(t.id)}>Delete</button>
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
              <div className="modal-title">{modal === 'add' ? 'Add Truck' : 'Edit Truck'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Plate No. *</label>
                  <input className="form-input" value={form.plate_no} onChange={(e) => setForm({ ...form, plate_no: e.target.value })} placeholder="e.g. TRK-2201" />
                </div>
                <div className="form-group">
                  <label className="form-label">Truck Type</label>
                  <select className="form-select" value={form.truck_type_id} onChange={(e) => setForm({ ...form, truck_type_id: e.target.value })}>
                    <option value="">—</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Cargo Box Dimensions (cm)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <input type="number" className="form-input" placeholder="Length" value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} />
                  <input type="number" className="form-input" placeholder="Width" value={form.width_cm} onChange={(e) => setForm({ ...form, width_cm: e.target.value })} />
                  <input type="number" className="form-input" placeholder="Height" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Max Load (kg)</label>
                <input type="number" className="form-input" value={form.max_load_kg} onChange={(e) => setForm({ ...form, max_load_kg: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} style={{ marginRight: 8 }} />
                  Active
                </label>
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
            <div className="modal-header"><div className="modal-title">Delete Truck</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this truck?</p>
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
