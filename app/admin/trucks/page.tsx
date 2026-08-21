'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type TruckType = { id: string; name: string }
type TruckOwner = { id: string; name: string }
type Truck = {
  id: string
  plate_no: string
  truck_type_id: string | null
  owner_id: string | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  max_load_kg: number | null
  note: string | null
  is_active: boolean
  kf_erp_synced_at: string | null
  registration_expiry: string | null
  insurance_expiry: string | null
}

type Form = {
  plate_no: string; truck_type_id: string; owner_id: string
  length_cm: string; width_cm: string; height_cm: string; max_load_kg: string
  note: string; is_active: boolean
  registration_expiry: string; insurance_expiry: string
}
const emptyForm: Form = {
  plate_no: '', truck_type_id: '', owner_id: '', length_cm: '', width_cm: '', height_cm: '', max_load_kg: '', note: '', is_active: true,
  registration_expiry: '', insurance_expiry: '',
}

export default function TrucksPage() {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [types, setTypes] = useState<TruckType[]>([])
  const [owners, setOwners] = useState<TruckOwner[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<'plate_no' | 'type' | 'owner' | 'length_cm' | 'max_load_kg' | 'source' | 'is_active' | 'registration_expiry' | 'insurance_expiry'>('plate_no')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [searchText, setSearchText] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: t }, { data: ty }, { data: ow }] = await Promise.all([
      supabase.from('trucks').select('*').order('plate_no'),
      supabase.from('truck_types').select('id, name').order('name'),
      supabase.from('truck_owners').select('id, name').eq('is_active', true).order('name'),
    ])
    setTrucks(t || [])
    setTypes(ty || [])
    setOwners(ow || [])
    setLoading(false)
  }

  function typeName(id: string | null) {
    return types.find((t) => t.id === id)?.name || '—'
  }
  function ownerName(id: string | null) {
    return owners.find((o) => o.id === id)?.name || '—'
  }

  function expiryCell(date: string | null) {
    if (!date) return <span style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>—</span>
    const daysLeft = Math.round((new Date(date + 'T00:00:00').getTime() - Date.now()) / 86400000)
    const color = daysLeft < 0 ? '#f2977e' : daysLeft <= 30 ? '#e3a45e' : '#93a4b6'
    return <span style={{ fontFamily: 'var(--font-mono)', color }}>{date}</span>
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredTrucks = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return trucks.filter((t) => {
      if (ownerFilter && t.owner_id !== ownerFilter) return false
      if (q && !t.plate_no.toLowerCase().includes(q)) return false
      return true
    })
  }, [trucks, ownerFilter, searchText])

  const sortedTrucks = useMemo(() => {
    const withValue = (t: Truck) => {
      switch (sortKey) {
        case 'plate_no': return t.plate_no.toLowerCase()
        case 'type': return typeName(t.truck_type_id).toLowerCase()
        case 'owner': return ownerName(t.owner_id).toLowerCase()
        case 'length_cm': return t.length_cm ?? -1
        case 'max_load_kg': return t.max_load_kg ?? -1
        case 'source': return t.kf_erp_synced_at ? 'kf-erp' : 'local'
        case 'is_active': return t.is_active ? 1 : 0
        case 'registration_expiry': return t.registration_expiry ?? ''
        case 'insurance_expiry': return t.insurance_expiry ?? ''
      }
    }
    const sorted = [...filteredTrucks].sort((a, b) => {
      const va = withValue(a)
      const vb = withValue(b)
      if (va < vb) return -1
      if (va > vb) return 1
      return 0
    })
    if (sortDir === 'desc') sorted.reverse()
    return sorted
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTrucks, types, owners, sortKey, sortDir])

  function SortHeader({ label, sortKeyName }: { label: string; sortKeyName: typeof sortKey }) {
    const active = sortKey === sortKeyName
    return (
      <th onClick={() => toggleSort(sortKeyName)} style={{ cursor: 'pointer', userSelect: 'none' }}>
        {label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
      </th>
    )
  }

  function openAdd() {
    const koufu = owners.find((o) => o.name === 'Koufu')
    setForm({ ...emptyForm, owner_id: koufu?.id || '' })
    setEditId(null)
    setModal('add')
  }

  function openEdit(t: Truck) {
    setForm({
      plate_no: t.plate_no,
      truck_type_id: t.truck_type_id || '',
      owner_id: t.owner_id || '',
      length_cm: t.length_cm?.toString() || '',
      width_cm: t.width_cm?.toString() || '',
      height_cm: t.height_cm?.toString() || '',
      max_load_kg: t.max_load_kg?.toString() || '',
      note: t.note || '',
      is_active: t.is_active,
      registration_expiry: t.registration_expiry || '',
      insurance_expiry: t.insurance_expiry || '',
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
        owner_id: form.owner_id || null,
        length_cm: form.length_cm ? Number(form.length_cm) : null,
        width_cm: form.width_cm ? Number(form.width_cm) : null,
        height_cm: form.height_cm ? Number(form.height_cm) : null,
        max_load_kg: form.max_load_kg ? Number(form.max_load_kg) : null,
        note: form.note.trim() || null,
        is_active: form.is_active,
        registration_expiry: form.registration_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
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
          <div className="page-sub">{sortedTrucks.length} of {trucks.length} truck(s)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={syncFromKfErp} disabled={syncing}>
            {syncing ? 'Syncing…' : '⟳ Sync from kf-erp'}
          </button>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Truck</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <select className="form-select" style={{ maxWidth: 220 }} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          <option value="">All Owners</option>
          {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input
          className="form-input"
          style={{ maxWidth: 260 }}
          placeholder="Search plate no."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
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
        ) : trucks.length === 0 ? (
          <div className="empty-state">No trucks yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader label="Plate No." sortKeyName="plate_no" />
                  <SortHeader label="Type" sortKeyName="type" />
                  <SortHeader label="Owner" sortKeyName="owner" />
                  <SortHeader label="Box (L×W×H cm)" sortKeyName="length_cm" />
                  <SortHeader label="Max Load (kg)" sortKeyName="max_load_kg" />
                  <SortHeader label="Source" sortKeyName="source" />
                  <SortHeader label="Status" sortKeyName="is_active" />
                  <SortHeader label="Registration Exp." sortKeyName="registration_expiry" />
                  <SortHeader label="Insurance Exp." sortKeyName="insurance_expiry" />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrucks.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{t.plate_no}</td>
                    <td>{typeName(t.truck_type_id)}</td>
                    <td>{t.owner_id && ownerName(t.owner_id) !== 'Koufu' ? <span className="badge badge-orange">{ownerName(t.owner_id)}</span> : <span className="badge badge-gray">Koufu</span>}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>
                      {t.length_cm && t.width_cm && t.height_cm ? `${t.length_cm} × ${t.width_cm} × ${t.height_cm}` : '—'}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{t.max_load_kg ?? '—'}</td>
                    <td>{t.kf_erp_synced_at ? <span className="badge badge-blue">kf-erp</span> : <span className="badge badge-gray">Local</span>}</td>
                    <td>{t.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                    <td>{expiryCell(t.registration_expiry)}</td>
                    <td>{expiryCell(t.insurance_expiry)}</td>
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
                <label className="form-label">Owner</label>
                <select className="form-select" value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })}>
                  <option value="">—</option>
                  {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
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
              <div className="form-label" style={{ marginTop: 4 }}>Compliance</div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Registration Expiry</label>
                  <input type="date" className="form-input" value={form.registration_expiry} onChange={(e) => setForm({ ...form, registration_expiry: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Insurance Expiry</label>
                  <input type="date" className="form-input" value={form.insurance_expiry} onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })} />
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
