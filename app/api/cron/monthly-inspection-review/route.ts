import { NextResponse } from 'next/server'
import { runInspectionAiReview } from '@/lib/inspectionAiReview'

// Hit by Vercel Cron once a month (see vercel.json). Vercel automatically
// sends "Authorization: Bearer $CRON_SECRET" on scheduled invocations when
// CRON_SECRET is set as an env var — this route rejects anything else so
// it can't be triggered by a random request.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const review = await runInspectionAiReview('cron')
    return NextResponse.json({ review })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Review failed' }, { status: 500 })
  }
}
