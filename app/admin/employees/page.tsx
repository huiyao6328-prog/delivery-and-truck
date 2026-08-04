'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Department = { id: string; name: string }
type Group = { id: string; name: string }
type Employee = {
  id: string
  code: string
  full_name: string
  department_id: string | null
  phone: string | null
  is_driver: boolean
  is_active: boolean
  group_id: string | null
  username: string | null
  kf_erp_synced_at: string | null
}

type Form = {
  code: string
  full_name: string
  department_id: string
  phone: string
  is_driver: boolean
  is_active: boolean
  group_id: string
  username: string
  password: string
}

const emptyForm: Form = {
  code: '', full_name: '', department_id: '', phone: '',
  is_driver: false, is_active: true, group_id: '', username: '', password: '',
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: emp }, { data: dept }, { data: grp }] = await Promise.all([
      supabase.from('employees').select('*').order('code'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('permission_groups').select('id, name').order('name'),
    ])
    setEmployees(emp || [])
    setDepartments(dept || [])
    setGroups(grp || [])
    setLoading(false)
  }

  function departmentName(id: string | null) {
    return departments.find((d) => d.id === id)?.name || '—'
  }
  function groupName(id: string | null) {
    return groups.find((g) => g.id === id)?.name || '—'
  }

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) =>
      e.full_name.toLowerCase().includes(q) ||
      e.code.toLowerCase().includes(q) ||
      (e.username || '').toLowerCase().includes(q) ||
      departmentName(e.department_id).toLowerCase().includes(q)
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, search, departments])

  function openAdd() {
    setForm(emptyForm)
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(e: Employee) {
    setForm({
      code: e.code,
      full_name: e.full_name,
      department_id: e.department_id || '',
      phone: e.phone || '',
      is_driver: e.is_driver,
      is_active: e.is_active,
      group_id: e.group_id || '',
      username: e.username || e.code,
      password: '',
    })
    setEditId(e.id)
    setError('')
    setModal('edit')
  }

  // Username defaults to (and keeps following) the employee code until the
  // admin types something else into the Username field directly.
  function handleCodeChange(newCode: string) {
    setForm((prev) => ({
      ...prev,
      code: newCode,
      username: prev.username === '' || prev.username === prev.code ? newCode : prev.username,
    }))
  }

  async function save() {
    if (!form.code.trim() || !form.full_name.trim()) {
      setError('Code and full name are required')
      return
    }
    if (modal === 'add' && !form.password.trim()) {
      setError('A password is required for a new employee login')
      return
    }
    setSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim(),
        full_name: form.full_name.trim(),
        department_id: form.department_id || null,
        phone: form.phone.trim() || null,
        is_driver: form.is_driver,
        is_active: form.is_active,
        group_id: form.group_id || null,
        username: form.username.trim() || null,
      }
      if (form.password.trim()) {
        const res = await fetch('/api/auth/hash', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: form.password.trim() }),
        })
        const { hashed } = await res.json()
        payload.password_hash = hashed
      }

      const result = modal === 'add'
        ? await supabase.from('employees').insert([payload])
        : await supabase.from('employees').update(payload).eq('id', editId)

      if (result.error) {
        setError(result.error.message)
        return
      }
      setModal(null)
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('employees').delete().eq('id', id)
    setDeleteId(null)
    fetchAll()
  }

  async function syncFromKfErp() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync/kf-erp', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSyncResult(`Sync failed: ${data.error || 'unknown error'}`)
        return
      }
      const failureNote = data.failures?.length ? ` · ${data.failures.length} row(s) failed` : ''
      setSyncResult(
        `Checked ${data.employeesConsidered} active kf-erp employee(s) in scope, synced ${data.departmentsSynced} department(s), added ${data.employeesInserted} and updated ${data.employeesUpdated} employee(s)${failureNote}`
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
          <div className="page-title">Employees</div>
          <div className="page-sub">
            {search ? `${filteredEmployees.length} of ${employees.length}` : `${employees.length}`} employee(s) · assign each one a permission group to grant back-office access
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={syncFromKfErp} disabled={syncing}>
            {syncing ? 'Syncing…' : '⟳ Sync from kf-erp'}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, code, username, or department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
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
        ) : filteredEmployees.length === 0 ? (
          <div className="empty-state">{search ? 'No employees match your search.' : 'No employees yet — add one to get started.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th><th>Name</th><th>Department</th><th>Driver</th>
                  <th>Permission Group</th><th>Username</th><th>Source</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{e.code}</td>
                    <td style={{ fontWeight: 600 }}>{e.full_name}</td>
                    <td>{departmentName(e.department_id)}</td>
                    <td>{e.is_driver ? <span className="badge badge-blue">Driver</span> : '—'}</td>
                    <td>{groupName(e.group_id)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>{e.username || '—'}</td>
                    <td>{e.kf_erp_synced_at ? <span className="badge badge-blue">kf-erp</span> : <span className="badge badge-gray">Local</span>}</td>
                    <td>
                      {e.is_active
                        ? <span className="badge badge-green">Active</span>
                        : <span className="badge badge-gray">Inactive</span>}
                    </td>
                    <td>
                      <div className="actions">
                        <button className="action-btn action-edit" onClick={() => openEdit(e)}>Edit</button>
                        <button className="action-btn action-delete" onClick={() => setDeleteId(e.id)}>Delete</button>
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
          <div className="modal">
            <div className="modal-header">
              <div className="modal-title">{modal === 'add' ? 'Add Employee' : 'Edit Employee'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Employee Code *</label>
                  <input className="form-input" value={form.code} onChange={(e) => handleCodeChange(e.target.value)} placeholder="e.g. 014" />
                </div>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input className="form-input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Mark Santos" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <select className="form-select" value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
                    <option value="">—</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">
                  <input type="checkbox" checked={form.is_driver} onChange={(e) => setForm({ ...form, is_driver: e.target.checked })} style={{ marginRight: 8 }} />
                  This employee drives trucks
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Permission Group</label>
                <select className="form-select" value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
                  <option value="">No back-office access</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Login Username</label>
                  <input className="form-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Leave blank for no login" />
                  <div style={{ fontSize: 11, color: '#64798d', marginTop: 4 }}>Defaults to the employee code — edit if this person needs something else.</div>
                </div>
                <div className="form-group">
                  <label className="form-label">{modal === 'add' ? 'Password *' : 'Reset Password'}</label>
                  <input type="password" className="form-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={modal === 'edit' ? 'Leave blank to keep current' : ''} />
                </div>
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
            <div className="modal-header"><div className="modal-title">Delete Employee</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this employee?</p>
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
