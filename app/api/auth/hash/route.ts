import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'

// Used by the Employees back-office page to hash a new password before
// writing it to employees.password_hash via the Supabase client. Only
// reachable by someone who already has the app open — the login route is
// the actual security boundary, this just keeps bcrypt off the client bundle.
export async function POST(req: Request) {
  const { password } = await req.json()
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required' }, { status: 400 })
  }
  const hashed = await bcrypt.hash(password, 10)
  return NextResponse.json({ hashed })
}
