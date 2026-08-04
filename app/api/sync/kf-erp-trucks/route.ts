import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Pulls active trucks (disable = 0) from kf-erp's zz_car_master and
// upserts them into this app's trucks table, matched on the stable
// kf_erp_aid identifier (kf-erp's own "aid" column) so re-running never
// creates duplicates. zz_car_master's dimensions are millimetres; this
// app's length_cm/width_cm/height_cm are centimetres, so values are
// divided by 10. A lot of kf-erp rows have incomplete or garbage
// dimension data (blank, or the literal text "cm") — those are imported
// with the dimension fields left null rather than skipped, same filtering
// kf-erp's own load calculator applies. car_type_label is unused in
// kf-erp's data today, so truck_type_id is always left for an admin to
// assign by hand afterwards.

type ErpCar = {
  aid: number
  car_number: string
  long_n: string | null
  wide_n: string | null
  high_n: string | null
  max_load_kg: number | null
  note: string | null
  disable: number
}

function parseMmToCm(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return n / 10
}

export async function POST() {
  const kfErpUrl = process.env.KFERP_SUPABASE_URL
  const kfErpKey = process.env.KFERP_SUPABASE_ANON_KEY
  if (!kfErpUrl || !kfErpKey) {
    return NextResponse.json({ error: 'kf-erp connection is not configured (KFERP_SUPABASE_URL / KFERP_SUPABASE_ANON_KEY)' }, { status: 500 })
  }
  const truckSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const truckSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  const kfErp = createClient(kfErpUrl, kfErpKey)
  const truck = createClient(truckSupabaseUrl, truckSupabaseKey)

  const { data: erpCars, error: carErr } = await kfErp
    .from('zz_car_master')
    .select('aid, car_number, long_n, wide_n, high_n, max_load_kg, note, disable')
    .eq('disable', 0)
    .not('aid', 'is', null)
    .returns<ErpCar[]>()
  if (carErr) {
    return NextResponse.json({ error: `Reading kf-erp trucks failed: ${carErr.message}` }, { status: 502 })
  }

  let inserted = 0
  let updated = 0
  let dimensionsIncomplete = 0
  const failures: string[] = []

  for (const c of erpCars || []) {
    const plateNo = c.car_number?.trim()
    if (!plateNo) continue

    const lengthCm = parseMmToCm(c.long_n)
    const widthCm = parseMmToCm(c.wide_n)
    const heightCm = parseMmToCm(c.high_n)
    const hasFullDims = lengthCm !== null && widthCm !== null && heightCm !== null
    if (!hasFullDims) dimensionsIncomplete += 1

    const payload = {
      plate_no: plateNo,
      length_cm: hasFullDims ? lengthCm : null,
      width_cm: hasFullDims ? widthCm : null,
      height_cm: hasFullDims ? heightCm : null,
      max_load_kg: c.max_load_kg || null,
      note: c.note || null,
      is_active: c.disable === 0,
      kf_erp_aid: c.aid,
      kf_erp_synced_at: new Date().toISOString(),
    }

    const { data: existing } = await truck.from('trucks').select('id').eq('kf_erp_aid', c.aid).maybeSingle()
    if (existing) {
      const { error } = await truck.from('trucks').update(payload).eq('id', existing.id)
      if (error) failures.push(`${plateNo}: ${error.message}`)
      else updated += 1
    } else {
      const { error } = await truck.from('trucks').insert([payload])
      if (error) failures.push(`${plateNo}: ${error.message}`)
      else inserted += 1
    }
  }

  return NextResponse.json({
    considered: erpCars?.length || 0,
    inserted,
    updated,
    dimensionsIncomplete,
    failures,
  })
}
