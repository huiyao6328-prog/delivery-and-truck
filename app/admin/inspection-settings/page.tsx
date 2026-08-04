'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { useSession } from '@/lib/useSession'

type Category = { id: string; sort_order: number; name: string; description: string | null; is_active: boolean }
type Item = {
  id: string; category_id: string; sort_order: number; label: string; hint: string | null; is_active: boolean
  updated_by: string | null; updated_at: string | null
}
type Employee = { id: string; full_name: string }

export default function InspectionSettingsPage() {
  const { session } = useSession()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'categories' | 'items'>('categories')
  const [selected, setSelected] = useState<Category | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [error, setError] = useState('')

  const [catModal, setCatModal] = useState<'add' | 'edit' | null>(null)
  const [catForm, setCatForm] = useState({ sort_order: '0', name: '', description: '' })
  const [catEditId, setCatEditId] = useState<string | null>(null)
  const [deleteCatId, setDeleteCatId] = useState<string | null>(null)

  const [itemModal, setItemModal] = useState<'add' | 'edit' | null>(null)
  const [itemForm, setItemForm] = useState({ sort_order: '0', label: '', hint: '' })
  const [itemEditId, setItemEditId] = useState<string | null>(null)
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)

  useEffect(() => { fetchCategories() }, [])

  async function fetchCategories() {
    setLoading(true)
    const { data } = await supabase.from('inspection_categories').select('*').order('sort_order')
    setCategories(data || [])
    setLoading(false)
  }

  async function fetchItems(categoryId: string) {
    setLoadingItems(true)
    const [itemRes, empRes] = await Promise.all([
      supabase.from('inspection_items').select('*').eq('category_id', categoryId).is('truck_id', null).order('sort_order'),
      supabase.from('employees').select('id, full_name'),
    ])
    setItems(itemRes.data || [])
    setEmployees(empRes.data || [])
    setLoadingItems(false)
  }

  function employeeName(id: string | null) {
    if (!id) return null
    return employees.find((e) => e.id === id)?.full_name || null
  }

  function enterItems(c: Category) {
    setSelected(c)
    setView('items')
    fetchItems(c.id)
  }

  function openAddCat() {
    const nextOrder = categories.length ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 1
    setCatForm({ sort_order: String(nextOrder), name: '', description: '' })
    setCatEditId(null)
    setCatModal('add')
  }
  function openEditCat(c: Category) {
    setCatForm({ sort_order: String(c.sort_order), name: c.name, description: c.description || '' })
    setCatEditId(c.id)
    setCatModal('edit')
  }
  async function saveCat() {
    if (!catForm.name.trim()) return
    const payload = { sort_order: Number(catForm.sort_order) || 0, name: catForm.name.trim(), description: catForm.description.trim() || null }
    if (catModal === 'add') await supabase.from('inspection_categories').insert([payload])
    else await supabase.from('inspection_categories').update(payload).eq('id', catEditId)
    setCatModal(null)
    fetchCategories()
  }
  async function removeCat(id: string) {
    await supabase.from('inspection_categories').delete().eq('id', id)
    setDeleteCatId(null)
    fetchCategories()
  }

  function openAddItem() {
    const nextOrder = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 1
    setItemForm({ sort_order: String(nextOrder), label: '', hint: '' })
    setItemEditId(null)
    setItemModal('add')
  }
  function openEditItem(i: Item) {
    setItemForm({ sort_order: String(i.sort_order), label: i.label, hint: i.hint || '' })
    setItemEditId(i.id)
    setError('')
    setItemModal('edit')
  }
  async function saveItem() {
    if (!selected || !itemForm.label.trim()) return
    setError('')
    const payload = {
      category_id: selected.id,
      truck_id: null,
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
    fetchItems(selected.id)
  }
  async function removeItem(id: string) {
    const { error: err } = await supabase.from('inspection_items').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setDeleteItemId(null)
    if (selected) fetchItems(selected.id)
  }

  return (
    <AdminLayout>
      {view === 'categories' && (
        <>
          <div className="page-header">
            <div>
              <div className="page-title">Inspection Settings</div>
              <div className="page-sub">Categories run top to bottom in the driver&apos;s checklist — order matches the recommended walk-around sequence</div>
            </div>
            <button className="btn btn-primary" onClick={openAddCat}>+ Add Category</button>
          </div>
          <div className="card">
            {loading ? (
              <div className="loading"><div className="spinner" /><span>Loading…</span></div>
            ) : categories.length === 0 ? (
              <div className="empty-state">No categories yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Category</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{c.sort_order}</td>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td style={{ color: '#93a4b6', fontSize: 13 }}>{c.description || '—'}</td>
                        <td>{c.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                        <td>
                          <div className="actions">
                            <button className="action-btn" style={{ background: '#e3efe4', color: '#26592c' }} onClick={() => enterItems(c)}>Edit Items</button>
                            <button className="action-btn action-edit" onClick={() => openEditCat(c)}>Edit</button>
                            <button className="action-btn action-delete" onClick={() => setDeleteCatId(c.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'items' && selected && (
        <>
          <div className="page-header">
            <div>
              <button onClick={() => setView('categories')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93a4b6', fontSize: 13, marginBottom: 4 }}>
                ← Back to categories
              </button>
              <div className="page-title">{selected.name} — Items</div>
              <div className="page-sub">{items.length} item(s)</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={openAddItem}>+ Add Item</button>
              <button className="btn btn-secondary" onClick={() => setView('categories')}>Close</button>
            </div>
          </div>
          {error && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#34201a', color: '#f2977e', border: '1px solid #4a2e25' }}>
              {error}
            </div>
          )}
          <div className="card">
            {loadingItems ? (
              <div className="loading"><div className="spinner" /><span>Loading…</span></div>
            ) : items.length === 0 ? (
              <div className="empty-state">No items in this category yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Item</th><th>Hint</th><th>Last Modified</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{i.sort_order}</td>
                        <td style={{ fontWeight: 600 }}>{i.label}</td>
                        <td style={{ color: '#93a4b6', fontSize: 13 }}>{i.hint || '—'}</td>
                        <td style={{ color: '#64798d', fontSize: 12 }}>
                          {i.updated_by ? `${employeeName(i.updated_by) || 'Unknown'} · ${new Date(i.updated_at!).toLocaleDateString()}` : '—'}
                        </td>
                        <td>{i.is_active ? <span className="badge badge-green">Active</span> : <span className="badge badge-gray">Inactive</span>}</td>
                        <td>
                          <div className="actions">
                            <button className="action-btn action-edit" onClick={() => openEditItem(i)}>Edit</button>
                            <button className="action-btn action-delete" onClick={() => setDeleteItemId(i.id)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Category modal */}
      {catModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">{catModal === 'add' ? 'Add Category' : 'Edit Category'}</div>
              <button className="modal-close" onClick={() => setCatModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group" style={{ maxWidth: 100 }}>
                  <label className="form-label">Order</label>
                  <input type="number" className="form-input" value={catForm.sort_order} onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <input className="form-input" value={catForm.description} onChange={(e) => setCatForm({ ...catForm, description: e.target.value })} />
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setCatModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={saveCat}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteCatId && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header"><div className="modal-title">Delete Category</div></div>
            <div className="modal-body">
              <p style={{ color: '#93a4b6', fontSize: 14 }}>This deletes the category and all of its items. This can&apos;t be undone.</p>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setDeleteCatId(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={() => removeCat(deleteCatId)}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Item modal */}
      {itemModal && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">{itemModal === 'add' ? 'Add Item' : 'Edit Item'}</div>
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
                  <input className="form-input" value={itemForm.label} onChange={(e) => setItemForm({ ...itemForm, label: e.target.value })} placeholder="e.g. Engine oil" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Hint (shown under the label)</label>
                <input className="form-input" value={itemForm.hint} onChange={(e) => setItemForm({ ...itemForm, hint: e.target.value })} placeholder="e.g. Dipstick between Min–Max" />
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
              <p style={{ color: '#93a4b6', fontSize: 14 }}>Delete this checklist item?</p>
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
