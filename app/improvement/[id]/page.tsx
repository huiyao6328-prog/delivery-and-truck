'use client'
import { useEffect, useMemo, useState, use } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'
import HelpButton from '@/components/HelpButton'

type Action = {
  id: string
  inspection_result_id: string
  truck_id: string
  status: 'pending' | 'in_progress' | 'pending_review' | 'closed'
  severity: 'critical' | 'moderate' | 'minor' | null
  assigned_to: string | null
  repair_vendor_type: 'truck_owner' | 'repair_shop' | null
  repair_vendor: string | null
  deadline: string | null
  approving_manager_id: string | null
  dispatch_instruction: string | null
  dropoff_at: string | null
  work_order_no: string | null
  corrective_action: string | null
  evidence_photo_url: string | null
  verification_result: 'pass' | 'fail' | null
  verified_by: string | null
  verified_at: string | null
  verification_notes: string | null
  created_at: string
}
type Result = { id: string; label_snapshot: string; category_snapshot: string; note: string | null; photo_url: string | null }
type Employee = { id: string; full_name: string }

const SEVERITY_DAYS: Record<string, number | null> = { critical: 1, moderate: 3, minor: null }
const STATUS_LABEL: Record<Action['status'], string> = {
  pending: 'Stage 2 · Awaiting Assignment',
  in_progress: 'Stage 3 · In Progress',
  pending_review: 'Stage 4 · Pending Review',
  closed: 'Closed',
}

export default function ImprovementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { session, loading: sessionLoading } = useSession()

  const [action, setAction] = useState<Action | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [plate, setPlate] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [uploadingEvidence, setUploadingEvidence] = useState(false)

  useEffect(() => { if (session) fetchAll() }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    const { data: a } = await supabase.from('improvement_actions').select('*').eq('id', id).single()
    if (!a) { setLoading(false); return }
    setAction(a)
    const [{ data: r }, { data: t }, { data: emp }] = await Promise.all([
      supabase.from('inspection_results').select('id, label_snapshot, category_snapshot, note, photo_url').eq('id', a.inspection_result_id).single(),
      supabase.from('trucks').select('plate_no').eq('id', a.truck_id).single(),
      supabase.from('employees').select('id, full_name').eq('is_active', true).order('full_name'),
    ])
    setResult(r || null)
    setPlate(t?.plate_no || '—')
    setEmployees(emp || [])
    setLoading(false)
  }

  const slaInfo = useMemo(() => {
    if (!action?.deadline) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(action.deadline + 'T00:00:00')
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (action.status === 'closed') return { label: 'Closed', tone: 'ok' as const }
    if (diffDays < 0) return { label: `${Math.abs(diffDays)} day(s) overdue`, tone: 'danger' as const }
    if (diffDays <= 1) return { label: diffDays === 0 ? 'Due today' : 'Due tomorrow', tone: 'danger' as const }
    return { label: `${diffDays} day(s) left`, tone: 'warn' as const }
  }, [action])

  function update<K extends keyof Action>(key: K, value: Action[K]) {
    setAction((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  function pickSeverity(sev: Action['severity']) {
    if (!action) return
    const days = sev ? SEVERITY_DAYS[sev] : null
    const deadline = days != null ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : action.deadline
    setAction({ ...action, severity: sev, deadline })
  }

  async function saveStage2() {
    if (!action) return
    setSaving('stage2')
    await supabase.from('improvement_actions').update({
      severity: action.severity,
      assigned_to: action.assigned_to,
      repair_vendor_type: action.repair_vendor_type,
      repair_vendor: action.repair_vendor,
      deadline: action.deadline,
      approving_manager_id: action.approving_manager_id,
      dispatch_instruction: action.dispatch_instruction,
      status: action.status === 'pending' ? 'in_progress' : action.status,
    }).eq('id', action.id)
    await fetchAll()
    setSaving(null)
  }

  async function saveStage3() {
    if (!action) return
    setSaving('stage3')
    await supabase.from('improvement_actions').update({
      status: action.status,
      dropoff_at: action.dropoff_at,
      work_order_no: action.work_order_no,
      corrective_action: action.corrective_action,
      evidence_photo_url: action.evidence_photo_url,
    }).eq('id', action.id)
    await fetchAll()
    setSaving(null)
  }

  async function saveStage4() {
    if (!action) return
    setSaving('stage4')
    const nextStatus = action.verification_result === 'pass' ? 'closed' : 'in_progress'
    await supabase.from('improvement_actions').update({
      verification_result: action.verification_result,
      verified_by: action.verified_by,
      verified_at: action.verified_at,
      verification_notes: action.verification_notes,
      status: nextStatus,
    }).eq('id', action.id)
    await fetchAll()
    setSaving(null)
  }

  async function uploadEvidence(file: File) {
    if (!action) return
    setUploadingEvidence(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `evidence-${action.id}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('inspection-photos').upload(path, file)
    if (!error) {
      const { data } = supabase.storage.from('inspection-photos').getPublicUrl(path)
      update('evidence_photo_url', data.publicUrl)
    }
    setUploadingEvidence(false)
  }

  if (sessionLoading || !session || loading) {
    return <div className="ip-loading">Loading…</div>
  }
  if (!action) {
    return <div className="ip-loading">Case not found. <Link href="/improvement" style={{ color: '#7fb2ff' }}>Back to list</Link></div>
  }

  return (
    <div className="ip-app">
      <header className="ip-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href="/improvement" className="ip-back">← Improvement Progress</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/" className="ip-back" aria-label="Back to Home">🏠 Home</Link>
            <HelpButton title="Case Detail">
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <li>Assessment & Deadline: set severity, who's assigned, and the repair deadline.</li>
                <li>Remediation & Progress: the assigned person logs work done here.</li>
                <li>Verification & Sign-off: a supervisor confirms the fix and closes the case — a failed verification sends it back for rework.</li>
              </ul>
            </HelpButton>
          </div>
        </div>
      </header>

      <main className="ip-main">
        <div className="ip-card ip-summary">
          <div className="ip-summary-top">
            <div>
              <div className="ip-plate">{plate}</div>
              <div className="ip-defect">{result?.label_snapshot}{result?.category_snapshot ? ` · ${result.category_snapshot}` : ''}</div>
            </div>
            {slaInfo && <span className={`ip-pill ip-pill-${slaInfo.tone}`}>{slaInfo.label}</span>}
          </div>
          {result?.note && <div className="ip-note">“{result.note}”</div>}
          {result?.photo_url && <img src={result.photo_url} alt="" className="ip-report-photo" />}
          <div className="ip-summary-meta">
            <div><div className="ip-eyebrow">Severity</div><div className="ip-val">{action.severity ? action.severity[0].toUpperCase() + action.severity.slice(1) : '—'}</div></div>
            <div><div className="ip-eyebrow">Stage</div><div className="ip-val">{STATUS_LABEL[action.status]}</div></div>
            <div><div className="ip-eyebrow">Deadline</div><div className="ip-val mono">{action.deadline || '—'}</div></div>
          </div>
        </div>

        <div className="ip-card">
          <div className="ip-stage-head">
            <div>
              <div className="ip-stage-title">Assessment, Assignment &amp; Deadline</div>
              <div className="ip-stage-sub">Set once the defect has been reviewed</div>
            </div>
            <span className="ip-role">Fleet Manager / Admin</span>
          </div>
          <div className="ip-field">
            <label>Severity</label>
            <div className="ip-severity-group">
              <button type="button" className={`ip-sev ip-sev-danger ${action.severity === 'critical' ? 'sel' : ''}`} onClick={() => pickSeverity('critical')}>Critical · 24h</button>
              <button type="button" className={`ip-sev ip-sev-warn ${action.severity === 'moderate' ? 'sel' : ''}`} onClick={() => pickSeverity('moderate')}>Moderate · 3 days</button>
              <button type="button" className={`ip-sev ip-sev-ok ${action.severity === 'minor' ? 'sel' : ''}`} onClick={() => pickSeverity('minor')}>Minor · next service</button>
            </div>
          </div>
          <div className="ip-field">
            <label>Assigned</label>
            <select value={action.assigned_to || ''} onChange={(e) => update('assigned_to', e.target.value || null)}>
              <option value="">—</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div className="ip-field">
            <label>Repair</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <select
                style={{ flex: '0 0 150px' }}
                value={action.repair_vendor_type || ''}
                onChange={(e) => update('repair_vendor_type', (e.target.value || null) as Action['repair_vendor_type'])}
              >
                <option value="">—</option>
                <option value="truck_owner">Truck Owner</option>
                <option value="repair_shop">Repair Shop</option>
              </select>
              <input
                type="text"
                style={{ flex: 1 }}
                value={action.repair_vendor || ''}
                placeholder="Name / detail"
                onChange={(e) => update('repair_vendor', e.target.value)}
              />
            </div>
          </div>
          <div className="ip-field">
            <label>Deadline</label>
            <input type="date" value={action.deadline || ''} onChange={(e) => update('deadline', e.target.value)} />
          </div>
          <div className="ip-field">
            <label>Approver</label>
            <select value={action.approving_manager_id || ''} onChange={(e) => update('approving_manager_id', e.target.value || null)}>
              <option value="">—</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
          <div className="ip-field">
            <label>Dispatch</label>
            <input type="text" value={action.dispatch_instruction || ''} placeholder="e.g. City routes only, no long-distance runs" onChange={(e) => update('dispatch_instruction', e.target.value)} />
          </div>
          <button className="ip-save" disabled={saving === 'stage2'} onClick={saveStage2}>{saving === 'stage2' ? 'Saving…' : 'Save'}</button>
        </div>

        <div className="ip-card">
          <div className="ip-stage-head">
            <div>
              <div className="ip-stage-title">Remediation &amp; Progress</div>
              <div className="ip-stage-sub">Logged by the technician while repairs are underway</div>
            </div>
            <span className="ip-role">Technician</span>
          </div>
          <div className="ip-field">
            <label>Status</label>
            <select value={action.status} onChange={(e) => update('status', e.target.value as Action['status'])}>
              <option value="pending">Not started</option>
              <option value="in_progress">In Progress</option>
              <option value="pending_review">Completed — pending review</option>
            </select>
          </div>
          <div className="ip-field">
            <label>Scheduled</label>
            <input type="datetime-local" value={action.dropoff_at ? action.dropoff_at.slice(0, 16) : ''} onChange={(e) => update('dropoff_at', e.target.value ? new Date(e.target.value).toISOString() : null)} />
          </div>
          <div className="ip-field">
            <label>Work Order</label>
            <input type="text" className="mono" value={action.work_order_no || ''} onChange={(e) => update('work_order_no', e.target.value)} />
          </div>
          <div className="ip-field">
            <label>Corrective Action</label>
            <textarea value={action.corrective_action || ''} placeholder="What was done, root cause, prevention" onChange={(e) => update('corrective_action', e.target.value)} />
          </div>
          <div className="ip-field">
            <label>Evidence</label>
            {action.evidence_photo_url ? (
              <img src={action.evidence_photo_url} alt="" className="ip-evidence-thumb" />
            ) : (
              <label className="ip-upload-btn">
                {uploadingEvidence ? 'Uploading…' : '📷 Add Photo'}
                <input type="file" accept="image/*" capture="environment" hidden disabled={uploadingEvidence}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadEvidence(f) }} />
              </label>
            )}
          </div>
          <button className="ip-save" disabled={saving === 'stage3'} onClick={saveStage3}>{saving === 'stage3' ? 'Saving…' : 'Save'}</button>
        </div>

        <div className="ip-card">
          <div className="ip-stage-head">
            <div>
              <div className="ip-stage-title">Verification &amp; Sign-off</div>
              <div className="ip-stage-sub">Confirmed by a supervisor before the case closes</div>
            </div>
            <span className="ip-role">Supervisor</span>
          </div>
          <div className="ip-field">
            <label>Result</label>
            <select value={action.verification_result || ''} onChange={(e) => update('verification_result', (e.target.value || null) as Action['verification_result'])}>
              <option value="">—</option>
              <option value="pass">Passed — case closed</option>
              <option value="fail">Failed — send back for rework</option>
            </select>
          </div>
          <div className="ip-field">
            <label>Verified By</label>
            <input type="text" value={action.verified_by || ''} onChange={(e) => update('verified_by', e.target.value)} />
          </div>
          <div className="ip-field">
            <label>Closed Date</label>
            <input type="date" value={action.verified_at || ''} onChange={(e) => update('verified_at', e.target.value)} />
          </div>
          <div className="ip-field">
            <label>Notes</label>
            <textarea value={action.verification_notes || ''} placeholder="Notes from the verification" onChange={(e) => update('verification_notes', e.target.value)} />
          </div>
          <button className="ip-save" disabled={saving === 'stage4'} onClick={saveStage4}>{saving === 'stage4' ? 'Saving…' : 'Save'}</button>
        </div>
      </main>

      <style jsx>{`
        .ip-app { max-width: 560px; margin: 0 auto; min-height: 100vh; background: #0f1b28; }
        .ip-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #93a4b6; font-size: 14px; }
        .ip-header { position: sticky; top: 0; z-index: 20; background: #16232f; border-bottom: 1px solid #26374a; padding: 14px 16px; }
        .ip-back { font-size: 13px; color: #93a4b6; text-decoration: none; }
        .ip-back:hover { color: #e9eef3; }
        .ip-main { padding: 14px 12px 32px; display: flex; flex-direction: column; gap: 12px; }
        .ip-card { background: #16232f; border: 1px solid #26374a; border-radius: 12px; padding: 14px 16px; }
        .ip-summary-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
        .ip-plate { font-family: var(--font-mono); font-size: 19px; font-weight: 700; color: #e9eef3; }
        .ip-defect { font-size: 13px; color: #93a4b6; margin-top: 2px; }
        .ip-note { font-size: 12.5px; color: #ffb6c1; margin-top: 8px; font-style: italic; }
        .ip-report-photo { width: 100%; max-width: 220px; border-radius: 8px; margin-top: 8px; border: 1px solid #26374a; }
        .ip-pill { font-family: var(--font-mono); font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 100px; white-space: nowrap; }
        .ip-pill-ok { background: #17301f; color: #86d494; }
        .ip-pill-warn { background: #332711; color: #f0c674; }
        .ip-pill-danger { background: #34201a; color: #f2977e; }
        .ip-summary-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; border-top: 1px solid #26374a; margin-top: 12px; padding-top: 10px; }
        .ip-eyebrow { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64798d; margin-bottom: 3px; }
        .ip-val { font-size: 13px; font-weight: 600; color: #e9eef3; }
        .mono { font-family: var(--font-mono); }
        .ip-stage-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
        .ip-stage-title { font-size: 14.5px; font-weight: 700; color: #e9eef3; }
        .ip-stage-sub { font-size: 11.5px; color: #64798d; margin-top: 1px; }
        .ip-role { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 4px 9px; border-radius: 100px; background: #241f38; color: #b8a8e8; border: 1px solid #3a3160; white-space: nowrap; }
        .ip-field { margin-bottom: 10px; }
        .ip-field label { display: block; font-size: 11.5px; font-weight: 700; color: #93a4b6; margin-bottom: 4px; }
        .ip-field select, .ip-field input, .ip-field textarea {
          width: 100%; font-size: 13.5px; color: #e9eef3; background: #101a24; border: 1px solid #28394a; border-radius: 7px; padding: 8px 10px; font-family: inherit;
        }
        .ip-field textarea { min-height: 70px; resize: vertical; line-height: 1.5; }
        .ip-severity-group { display: flex; gap: 6px; flex-wrap: wrap; }
        .ip-sev { font-size: 11.5px; font-weight: 700; padding: 6px 10px; border-radius: 100px; border: 1.5px solid #28394a; background: #101a24; color: #64798d; cursor: pointer; opacity: 0.6; }
        .ip-sev.sel { opacity: 1; }
        .ip-sev-danger.sel { background: #34201a; border-color: #5a3226; color: #f2977e; }
        .ip-sev-warn.sel { background: #332711; border-color: #5c4a1e; color: #f0c674; }
        .ip-sev-ok.sel { background: #17301f; border-color: #2c5c3d; color: #86d494; }
        .ip-upload-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #ffb6c1; border: 1px dashed #6b3652; border-radius: 7px; padding: 8px 11px; cursor: pointer; }
        .ip-evidence-thumb { width: 64px; height: 64px; object-fit: cover; border-radius: 8px; border: 1px solid #26374a; }
        .ip-save { width: 100%; margin-top: 4px; border: none; border-radius: 8px; padding: 10px; font-size: 13.5px; font-weight: 700; background: #c85a26; color: #fff; cursor: pointer; }
        .ip-save:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
