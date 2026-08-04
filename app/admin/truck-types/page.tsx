'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type TruckType = {
  id: string
  name: string
  max_load_kg: number | null
  description: string | null
  is_active: boolean
}

type Form = { name: string; max_load_kg: string; description: string; is_active: boolean }
const emptyForm: Form = { name: '', max_load_kg: '', description: '', is_active: true }

export default function TruckTypesPage() {
  const [types, setTypes] = useState<TruckType[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => { fetchTypes() }, [])

  async function fetchTypes() {
    setLoading(true)
    const { data } = await supabase.from('truck_types').select('*').order('name')
    setTypes(data || [])
    setLoading(false)
  }

  function openAdd() {
    setForm(emptyForm)
    setEditId(null)
    setModal('add')
  }

  function openEdit(t: TruckType) {
    setForm({
      name: t.name,
      max_load_kg: t.max_load_kg?.toString() || '',
      description: t.description || '',
      is_active: t.is_active,
    })
    setEditId(t.id)
    setModal('edit')
  }

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        max_load_kg: form.max_load_kg ? Number(form.max_load_kg) : null,
        description: form.description.trim() || null,
        is_active: form.is_active,
      }
      if (modal === 'add') await supabase.from('truck_types').insert([payload])
      else await supabase.from('truck_types').update(payload).eq('id', editId)
      setModal(null)
      fetchTypes()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('truck_types').delete().eq('id', id)
    setDeleteId(null)
    fetchTypes()
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Truck Types</div>
          <div className="page-sub">{types.length} type(s)</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Truck Type</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : types.length === 0 ? (
          <div className="empty-state">No truck types yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Max Load (kg)</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{t.max_load_kg ?? '—'}</td>
                    <td style={{ color: '#93a4b6' }}>{t.description || '—'}</td>
                    <td>{t.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    <td>
                      <div className="actions">
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
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="modal-title">{modal === 'add' ? 'Add Truck Type' : 'Edit Truck Type'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 3.5T Box Truck" />
              </div>
              <div className="form-group">
                <label className="form-label">Max Load (kg)</label>
                <input type="number" className="form-input" value={form.max_load_kg} onChange={(e) => setForm({ ...form, max_load_kg: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
            <div className="modal-header"><div className="modal-title">Delete Truck Type</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this truck type?</p>
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
