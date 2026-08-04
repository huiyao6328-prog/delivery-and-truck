'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type PackBox = {
  id: string
  name: string
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  weight_kg: number | null
  gross_weight_kg: number | null
  packing_qty: number | null
  packing_qty_unit: string | null
  note: string | null
  is_active: boolean
  kf_erp_synced_at: string | null
}

type Form = {
  name: string; length_cm: string; width_cm: string; height_cm: string
  weight_kg: string; gross_weight_kg: string; packing_qty: string; packing_qty_unit: string
  note: string; is_active: boolean
}
const emptyForm: Form = {
  name: '', length_cm: '', width_cm: '', height_cm: '',
  weight_kg: '', gross_weight_kg: '', packing_qty: '', packing_qty_unit: '',
  note: '', is_active: true,
}

export default function PackBoxesPage() {
  const [boxes, setBoxes] = useState<PackBox[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  useEffect(() => { fetchBoxes() }, [])

  async function fetchBoxes() {
    setLoading(true)
    const { data } = await supabase.from('pack_boxes').select('*').order('name')
    setBoxes(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm(emptyForm)
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(b: PackBox) {
    setForm({
      name: b.name,
      length_cm: b.length_cm?.toString() || '',
      width_cm: b.width_cm?.toString() || '',
      height_cm: b.height_cm?.toString() || '',
      weight_kg: b.weight_kg?.toString() || '',
      gross_weight_kg: b.gross_weight_kg?.toString() || '',
      packing_qty: b.packing_qty?.toString() || '',
      packing_qty_unit: b.packing_qty_unit || '',
      note: b.note || '',
      is_active: b.is_active,
    })
    setEditId(b.id)
    setError('')
    setModal('edit')
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: form.name.trim(),
        length_cm: form.length_cm ? Number(form.length_cm) : null,
        width_cm: form.width_cm ? Number(form.width_cm) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
        gross_weight_kg: form.gross_weight_kg ? Number(form.gross_weight_kg) : null,
        packing_qty: form.packing_qty ? Number(form.packing_qty) : null,
        packing_qty_unit: form.packing_qty_unit.trim() || null,
        note: form.note.trim() || null,
        is_active: form.is_active,
      }
      const result = modal === 'add'
        ? await supabase.from('pack_boxes').insert([payload])
        : await supabase.from('pack_boxes').update(payload).eq('id', editId)
      if (result.error) {
        setError(result.error.message)
        return
      }
      setModal(null)
      fetchBoxes()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('pack_boxes').delete().eq('id', id)
    setDeleteId(null)
    fetchBoxes()
  }

  async function syncFromKfErp() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync/kf-erp-pack-boxes', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncResult(`Sync failed: ${data.error || 'unknown error'}`)
        return
      }
      const failureNote = data.failures?.length ? ` · ${data.failures.length} row(s) failed` : ''
      const dimsNote = data.dimensionsIncomplete ? ` · ${data.dimensionsIncomplete} missing dimensions (fill in manually)` : ''
      setSyncResult(
        `Checked ${data.considered} active kf-erp carton type(s), added ${data.inserted} and updated ${data.updated}${dimsNote}${failureNote}`
      )
      fetchBoxes()
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
          <div className="page-title">Carton Types</div>
          <div className="page-sub">{boxes.length} carton type(s) · used by the Load Calculator</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={syncFromKfErp} disabled={syncing}>
            {syncing ? 'Syncing…' : '⟳ Sync from kf-erp'}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Carton Type</button>
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
        ) : boxes.length === 0 ? (
          <div className="empty-state">No carton types yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Box (L×W×H cm)</th><th>Weight (kg)</th><th>Packing Qty</th><th>Source</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {boxes.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>{b.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>
                      {b.length_cm && b.width_cm && b.height_cm ? `${b.length_cm} × ${b.width_cm} × ${b.height_cm}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{b.weight_kg ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{b.packing_qty ? `${b.packing_qty}${b.packing_qty_unit ? ' ' + b.packing_qty_unit : ''}` : '—'}</td>
                    <td>{b.kf_erp_synced_at ? <span className="badge badge-blue">kf-erp</span> : <span className="badge badge-gray">Local</span>}</td>
                    <td>{b.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    <td>
                      <div className="actions">
                        <button className="action-btn action-edit" onClick={() => openEdit(b)}>Edit</button>
                        <button className="action-btn action-delete" onClick={() => setDeleteId(b.id)}>Delete</button>
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
              <div className="modal-title">{modal === 'add' ? 'Add Carton Type' : 'Edit Carton Type'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 20kg Master Carton" />
              </div>
              <div className="form-group">
                <label className="form-label">Carton Dimensions (cm)</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <input type="number" className="form-input" placeholder="Length" value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} />
                  <input type="number" className="form-input" placeholder="Width" value={form.width_cm} onChange={(e) => setForm({ ...form, width_cm: e.target.value })} />
                  <input type="number" className="form-input" placeholder="Height" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Net Weight (kg)</label>
                  <input type="number" className="form-input" value={form.weight_kg} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Gross Weight (kg)</label>
                  <input type="number" className="form-input" value={form.gross_weight_kg} onChange={(e) => setForm({ ...form, gross_weight_kg: e.target.value })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Packing Qty (pcs/carton)</label>
                  <input type="number" className="form-input" value={form.packing_qty} onChange={(e) => setForm({ ...form, packing_qty: e.target.value })} placeholder="e.g. 1000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Unit</label>
                  <input className="form-input" value={form.packing_qty_unit} onChange={(e) => setForm({ ...form, packing_qty_unit: e.target.value })} placeholder="e.g. pcs" />
                </div>
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
              {error && <div style={{ color: '#f2977e', fontSize: 13, marginBottom: 8 }}>{error}</div>}
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
            <div className="modal-header"><div className="modal-title">Delete Carton Type</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this carton type?</p>
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
