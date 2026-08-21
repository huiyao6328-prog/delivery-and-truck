'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type RoleTitle = { role_level: number; title: string }

export default function RoleTitlesPage() {
  const [titles, setTitles] = useState<RoleTitle[]>([])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<number | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('role_level_titles').select('*').order('role_level')
    setTitles(data || [])
    setDrafts(Object.fromEntries((data || []).map((t) => [t.role_level, t.title])))
    setLoading(false)
  }

  async function save(level: number) {
    setSaving(level)
    await supabase.from('role_level_titles').update({ title: drafts[level]?.trim() || '' }).eq('role_level', level)
    await fetchAll()
    setSaving(null)
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Role Titles</div>
          <div className="page-sub">Job title shown for each Employee Role Level (1 = highest authority)</div>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : (
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {titles.map((t) => (
              <div key={t.role_level} style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div style={{ flexShrink: 0, width: 70, fontFamily: 'var(--font-mono)', fontSize: 13, color: '#93a4b6', paddingBottom: 9 }}>Level {t.role_level}</div>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                  <input className="form-input" value={drafts[t.role_level] ?? ''} onChange={(e) => setDrafts({ ...drafts, [t.role_level]: e.target.value })} />
                </div>
                <button className="btn btn-primary" disabled={saving === t.role_level || drafts[t.role_level] === t.title} onClick={() => save(t.role_level)}>
                  {saving === t.role_level ? 'Saving…' : 'Save'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
