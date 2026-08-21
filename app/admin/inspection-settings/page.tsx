'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { useSession } from '@/lib/useSession'

type Category = { id: string; sort_order: number; name: string; description: string | null; is_active: boolean }
type Severity = 'critical' | 'moderate' | 'minor'
type Item = {
  id: string; category_id: string; sort_order: number; label: string; hint: string | null; is_active: boolean
  updated_by: string | null; updated_at: string | null; default_severity: Severity | null
}
type Employee = { id: string; full_name: string }
type AiReview = { id: string; run_at: string; triggered_by: 'manual' | 'cron'; summary: string }

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', moderate: 'Moderate', minor: 'Minor' }
const SEVERITY_BADGE: Record<Severity, string> = { critical: 'badge-red', moderate: 'badge-orange', minor: 'badge-gray' }

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
  const [itemForm, setItemForm] = useState({ sort_order: '0', label: '', hint: '', default_severity: '' as Severity | '' })
  const [itemEditId, setItemEditId] = useState<string | null>(null)
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [suggestError, setSuggestError] = useState('')

  const [reviews, setReviews] = useState<AiReview[]>([])
  const [loadingReviews, setLoadingReviews] = useState(true)
  const [runningReview, setRunningReview] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [expandedReviewId, setExpandedReviewId] = useState<string | null>(null)

  useEffect(() => { fetchCategories(); fetchReviews() }, [])

  async function fetchReviews() {
    setLoadingReviews(true)
    const { data } = await supabase.from('inspection_ai_reviews').select('id, run_at, triggered_by, summary').order('run_at', { ascending: false }).limit(12)
    setReviews(data || [])
    setLoadingReviews(false)
  }

  async function runReviewNow() {
    setRunningReview(true)
    setReviewError('')
    try {
      const res = await fetch('/api/ai/monthly-review', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setReviewError(data.error || 'Review failed')
        return
      }
      setExpandedReviewId(data.review.id)
      fetchReviews()
    } catch {
      setReviewError('Could not reach the review service')
    } finally {
      setRunningReview(false)
    }
  }

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
    setItemForm({ sort_order: String(nextOrder), label: '', hint: '', default_severity: '' })
    setItemEditId(null)
    setSuggestError('')
    setItemModal('add')
  }
  function openEditItem(i: Item) {
    setItemForm({ sort_order: String(i.sort_order), label: i.label, hint: i.hint || '', default_severity: i.default_severity || '' })
    setItemEditId(i.id)
    setError('')
    setSuggestError('')
    setItemModal('edit')
  }
  async function suggestSeverity() {
    if (!itemForm.label.trim()) return
    setSuggesting(true)
    setSuggestError('')
    try {
      const res = await fetch('/api/ai/classify-severity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: itemForm.label.trim(), hint: itemForm.hint.trim(), category: selected?.name }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSuggestError(data.error || 'AI suggestion failed')
        return
      }
      setItemForm((f) => ({ ...f, default_severity: data.severity }))
    } catch {
      setSuggestError('Could not reach the AI suggestion service')
    } finally {
      setSuggesting(false)
    }
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
      default_severity: itemForm.default_severity || null,
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

          <div className="page-header" style={{ marginTop: 32 }}>
            <div>
              <div className="page-title" style={{ fontSize: 17 }}>AI Review Log</div>
              <div className="page-sub">Gemini re-checks item severity and each truck&apos;s checklist for drift · runs automatically on the 1st of every month, or on demand below</div>
            </div>
            <button className="btn btn-secondary" onClick={runReviewNow} disabled={runningReview}>
              {runningReview ? 'Running…' : '▶ Run AI Review Now'}
            </button>
          </div>
          {reviewError && (
            <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#34201a', color: '#f2977e', border: '1px solid #4a2e25' }}>
              {reviewError}
            </div>
          )}
          <div className="card">
            {loadingReviews ? (
              <div className="loading"><div className="spinner" /><span>Loading…</span></div>
            ) : reviews.length === 0 ? (
              <div className="empty-state">No AI reviews have run yet.</div>
            ) : (
              <div>
                {reviews.map((r) => {
                  const expanded = expandedReviewId === r.id
                  return (
                    <div key={r.id} style={{ borderBottom: '1px solid #1e2c3a' }}>
                      <button
                        onClick={() => setExpandedReviewId(expanded ? null : r.id)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 13.5, color: '#e9eef3', fontWeight: 600 }}>{new Date(r.run_at).toLocaleString()}</span>
                          <span className={`badge ${r.triggered_by === 'cron' ? 'badge-blue' : 'badge-gray'}`}>{r.triggered_by === 'cron' ? 'Monthly Auto' : 'Manual'}</span>
                        </div>
                        <span style={{ color: '#64798d', fontSize: 12 }}>{expanded ? '▲ Hide' : '▼ View'}</span>
                      </button>
                      {expanded && (
                        <pre style={{
                          margin: 0, padding: '0 16px 16px', fontSize: 12.5, color: '#cdd8e3', whiteSpace: 'pre-wrap',
                          fontFamily: 'inherit', lineHeight: 1.6,
                        }}>{r.summary}</pre>
                      )}
                    </div>
                  )
                })}
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
                  <thead><tr><th>#</th><th>Item</th><th>Hint</th><th>Default Severity</th><th>Last Modified</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id}>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{i.sort_order}</td>
                        <td style={{ fontWeight: 600 }}>{i.label}</td>
                        <td style={{ color: '#93a4b6', fontSize: 13 }}>{i.hint || '—'}</td>
                        <td>{i.default_severity ? <span className={`badge ${SEVERITY_BADGE[i.default_severity]}`}>{SEVERITY_LABEL[i.default_severity]}</span> : '—'}</td>
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
              <div className="form-group">
                <label className="form-label">Default Severity</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="form-select"
                    style={{ flex: 1 }}
                    value={itemForm.default_severity}
                    onChange={(e) => setItemForm({ ...itemForm, default_severity: e.target.value as Severity | '' })}
                  >
                    <option value="">—</option>
                    <option value="critical">Critical</option>
                    <option value="moderate">Moderate</option>
                    <option value="minor">Minor</option>
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flexShrink: 0 }}
                    onClick={suggestSeverity}
                    disabled={suggesting || !itemForm.label.trim()}
                  >
                    {suggesting ? 'Asking AI…' : '✨ AI Suggest'}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#64798d', marginTop: 4 }}>
                  Seeds the severity when this item is flagged as an issue — still adjustable per case in Improvement Progress.
                </div>
                {suggestError && <div style={{ color: '#f2977e', fontSize: 12.5, marginTop: 4 }}>{suggestError}</div>}
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
