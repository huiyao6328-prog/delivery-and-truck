'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Department = { id: string; name: string }
type Group = { id: string; name: string }
type Truck = { id: string; plate_no: string; owner_id: string | null }
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
  license_no: string | null
  license_expiry: string | null
  role_level: number | null
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
  license_no: string
  license_expiry: string
  role_level: string
  maintenanceTruckIds: string[]
}

const emptyForm: Form = {
  code: '', full_name: '', department_id: '', phone: '',
  is_driver: false, is_active: true, group_id: '', username: '', password: '',
  license_no: '', license_expiry: '', role_level: '', maintenanceTruckIds: [],
}

const ROLE_LEVEL_LABEL: Record<number, string> = { 1: 'Level 1 — Highest', 2: 'Level 2', 3: 'Level 3', 4: 'Level 4' }
type RoleTitle = { role_level: number; title: string }

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [assignments, setAssignments] = useState<{ truck_id: string; employee_id: string }[]>([])
  const [roleTitles, setRoleTitles] = useState<RoleTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [sortKey, setSortKey] = useState<'code' | 'name' | 'department' | 'driver' | 'license_expiry' | 'role_level' | 'group' | 'username' | 'status'>('code')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: emp }, { data: dept }, { data: grp }, { data: trk }, { data: asn }, { data: owners }, { data: titles }] = await Promise.all([
      supabase.from('employees').select('*').order('code'),
      supabase.from('departments').select('id, name').order('name'),
      supabase.from('permission_groups').select('id, name').order('name'),
      supabase.from('trucks').select('id, plate_no, owner_id').order('plate_no'),
      supabase.from('truck_maintenance_assignments').select('truck_id, employee_id'),
      supabase.from('truck_owners').select('id, is_default'),
      supabase.from('role_level_titles').select('role_level, title').order('role_level'),
    ])
    const defaultOwnerIds = new Set((owners || []).filter((o) => o.is_default).map((o) => o.id))
    setEmployees(emp || [])
    setDepartments(dept || [])
    setGroups(grp || [])
    setTrucks((trk || []).filter((t) => t.owner_id && defaultOwnerIds.has(t.owner_id)))
    setAssignments(asn || [])
    setRoleTitles(titles || [])
    setLoading(false)
  }

  function roleTitleFor(level: string) {
    return level ? roleTitles.find((t) => t.role_level === Number(level))?.title || '—' : '—'
  }

  function departmentName(id: string | null) {
    return departments.find((d) => d.id === id)?.name || '—'
  }
  function groupName(id: string | null) {
    return groups.find((g) => g.id === id)?.name || '—'
  }

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (departmentFilter && e.department_id !== departmentFilter) return false
      if (!q) return true
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.code.toLowerCase().includes(q) ||
        (e.username || '').toLowerCase().includes(q) ||
        departmentName(e.department_id).toLowerCase().includes(q)
      )
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, search, departmentFilter, departments])

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedEmployees = useMemo(() => {
    const withValue = (e: Employee) => {
      switch (sortKey) {
        case 'code': return e.code.toLowerCase()
        case 'name': return e.full_name.toLowerCase()
        case 'department': return departmentName(e.department_id).toLowerCase()
        case 'driver': return e.is_driver ? 1 : 0
        case 'license_expiry': return e.license_expiry ?? ''
        case 'role_level': return e.role_level ?? 99
        case 'group': return groupName(e.group_id).toLowerCase()
        case 'username': return (e.username ?? '').toLowerCase()
        case 'status': return e.is_active ? 1 : 0
      }
    }
    const sorted = [...filteredEmployees].sort((a, b) => {
      const va = withValue(a)
      const vb = withValue(b)
      if (va < vb) return -1
      if (va > vb) return 1
      return 0
    })
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEmployees, sortKey, sortDir, departments, groups])

  function SortHeader({ label, sortKeyName }: { label: string; sortKeyName: typeof sortKey }) {
    const active = sortKey === sortKeyName
    return (
      <th onClick={() => toggleSort(sortKeyName)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

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
      license_no: e.license_no || '',
      license_expiry: e.license_expiry || '',
      role_level: e.role_level ? String(e.role_level) : '',
      maintenanceTruckIds: assignments.filter((a) => a.employee_id === e.id).map((a) => a.truck_id),
    })
    setEditId(e.id)
    setError('')
    setModal('edit')
  }

  function toggleMaintenanceTruck(truckId: string) {
    setForm((prev) => ({
      ...prev,
      maintenanceTruckIds: prev.maintenanceTruckIds.includes(truckId)
        ? prev.maintenanceTruckIds.filter((id) => id !== truckId)
        : [...prev.maintenanceTruckIds, truckId],
    }))
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
    if (form.role_level === '1') {
      const holder = employees.find((e) => e.role_level === 1 && e.id !== editId)
      if (holder) {
        setError(`Level 1 is already assigned to ${holder.full_name} — only one person can hold it. Change their level first.`)
        return
      }
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
        license_no: form.license_no.trim() || null,
        license_expiry: form.license_expiry || null,
        role_level: form.role_level ? Number(form.role_level) : null,
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
        ? await supabase.from('employees').insert([payload]).select('id').single()
        : await supabase.from('employees').update(payload).eq('id', editId).select('id').single()

      if (result.error) {
        setError(result.error.code === '23505' && result.error.message.includes('role_level')
          ? 'Level 1 is already assigned to someone else — only one person can hold it.'
          : result.error.message)
        return
      }
      const employeeId = result.data.id as string

      const currentTruckIds = assignments.filter((a) => a.employee_id === employeeId).map((a) => a.truck_id)
      const toAdd = form.maintenanceTruckIds.filter((id) => !currentTruckIds.includes(id))
      const toRemove = currentTruckIds.filter((id) => !form.maintenanceTruckIds.includes(id))
      if (toAdd.length) {
        await supabase.from('truck_maintenance_assignments').insert(toAdd.map((truck_id) => ({ truck_id, employee_id: employeeId })))
      }
      if (toRemove.length) {
        await supabase.from('truck_maintenance_assignments').delete().eq('employee_id', employeeId).in('truck_id', toRemove)
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

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Employees</div>
          <div className="page-sub">
            {search || departmentFilter ? `${filteredEmployees.length} of ${employees.length}` : `${employees.length}`} employee(s) · assign each one a permission group to grant back-office access
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Employee</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="form-select" style={{ width: 180 }} value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="Search by name, code, username, or department…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : filteredEmployees.length === 0 ? (
          <div className="empty-state">{search || departmentFilter ? 'No employees match this filter.' : 'No employees yet — add one to get started.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Code" sortKeyName="code" />
                  <SortHeader label="Name" sortKeyName="name" />
                  <SortHeader label="Department" sortKeyName="department" />
                  <SortHeader label="Role Level" sortKeyName="role_level" />
                  <SortHeader label="Driver" sortKeyName="driver" />
                  <SortHeader label="License Expiry" sortKeyName="license_expiry" />
                  <th>Has License</th>
                  <SortHeader label="Permission Group" sortKeyName="group" />
                  <SortHeader label="Username" sortKeyName="username" />
                  <SortHeader label="Status" sortKeyName="status" />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmployees.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{e.code}</td>
                    <td style={{ fontWeight: 600 }}>{e.full_name}</td>
                    <td>{departmentName(e.department_id)}</td>
                    <td>{e.role_level ? <span className={`badge ${e.role_level === 1 ? 'badge-orange' : 'badge-gray'}`}>{ROLE_LEVEL_LABEL[e.role_level]}</span> : '—'}</td>
                    <td>{e.is_driver ? <span className="badge badge-blue">Driver</span> : '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: e.license_expiry && e.license_expiry < new Date().toISOString().slice(0, 10) ? '#f2977e' : '#93a4b6' }}>
                      {e.license_expiry || '—'}
                    </td>
                    <td>{e.license_no ? <span className="badge badge-green">Y</span> : <span className="badge badge-gray">N</span>}</td>
                    <td>{groupName(e.group_id)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>{e.username || '—'}</td>
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
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Role Level</label>
                  <select className="form-select" value={form.role_level} onChange={(e) => setForm({ ...form, role_level: e.target.value })}>
                    <option value="">—</option>
                    <option value="1">Level 1 — Highest authority (only one person)</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                    <option value="4">Level 4 — Lowest</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Job Title</label>
                  <input className="form-input" value={roleTitleFor(form.role_level)} disabled />
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#64798d', marginTop: -10, marginBottom: 16 }}>Organizational rank — lower number outranks higher. Separate from Permission Group, which controls back-office access. Job Title follows Role Level automatically — edit the mapping under Role Titles.</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">License No.</label>
                  <input className="form-input" value={form.license_no} onChange={(e) => setForm({ ...form, license_no: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">License Expiry</label>
                  <input type="date" className="form-input" value={form.license_expiry} onChange={(e) => setForm({ ...form, license_expiry: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Maintenance Responsible For</label>
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '6px 14px', padding: '10px 12px',
                  border: '1px solid #28394a', borderRadius: 8, maxHeight: 140, overflowY: 'auto',
                }}>
                  {trucks.length === 0 ? (
                    <span style={{ fontSize: 12.5, color: '#64798d' }}>No trucks yet.</span>
                  ) : trucks.map((t) => (
                    <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#e9eef3', fontWeight: 500 }}>
                      <input type="checkbox" checked={form.maintenanceTruckIds.includes(t.id)} onChange={() => toggleMaintenanceTruck(t.id)} />
                      {t.plate_no}
                    </label>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: '#64798d', marginTop: 4 }}>Vehicle(s) this person is responsible for maintaining — shown as their Assigned Vehicle on Driver Readiness checks.</div>
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
