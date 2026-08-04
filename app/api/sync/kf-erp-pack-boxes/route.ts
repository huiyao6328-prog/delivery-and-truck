import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Pulls active carton types (disable = 0) from kf-erp's
// zz_pack_box_size_master and upserts them into this app's pack_boxes
// table, matched on the stable kf_erp_box_id identifier so re-running
// never creates duplicates. zz_pack_box_size_master's dimensions are
// millimetres; this app's length_cm/width_cm/height_cm are centimetres,
// so values are divided by 10.

type ErpBox = {
  _id: number
  box_name_id: string | null
  box_long: number | null
  box_width: number | null
  box_height: number | null
  box_weight: number | null
  gross_weight: number | null
  packing_qty: number | null
  packing_qty_unit: string | null
  disable: number
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

  const { data: erpBoxes, error: boxErr } = await kfErp
    .from('zz_pack_box_size_master')
    .select('_id, box_name_id, box_long, box_width, box_height, box_weight, gross_weight, packing_qty, packing_qty_unit, disable')
    .eq('disable', 0)
    .returns<ErpBox[]>()
  if (boxErr) {
    return NextResponse.json({ error: `Reading kf-erp carton types failed: ${boxErr.message}` }, { status: 502 })
  }

  let inserted = 0
  let updated = 0
  let dimensionsIncomplete = 0
  const failures: string[] = []

  for (const b of erpBoxes || []) {
    const name = b.box_name_id?.trim()
    if (!name) continue

    const lengthCm = b.box_long ? b.box_long / 10 : null
    const widthCm = b.box_width ? b.box_width / 10 : null
    const heightCm = b.box_height ? b.box_height / 10 : null
    const hasFullDims = !!(lengthCm && widthCm && heightCm)
    if (!hasFullDims) dimensionsIncomplete += 1

    const payload = {
      name,
      length_cm: hasFullDims ? lengthCm : null,
      width_cm: hasFullDims ? widthCm : null,
      height_cm: hasFullDims ? heightCm : null,
      weight_kg: b.box_weight || null,
      gross_weight_kg: b.gross_weight || null,
      packing_qty: b.packing_qty || null,
      packing_qty_unit: b.packing_qty_unit || null,
      is_active: b.disable === 0,
      kf_erp_box_id: b._id,
      kf_erp_synced_at: new Date().toISOString(),
    }

    const { data: existing } = await truck.from('pack_boxes').select('id').eq('kf_erp_box_id', b._id).maybeSingle()
    if (existing) {
      const { error } = await truck.from('pack_boxes').update(payload).eq('id', existing.id)
      if (error) failures.push(`${name}: ${error.message}`)
      else updated += 1
    } else {
      const { error } = await truck.from('pack_boxes').insert([payload])
      if (error) failures.push(`${name}: ${error.message}`)
      else inserted += 1
    }
  }

  return NextResponse.json({
    considered: erpBoxes?.length || 0,
    inserted,
    updated,
    dimensionsIncomplete,
    failures,
  })
}
