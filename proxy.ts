import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// First line of defence for the back office: a marker cookie set at login
// (see app/login/page.tsx). The real permission payload lives in
// localStorage and is checked client-side by useSession()/AdminLayout —
// this only stops a signed-out browser from ever rendering an /admin page.
export function proxy(req: NextRequest) {
  const authed = req.cookies.get('truck_auth')?.value === '1'
  if (!authed) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', req.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
