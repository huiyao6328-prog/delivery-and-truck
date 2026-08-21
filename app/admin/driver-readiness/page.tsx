'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { useSession } from '@/lib/useSession'

type Employee = { id: string; full_name: string; is_driver: boolean; license_no: string | null; license_expiry: string | null }
type Truck = { id: string; plate_no: string }
type Assignment = { truck_id: string; employee_id: string }
type CheckItem = { id: string; sort_order: number; label: string; hint: string | null; is_active: boolean }

type Check = {
  id: string
  driver_id: string
  check_date: string
  license_no_snapshot: string | null
  license_expiry_snapshot: string | null
  overall_result: 'ok' | 'issues_found'
  note: string | null
  checked_by: string | null
}
type Result = { id: string; check_id: string; item_id: string | null; label_snapshot: string; status: 'pass' | 'fail' }

type Form = { person_id: string; check_date: string; note: string; results: Record<string, 'pass' | 'fail'> }
const emptyForm = (items: CheckItem[]): Form => ({
  person_id: '', check_date: new Date().toISOString().slice(0, 10), note: '',
  results: Object.fromEntries(items.map((i) => [i.id, 'pass'])),
})

export default function DriverReadinessPage() {
  const { session } = useSession()
  const [checks, setChecks] = useState<Check[]>([])
  const [resultsByCheck, setResultsByCheck] = useState<Record<string, Result[]>>({})
  const [employees, setEmployees] = useState<Employee[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [items, setItems] = useState<CheckItem[]>([])
  const [loading, setLoading] = useState(true)

  const [searchText, setSearchText] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [resultFilter, setResultFilter] = useState<'all' | 'issues_found'>('all')

  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm([]))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [itemsModal, setItemsModal] = useState(false)
  const [itemForm, setItemForm] = useState({ label: '', hint: '' })
  const [itemEditId, setItemEditId] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: c }, { data: emp }, { data: t }, { data: asn }, { data: it }] = await Promise.all([
      supabase.from('driver_readiness_checks').select('*').order('check_date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
      supabase.from('employees').select('id, full_name, is_driver, license_no, license_expiry').eq('is_active', true).order('full_name'),
      supabase.from('trucks').select('id, plate_no').order('plate_no'),
      supabase.from('truck_maintenance_assignments').select('truck_id, employee_id'),
      supabase.from('personnel_check_items').select('*').order('sort_order'),
    ])
    const checkList = c || []
    setChecks(checkList)
    setEmployees(emp || [])
    setTrucks(t || [])
    setAssignments(asn || [])
    setItems(it || [])
    if (checkList.length) {
      const { data: r } = await supabase.from('driver_readiness_check_results').select('*').in('check_id', checkList.map((x) => x.id))
      const byCheck: Record<string, Result[]> = {}
      ;(r || []).forEach((row) => { byCheck[row.check_id] = byCheck[row.check_id] || []; byCheck[row.check_id].push(row) })
      setResultsByCheck(byCheck)
    }
    setLoading(false)
  }

  const activeItems = useMemo(() => items.filter((i) => i.is_active), [items])

  function personName(id: string) { return employees.find((e) => e.id === id)?.full_name || '—' }
  function employeeName(id: string | null) { return id ? employees.find((e) => e.id === id)?.full_name || '—' : '—' }
  function assignedVehicles(personId: string) {
    const plates = assignments.filter((a) => a.employee_id === personId).map((a) => trucks.find((t) => t.id === a.truck_id)?.plate_no).filter(Boolean)
    return plates.length ? plates.join(', ') : '—'
  }

  const filteredChecks = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return checks.filter((c) => {
      if (resultFilter === 'issues_found' && c.overall_result !== 'issues_found') return false
      if (dateFrom && c.check_date < dateFrom) return false
      if (dateTo && c.check_date > dateTo) return false
      if (q && !personName(c.driver_id).toLowerCase().includes(q)) return false
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, searchText, dateFrom, dateTo, resultFilter, employees])

  function openAdd() {
    setForm(emptyForm(activeItems))
    setEditId(null)
    setError('')
    setModal('add')
  }

  function openEdit(c: Check) {
    const existing = resultsByCheck[c.id] || []
    const results: Record<string, 'pass' | 'fail'> = Object.fromEntries(activeItems.map((i) => [i.id, 'pass']))
    existing.forEach((r) => { if (r.item_id) results[r.item_id] = r.status })
    setForm({ person_id: c.driver_id, check_date: c.check_date, note: c.note || '', results })
    setEditId(c.id)
    setError('')
    setModal('edit')
  }

  async function save() {
    if (!form.person_id) {
      setError('Select a person')
      return
    }
    setSaving(true)
    setError('')
    try {
      const person = employees.find((e) => e.id === form.person_id)
      const overall_result = Object.values(form.results).some((v) => v === 'fail') ? 'issues_found' : 'ok'
      const payload = {
        driver_id: form.person_id,
        check_date: form.check_date,
        license_no_snapshot: person?.license_no || null,
        license_expiry_snapshot: person?.license_expiry || null,
        overall_result,
        note: form.note.trim() || null,
        checked_by: session?.employee.id || null,
      }
      const result = modal === 'add'
        ? await supabase.from('driver_readiness_checks').insert([payload]).select('id').single()
        : await supabase.from('driver_readiness_checks').update(payload).eq('id', editId).select('id').single()
      if (result.error) {
        setError(result.error.message)
        return
      }
      const checkId = result.data.id as string
      if (modal === 'edit') await supabase.from('driver_readiness_check_results').delete().eq('check_id', checkId)
      const resultRows = activeItems.map((i) => ({
        check_id: checkId,
        item_id: i.id,
        label_snapshot: i.label,
        status: form.results[i.id] || 'pass',
      }))
      if (resultRows.length) await supabase.from('driver_readiness_check_results').insert(resultRows)
      setModal(null)
      fetchAll()
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    await supabase.from('driver_readiness_checks').delete().eq('id', id)
    setDeleteId(null)
    fetchAll()
  }

  function openAddItem() {
    setItemForm({ label: '', hint: '' })
    setItemEditId(null)
  }
  function openEditItem(i: CheckItem) {
    setItemForm({ label: i.label, hint: i.hint || '' })
    setItemEditId(i.id)
  }
  async function saveItem() {
    if (!itemForm.label.trim()) return
    if (itemEditId) {
      await supabase.from('personnel_check_items').update({ label: itemForm.label.trim(), hint: itemForm.hint.trim() || null }).eq('id', itemEditId)
    } else {
      const nextOrder = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 1
      await supabase.from('personnel_check_items').insert([{ label: itemForm.label.trim(), hint: itemForm.hint.trim() || null, sort_order: nextOrder }])
    }
    setItemForm({ label: '', hint: '' })
    setItemEditId(null)
    fetchAll()
  }
  async function toggleItemActive(i: CheckItem) {
    await supabase.from('personnel_check_items').update({ is_active: !i.is_active }).eq('id', i.id)
    fetchAll()
  }
  async function deleteItem(id: string) {
    await supabase.from('personnel_check_items').delete().eq('id', id)
    fetchAll()
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Personnel Readiness Check</div>
          <div className="page-sub">{filteredChecks.length} of {checks.length} check(s) · supervisor confirmation of drivers &amp; helpers before dispatch · most recent 300</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setItemsModal(true)}>⚙ Check Items</button>
          <button className="btn btn-primary" onClick={openAdd}>+ New Check</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ width: 220 }}
          placeholder="Search person…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <input type="date" className="form-input" style={{ width: 150 }} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="form-input" style={{ width: 150 }} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <select className="form-select" style={{ width: 180 }} value={resultFilter} onChange={(e) => setResultFilter(e.target.value as 'all' | 'issues_found')}>
          <option value="all">All results</option>
          <option value="issues_found">Issues flagged only</option>
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : filteredChecks.length === 0 ? (
          <div className="empty-state">No checks match this filter.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Person</th><th>License No.</th><th>License Expiry</th>
                  <th>Result</th><th>Checked By</th><th>Assigned Vehicle(s)</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredChecks.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{c.check_date}</td>
                    <td style={{ fontWeight: 600 }}>{personName(c.driver_id)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>{c.license_no_snapshot || '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>{c.license_expiry_snapshot || '—'}</td>
                    <td>
                      {c.overall_result === 'issues_found'
                        ? <span className="badge badge-red">Issues Found</span>
                        : <span className="badge badge-green">OK</span>}
                    </td>
                    <td style={{ color: '#93a4b6' }}>{employeeName(c.checked_by)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>{assignedVehicles(c.driver_id)}</td>
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
              <div className="modal-title">{modal === 'add' ? 'New Personnel Check' : 'Edit Personnel Check'}</div>
              <button className="modal-close" onClick={() => setModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Person *</label>
                  <select className="form-select" value={form.person_id} onChange={(e) => setForm({ ...form, person_id: e.target.value })} disabled={modal === 'edit'}>
                    <option value="">—</option>
                    {employees.map((d) => <option key={d.id} value={d.id}>{d.full_name}{d.is_driver ? ' (Driver)' : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Check Date</label>
                  <input type="date" className="form-input" value={form.check_date} onChange={(e) => setForm({ ...form, check_date: e.target.value })} disabled={modal === 'edit'} />
                </div>
              </div>

              {form.person_id && (
                <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: '#93a4b6', marginBottom: 16, padding: '8px 12px', background: '#101a24', borderRadius: 8 }}>
                  <div>License: {employees.find((e) => e.id === form.person_id)?.license_no || '—'}</div>
                  <div>Expiry: {employees.find((e) => e.id === form.person_id)?.license_expiry || '—'}</div>
                  <div>Assigned Vehicle: {assignedVehicles(form.person_id)}</div>
                </div>
              )}

              {activeItems.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#f2977e', marginBottom: 12 }}>No check items configured yet — click &quot;⚙ Check Items&quot; to add some.</div>
              ) : activeItems.map((item) => (
                <div className="form-group" key={item.id}>
                  <label className="form-label">{item.label}</label>
                  {item.hint && <div style={{ fontSize: 11, color: '#64798d', marginBottom: 4 }}>{item.hint}</div>}
                  <select
                    className="form-select"
                    value={form.results[item.id] || 'pass'}
                    onChange={(e) => setForm({ ...form, results: { ...form.results, [item.id]: e.target.value as 'pass' | 'fail' } })}
                  >
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
              ))}

              <div className="form-group">
                <label className="form-label">Note</label>
                <textarea className="form-textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional — reason for any fail" />
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
            <div className="modal-header"><div className="modal-title">Delete Check</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This can&apos;t be undone. Delete this check?</p>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => remove(deleteId)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {itemsModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <div className="modal-title">Check Items</div>
              <button className="modal-close" onClick={() => { setItemsModal(false); setItemForm({ label: '', hint: '' }); setItemEditId(null) }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {items.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#64798d' }}>No check items yet.</div>
                ) : items.map((i) => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #26374a', borderRadius: 8, opacity: i.is_active ? 1 : 0.5 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: '#e9eef3' }}>{i.label}</div>
                      {i.hint && <div style={{ fontSize: 11.5, color: '#64798d' }}>{i.hint}</div>}
                    </div>
                    <button className="action-btn action-edit" onClick={() => openEditItem(i)}>Edit</button>
                    <button className="action-btn" style={{ background: i.is_active ? '#3a2018' : '#17301f', color: i.is_active ? '#f2977e' : '#86d494' }} onClick={() => toggleItemActive(i)}>
                      {i.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button className="action-btn action-delete" onClick={() => deleteItem(i.id)}>Delete</button>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid #26374a', paddingTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e9eef3', marginBottom: 10 }}>{itemEditId ? 'Edit Item' : 'Add Item'}</div>
                <div className="form-group">
                  <label className="form-label">Label *</label>
                  <input className="form-input" value={itemForm.label} onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })} placeholder="e.g. Alcohol Test" />
                </div>
                <div className="form-group">
                  <label className="form-label">Hint</label>
                  <input className="form-input" value={itemForm.hint} onChange={(e) => setItemForm({ ...itemForm, hint: e.target.value })} placeholder="Shown under the label" />
                </div>
                <div className="modal-footer">
                  {itemEditId && <button className="btn btn-secondary" onClick={() => { setItemForm({ label: '', hint: '' }); setItemEditId(null) }}>Cancel Edit</button>}
                  <button className="btn btn-primary" onClick={saveItem}>{itemEditId ? 'Save Changes' : '+ Add Item'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
