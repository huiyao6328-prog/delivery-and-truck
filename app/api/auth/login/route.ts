import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// In-memory login throttle (resets on server restart) — same policy as the
// sister tcsp-website project.
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>()
const MAX_ATTEMPTS = 5
const LOCK_DURATION = 15 * 60 * 1000

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Enter a username and password' }, { status: 400 })
  }

  const attempt = loginAttempts.get(ip)
  if (attempt) {
    const timeSinceLast = Date.now() - attempt.lastAttempt
    if (attempt.count >= MAX_ATTEMPTS && timeSinceLast < LOCK_DURATION) {
      const remainingMinutes = Math.ceil((LOCK_DURATION - timeSinceLast) / 60000)
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${remainingMinutes} minute(s).` },
        { status: 429 }
      )
    }
    if (timeSinceLast >= LOCK_DURATION) loginAttempts.delete(ip)
  }

  const { data: employee, error } = await supabase
    .from('employees')
    .select('id, code, full_name, department_id, group_id, is_driver, is_active, username, password_hash')
    .eq('username', username)
    .single()

  const fail = () => {
    const current = loginAttempts.get(ip) || { count: 0, lastAttempt: 0 }
    loginAttempts.set(ip, { count: current.count + 1, lastAttempt: Date.now() })
    return NextResponse.json({ error: 'Incorrect username or password' }, { status: 401 })
  }

  if (error || !employee || !employee.is_active || !employee.password_hash) {
    return fail()
  }

  const isMatch = await bcrypt.compare(password, employee.password_hash)
  if (!isMatch) return fail()

  loginAttempts.delete(ip)

  let groupFunctions: { function_code: string; access_level: string }[] = []
  if (employee.group_id) {
    const { data } = await supabase
      .from('permission_group_functions')
      .select('function_code, access_level')
      .eq('group_id', employee.group_id)
    groupFunctions = data || []
  }

  await supabase.from('employees').update({ last_login_at: new Date().toISOString() }).eq('id', employee.id)

  return NextResponse.json({
    employee: {
      id: employee.id,
      code: employee.code,
      full_name: employee.full_name,
      department_id: employee.department_id,
      group_id: employee.group_id,
      is_driver: employee.is_driver,
    },
    groupFunctions,
  })
}
