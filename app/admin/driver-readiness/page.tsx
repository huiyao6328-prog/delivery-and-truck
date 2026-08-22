'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { useSession } from '@/lib/useSession'

type Employee = { id: string; full_name: string; is_driver: boolean; license_no: string | null; license_expiry: string | null }
type Truck = { id: string; plate_no: string }
type Assignment = { truck_id: string; employee_id: string }
type AnswerType = 'checkbox' | 'text'
type TextValueType = 'text' | 'number' | 'phone'
type CheckItem = {
  id: string; sort_order: number; label: string; hint: string | null; is_active: boolean; answer_type: AnswerType
  text_placeholder: string | null; text_value_type: TextValueType | null
}

const PHONE_PATTERN = /^\d{4}-\d{3}-\d{4}$/
const PHONE_MAX_DIGITS = 11
// Auto-inserts dashes as digits are typed (####-###-####) and caps at 11
// digits total — the phone format used here, not the Philippines' own.
function formatPhoneInput(raw: string): { formatted: string; overflow: boolean } {
  const digits = raw.replace(/\D/g, '')
  const overflow = digits.length > PHONE_MAX_DIGITS
  const truncated = digits.slice(0, PHONE_MAX_DIGITS)
  const match = truncated.match(/^(\d{0,4})(\d{0,3})(\d{0,4})$/)
  const formatted = match ? [match[1], match[2], match[3]].filter(Boolean).join('-') : truncated
  return { formatted, overflow }
}
function validateTextAnswer(item: CheckItem, value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return `"${item.label}" is required`
  if (item.text_value_type === 'number' && !/^\d+(\.\d+)?$/.test(trimmed)) return `"${item.label}" must be a number`
  if (item.text_value_type === 'phone' && !PHONE_PATTERN.test(trimmed)) return `"${item.label}" must be in ####-###-#### format`
  return null
}

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
type Result = { id: string; check_id: string; item_id: string | null; label_snapshot: string; status: 'pass' | 'fail'; note: string | null }

type ItemAnswer = { status: 'pass' | 'fail'; note: string }
type Form = { person_id: string; check_date: string; note: string; results: Record<string, ItemAnswer> }
// Every item defaults to fail — a supervisor has to actively confirm each
// one (check the box, or type an answer) rather than everything starting
// as "OK" by default.
const emptyForm = (items: CheckItem[]): Form => ({
  person_id: '', check_date: new Date().toISOString().slice(0, 10), note: '',
  results: Object.fromEntries(items.map((i) => [i.id, { status: 'fail', note: '' }])),
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
  const [phoneOverflow, setPhoneOverflow] = useState<Record<string, boolean>>({})

  const [itemsModal, setItemsModal] = useState(false)
  const [itemForm, setItemForm] = useState<{ label: string; hint: string; answer_type: AnswerType; text_placeholder: string; text_value_type: TextValueType }>(
    { label: '', hint: '', answer_type: 'checkbox', text_placeholder: '', text_value_type: 'text' }
  )
  const [itemEditId, setItemEditId] = useState<string | null>(null)
  const [itemSortKey, setItemSortKey] = useState<'order' | 'label' | 'hint' | 'status'>('order')
  const [itemSortDir, setItemSortDir] = useState<'asc' | 'desc'>('asc')

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

  function toggleItemSort(key: typeof itemSortKey) {
    if (itemSortKey === key) setItemSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setItemSortKey(key); setItemSortDir('asc') }
  }

  const sortedItems = useMemo(() => {
    const withValue = (i: CheckItem) => {
      switch (itemSortKey) {
        case 'order': return i.sort_order
        case 'label': return i.label.toLowerCase()
        case 'hint': return (i.hint || '').toLowerCase()
        case 'status': return i.is_active ? 1 : 0
      }
    }
    const sorted = [...items].sort((a, b) => {
      const va = withValue(a), vb = withValue(b)
      if (va < vb) return -1
      if (va > vb) return 1
      return 0
    })
    if (itemSortDir === 'desc') sorted.reverse()
    return sorted
  }, [items, itemSortKey, itemSortDir])

  function ItemSortHeader({ label, sortKeyName }: { label: string; sortKeyName: typeof itemSortKey }) {
    const active = itemSortKey === sortKeyName
    return (
      <th onClick={() => toggleItemSort(sortKeyName)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}{active ? (itemSortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

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
    const results: Record<string, ItemAnswer> = Object.fromEntries(activeItems.map((i) => [i.id, { status: 'fail' as const, note: '' }]))
    existing.forEach((r) => { if (r.item_id) results[r.item_id] = { status: r.status, note: r.note || '' } })
    setForm({ person_id: c.driver_id, check_date: c.check_date, note: c.note || '', results })
    setEditId(c.id)
    setError('')
    setModal('edit')
  }

  function setItemStatus(itemId: string, status: 'pass' | 'fail') {
    setForm((f) => ({ ...f, results: { ...f.results, [itemId]: { ...f.results[itemId], status } } }))
  }
  function setItemNote(itemId: string, note: string, valueType?: TextValueType | null) {
    let value = note
    if (valueType === 'phone') {
      const { formatted, overflow } = formatPhoneInput(note)
      value = formatted
      setPhoneOverflow((w) => ({ ...w, [itemId]: overflow }))
    }
    // Text-answer items derive pass/fail from whether anything was typed —
    // same "defaults to fail until confirmed" rule as the checkbox items.
    setForm((f) => ({ ...f, results: { ...f.results, [itemId]: { note: value, status: value.trim() ? 'pass' : 'fail' } } }))
  }

  async function save() {
    if (!form.person_id) {
      setError('Select a person')
      return
    }
    for (const item of activeItems) {
      if (item.answer_type !== 'text') continue
      const invalid = validateTextAnswer(item, form.results[item.id]?.note || '')
      if (invalid) {
        setError(invalid)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      const person = employees.find((e) => e.id === form.person_id)
      const overall_result = Object.values(form.results).some((v) => v.status === 'fail') ? 'issues_found' : 'ok'
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
        status: form.results[i.id]?.status || 'fail',
        note: form.results[i.id]?.note.trim() || null,
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
    setItemForm({ label: '', hint: '', answer_type: 'checkbox', text_placeholder: '', text_value_type: 'text' })
    setItemEditId(null)
  }
  function openEditItem(i: CheckItem) {
    setItemForm({
      label: i.label, hint: i.hint || '', answer_type: i.answer_type,
      text_placeholder: i.text_placeholder || '', text_value_type: i.text_value_type || 'text',
    })
    setItemEditId(i.id)
  }
  async function saveItem() {
    if (!itemForm.label.trim()) return
    const payload = {
      label: itemForm.label.trim(),
      hint: itemForm.hint.trim() || null,
      answer_type: itemForm.answer_type,
      text_placeholder: itemForm.answer_type === 'text' ? (itemForm.text_placeholder.trim() || null) : null,
      text_value_type: itemForm.answer_type === 'text' ? itemForm.text_value_type : null,
    }
    if (itemEditId) {
      await supabase.from('personnel_check_items').update(payload).eq('id', itemEditId)
    } else {
      const nextOrder = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 1
      await supabase.from('personnel_check_items').insert([{ ...payload, sort_order: nextOrder }])
    }
    setItemForm({ label: '', hint: '', answer_type: 'checkbox', text_placeholder: '', text_value_type: 'text' })
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
              ) : activeItems.map((item) => {
                const answer = form.results[item.id] || { status: 'fail' as const, note: '' }
                return (
                  <div className="form-group" key={item.id}>
                    <label className="form-label">{item.label}{item.answer_type === 'text' && <span style={{ color: '#f2977e' }}> *</span>}</label>
                    {item.hint && <div style={{ fontSize: 11, color: '#64798d', marginBottom: 4 }}>{item.hint}</div>}
                    {item.answer_type === 'text' ? (
                      <>
                        <input
                          className="form-input"
                          value={answer.note}
                          onChange={(e) => setItemNote(item.id, e.target.value, item.text_value_type)}
                          placeholder={item.text_placeholder || (item.text_value_type === 'phone' ? '0912-345-6789' : item.text_value_type === 'number' ? 'Enter a number' : 'Type an answer')}
                          inputMode={item.text_value_type === 'number' ? 'numeric' : item.text_value_type === 'phone' ? 'tel' : 'text'}
                          maxLength={item.text_value_type === 'phone' ? 13 : undefined}
                          style={{ borderColor: answer.status === 'fail' ? '#5a3226' : undefined }}
                        />
                        {item.text_value_type === 'phone' && phoneOverflow[item.id] && (
                          <div style={{ fontSize: 11, color: '#f2977e', marginTop: 4 }}>已超過 11 碼，多餘的數字不會被保留（格式固定為 ####-###-####）</div>
                        )}
                      </>
                    ) : (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: answer.status === 'pass' ? '#86d494' : '#f2977e', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={answer.status === 'pass'}
                          onChange={(e) => setItemStatus(item.id, e.target.checked ? 'pass' : 'fail')}
                        />
                        {answer.status === 'pass' ? 'Confirmed OK' : 'Not confirmed — counts as fail'}
                      </label>
                    )}
                  </div>
                )
              })}

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
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <div className="modal-title">Check Items</div>
              <button className="modal-close" onClick={() => { setItemsModal(false); setItemForm({ label: '', hint: '', answer_type: 'checkbox', text_placeholder: '', text_value_type: 'text' }); setItemEditId(null) }}>×</button>
            </div>
            <div className="modal-body">
              {items.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64798d', marginBottom: 18 }}>No check items yet.</div>
              ) : (
                <div className="table-wrap" style={{ marginBottom: 18 }}>
                  <table className="data-table" style={{ fontSize: 12.5 }}>
                    <thead>
                      <tr>
                        <ItemSortHeader label="#" sortKeyName="order" />
                        <ItemSortHeader label="Label" sortKeyName="label" />
                        <ItemSortHeader label="Hint" sortKeyName="hint" />
                        <th style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>Answer</th>
                        <ItemSortHeader label="Status" sortKeyName="status" />
                        <th style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedItems.map((i) => (
                        <tr key={i.id} style={{ opacity: i.is_active ? 1 : 0.5 }}>
                          <td style={{ fontFamily: 'var(--font-mono)', padding: '8px 12px' }}>{i.sort_order}</td>
                          <td style={{ fontWeight: 600, padding: '8px 12px' }}>{i.label}</td>
                          <td style={{ color: '#93a4b6', fontSize: 12, padding: '8px 12px' }}>{i.hint || '—'}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }} title={i.answer_type === 'text' ? 'Text Box' : 'Checkbox'}>
                            <span className={`badge ${i.answer_type === 'text' ? 'badge-blue' : 'badge-gray'}`} style={{ padding: '2px 7px', fontSize: 10.5 }}>
                              {i.answer_type === 'text' ? 'Text' : 'Check'}
                            </span>
                          </td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                            <span className={`badge ${i.is_active ? 'badge-green' : 'badge-gray'}`} style={{ padding: '2px 7px', fontSize: 10.5 }}>
                              {i.is_active ? 'On' : 'Off'}
                            </span>
                          </td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                            <div className="actions" style={{ gap: 4 }}>
                              <button className="action-btn action-edit" style={{ padding: '4px 7px', fontSize: 11 }} title="Edit" onClick={() => openEditItem(i)}>✎</button>
                              <button
                                className="action-btn"
                                style={{ padding: '4px 7px', fontSize: 11, background: i.is_active ? '#3a2018' : '#17301f', color: i.is_active ? '#f2977e' : '#86d494' }}
                                title={i.is_active ? 'Disable' : 'Enable'}
                                onClick={() => toggleItemActive(i)}
                              >
                                {i.is_active ? '⏸' : '▶'}
                              </button>
                              <button className="action-btn action-delete" style={{ padding: '4px 7px', fontSize: 11 }} title="Delete" onClick={() => deleteItem(i.id)}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
                <div className="form-group">
                  <label className="form-label">Answer As</label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <select className="form-select" style={{ flex: 1 }} value={itemForm.answer_type} onChange={(e) => setItemForm({ ...itemForm, answer_type: e.target.value as AnswerType })}>
                      <option value="checkbox">Checkbox (pass/fail toggle)</option>
                      <option value="text">Text Box (free-text answer)</option>
                    </select>
                    {itemEditId && <button className="btn btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => { setItemForm({ label: '', hint: '', answer_type: 'checkbox', text_placeholder: '', text_value_type: 'text' }); setItemEditId(null) }}>Cancel Edit</button>}
                    <button className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} onClick={saveItem}>{itemEditId ? 'Save Changes' : '+ Add Item'}</button>
                  </div>
                  <div style={{ fontSize: 11, color: '#64798d', marginTop: 4 }}>
                    {itemForm.answer_type === 'text'
                      ? 'A text answer is always required — the check can\'t be saved until it\'s filled in correctly.'
                      : 'The item starts as fail until the supervisor actively checks it.'}
                  </div>
                </div>
                {itemForm.answer_type === 'text' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Value Type</label>
                      <select className="form-select" value={itemForm.text_value_type} onChange={(e) => setItemForm({ ...itemForm, text_value_type: e.target.value as TextValueType })}>
                        <option value="text">Text (any characters)</option>
                        <option value="number">Number</option>
                        <option value="phone">Phone (####-###-####)</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Default / Placeholder Text</label>
                      <input
                        className="form-input"
                        value={itemForm.text_placeholder}
                        onChange={(e) => setItemForm({ ...itemForm, text_placeholder: e.target.value })}
                        placeholder={itemForm.text_value_type === 'phone' ? 'e.g. 0912-345-6789' : 'Shown as example text in the empty box'}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
