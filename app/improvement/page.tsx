'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

type Action = {
  id: string
  inspection_result_id: string
  truck_id: string
  status: 'pending' | 'in_progress' | 'pending_review' | 'closed'
  severity: 'critical' | 'moderate' | 'minor' | null
  deadline: string | null
  assigned_to: string | null
  created_at: string
}
type Result = { id: string; label_snapshot: string }
type Truck = { id: string; plate_no: string }
type Employee = { id: string; full_name: string }

const STATUS_LABEL: Record<Action['status'], string> = {
  pending: 'Awaiting Assignment',
  in_progress: 'In Progress',
  pending_review: 'Pending Review',
  closed: 'Closed',
}
const STATUS_TONE: Record<Action['status'], string> = {
  pending: 'danger', in_progress: 'warn', pending_review: 'warn', closed: 'ok',
}

export default function ImprovementListPage() {
  const { session, loading: sessionLoading } = useSession()
  const [actions, setActions] = useState<Action[]>([])
  const [results, setResults] = useState<Record<string, Result>>({})
  const [trucks, setTrucks] = useState<Record<string, Truck>>({})
  const [employees, setEmployees] = useState<Record<string, Employee>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'open' | 'all'>('open')

  useEffect(() => { if (session) fetchAll() }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true)
    const { data: a } = await supabase.from('improvement_actions').select('*').order('created_at', { ascending: false })
    const list = a || []
    setActions(list)
    if (list.length) {
      const [{ data: r }, { data: t }, { data: emp }] = await Promise.all([
        supabase.from('inspection_results').select('id, label_snapshot').in('id', list.map((x) => x.inspection_result_id)),
        supabase.from('trucks').select('id, plate_no'),
        supabase.from('employees').select('id, full_name'),
      ])
      setResults(Object.fromEntries((r || []).map((x) => [x.id, x])))
      setTrucks(Object.fromEntries((t || []).map((x) => [x.id, x])))
      setEmployees(Object.fromEntries((emp || []).map((x) => [x.id, x])))
    }
    setLoading(false)
  }

  const filtered = useMemo(
    () => (filter === 'open' ? actions.filter((a) => a.status !== 'closed') : actions),
    [actions, filter]
  )

  function daysLabel(a: Action) {
    if (!a.deadline || a.status === 'closed') return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = new Date(a.deadline + 'T00:00:00')
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, tone: 'danger' }
    if (diff <= 1) return { label: diff === 0 ? 'Due today' : 'Due tomorrow', tone: 'danger' }
    return { label: `${diff}d left`, tone: 'warn' }
  }

  if (sessionLoading || !session) {
    return <div className="il-loading">Loading…</div>
  }

  return (
    <div className="il-app">
      <header className="il-header">
        <Link href="/" className="il-back">← Home</Link>
        <div className="il-title">Improvement Progress</div>
        <div className="il-tabs">
          <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>Open</button>
          <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
        </div>
      </header>

      <main className="il-main">
        {loading ? (
          <div className="il-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="il-empty">{filter === 'open' ? 'No open defects — nice.' : 'No defects recorded yet.'}</div>
        ) : (
          <div className="il-list">
            {filtered.map((a) => {
              const sla = daysLabel(a)
              return (
                <Link href={`/improvement/${a.id}`} key={a.id} className="il-row">
                  <div className="il-row-main">
                    <div className="il-plate">{trucks[a.truck_id]?.plate_no || '—'}</div>
                    <div className="il-defect">{results[a.inspection_result_id]?.label_snapshot || '—'}</div>
                    <div className="il-meta">
                      {a.severity && <span className={`il-badge il-badge-${a.severity === 'critical' ? 'danger' : a.severity === 'moderate' ? 'warn' : 'ok'}`}>{a.severity}</span>}
                      <span className="il-tracker">{a.assigned_to ? employees[a.assigned_to]?.full_name : 'Unassigned'}</span>
                    </div>
                  </div>
                  <div className="il-row-side">
                    <span className={`il-status il-status-${STATUS_TONE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                    {sla && <span className={`il-sla il-sla-${sla.tone}`}>{sla.label}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>

      <style jsx>{`
        .il-app { max-width: 560px; margin: 0 auto; min-height: 100vh; background: #0f1b28; }
        .il-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #93a4b6; font-size: 14px; }
        .il-header { position: sticky; top: 0; z-index: 20; background: #16232f; border-bottom: 1px solid #26374a; padding: 14px 16px; }
        .il-back { font-size: 12.5px; color: #93a4b6; text-decoration: none; }
        .il-back:hover { color: #e9eef3; }
        .il-title { font-size: 18px; font-weight: 700; color: #e9eef3; margin-top: 6px; }
        .il-tabs { display: flex; gap: 6px; margin-top: 10px; }
        .il-tabs button { font-size: 12.5px; font-weight: 700; padding: 6px 12px; border-radius: 100px; border: 1px solid #28394a; background: #101a24; color: #93a4b6; cursor: pointer; }
        .il-tabs button.active { background: #c85a26; border-color: #c85a26; color: #fff; }
        .il-main { padding: 14px 12px 32px; }
        .il-empty { text-align: center; padding: 48px 16px; color: #64798d; font-size: 13.5px; }
        .il-list { display: flex; flex-direction: column; gap: 8px; }
        .il-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: #16232f; border: 1px solid #26374a; border-radius: 10px; padding: 12px 14px; text-decoration: none; }
        .il-row-main { min-width: 0; }
        .il-plate { font-family: var(--font-mono); font-weight: 700; font-size: 14px; color: #e9eef3; }
        .il-defect { font-size: 12.5px; color: #93a4b6; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
        .il-meta { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .il-badge { font-size: 10.5px; font-weight: 700; text-transform: uppercase; padding: 2px 8px; border-radius: 100px; }
        .il-badge-danger { background: #34201a; color: #f2977e; }
        .il-badge-warn { background: #332711; color: #f0c674; }
        .il-badge-ok { background: #17301f; color: #86d494; }
        .il-tracker { font-size: 11.5px; color: #64798d; }
        .il-row-side { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
        .il-status { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 100px; white-space: nowrap; }
        .il-status-danger { background: #34201a; color: #f2977e; }
        .il-status-warn { background: #332711; color: #f0c674; }
        .il-status-ok { background: #17301f; color: #86d494; }
        .il-sla { font-family: var(--font-mono); font-size: 10.5px; font-weight: 700; }
        .il-sla-danger { color: #f2977e; }
        .il-sla-warn { color: #f0c674; }
      `}</style>
    </div>
  )
}
