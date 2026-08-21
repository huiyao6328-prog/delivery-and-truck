'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

type Truck = { id: string; plate_no: string }
type Category = { id: string; sort_order: number; name: string; description: string | null }
type Item = {
  id: string; category_id: string; sort_order: number; label: string; hint: string | null; truck_id: string | null
  default_severity: 'critical' | 'moderate' | 'minor' | null
}
type Status = 'ok' | 'issue' | 'na'
type Answer = { status: Status; note: string; photoUrl?: string; uploadingPhoto?: boolean }

export default function NewInspectionPage() {
  const router = useRouter()
  const { session, loading: sessionLoading } = useSession()

  const [trucks, setTrucks] = useState<Truck[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingItems, setLoadingItems] = useState(false)

  const [truckId, setTruckId] = useState('')
  const [odometer, setOdometer] = useState('')
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [openCategory, setOpenCategory] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchTrucksAndCategories() }, [])
  useEffect(() => {
    setAnswers({})
    if (truckId) fetchItemsForTruck(truckId)
    else setItems([])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truckId])

  async function fetchTrucksAndCategories() {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('trucks').select('id, plate_no').eq('is_active', true).order('plate_no'),
      supabase.from('inspection_categories').select('*').eq('is_active', true).order('sort_order'),
    ])
    setTrucks(t || [])
    setCategories(c || [])
    if (c && c.length) setOpenCategory(c[0].id)
    setLoading(false)
  }

  // Effective checklist for this truck: every global item (truck_id null)
  // except ones this truck has explicitly excluded, plus any items added
  // just for this truck.
  async function fetchItemsForTruck(id: string) {
    setLoadingItems(true)
    const [{ data: rawItems }, { data: exclusions }] = await Promise.all([
      supabase.from('inspection_items').select('*').eq('is_active', true).or(`truck_id.is.null,truck_id.eq.${id}`).order('sort_order'),
      supabase.from('truck_inspection_item_exclusions').select('item_id').eq('truck_id', id),
    ])
    const excludedIds = new Set((exclusions || []).map((e) => e.item_id))
    setItems((rawItems || []).filter((it) => it.truck_id || !excludedIds.has(it.id)))
    setLoadingItems(false)
  }

  const itemsByCategory = useMemo(() => {
    const map: Record<string, Item[]> = {}
    items.forEach((it) => {
      map[it.category_id] = map[it.category_id] || []
      map[it.category_id].push(it)
    })
    return map
  }, [items])

  const totalItems = items.length
  const checkedCount = Object.keys(answers).length
  const anyIssue = Object.values(answers).some((a) => a.status === 'issue')
  const allChecked = totalItems > 0 && checkedCount === totalItems
  const canSubmit = allChecked && !!truckId && !submitting

  function setAnswer(itemId: string, status: Status) {
    setAnswers((prev) => ({ ...prev, [itemId]: { status, note: prev[itemId]?.note || '' } }))
  }
  function setNote(itemId: string, note: string) {
    setAnswers((prev) => ({ ...prev, [itemId]: { status: prev[itemId]?.status || 'issue', note } }))
  }

  async function uploadPhoto(itemId: string, file: File) {
    setAnswers((prev) => ({ ...prev, [itemId]: { status: prev[itemId]?.status || 'issue', note: prev[itemId]?.note || '', uploadingPhoto: true } }))
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `${itemId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('inspection-photos').upload(path, file)
    if (error) {
      setAnswers((prev) => ({ ...prev, [itemId]: { ...prev[itemId], uploadingPhoto: false } }))
      return
    }
    const { data } = supabase.storage.from('inspection-photos').getPublicUrl(path)
    setAnswers((prev) => ({ ...prev, [itemId]: { ...prev[itemId], photoUrl: data.publicUrl, uploadingPhoto: false } }))
  }

  function categoryProgress(categoryId: string) {
    const catItems = itemsByCategory[categoryId] || []
    const checked = catItems.filter((it) => answers[it.id]).length
    const issue = catItems.some((it) => answers[it.id]?.status === 'issue')
    return { checked, total: catItems.length, issue, done: checked === catItems.length && catItems.length > 0 }
  }

  async function handleSubmit() {
    if (!session || !canSubmit) return
    if (!odometer.trim()) {
      alert('Please fill in the odometer reading')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const overallResult = anyIssue ? 'issues_found' : 'ok'
      const { data: inspection, error: insErr } = await supabase
        .from('inspections')
        .insert([{
          truck_id: truckId,
          driver_id: session.employee.id,
          odometer_km: Number(odometer),
          overall_result: overallResult,
          submitted_at: new Date().toISOString(),
        }])
        .select('id, inspection_date')
        .single()

      if (insErr || !inspection) {
        setError(insErr?.message || 'Could not submit — try again')
        return
      }

      const categoryById: Record<string, string> = {}
      categories.forEach((c) => { categoryById[c.id] = c.name })

      const resultRows = items.map((it) => ({
        inspection_id: inspection.id,
        item_id: it.id,
        label_snapshot: it.label,
        category_snapshot: categoryById[it.category_id] || '',
        status: answers[it.id].status,
        note: answers[it.id].note || null,
        photo_url: answers[it.id].photoUrl || null,
      }))
      const { data: insertedResults, error: resErr } = await supabase.from('inspection_results').insert(resultRows).select('id, item_id, status')
      if (resErr) {
        setError(resErr.message)
        return
      }

      const severityByItemId: Record<string, Item['default_severity']> = {}
      items.forEach((it) => { severityByItemId[it.id] = it.default_severity })

      const issueRows = (insertedResults || [])
        .filter((r) => r.status === 'issue')
        .map((r) => ({
          inspection_result_id: r.id,
          truck_id: truckId,
          inspection_date: inspection.inspection_date,
          severity: (r.item_id && severityByItemId[r.item_id]) || null,
        }))
      if (issueRows.length) {
        await supabase.from('improvement_actions').insert(issueRows)
      }

      router.push(`/inspection/${inspection.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (sessionLoading || !session || loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b96a3' }}>Loading…</div>
  }

  return (
    <div className="ins-app">
      <header className="ins-header">
        <div className="ins-header-top">
          <div className="ins-header-left">
            <Link href="/" className="ins-home-btn" aria-label="Back to home">←&nbsp;Home</Link>
            <div className="ins-brand"><b>Delivery&nbsp;&amp;&nbsp;Truck</b> · Daily Inspection</div>
          </div>
          <div className="ins-doc-label">FORM DVI-01</div>
        </div>
        <div className="ins-header-fields">
          <div className="ins-field ins-field-truck">
            <label>Truck</label>
            <select value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              <option value="">Select truck…</option>
              {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
            </select>
          </div>
          <div className="ins-field">
            <label>Driver</label>
            <div className="ins-static">{session.employee.full_name}</div>
          </div>
          <div className="ins-field">
            <label>Date</label>
            <div className="ins-static">{new Date().toISOString().slice(0, 10)}</div>
          </div>
          <div className="ins-field ins-field-odometer">
            <label>Odometer (km)</label>
            <input type="number" inputMode="numeric" placeholder="Enter current odometer reading" value={odometer} onChange={(e) => setOdometer(e.target.value)} />
          </div>
        </div>
        <div className="ins-progress-row">
          <div className="ins-progress-track"><div className="ins-progress-fill" style={{ width: totalItems ? `${(checkedCount / totalItems) * 100}%` : '0%' }} /></div>
          <div className="ins-progress-count">{checkedCount} / {totalItems} checked</div>
        </div>
      </header>

      <main className="ins-main">
        {!truckId ? (
          <div className="ins-empty">Select a truck above to load its checklist.</div>
        ) : loadingItems ? (
          <div className="ins-empty">Loading checklist…</div>
        ) : categories.map((cat, ci) => {
          const progress = categoryProgress(cat.id)
          const open = openCategory === cat.id
          return (
            <div key={cat.id} className={`ins-category ${progress.done ? (progress.issue ? 'issue' : 'done') : 'incomplete'} ${open ? 'open' : ''}`}>
              <div className="ins-category-head" onClick={() => setOpenCategory(open ? null : cat.id)}>
                <div className="ins-cat-num">{ci + 1}</div>
                <div className="ins-cat-titles">
                  <div className="ins-cat-title">{cat.name}</div>
                  {cat.description && <div className="ins-cat-sub">{cat.description}</div>}
                </div>
                <div className="ins-cat-count">{progress.checked}/{progress.total}</div>
                <div className="ins-chevron" />
              </div>
              {open && (
                <div className="ins-cat-body">
                  {(itemsByCategory[cat.id] || []).map((item) => {
                    const answer = answers[item.id]
                    return (
                      <div key={item.id} className="ins-item">
                        <div className="ins-item-row">
                          <div className="ins-item-text">
                            <div className="ins-item-label">{item.label}</div>
                            {item.hint && <div className="ins-item-hint">{item.hint}</div>}
                          </div>
                          <div className="ins-segmented">
                            <button type="button" className={answer?.status === 'ok' ? 'sel-ok' : ''} onClick={() => setAnswer(item.id, 'ok')}>OK</button>
                            <button type="button" className={answer?.status === 'issue' ? 'sel-issue' : ''} onClick={() => setAnswer(item.id, 'issue')}>ISSUE</button>
                            <button type="button" className={answer?.status === 'na' ? 'sel-na' : ''} onClick={() => setAnswer(item.id, 'na')}>N/A</button>
                          </div>
                        </div>
                        {answer?.status === 'issue' && (
                          <div className="ins-issue-panel">
                            <textarea
                              placeholder="What's wrong? e.g. left rear tire tread near limit"
                              value={answer.note}
                              onChange={(e) => setNote(item.id, e.target.value)}
                            />
                            <div className="ins-photo-row">
                              {answer.photoUrl ? (
                                <img src={answer.photoUrl} alt="" className="ins-photo-thumb" />
                              ) : (
                                <label className="ins-photo-btn">
                                  {answer.uploadingPhoto ? 'Uploading…' : '📷 Add Photo'}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    hidden
                                    disabled={answer.uploadingPhoto}
                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(item.id, f) }}
                                  />
                                </label>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </main>

      <footer className="ins-footer">
        <div className={`ins-footer-status ${allChecked && anyIssue ? 'has-issue' : ''}`}>
          {!truckId
            ? 'Select a truck to begin'
            : !allChecked
            ? `Check every item to submit — ${totalItems - checkedCount} left`
            : !odometer.trim()
            ? 'Enter the odometer reading to submit'
            : anyIssue ? 'Issues found — submitting will notify Maintenance' : 'All items OK'}
        </div>
        {error && <div className="ins-error">{error}</div>}
        <button
          className={`ins-submit ${canSubmit ? 'ready' : ''} ${canSubmit && anyIssue ? 'has-issue' : ''}`}
          disabled={!canSubmit}
          onClick={handleSubmit}
        >
          {submitting
            ? 'Submitting…'
            : allChecked && anyIssue ? 'Submit & Flag for Maintenance' : 'Submit Inspection'}
        </button>
      </footer>

      <style jsx>{`
        .ins-app { max-width: 560px; margin: 0 auto; min-height: 100vh; background: #0f1b28; display: flex; flex-direction: column; font-size: 14px; }
        .ins-header { position: sticky; top: 0; z-index: 20; background: #16232f; border-bottom: 1px solid #26374a; }
        .ins-header-top { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px 2px; }
        .ins-header-left { display: flex; align-items: center; gap: 10px; }
        .ins-home-btn { flex-shrink: 0; font-size: 12px; font-weight: 700; color: #93a4b6; text-decoration: none; border: 1px solid #28394a; border-radius: 7px; padding: 5px 9px; }
        .ins-home-btn:hover { color: #e9eef3; border-color: #3a4f65; }
        .ins-brand { font-size: 13px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #93a4b6; }
        .ins-brand b { color: #e37a42; }
        .ins-doc-label { font-size: 11px; color: #64798d; font-family: var(--font-mono); }
        .ins-header-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #26374a; margin-top: 10px; border-top: 1px solid #26374a; }
        .ins-field { background: #16232f; padding: 8px 16px 10px; }
        .ins-field label { display: block; font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64798d; margin-bottom: 3px; }
        .ins-field select, .ins-field input, .ins-static { width: 100%; border: none; background: transparent; font-family: var(--font-mono); font-size: 15px; font-weight: 600; color: #e9eef3; padding: 0; }
        .ins-field-truck select { color: #8dc63f; }
        .ins-field-odometer input { color: #4da3ff; }
        .ins-field-odometer input::placeholder { color: #ffb6c1; opacity: 1; }
        .ins-field select:focus, .ins-field input:focus { outline: none; }
        .ins-field select option { background: #16232f; color: #e9eef3; }
        .ins-progress-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px 12px; }
        .ins-progress-track { flex: 1; height: 6px; border-radius: 3px; background: #1c2b3a; overflow: hidden; }
        .ins-progress-fill { height: 100%; background: #c85a26; border-radius: 3px; transition: width 0.25s ease; }
        .ins-progress-count { font-family: var(--font-mono); font-size: 12.5px; font-weight: 700; color: #93a4b6; white-space: nowrap; }
        .ins-main { flex: 1; padding: 12px 12px 24px; }
        .ins-empty { text-align: center; padding: 40px 16px; color: #64798d; font-size: 13.5px; }
        .ins-category { background: #16232f; border: 1px solid #26374a; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
        .ins-category.incomplete { background: #2a1620; border-color: #6b3652; }
        .ins-category-head { display: flex; align-items: center; gap: 12px; padding: 13px 14px; cursor: pointer; }
        .ins-cat-num { flex: 0 0 auto; width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 12px; font-weight: 700; border: 1.5px solid #28394a; color: #93a4b6; }
        .ins-category.done .ins-cat-num { background: #17301f; color: #86d494; border-color: #274734; }
        .ins-category.issue .ins-cat-num { background: #34201a; color: #f2977e; border-color: #4a2e25; }
        .ins-category.incomplete .ins-cat-num { background: #4a2338; border-color: #ffb6c1; color: #ffb6c1; }
        .ins-cat-titles { flex: 1; min-width: 0; }
        .ins-cat-title { font-size: 15px; font-weight: 700; color: #e9eef3; }
        .ins-category.incomplete .ins-cat-title { color: #ffb6c1; }
        .ins-cat-sub { font-size: 12px; color: #64798d; margin-top: 1px; }
        .ins-cat-count { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: #64798d; }
        .ins-category.done .ins-cat-count { color: #86d494; }
        .ins-category.issue .ins-cat-count { color: #f2977e; }
        .ins-category.incomplete .ins-cat-count { color: #ffb6c1; }
        .ins-chevron { width: 9px; height: 9px; border-right: 2px solid #64798d; border-bottom: 2px solid #64798d; transform: rotate(-45deg); margin-left: 2px; }
        .ins-category.open .ins-chevron { transform: rotate(45deg); }
        .ins-cat-body { border-top: 1px solid #26374a; }
        .ins-item { padding: 12px 14px; border-bottom: 1px solid #1e2c3a; }
        .ins-item:last-child { border-bottom: none; }
        .ins-item-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ins-item-text { flex: 1; min-width: 0; }
        .ins-item-label { font-size: 14px; font-weight: 600; line-height: 1.35; color: #e9eef3; }
        .ins-item-hint { font-size: 12px; color: #64798d; margin-top: 2px; line-height: 1.4; }
        .ins-segmented { display: flex; flex: 0 0 auto; border: 1px solid #28394a; border-radius: 7px; overflow: hidden; }
        .ins-segmented button { font-family: inherit; font-size: 11.5px; font-weight: 700; padding: 7px 9px; border: none; background: #1c2b3a; color: #93a4b6; cursor: pointer; border-left: 1px solid #28394a; }
        .ins-segmented button:first-child { border-left: none; }
        .ins-segmented button.sel-ok { background: #e3efe4; color: #26592c; }
        .ins-segmented button.sel-issue { background: #f8e2da; color: #9c3719; }
        .ins-segmented button.sel-na { background: #ece9df; color: #6b6252; }
        .ins-issue-panel { margin-top: 10px; padding: 10px; background: #34201a; border: 1px solid #5a3226; border-radius: 8px; }
        .ins-issue-panel textarea { width: 100%; min-height: 50px; resize: vertical; border: 1px solid #5a3226; border-radius: 6px; background: #16232f; color: #e9eef3; font-family: inherit; font-size: 13px; padding: 8px; }
        .ins-photo-row { margin-top: 8px; }
        .ins-photo-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #ffb6c1; border: 1px dashed #6b3652; border-radius: 7px; padding: 7px 11px; cursor: pointer; }
        .ins-photo-thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 7px; border: 1px solid #5a3226; }
        .ins-footer { position: sticky; bottom: 0; background: #16232f; border-top: 1px solid #26374a; padding: 10px 16px calc(12px + env(safe-area-inset-bottom)); }
        .ins-footer-status { text-align: center; font-size: 12px; font-weight: 700; color: #64798d; margin-bottom: 8px; }
        .ins-footer-status.has-issue { color: #f2977e; }
        .ins-error { text-align: center; font-size: 12.5px; color: #f2977e; margin-bottom: 8px; }
        .ins-submit { width: 100%; border: none; border-radius: 9px; padding: 13px; font-size: 15px; font-weight: 800; background: #2c3d4e; color: #93a4b6; cursor: not-allowed; }
        .ins-submit.ready { background: #c85a26; color: #fff; cursor: pointer; }
        .ins-submit.ready.has-issue { background: #a0431d; color: #fff; }
      `}</style>
    </div>
  )
}
