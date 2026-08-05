'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import type { AccessLevel } from '@/lib/useSession'

const FUNCTIONS: { code: string; label: string }[] = [
  { code: 'employees', label: 'Employees' },
  { code: 'permissions', label: 'Permission Groups' },
  { code: 'truck_types', label: 'Truck Types' },
  { code: 'truck_owners', label: 'Truck Owners' },
  { code: 'trucks', label: 'Trucks' },
  { code: 'dispatches', label: 'Dispatch Records' },
  { code: 'inspections', label: 'Daily Inspections' },
  { code: 'inspection_settings', label: 'Inspection Settings' },
  { code: 'pack_boxes', label: 'Carton Types' },
  { code: 'load_calculator', label: 'Load Calculator' },
]

type Group = { id: string; name: string; description: string | null }

export default function PermissionGroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [levels, setLevels] = useState<Record<string, AccessLevel>>({})
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { fetchGroups() }, [])

  async function fetchGroups() {
    setLoading(true)
    const { data } = await supabase.from('permission_groups').select('*').order('name')
    setGroups(data || [])
    setLoading(false)
  }

  function openAdd() {
    setName('')
    setDescription('')
    const blank: Record<string, AccessLevel> = {}
    FUNCTIONS.forEach((f) => { blank[f.code] = 'none' })
    setLevels(blank)
    setEditId(null)
    setModal('add')
  }

  async function openEdit(g: Group) {
    setName(g.name)
    setDescription(g.description || '')
    const { data } = await supabase.from('permission_group_functions').select('function_code, access_level').eq('group_id', g.id)
    const map: Record<string, AccessLevel> = {}
    FUNCTIONS.forEach((f) => { map[f.code] = 'none' })
    ;(data || []).forEach((row) => { map[row.function_code] = row.access_level as AccessLevel })
    setLevels(map)
    setEditId(g.id)
    setModal('edit')
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    try {
      let groupId = editId
      if (modal === 'add') {
        const { data, error } = await supabase.from('permission_groups').insert([{ name: name.trim(), description: description.trim() || null }]).select('id').single()
        if (error || !data) return
        groupId = data.id
      } else {
        await supabase.from('permission_groups').update({ name: name.trim(), description: description.trim() || null }).eq('id', editId)
      }
      await supabase.from('permission_group_functions').delete().eq('group_id', groupId)
      const rows = FUNCTIONS
        .filter((f) => levels[f.code] !== 'none')
        .map((f) => ({ group_id: groupId, function_code: f.code, access_level: levels[f.code] }))
      if (rows.length) await supabase.from('permission_group_functions').insert(rows)
      setModal(null)
      fetchGroups()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setDeleteError('')
    const { error } = await supabase.from('permission_groups').delete().eq('id', id)
    if (error) {
      setDeleteError('This group is still assigned to one or more employees — reassign them first.')
      return
    }
    setDeleteId(null)
    fetchGroups()
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Permission Groups</div>
          <div className="page-sub">Controls which back-office modules a group of employees can see and edit</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Group</button>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : groups.length === 0 ? (
          <div className="empty-state">No permission groups yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                    <td style={{ color: '#93a4b6' }}>{g.description || '—'}</td>
                    <td>
                      <div className="actions">
                        <button className="action-btn action-edit" onClick={() => openEdit(g)}>Edit</button>
                        <button className="action-btn action-delete" onClick={() => { setDeleteId(g.id); setDeleteError('') }}>Delete</button>
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
              <div className="modal-title">{modal === 'add' ? 'Add Permission Group' : 'Edit Permission Group'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Group Name *</label>
                <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dispatchers" />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Module Access</label>
                <div style={{ border: '1px solid #26374a', borderRadius: 8, overflow: 'hidden' }}>
                  {FUNCTIONS.map((f, i) => (
                    <div key={f.code} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '9px 12px', borderTop: i > 0 ? '1px solid #1e2c3a' : 'none',
                    }}>
                      <span style={{ fontSize: 13.5, color: '#e9eef3' }}>{f.label}</span>
                      <select
                        className="form-select"
                        style={{ width: 120 }}
                        value={levels[f.code] || 'none'}
                        onChange={(e) => setLevels({ ...levels, [f.code]: e.target.value as AccessLevel })}
                      >
                        <option value="none">No access</option>
                        <option value="read">Read only</option>
                        <option value="edit">Edit</option>
                      </select>
                    </div>
                  ))}
                </div>
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
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header"><div className="modal-title">Delete Group</div></div>
            <div className="modal-body">
              <p style={{ color: '#6b7280', fontSize: 14 }}>This can&apos;t be undone. Delete this permission group?</p>
              {deleteError && <div style={{ color: '#9c3719', fontSize: 13, marginTop: 8 }}>{deleteError}</div>}
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
