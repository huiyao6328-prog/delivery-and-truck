import { NextResponse } from 'next/server'
import { classifySeverity } from '@/lib/inspectionAiReview'

// Suggests a default severity (critical/moderate/minor) for an inspection
// checklist item template, using Gemini. Called from the Inspection
// Settings item modal's "AI Suggest" button — the result just pre-fills a
// dropdown the admin can still override before saving. Server-side only:
// GEMINI_API_KEY is never exposed to the browser bundle.

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini is not configured (GEMINI_API_KEY missing)' }, { status: 500 })
  }

  const { label, hint, category } = await req.json()
  if (!label || typeof label !== 'string') {
    return NextResponse.json({ error: 'label is required' }, { status: 400 })
  }

  try {
    const { severity, reason } = await classifySeverity(label, hint || '', category || '', apiKey)
    return NextResponse.json({ severity, reason })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gemini request failed' }, { status: 502 })
  }
}
