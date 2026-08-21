'use client'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'

type Truck = { id: string; plate_no: string }
type Transaction = {
  id: string
  truck_id: string | null
  plate_raw: string
  transaction_date: string
  quantity_litres: number
  amount_inc_vat: number
  unit_price_ex_vat: number | null
}

type ShellRow = {
  Plate?: string
  Date?: string
  Time?: string
  Location?: string
  ReceiptNumber?: number | string
  Km?: number
  Product?: number | string
  QuantityLitres?: number
  UnitPriceExVat?: number
  VatAmount?: number
  AmountExVat?: number
  AmountIncVat?: number
}

function normalizePlate(p: string) {
  return p.replace(/\s+/g, '').toUpperCase()
}

export default function FuelCostsPage() {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<{ imported: number; duplicates: number; unmatched: { plate: string; count: number }[] } | null>(null)
  const [importError, setImportError] = useState('')

  const [monthFilter, setMonthFilter] = useState('')
  const [truckFilter, setTruckFilter] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: t }, { data: tx }] = await Promise.all([
      supabase.from('trucks').select('id, plate_no').order('plate_no'),
      supabase.from('fuel_transactions').select('id, truck_id, plate_raw, transaction_date, quantity_litres, amount_inc_vat, unit_price_ex_vat').order('transaction_date', { ascending: false }),
    ])
    setTrucks(t || [])
    setTransactions(tx || [])
    setLoading(false)
  }

  function truckPlate(id: string | null) { return id ? trucks.find((t) => t.id === id)?.plate_no || '—' : '—' }

  async function handleFile(file: File) {
    setImporting(true)
    setImportError('')
    setImportSummary(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheet = wb.Sheets['Sheet1'] || wb.Sheets[wb.SheetNames[0]]
      if (!sheet) throw new Error('Could not find a data sheet in this file')
      const rows = XLSX.utils.sheet_to_json<ShellRow>(sheet, { defval: null })

      const plateMap = new Map(trucks.map((t) => [normalizePlate(t.plate_no), t.id]))
      const unmatchedCounts = new Map<string, number>()
      const importBatch = `${file.name}-${new Date().toISOString()}`

      const payload = rows
        .filter((r) => r.Plate && r.ReceiptNumber != null && r.QuantityLitres != null)
        .map((r) => {
          const plateRaw = String(r.Plate).trim()
          const truckId = plateMap.get(normalizePlate(plateRaw)) || null
          if (!truckId) unmatchedCounts.set(plateRaw, (unmatchedCounts.get(plateRaw) || 0) + 1)
          return {
            truck_id: truckId,
            plate_raw: plateRaw,
            transaction_date: r.Date || null,
            transaction_time: r.Time ? String(r.Time) : null,
            location: r.Location || null,
            receipt_number: String(r.ReceiptNumber),
            odometer_km: r.Km ?? null,
            product_code: r.Product != null ? String(r.Product) : null,
            quantity_litres: r.QuantityLitres,
            unit_price_ex_vat: r.UnitPriceExVat ?? null,
            vat_amount: r.VatAmount ?? null,
            amount_ex_vat: r.AmountExVat ?? null,
            amount_inc_vat: r.AmountIncVat ?? 0,
            import_batch: importBatch,
          }
        })

      if (payload.length === 0) throw new Error('No usable rows found — check this is the Shell statement export')

      // Count how many receipt numbers already exist, to report duplicates skipped.
      const receiptNumbers = payload.map((p) => p.receipt_number)
      const existing = new Set<string>()
      for (let i = 0; i < receiptNumbers.length; i += 200) {
        const chunk = receiptNumbers.slice(i, i + 200)
        const { data } = await supabase.from('fuel_transactions').select('receipt_number').in('receipt_number', chunk)
        ;(data || []).forEach((d) => existing.add(d.receipt_number))
      }

      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200)
        const { error } = await supabase.from('fuel_transactions').upsert(chunk, { onConflict: 'receipt_number', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
      }

      setImportSummary({
        imported: payload.length - existing.size,
        duplicates: existing.size,
        unmatched: [...unmatchedCounts.entries()].map(([plate, count]) => ({ plate, count })),
      })
      fetchAll()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function assignUnmatchedPlate(plateRaw: string, truckId: string) {
    await supabase.from('fuel_transactions').update({ truck_id: truckId }).eq('plate_raw', plateRaw).is('truck_id', null)
    setImportSummary((prev) => prev ? { ...prev, unmatched: prev.unmatched.filter((u) => u.plate !== plateRaw) } : prev)
    fetchAll()
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (monthFilter && !t.transaction_date.startsWith(monthFilter)) return false
      if (truckFilter && t.truck_id !== truckFilter) return false
      return true
    })
  }, [transactions, monthFilter, truckFilter])

  const summaryByTruck = useMemo(() => {
    const map: Record<string, { liters: number; cost: number; count: number }> = {}
    filteredTransactions.forEach((t) => {
      const key = t.truck_id || `unmatched:${t.plate_raw}`
      map[key] = map[key] || { liters: 0, cost: 0, count: 0 }
      map[key].liters += t.quantity_litres
      map[key].cost += t.amount_inc_vat
      map[key].count += 1
    })
    return Object.entries(map)
      .map(([key, v]) => ({
        key,
        label: key.startsWith('unmatched:') ? `${key.slice(10)} (unmatched)` : truckPlate(key),
        ...v,
        avgPrice: v.liters > 0 ? v.cost / v.liters : 0,
      }))
      .sort((a, b) => b.cost - a.cost)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTransactions, trucks])

  const months = useMemo(() => [...new Set(transactions.map((t) => t.transaction_date.slice(0, 7)))].sort().reverse(), [transactions])

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Fuel & Cost</div>
          <div className="page-sub">{transactions.length} transaction(s) imported from Shell fuel card statements</div>
        </div>
        <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
          {importing ? 'Importing…' : '⬆ Upload Statement'}
          <input type="file" accept=".xlsx,.xls" hidden disabled={importing} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        </label>
      </div>

      {importError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13, background: '#34201a', color: '#f2977e', border: '1px solid #4a2e25' }}>
          {importError}
        </div>
      )}

      {importSummary && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#e9eef3', marginBottom: 10 }}>Import Result</div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13.5, color: '#cdd8e3', marginBottom: importSummary.unmatched.length ? 14 : 0 }}>
            <div><b style={{ color: '#86d494' }}>{importSummary.imported}</b> imported</div>
            <div><b style={{ color: '#93a4b6' }}>{importSummary.duplicates}</b> already imported (skipped)</div>
            {importSummary.unmatched.length > 0 && <div><b style={{ color: '#f2977e' }}>{importSummary.unmatched.length}</b> unmatched plate(s)</div>}
          </div>
          {importSummary.unmatched.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {importSummary.unmatched.map((u) => (
                <div key={u.plate} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                  <span className="mono" style={{ fontFamily: 'var(--font-mono)', color: '#e9eef3', minWidth: 100 }}>{u.plate}</span>
                  <span style={{ color: '#64798d' }}>{u.count} row(s)</span>
                  <select className="form-select" style={{ width: 200 }} defaultValue="" onChange={(e) => { if (e.target.value) assignUnmatchedPlate(u.plate, e.target.value) }}>
                    <option value="">Assign to truck…</option>
                    {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <select className="form-select" style={{ width: 150 }} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
          <option value="">All months</option>
          {months.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className="form-select" style={{ width: 170 }} value={truckFilter} onChange={(e) => setTruckFilter(e.target.value)}>
          <option value="">All trucks</option>
          {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}</option>)}
        </select>
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : summaryByTruck.length === 0 ? (
          <div className="empty-state">No fuel transactions yet — upload a Shell statement to get started.</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Truck</th><th>Transactions</th><th>Total Liters</th><th>Total Cost (₱)</th><th>Avg ₱/Liter</th></tr></thead>
              <tbody>
                {summaryByTruck.map((s) => (
                  <tr key={s.key}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.key.startsWith('unmatched:') ? '#f2977e' : undefined }}>{s.label}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.count}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.liters.toFixed(1)}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: '#93a4b6' }}>{s.avgPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: '#64798d', marginTop: 10 }}>
        Odometer readings in the source statement aren&apos;t always recorded (some rows show 0), so km/liter efficiency isn&apos;t shown yet — totals only until we&apos;ve seen a few months of consistent data.
      </div>
    </AdminLayout>
  )
}
