import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Pulls active employees from kf-erp's Supabase (read-only, its own public
// anon key) and upserts them into this app's departments / employees
// tables. Only employees in ALLOWED_KF_ERP_DEPARTMENTS are imported — kf-erp
// has no dedicated "Delivery"/"Driver" department, so this is the
// stand-in list of unit_ids that actually cover delivery/driving staff.
// Update it if that changes.
//
// employees.department is joined to erp_departments.unit_id in a single
// PostgREST query (via the FK embed) rather than fetched and matched by
// hand. Matches on stable identifiers (kf_erp_unit_id, employees.code) so
// re-running never creates duplicates. Truck-app-only fields — is_driver,
// group_id, username, password_hash — are never touched by this sync;
// they're left as-is on update, and default to "no access" on first
// insert so a newly-synced employee can't log in until an admin
// deliberately grants them a group and credentials.

const ALLOWED_KF_ERP_DEPARTMENTS = ['055'] // Logistics — the department covering delivery/driver staff

type ErpEmployee = {
  code: string
  full_name: string
  is_active: boolean
  department: string | null
  erp_departments: { unit_name: string } | null
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

  const { data: erpEmployees, error: empErr } = await kfErp
    .from('erp_employees')
    .select('code, full_name, is_active, department, erp_departments(unit_name)')
    .eq('is_active', true)
    .in('department', ALLOWED_KF_ERP_DEPARTMENTS)
    .returns<ErpEmployee[]>()
  if (empErr) {
    return NextResponse.json({ error: `Reading kf-erp employees failed: ${empErr.message}` }, { status: 502 })
  }

  const departmentIdByUnitId = new Map<string, string>()
  let departmentsSynced = 0

  for (const e of erpEmployees || []) {
    if (!e.department || departmentIdByUnitId.has(e.department)) continue
    const deptName = e.erp_departments?.unit_name
    if (!deptName) continue
    const { data, error } = await truck
      .from('departments')
      .upsert({ kf_erp_unit_id: e.department, name: deptName, is_active: true }, { onConflict: 'kf_erp_unit_id' })
      .select('id')
      .single()
    if (!error && data) {
      departmentsSynced += 1
      departmentIdByUnitId.set(e.department, data.id)
    }
  }

  let employeesInserted = 0
  let employeesUpdated = 0
  const failures: string[] = []

  for (const e of erpEmployees || []) {
    const { data: existing } = await truck.from('employees').select('id').eq('code', e.code).maybeSingle()
    const payload = {
      code: e.code,
      full_name: e.full_name,
      department_id: e.department ? departmentIdByUnitId.get(e.department) || null : null,
      is_active: e.is_active,
      kf_erp_synced_at: new Date().toISOString(),
    }
    if (existing) {
      const { error } = await truck.from('employees').update(payload).eq('id', existing.id)
      if (error) failures.push(`${e.code}: ${error.message}`)
      else employeesUpdated += 1
    } else {
      const { error } = await truck.from('employees').insert([payload])
      if (error) failures.push(`${e.code}: ${error.message}`)
      else employeesInserted += 1
    }
  }

  return NextResponse.json({
    departmentsSynced,
    employeesConsidered: erpEmployees?.length || 0,
    employeesInserted,
    employeesUpdated,
    failures,
  })
}
