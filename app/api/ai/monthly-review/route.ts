import { NextResponse } from 'next/server'
import { runInspectionAiReview } from '@/lib/inspectionAiReview'

// Manual trigger for the same review the monthly cron job runs — the
// "Run AI Review Now" button on Inspection Settings.
export async function POST() {
  try {
    const review = await runInspectionAiReview('manual')
    return NextResponse.json({ review })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Review failed' }, { status: 500 })
  }
}
