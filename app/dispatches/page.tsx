'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

type Truck = { id: string; plate_no: string }
type Dispatch = {
  id: string
  truck_id: string
  dispatch_date: string
  status: string
  destination: string | null
  purpose: string | null
  start_mileage_km: number | null
  end_mileage_km: number | null
  departure_time: string | null
  return_time: string | null
  fuel_level_on_return: string | null
  has_issue: boolean
  issue_note: string | null
  note: string | null
}

const FUEL_LABEL: Record<string, string> = {
  full: 'Full', three_quarter: '3/4', half: '1/2', quarter: '1/4', empty: 'Empty',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Not Started', in_progress: 'Out', completed: 'Returned', cancelled: 'Cancelled',
}

function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function MyDispatchesPage() {
  const { session, loading: sessionLoading } = useSession()
  const [dispatches, setDispatches] = useState<Dispatch[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const [departureTime, setDepartureTime] = useState('')
  const [startMileage, setStartMileage] = useState('')

  const [returnTime, setReturnTime] = useState('')
  const [endMileage, setEndMileage] = useState('')
  const [fuelLevel, setFuelLevel] = useState('full')
  const [hasIssue, setHasIssue] = useState(false)
  const [issueNote, setIssueNote] = useState('')
  const [returnNote, setReturnNote] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (session) fetchData() }, [session])

  async function fetchData() {
    if (!session) return
    const [{ data: d }, { data: t }] = await Promise.all([
      supabase.from('dispatches').select('*').eq('driver_id', session.employee.id).order('dispatch_date', { ascending: false }).limit(50),
      supabase.from('trucks').select('id, plate_no'),
    ])
    setDispatches(d || [])
    setTrucks(t || [])
    setLoading(false)
  }

  function truckPlate(id: string) { return trucks.find((t) => t.id === id)?.plate_no || '—' }

  function openDepart(d: Dispatch) {
    setExpandedId(d.id)
    setDepartureTime(nowLocal())
    setStartMileage('')
    setError('')
  }
  function openReturn(d: Dispatch) {
    setExpandedId(d.id)
    setReturnTime(nowLocal())
    setEndMileage('')
    setFuelLevel('full')
    setHasIssue(false)
    setIssueNote('')
    setReturnNote('')
    setError('')
  }

  async function submitDeparture(id: string) {
    if (!startMileage.trim()) { setError('Enter the starting odometer reading'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('dispatches').update({
      departure_time: new Date(departureTime).toISOString(),
      start_mileage_km: Number(startMileage),
      departed_by: session?.employee.id || null,
      status: 'in_progress',
    }).eq('id', id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setExpandedId(null)
    fetchData()
  }

  async function submitReturn(id: string) {
    if (!endMileage.trim()) { setError('Enter the ending odometer reading'); return }
    if (hasIssue && !issueNote.trim()) { setError('Describe the issue found'); return }
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('dispatches').update({
      return_time: new Date(returnTime).toISOString(),
      end_mileage_km: Number(endMileage),
      fuel_level_on_return: fuelLevel,
      has_issue: hasIssue,
      issue_note: hasIssue ? issueNote.trim() : null,
      note: returnNote.trim() || null,
      returned_by: session?.employee.id || null,
      status: 'completed',
    }).eq('id', id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setExpandedId(null)
    fetchData()
  }

  if (sessionLoading || !session || loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#93a4b6' }}>Loading…</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f1b28' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', background: '#16232f', borderBottom: '1px solid #26374a', position: 'sticky', top: 0 }}>
        <Link href="/" style={{ fontSize: 13, color: '#93a4b6', textDecoration: 'none' }}>← Back</Link>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#e9eef3' }}>My Dispatches</div>
      </header>

      <main style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>
        {dispatches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64798d', fontSize: 13.5 }}>No dispatches assigned to you yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dispatches.map((d) => {
              const expanded = expandedId === d.id
              const tripKm = d.start_mileage_km != null && d.end_mileage_km != null ? d.end_mileage_km - d.start_mileage_km : null
              return (
                <div key={d.id} style={{ background: '#16232f', border: '1px solid #26374a', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: '#e9eef3' }}>{truckPlate(d.truck_id)}</div>
                      <div style={{ fontSize: 12, color: '#64798d', marginTop: 2 }}>{d.dispatch_date}{d.destination ? ` · ${d.destination}` : ''}</div>
                    </div>
                    <span style={{
                      fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
                      background: d.status === 'completed' ? '#17301f' : d.status === 'in_progress' ? '#1c3352' : d.status === 'cancelled' ? '#2a2f3a' : '#2c3d4e',
                      color: d.status === 'completed' ? '#86d494' : d.status === 'in_progress' ? '#7fb2ff' : d.status === 'cancelled' ? '#93a4b6' : '#93a4b6',
                    }}>
                      {STATUS_LABEL[d.status]}
                    </span>
                  </div>

                  {d.status === 'completed' && (
                    <div style={{ marginTop: 10, fontSize: 12.5, color: '#93a4b6', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div>Out {d.departure_time ? new Date(d.departure_time).toLocaleString() : '—'} · {d.start_mileage_km ?? '—'} km</div>
                      <div>Back {d.return_time ? new Date(d.return_time).toLocaleString() : '—'} · {d.end_mileage_km ?? '—'} km{tripKm != null ? ` (${tripKm} km trip)` : ''}</div>
                      <div>Fuel on return: {d.fuel_level_on_return ? FUEL_LABEL[d.fuel_level_on_return] : '—'}</div>
                      {d.has_issue && <div style={{ color: '#f2977e' }}>Issue: {d.issue_note}</div>}
                    </div>
                  )}

                  {d.status === 'pending' && !expanded && (
                    <button onClick={() => openDepart(d)} style={{ marginTop: 10, width: '100%', padding: '9px', border: 'none', borderRadius: 8, background: '#c85a26', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                      Start Trip
                    </button>
                  )}
                  {d.status === 'in_progress' && !expanded && (
                    <>
                      <div style={{ marginTop: 10, fontSize: 12.5, color: '#93a4b6' }}>
                        Out {d.departure_time ? new Date(d.departure_time).toLocaleString() : '—'} · {d.start_mileage_km ?? '—'} km
                      </div>
                      <button onClick={() => openReturn(d)} style={{ marginTop: 8, width: '100%', padding: '9px', border: 'none', borderRadius: 8, background: '#c85a26', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                        Mark Returned
                      </button>
                    </>
                  )}

                  {expanded && d.status === 'pending' && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #26374a', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={fieldLabel}>Departure Time</label>
                        <input type="datetime-local" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} style={fieldInput} />
                      </div>
                      <div>
                        <label style={fieldLabel}>Starting Odometer (km)</label>
                        <input type="number" value={startMileage} onChange={(e) => setStartMileage(e.target.value)} style={fieldInput} placeholder="e.g. 84213" />
                      </div>
                      {error && <div style={{ color: '#f2977e', fontSize: 12.5 }}>{error}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setExpandedId(null)} style={{ flex: 1, padding: '9px', border: '1px solid #28394a', borderRadius: 8, background: 'none', color: '#93a4b6', fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => submitDeparture(d.id)} disabled={saving} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#c85a26', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Confirm Departure'}</button>
                      </div>
                    </div>
                  )}

                  {expanded && d.status === 'in_progress' && (
                    <div style={{ marginTop: 12, borderTop: '1px solid #26374a', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={fieldLabel}>Return Time</label>
                        <input type="datetime-local" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} style={fieldInput} />
                      </div>
                      <div>
                        <label style={fieldLabel}>Ending Odometer (km)</label>
                        <input type="number" value={endMileage} onChange={(e) => setEndMileage(e.target.value)} style={fieldInput} placeholder="e.g. 84350" />
                      </div>
                      <div>
                        <label style={fieldLabel}>Fuel Level on Return</label>
                        <select value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)} style={fieldInput}>
                          <option value="full">Full</option>
                          <option value="three_quarter">3/4</option>
                          <option value="half">1/2</option>
                          <option value="quarter">1/4</option>
                          <option value="empty">Empty</option>
                        </select>
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e9eef3', cursor: 'pointer' }}>
                        <input type="checkbox" checked={hasIssue} onChange={(e) => setHasIssue(e.target.checked)} />
                        Vehicle issue found
                      </label>
                      {hasIssue && (
                        <textarea value={issueNote} onChange={(e) => setIssueNote(e.target.value)} placeholder="What's wrong?" style={{ ...fieldInput, minHeight: 60 }} />
                      )}
                      <div>
                        <label style={fieldLabel}>Note (optional)</label>
                        <textarea value={returnNote} onChange={(e) => setReturnNote(e.target.value)} style={{ ...fieldInput, minHeight: 50 }} />
                      </div>
                      {error && <div style={{ color: '#f2977e', fontSize: 12.5 }}>{error}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setExpandedId(null)} style={{ flex: 1, padding: '9px', border: '1px solid #28394a', borderRadius: 8, background: 'none', color: '#93a4b6', fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={() => submitReturn(d.id)} disabled={saving} style={{ flex: 1, padding: '9px', border: 'none', borderRadius: 8, background: '#c85a26', color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>{saving ? 'Saving…' : 'Confirm Return'}</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

const fieldLabel: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase',
  color: '#64798d', marginBottom: 5,
}
const fieldInput: React.CSSProperties = {
  width: '100%', padding: '9px 11px', border: '1px solid #28394a', borderRadius: 8,
  fontSize: 14, background: '#101a24', color: '#e9eef3', outline: 'none', fontFamily: 'inherit',
}
