'use client'
import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { useSession } from '@/lib/useSession'

type Truck = { id: string; plate_no: string }
type Category = { id: string; sort_order: number; name: string; description: string | null }
type Item = {
  id: string
  category_id: string
  sort_order: number
  label: string
  hint: string | null
  truck_id: string | null
  updated_by: string | null
  updated_at: string | null
}
type Employee = { id: string; full_name: string }

export default function TruckChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: truckId } = use(params)
  const { session } = useSession()

  const [truck, setTruck] = useState<Truck | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [exclusions, setExclusions] = useState<Record<string, { excluded_by: string | null; excluded_at: string }>>({})
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [itemModal, setItemModal] = useState<'add' | 'edit' | null>(null)
  const [itemForm, setItemForm] = useState({ sort_order: '0', label: '', hint: '' })
  const [itemEditId, setItemEditId] = useState<string | null>(null)
  const [itemCategoryId, setItemCategoryId] = useState<string | null>(null)
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [truckId])

  async function fetchAll() {
    setLoading(true)
    setError('')
    const [truckRes, catRes, itemRes, exclRes, empRes] = await Promise.all([
      supabase.from('trucks').select('id, plate_no').eq('id', truckId).single(),
      supabase.from('inspection_categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('inspection_items').select('*').eq('is_active', true).or(`truck_id.is.null,truck_id.eq.${truckId}`).order('sort_order'),
      supabase.from('truck_inspection_item_exclusions').select('item_id, excluded_by, excluded_at').eq('truck_id', truckId),
      supabase.from('employees').select('id, full_name'),
    ])
    if (truckRes.error) setError(truckRes.error.message)
    setTruck(truckRes.data)
    setCategories(catRes.data || [])
    setItems(itemRes.data || [])
    setEmployees(empRes.data || [])
    const exclMap: Record<string, { excluded_by: string | null; excluded_at: string }> = {}
    ;(exclRes.data || []).forEach((e) => { exclMap[e.item_id] = { excluded_by: e.excluded_by, excluded_at: e.excluded_at } })
    setExclusions(exclMap)
    setLoading(false)
  }

  function employeeName(id: string | null) {
    if (!id) return null
    return employees.find((e) => e.id === id)?.full_name || null
  }

  function itemsForCategory(categoryId: string) {
    return items.filter((i) => i.category_id === categoryId)
  }

  async function toggleExclusion(item: Item) {
    const excluded = !!exclusions[item.id]
    setError('')
    if (excluded) {
      const { error: err } = await supabase.from('truck_inspection_item_exclusions').delete().eq('truck_id', truckId).eq('item_id', item.id)
      if (err) { setError(err.message); return }
    } else {
      const { error: err } = await supabase.from('truck_inspection_item_exclusions')
        .insert([{ truck_id: truckId, item_id: item.id, excluded_by: session?.employee.id || null }])
      if (err) { setError(err.message); return }
    }
    fetchAll()
  }

  function openAddItem(categoryId: string) {
    const nextOrder = itemsForCategory(categoryId).length
      ? Math.max(...itemsForCategory(categoryId).map((i) => i.sort_order)) + 1 : 1
    setItemForm({ sort_order: String(nextOrder), label: '', hint: '' })
    setItemEditId(null)
    setItemCategoryId(categoryId)
    setError('')
    setItemModal('add')
  }
  function openEditItem(item: Item) {
    setItemForm({ sort_order: String(item.sort_order), label: item.label, hint: item.hint || '' })
    setItemEditId(item.id)
    setItemCategoryId(item.category_id)
    setError('')
    setItemModal('edit')
  }
  async function saveItem() {
    if (!itemCategoryId || !itemForm.label.trim()) return
    const payload = {
      category_id: itemCategoryId,
      truck_id: truckId,
      sort_order: Number(itemForm.sort_order) || 0,
      label: itemForm.label.trim(),
      hint: itemForm.hint.trim() || null,
      updated_by: session?.employee.id || null,
      updated_at: new Date().toISOString(),
    }
    const result = itemModal === 'add'
      ? await supabase.from('inspection_items').insert([payload])
      : await supabase.from('inspection_items').update(payload).eq('id', itemEditId)
    if (result.error) { setError(result.error.message); return }
    setItemModal(null)
    fetchAll()
  }
  async function removeItem(id: string) {
    const { error: err } = await supabase.from('inspection_items').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setDeleteItemId(null)
    fetchAll()
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="loading"><div className="spinner" /><span>Loading…</span></div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <Link href="/admin/trucks" style={{ background: 'none', border: 'none', color: '#93a4b6', fontSize: 13, textDecoration: 'none', display: 'inline-block', marginBottom: 4 }}>← Back to trucks</Link>
          <div className="page-title">{truck?.plate_no || '—'} — Checklist</div>
          <div className="page-sub">Global items apply unless turned off here; add items unique to this truck below each category</div>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#34201a', color: '#f2977e', border: '1px solid #4a2e25' }}>
          {error}
        </div>
      )}

      {categories.map((cat) => {
        const catItems = itemsForCategory(cat.id)
        const globalItems = catItems.filter((i) => !i.truck_id)
        const truckItems = catItems.filter((i) => i.truck_id === truckId)
        return (
          <div key={cat.id} className="card" style={{ marginBottom: 14 }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #26374a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e37a42' }}>{cat.name}</div>
                {cat.description && <div style={{ fontSize: 12, color: '#64798d', marginTop: 2 }}>{cat.description}</div>}
              </div>
              <button className="btn btn-secondary" onClick={() => openAddItem(cat.id)}>+ Add Item for This Truck</button>
            </div>
            <div>
              {globalItems.map((item) => {
                const excl = exclusions[item.id]
                const excludedByName = excl ? employeeName(excl.excluded_by) : null
                return (
                  <div key={item.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '10px 16px', borderBottom: '1px solid #1e2c3a', opacity: excl ? 0.5 : 1,
                  }}>
                    <div>
                      <div style={{ fontSize: 13.5, color: '#e9eef3', textDecoration: excl ? 'line-through' : 'none' }}>{item.label}</div>
                      {item.hint && <div style={{ fontSize: 12, color: '#64798d', marginTop: 2 }}>{item.hint}</div>}
                      {excl && (
                        <div style={{ fontSize: 11, color: '#f2977e', marginTop: 2 }}>
                          Excluded{excludedByName ? ` by ${excludedByName}` : ''} · {new Date(excl.excluded_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#93a4b6', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={!excl} onChange={() => toggleExclusion(item)} />
                      Included
                    </label>
                  </div>
                )
              })}
              {truckItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', borderBottom: '1px solid #1e2c3a' }}>
                  <div>
                    <div style={{ fontSize: 13.5, color: '#e9eef3' }}>
                      {item.label} <span className="badge badge-orange" style={{ marginLeft: 6 }}>Truck-only</span>
                    </div>
                    {item.hint && <div style={{ fontSize: 12, color: '#64798d', marginTop: 2 }}>{item.hint}</div>}
                    {item.updated_by && item.updated_at && (
                      <div style={{ fontSize: 11, color: '#64798d', marginTop: 2 }}>
                        {employeeName(item.updated_by) || 'Unknown'} · {new Date(item.updated_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="actions">
                    <button className="action-btn action-edit" onClick={() => openEditItem(item)}>Edit</button>
                    <button className="action-btn action-delete" onClick={() => setDeleteItemId(item.id)}>Delete</button>
                  </div>
                </div>
              ))}
              {globalItems.length === 0 && truckItems.length === 0 && (
                <div className="empty-state">No items in this category.</div>
              )}
            </div>
          </div>
        )
      })}

      {itemModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">{itemModal === 'add' ? 'Add Item for This Truck' : 'Edit Truck Item'}</div>
              <button className="modal-close" onClick={() => setItemModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group" style={{ maxWidth: 100 }}>
                  <label className="form-label">Order</label>
                  <input type="number" className="form-input" value={itemForm.sort_order} onChange={(e) => setItemForm({ ...itemForm, sort_order: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Label *</label>
                  <input className="form-input" value={itemForm.label} onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Hint (shown under the label)</label>
                <input className="form-input" value={itemForm.hint} onChange={(e) => setItemForm({ ...itemForm, hint: e.target.value })} />
              </div>
              {error && <div style={{ color: '#f2977e', fontSize: 13, marginBottom: 8 }}>{error}</div>}
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setItemModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveItem}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteItemId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header"><div className="modal-title">Delete Item</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>Delete this truck-only checklist item?</p>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDeleteItemId(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => removeItem(deleteItemId)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
