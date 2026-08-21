'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useSession } from '@/lib/useSession'

type Truck = { id: string; plate_no: string; owner_id: string | null }
type TruckOwner = { id: string; name: string; is_default: boolean }

function nowLocal() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function NewAccidentPage() {
  const router = useRouter()
  const { session, loading: sessionLoading } = useSession()
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [owners, setOwners] = useState<TruckOwner[]>([])
  const [loading, setLoading] = useState(true)

  const [ownerId, setOwnerId] = useState('')
  const [truckId, setTruckId] = useState('')
  const [occurredAt, setOccurredAt] = useState(nowLocal())
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [stoppedSafely, setStoppedSafely] = useState(false)
  const [ensuredSafety, setEnsuredSafety] = useState(false)
  const [notifiedManager, setNotifiedManager] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { if (session) fetchTrucks() }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchTrucks() {
    const [{ data: t }, { data: o }] = await Promise.all([
      supabase.from('trucks').select('id, plate_no, owner_id').eq('is_active', true).order('plate_no'),
      supabase.from('truck_owners').select('id, name, is_default').eq('is_active', true).order('name'),
    ])
    setTrucks(t || [])
    setOwners(o || [])
    const defaultOwner = (o || []).find((x) => x.is_default)
    if (defaultOwner) setOwnerId(defaultOwner.id)
    setLoading(false)
  }

  async function uploadPhoto(file: File) {
    setUploadingPhoto(true)
    const ext = file.name.split('.').pop() || 'jpg'
    const path = `accident-${Date.now()}.${ext}`
    const { error: err } = await supabase.storage.from('inspection-photos').upload(path, file)
    if (err) { setUploadingPhoto(false); return }
    const { data } = supabase.storage.from('inspection-photos').getPublicUrl(path)
    setPhotoUrl(data.publicUrl)
    setUploadingPhoto(false)
  }

  const filteredTrucks = ownerId ? trucks.filter((t) => t.owner_id === ownerId) : trucks

  function handleOwnerChange(id: string) {
    setOwnerId(id)
    if (truckId && !trucks.some((t) => t.id === truckId && t.owner_id === id)) setTruckId('')
  }

  async function handleSubmit() {
    if (!session) return
    if (!truckId) { setError('Select which truck was involved'); return }
    if (!description.trim()) { setError('Describe what happened'); return }
    setSubmitting(true)
    setError('')
    const { data, error: err } = await supabase
      .from('accident_reports')
      .insert([{
        truck_id: truckId,
        driver_id: session.employee.id,
        occurred_at: new Date(occurredAt).toISOString(),
        location: location.trim() || null,
        description: description.trim(),
        photo_url: photoUrl || null,
        stopped_safely: stoppedSafely,
        ensured_safety: ensuredSafety,
        notified_manager: notifiedManager,
      }])
      .select('id')
      .single()
    setSubmitting(false)
    if (err || !data) { setError(err?.message || 'Could not submit — try again'); return }
    router.push(`/accident/${data.id}`)
  }

  if (sessionLoading || !session || loading) {
    return <div className="an-loading">Loading…</div>
  }

  return (
    <div className="an-app">
      <header className="an-header">
        <Link href="/accident" className="an-back">← Accident Reports</Link>
        <div className="an-title">Report an Accident</div>
        <div className="an-sub">Fill this in as soon as it's safe to do so — the time between the accident and this report matters.</div>
      </header>

      <main className="an-main">
        <div className="an-field">
          <label>Truck Owner</label>
          <select value={ownerId} onChange={(e) => handleOwnerChange(e.target.value)}>
            <option value="">All owners</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div className="an-field">
          <label>Truck *</label>
          <select value={truckId} onChange={(e) => setTruckId(e.target.value)}>
            <option value="">Select truck…</option>
            {filteredTrucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
          </select>
        </div>
        <div className="an-field">
          <label>When did it happen? *</label>
          <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
        </div>
        <div className="an-field">
          <label>Location</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. EDSA near Ayala Ave" />
        </div>
        <div className="an-field">
          <label>What happened? *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the accident" />
        </div>
        <div className="an-field">
          <label>Photo</label>
          {photoUrl ? (
            <img src={photoUrl} alt="" className="an-photo" />
          ) : (
            <label className="an-upload-btn">
              {uploadingPhoto ? 'Uploading…' : '📷 Add Photo'}
              <input type="file" accept="image/*" capture="environment" hidden disabled={uploadingPhoto}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f) }} />
            </label>
          )}
        </div>

        <div className="an-checklist">
          <div className="an-checklist-title">At the scene</div>
          <label className="an-check"><input type="checkbox" checked={stoppedSafely} onChange={(e) => setStoppedSafely(e.target.checked)} /> I stopped the vehicle safely</label>
          <label className="an-check"><input type="checkbox" checked={ensuredSafety} onChange={(e) => setEnsuredSafety(e.target.checked)} /> I made sure everyone was safe</label>
          <label className="an-check"><input type="checkbox" checked={notifiedManager} onChange={(e) => setNotifiedManager(e.target.checked)} /> I notified my supervisor</label>
        </div>

        {error && <div className="an-error">{error}</div>}
        <button className="an-submit" disabled={submitting} onClick={handleSubmit}>{submitting ? 'Submitting…' : 'Submit Report'}</button>
      </main>

      <style jsx>{`
        .an-app { max-width: 560px; margin: 0 auto; min-height: 100vh; background: #0f1b28; }
        .an-loading { min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #93a4b6; font-size: 14px; }
        .an-header { position: sticky; top: 0; z-index: 20; background: #16232f; border-bottom: 1px solid #26374a; padding: 14px 16px; }
        .an-back { font-size: 12.5px; color: #93a4b6; text-decoration: none; }
        .an-back:hover { color: #e9eef3; }
        .an-title { font-size: 18px; font-weight: 700; color: #e9eef3; margin-top: 6px; }
        .an-sub { font-size: 12px; color: #f2977e; margin-top: 4px; }
        .an-main { padding: 16px 14px 40px; display: flex; flex-direction: column; gap: 16px; }
        .an-field label { display: block; font-size: 12.5px; font-weight: 700; color: #93a4b6; margin-bottom: 6px; }
        .an-field select, .an-field input, .an-field textarea {
          width: 100%; font-size: 14px; color: #e9eef3; background: #16232f; border: 1px solid #28394a; border-radius: 8px; padding: 10px 12px; font-family: inherit;
        }
        .an-field textarea { min-height: 90px; resize: vertical; line-height: 1.5; }
        .an-photo { width: 100%; max-width: 240px; border-radius: 8px; border: 1px solid #26374a; }
        .an-upload-btn { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #ffb6c1; border: 1px dashed #6b3652; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
        .an-checklist { background: #16232f; border: 1px solid #26374a; border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
        .an-checklist-title { font-size: 12.5px; font-weight: 700; color: #93a4b6; margin-bottom: 2px; }
        .an-check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; color: #e9eef3; }
        .an-error { color: #f2977e; font-size: 13px; }
        .an-submit { border: none; border-radius: 8px; padding: 13px; font-size: 14.5px; font-weight: 700; background: #c85a26; color: #fff; cursor: pointer; }
        .an-submit:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  )
}
