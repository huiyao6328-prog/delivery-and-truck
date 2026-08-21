import { createClient } from '@supabase/supabase-js'

const MODEL = 'gemini-3.6-flash'
const SEVERITY_LABEL: Record<string, string> = { critical: '嚴重 (Critical)', moderate: '中等 (Moderate)', minor: '輕微 (Minor)' }

export async function classifySeverity(label: string, hint: string, category: string, apiKey: string) {
  const prompt = `You are helping a truck fleet safety manager classify how severe it is when a pre-trip vehicle inspection checklist item fails.

Checklist item: "${label}"
${category ? `Category: "${category}"\n` : ''}${hint ? `What to check: "${hint}"\n` : ''}
Classify how severe it is if a driver marks this item as an "issue" (failed) during a pre-trip inspection:
- "critical": the vehicle is unsafe to dispatch at all (e.g. brakes, steering, missing required safety equipment)
- "moderate": should be fixed soon but the vehicle can still be dispatched with caution
- "minor": cosmetic or low-risk, can wait until the next scheduled service

Respond with your classification.`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              severity: { type: 'STRING', enum: ['critical', 'moderate', 'minor'] },
              reason: { type: 'STRING' },
            },
            required: ['severity'],
          },
        },
      }),
    }
  )
  if (!res.ok) throw new Error(`Gemini request failed: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no classification')
  const parsed = JSON.parse(text) as { severity?: string; reason?: string }
  if (!parsed.severity || !['critical', 'moderate', 'minor'].includes(parsed.severity)) {
    throw new Error('Gemini returned an unrecognized severity')
  }
  return { severity: parsed.severity as 'critical' | 'moderate' | 'minor', reason: parsed.reason || null }
}

type Item = { id: string; category_id: string; label: string; hint: string | null; default_severity: string | null; is_active: boolean; truck_id: string | null }

// Runs the full AI-assisted checklist review: (1) re-classifies every active
// global checklist item's severity and flags disagreements with the saved
// default_severity, (2) diffs each truck's effective checklist (global
// items minus its exclusions, plus truck-specific items) against the
// previous run's snapshot to flag additions/removals. Writes one summary
// row to inspection_ai_reviews — report-only, never changes settings.
export async function runInspectionAiReview(triggeredBy: 'manual' | 'cron') {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const geminiKey = process.env.GEMINI_API_KEY
  const supabase = createClient(supabaseUrl, supabaseKey)

  const [{ data: categories }, { data: allItems }, { data: trucks }, { data: exclusions }, { data: lastReview }] = await Promise.all([
    supabase.from('inspection_categories').select('id, name'),
    supabase.from('inspection_items').select('id, category_id, label, hint, default_severity, is_active, truck_id'),
    supabase.from('trucks').select('id, plate_no').eq('is_active', true),
    supabase.from('truck_inspection_item_exclusions').select('truck_id, item_id'),
    supabase.from('inspection_ai_reviews').select('snapshot').order('run_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  const catName: Record<string, string> = Object.fromEntries((categories || []).map((c) => [c.id, c.name]))
  const items = (allItems || []) as Item[]
  const globalItems = items.filter((i) => !i.truck_id && i.is_active)
  const truckItems = items.filter((i) => i.truck_id && i.is_active)
  const itemLabel = (id: string) => items.find((i) => i.id === id)?.label || id

  // Check A: severity audit
  const severityMismatches: string[] = []
  if (geminiKey) {
    for (const item of globalItems) {
      try {
        const { severity } = await classifySeverity(item.label, item.hint || '', catName[item.category_id] || '', geminiKey)
        if (severity !== item.default_severity) {
          const current = item.default_severity ? SEVERITY_LABEL[item.default_severity] : '未設定'
          severityMismatches.push(`「${item.label}」（${catName[item.category_id] || ''}）：目前設定「${current}」，AI 這次建議「${SEVERITY_LABEL[severity]}」`)
        }
      } catch (err) {
        severityMismatches.push(`「${item.label}」：AI 覆核失敗（${err instanceof Error ? err.message : '未知錯誤'}）`)
      }
    }
  } else {
    severityMismatches.push('（Gemini 未設定 API Key，本次跳過嚴重度覆核）')
  }

  // Effective checklist per truck: global items minus this truck's
  // exclusions, plus items added just for this truck.
  const exclusionsByTruck: Record<string, Set<string>> = {}
  ;(exclusions || []).forEach((e) => {
    exclusionsByTruck[e.truck_id] = exclusionsByTruck[e.truck_id] || new Set()
    exclusionsByTruck[e.truck_id].add(e.item_id)
  })
  const truckItemsByTruck: Record<string, string[]> = {}
  truckItems.forEach((i) => {
    truckItemsByTruck[i.truck_id!] = truckItemsByTruck[i.truck_id!] || []
    truckItemsByTruck[i.truck_id!].push(i.id)
  })
  const checklistByTruck: Record<string, string[]> = {}
  ;(trucks || []).forEach((t) => {
    const excluded = exclusionsByTruck[t.id] || new Set()
    checklistByTruck[t.id] = [
      ...globalItems.filter((i) => !excluded.has(i.id)).map((i) => i.id),
      ...(truckItemsByTruck[t.id] || []),
    ].sort()
  })

  // Check B: diff against the previous run's snapshot
  const prevSnapshot = lastReview?.snapshot as { checklistByTruck?: Record<string, string[]> } | undefined
  const checklistChanges: string[] = []
  if (prevSnapshot?.checklistByTruck) {
    for (const t of trucks || []) {
      const prev = new Set(prevSnapshot.checklistByTruck[t.id] || [])
      const curr = new Set(checklistByTruck[t.id] || [])
      const added = [...curr].filter((id) => !prev.has(id))
      const removed = [...prev].filter((id) => !curr.has(id))
      if (added.length || removed.length) {
        const parts: string[] = []
        if (added.length) parts.push(`新增 ${added.length} 項（${added.map(itemLabel).join('、')}）`)
        if (removed.length) parts.push(`移除 ${removed.length} 項（${removed.map(itemLabel).join('、')}）`)
        checklistChanges.push(`${t.plate_no}：${parts.join('，')}`)
      }
    }
  } else {
    checklistChanges.push('（初次執行，尚無歷史資料可比對車輛檢查項目異動）')
  }

  const runAt = new Date()
  const summary = [
    `執行時間：${runAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}（${triggeredBy === 'cron' ? '每月自動執行' : '手動執行'}）`,
    '',
    '【嚴重度建議覆核】',
    severityMismatches.length ? severityMismatches.map((l) => `- ${l}`).join('\n') : '- 所有項目的嚴重度設定皆與 AI 建議一致，無需調整。',
    '',
    '【車輛檢查項目異動】',
    checklistChanges.length ? checklistChanges.map((l) => `- ${l}`).join('\n') : '- 沒有車輛的檢查項目有異動。',
  ].join('\n')

  const { data: inserted, error } = await supabase
    .from('inspection_ai_reviews')
    .insert([{
      run_at: runAt.toISOString(),
      triggered_by: triggeredBy,
      summary,
      snapshot: { checklistByTruck },
    }])
    .select()
    .single()

  if (error) throw new Error(error.message)
  return inserted
}
