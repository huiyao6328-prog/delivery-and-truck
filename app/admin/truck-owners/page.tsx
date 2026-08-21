'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type TruckOwner = { id: string; name: string; is_active: boolean; is_default: boolean }

export default function TruckOwnersPage() {
  const [owners, setOwners] = useState<TruckOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { fetchOwners() }, [])

  async function fetchOwners() {
    setLoading(true)
    const { data } = await supabase.from('truck_owners').select('*').order('name')
    setOwners(data || [])
    setLoading(false)
  }

  function openAdd() {
    setName('')
    setIsActive(true)
    setIsDefault(false)
    setEditId(null)
    setError('')
    setModal('add')
  }
  function openEdit(o: TruckOwner) {
    setName(o.name)
    setIsActive(o.is_active)
    setIsDefault(o.is_default)
    setEditId(o.id)
    setError('')
    setModal('edit')
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = { name: name.trim(), is_active: isActive, is_default: isDefault }
      const result = modal === 'add'
        ? await supabase.from('truck_owners').insert([payload])
        : await supabase.from('truck_owners').update(payload).eq('id', editId)
      if (result.error) {
        setError(result.error.message)
        return
      }
      setModal(null)
      fetchOwners()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setDeleteError('')
    const { error: err } = await supabase.from('truck_owners').delete().eq('id', id)
    if (err) {
      setDeleteError('This owner is still assigned to one or more trucks — reassign them first.')
      return
    }
    setDeleteId(null)
    fetchOwners()
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Truck Owners</div>
          <div className="page-sub">{owners.length} owner(s) · whether a truck is company-owned or belongs to a trucking company</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Owner</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : owners.length === 0 ? (
          <div className="empty-state">No owners yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Status</th><th>Default Fleet</th><th>Actions</th></tr></thead>
              <tbody>
                {owners.map((o) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.name}</td>
                    <td>{o.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    <td>{o.is_default ? <span className="badge badge-orange">Default</span> : '—'}</td>
                    <td>
                      <div className="actions">
                        <button className="action-btn action-edit" onClick={() => openEdit(o)}>Edit</button>
                        <button className="action-btn action-delete" onClick={() => { setDeleteId(o.id); setDeleteError('') }}>Delete</button>
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
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <div className="modal-title">{modal === 'add' ? 'Add Owner' : 'Edit Owner'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Name *</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Trucking Services" />
              </div>
              <div className="form-group">
                <label className="form-label">
                  <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ marginRight: 8 }} />
                  Active
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">
                  <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} style={{ marginRight: 8 }} />
                  Part of default fleet (shown on Dashboard)
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
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header"><div className="modal-title">Delete Owner</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this owner?</p>
              {deleteError && <div style={{ color: '#f2977e', fontSize: 13, marginTop: 8 }}>{deleteError}</div>}
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
