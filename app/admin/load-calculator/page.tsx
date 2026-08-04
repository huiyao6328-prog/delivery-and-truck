'use client'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import AdminLayout from '@/components/admin/AdminLayout'
import { useSession } from '@/lib/useSession'

// Ported from kf-erp's src/app/(dashboard)/vehicle/calculator (a real,
// in-use feature there) — same math, adapted to this app's own trucks /
// pack_boxes tables and centimetres throughout (kf-erp's zz_car_master /
// zz_pack_box_size_master are millimetres; this app's trucks table is
// already centimetres).

type Truck = {
  id: string
  plate_no: string
  truck_type_id: string | null
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  max_load_kg: number | null
  is_active: boolean
}
type TruckType = { id: string; name: string }
type PackBox = {
  id: string
  name: string
  length_cm: number | null
  width_cm: number | null
  height_cm: number | null
  weight_kg: number | null
  gross_weight_kg: number | null
  packing_qty: number | null
  packing_qty_unit: string | null
}
type Row = { key: number; boxId: string | null; qty: string }

let rowKeySeq = 1

function truckHasValidDims(t: Truck): boolean {
  const w = Number(t.width_cm), l = Number(t.length_cm), h = Number(t.height_cm)
  return Number.isFinite(w) && w > 0 && Number.isFinite(l) && l > 0 && Number.isFinite(h) && h > 0
}
function getPackingQty(box: PackBox): number {
  const pq = Number(box.packing_qty)
  return Number.isFinite(pq) && pq > 0 ? pq : 1
}
function getUnitWeight(box: PackBox): number {
  return box.weight_kg || box.gross_weight_kg || 0
}

// Best single axis-aligned orientation for this carton on the cargo floor
// (length/width may be swapped, height is fixed), plus how many layers of
// it can stack to the cargo box's height.
function bestOrientation(truck: Truck, box: PackBox) {
  const w = Number(truck.width_cm), l = Number(truck.length_cm), h = Number(truck.height_cm)
  const bw = box.width_cm ?? 0, bl = box.length_cm ?? 0, bh = box.height_cm ?? 0
  const rowsA = Math.floor(w / bw), colsA = Math.floor(l / bl), countA = rowsA * colsA
  const rowsB = Math.floor(w / bl), colsB = Math.floor(l / bw), countB = rowsB * colsB
  const footW = countA >= countB ? bw : bl
  const footL = countA >= countB ? bl : bw
  const layers = Math.floor(h / bh)
  return { possible: (countA > 0 || countB > 0) && layers > 0, footW, footL, layers, layersOk: layers > 0 }
}

interface FitItem { box: PackBox; qty: number }
interface FitPerProduct {
  box: PackBox; qty: number; packingQty: number; unitQty: number; possible: boolean
  reason?: string; layers?: number; columnsNeeded?: number; areaNeeded?: number
}
interface FitResult {
  fits: boolean; usedArea: number; totalArea: number; ratio: number
  totalBoxes: number; totalUnits: number; perProduct: FitPerProduct[]
}

// Floor-area estimate: each product stacks in its own columns (using its
// best single orientation); columns needed x footprint area is summed
// across products and compared to the cargo floor area. Not a full 3D
// packing optimizer, but a much better approximation than raw volume when
// mixing different carton types than assuming they interlock perfectly.
function checkFit(truck: Truck, items: FitItem[]): FitResult {
  const w = Number(truck.width_cm), l = Number(truck.length_cm)
  const totalArea = w * l
  let usedArea = 0, fits = true, totalBoxes = 0, totalUnits = 0
  const perProduct = items.map(({ box, qty }): FitPerProduct => {
    const packingQty = getPackingQty(box)
    const unitQty = qty * packingQty
    totalBoxes += qty
    totalUnits += unitQty
    const o = bestOrientation(truck, box)
    if (!o.possible) {
      fits = false
      return { box, qty, packingQty, unitQty, possible: false, reason: !o.layersOk ? 'Carton height exceeds cargo box height' : "Carton footprint doesn't fit the cargo floor" }
    }
    const columnsNeeded = Math.ceil(qty / o.layers)
    const areaNeeded = columnsNeeded * o.footW * o.footL
    usedArea += areaNeeded
    return { box, qty, packingQty, unitQty, possible: true, layers: o.layers, columnsNeeded, areaNeeded }
  })
  if (usedArea > totalArea) fits = false
  return { fits, usedArea, totalArea, ratio: totalArea ? usedArea / totalArea : 0, totalBoxes, totalUnits, perProduct }
}

// Tab 1: maximum capacity of a single carton type in a single truck --
// floor grid (rows x cols) x stacked layers, with the exact numbers the
// top/side-view diagrams are drawn from.
interface CapacityResult {
  rows: number; cols: number; footprint: number; footW: number; footL: number; bh: number
  layers: number; total: number; truckW: number; truckL: number; truckH: number
  fits: boolean; reason: string; packingQty: number; totalUnits: number
}
function computeForBox(truck: Truck, box: PackBox): CapacityResult | null {
  const w = Number(truck.width_cm), l = Number(truck.length_cm), h = Number(truck.height_cm)
  const bw = box.width_cm ?? 0, bl = box.length_cm ?? 0, bh = box.height_cm ?? 0
  if (!bw || !bl || !bh) return null

  const rowsA = Math.floor(w / bw), colsA = Math.floor(l / bl), countA = rowsA * colsA
  const rowsB = Math.floor(w / bl), colsB = Math.floor(l / bw), countB = rowsB * colsB
  let rows: number, cols: number, footW: number, footL: number
  if (countA >= countB) { rows = rowsA; cols = colsA; footW = bw; footL = bl } else { rows = rowsB; cols = colsB; footW = bl; footL = bw }

  const layers = Math.floor(h / bh)
  const footprint = rows * cols
  const total = footprint * layers

  let fits = true, reason = ''
  if (footprint <= 0) { fits = false; reason = "Carton footprint doesn't fit the cargo floor in either orientation" }
  else if (layers <= 0) { fits = false; reason = 'Carton height exceeds cargo box height, cannot stack' }

  const packingQty = getPackingQty(box)
  return { rows, cols, footprint, footW, footL, bh, layers, total, truckW: w, truckL: l, truckH: h, fits, reason, packingQty, totalUnits: total * packingQty }
}

interface CostRow { box: PackBox; qty: number; unitWeight: number; unitVolumeL: number; avgPrice: number; volumePrice: number; weightPrice: number }
function computeCostBreakdown(items: FitItem[], totalPrice: number): CostRow[] {
  const totalQty = items.reduce((s, i) => s + i.qty, 0)
  const totalVolume = items.reduce((s, i) => s + (i.box.length_cm ?? 0) * (i.box.width_cm ?? 0) * (i.box.height_cm ?? 0) * i.qty, 0)
  const totalWeight = items.reduce((s, i) => s + getUnitWeight(i.box) * i.qty, 0)

  return items.map(({ box, qty }) => {
    const unitVolumeCm3 = (box.length_cm ?? 0) * (box.width_cm ?? 0) * (box.height_cm ?? 0)
    const unitWeight = getUnitWeight(box)
    const rowVolume = unitVolumeCm3 * qty
    const rowWeight = unitWeight * qty
    const avgPrice = totalQty ? totalPrice / totalQty : 0
    const volumePrice = totalVolume && qty ? (totalPrice * (rowVolume / totalVolume)) / qty : 0
    const weightPrice = totalWeight && qty ? (totalPrice * (rowWeight / totalWeight)) / qty : 0
    return { box, qty, unitWeight, unitVolumeL: unitVolumeCm3 / 1000, avgPrice, volumePrice, weightPrice }
  })
}

function exportCostBreakdown(costRows: CostRow[], label: string) {
  const data = costRows.map((r) => ({
    Carton: r.box.name,
    Qty: r.qty,
    'Weight/carton (kg)': r.unitWeight || '',
    'Volume/carton (L)': r.unitVolumeL.toFixed(2),
    'Avg Price/carton': r.avgPrice.toFixed(2),
    'Volume-based Price/carton': r.volumePrice.toFixed(2),
    'Weight-based Price/carton': r.weightPrice.toFixed(2),
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cost Breakdown')
  const safe = (label || 'load').replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
  XLSX.writeFile(wb, `carton_cost_breakdown_${safe}.xlsx`)
}

interface SavedItem { box_name: string; qty: number; unit_weight: number; unit_volume_l: number; avg_price: number; volume_price: number; weight_price: number }
function toSavedItem(r: CostRow): SavedItem {
  return { box_name: r.box.name, qty: r.qty, unit_weight: r.unitWeight, unit_volume_l: r.unitVolumeL, avg_price: r.avgPrice, volume_price: r.volumePrice, weight_price: r.weightPrice }
}

interface CalcRecord { id: string; created_at: string; mode: 'single' | 'plan'; truck_plate_no: string | null; total_price: number | null; items: SavedItem[] }

export default function LoadCalculatorPage() {
  const { session } = useSession()
  const [tab, setTab] = useState<'single' | 'plan'>('single')
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [truckTypes, setTruckTypes] = useState<TruckType[]>([])
  const [boxes, setBoxes] = useState<PackBox[]>([])
  const [loading, setLoading] = useState(true)
  const [historyRefresh, setHistoryRefresh] = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('trucks').select('*').order('plate_no'),
      supabase.from('truck_types').select('id, name'),
      supabase.from('pack_boxes').select('*').eq('is_active', true).order('name'),
    ]).then(([t, ty, b]) => {
      setTrucks((t.data || []).filter((row: Truck) => row.is_active))
      setTruckTypes(ty.data || [])
      setBoxes(b.data || [])
      setLoading(false)
    })
  }, [])

  function truckTypeLabel(t: Truck) {
    return truckTypes.find((ty) => ty.id === t.truck_type_id)?.name || null
  }

  async function saveCalculation(mode: 'single' | 'plan', truckPlateNo: string | null, totalPrice: number, costRows: CostRow[]) {
    const { error } = await supabase.from('load_calculations').insert([{
      created_by: session?.employee.id || null,
      mode,
      truck_plate_no: truckPlateNo,
      total_price: totalPrice,
      items: costRows.map(toSavedItem),
    }])
    return error?.message || null
  }

  function onSaved() {
    setHistoryRefresh((n) => n + 1)
  }

  return (
    <AdminLayout>
      <div className="page-header">
        <div>
          <div className="page-title">Load Calculator</div>
          <div className="page-sub">How many cartons fit a truck, or which truck fits a mixed load</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #26374a', marginBottom: 16 }}>
        <TabButton active={tab === 'single'} onClick={() => setTab('single')}>Single Carton Capacity</TabButton>
        <TabButton active={tab === 'plan'} onClick={() => setTab('plan')}>Load Planning</TabButton>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /><span>Loading…</span></div>
      ) : tab === 'single' ? (
        <SingleCartonTab trucks={trucks} truckTypeLabel={truckTypeLabel} boxes={boxes} onSave={saveCalculation} onSaved={onSaved} />
      ) : (
        <LoadPlanningTab trucks={trucks} truckTypeLabel={truckTypeLabel} boxes={boxes} onSave={saveCalculation} onSaved={onSaved} />
      )}

      <div style={{ marginTop: 16 }}>
        <CalculationHistory refreshKey={historyRefresh} />
      </div>
    </AdminLayout>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 16px', fontSize: 13.5, fontWeight: 600, border: 'none', borderBottom: '2px solid transparent',
        marginBottom: -2, background: 'none', cursor: 'pointer',
        color: active ? '#e37a42' : '#93a4b6',
        borderBottomColor: active ? '#e37a42' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

type SaveFn = (mode: 'single' | 'plan', truckPlateNo: string | null, totalPrice: number, costRows: CostRow[]) => Promise<string | null>

// ==================== Tab 1: Single Carton Capacity ====================

function SingleCartonTab({ trucks, truckTypeLabel, boxes, onSave, onSaved }: {
  trucks: Truck[]; truckTypeLabel: (t: Truck) => string | null; boxes: PackBox[]; onSave: SaveFn; onSaved: () => void
}) {
  const [truckId, setTruckId] = useState('')
  const [boxId, setBoxId] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)

  const truck = useMemo(() => trucks.find((t) => t.id === truckId) ?? null, [trucks, truckId])
  const truckValid = truck ? truckHasValidDims(truck) : false
  const box = useMemo(() => boxes.find((b) => b.id === boxId) ?? null, [boxes, boxId])

  const result = useMemo(() => {
    if (!truck || !truckValid || !box) return null
    return computeForBox(truck, box)
  }, [truck, truckValid, box])

  const totalPrice = Number(price) || 0
  const costRows = useMemo(() => {
    if (!box || !result || !result.fits || totalPrice <= 0) return []
    return computeCostBreakdown([{ box, qty: result.total }], totalPrice)
  }, [box, result, totalPrice])

  async function handleSave() {
    if (costRows.length === 0) return
    setSaving(true)
    setSaveError('')
    setSaved(false)
    const err = await onSave('single', truck?.plate_no ?? null, totalPrice, costRows)
    setSaving(false)
    if (err) { setSaveError(err); return }
    setSaved(true)
    onSaved()
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Truck</label>
            <select className="form-select" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              <option value="">Select truck</option>
              {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}{truckTypeLabel(t) ? ` — ${truckTypeLabel(t)}` : ''}</option>)}
            </select>
            {truck && !truckValid && <p style={{ fontSize: 12, color: '#e0a94a', marginTop: 6 }}>No cargo box dimensions set for this truck.</p>}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Carton</label>
            <BoxPicker boxes={boxes} value={boxId} onChange={setBoxId} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Trip Price (optional, for cost/carton)</label>
            <input type="number" className="form-input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 5000" />
          </div>
        </div>
      </div>

      {result && (
        result.fits ? (
          <div className="card" style={{ padding: 16, borderColor: '#274734' }}>
            <div style={{ fontSize: 13.5, color: '#cdd8e3', marginBottom: 14 }}>
              Floor layout <b>{result.rows} × {result.cols}</b> = {result.footprint} cartons/layer · stacked <b>{result.layers}</b> layers<br />
              Total capacity <span style={{ fontWeight: 700, color: '#86d494' }}>{result.total.toLocaleString()} cartons</span>
              {result.packingQty > 1 && <> · <span style={{ fontWeight: 700, color: '#86d494' }}>{result.totalUnits.toLocaleString()} pcs</span> ({result.packingQty} pcs/carton)</>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div>
                <div style={{ fontSize: 11.5, color: '#64798d', marginBottom: 6 }}>Top view · floor layout</div>
                <TopView truckL={result.truckL} truckW={result.truckW} rows={result.rows} cols={result.cols} footL={result.footL} footW={result.footW} />
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#64798d', marginBottom: 6 }}>Side view · stacking</div>
                <SideView truckH={result.truckH} layers={result.layers} layerH={result.bh} />
              </div>
            </div>

            {costRows.length > 0 && (
              <div style={{ borderTop: '1px solid #26374a', marginTop: 14, paddingTop: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#93a4b6', margin: 0 }}>Cost per Carton (₱{totalPrice.toLocaleString()} total)</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => exportCostBreakdown(costRows, truck?.plate_no ?? 'load')}>Export Excel</button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Record'}</button>
                  </div>
                </div>
                {saveError && <p style={{ fontSize: 12.5, color: '#f2977e', marginBottom: 8 }}>{saveError}</p>}
                {saved && <p style={{ fontSize: 12.5, color: '#86d494', marginBottom: 8 }}>✓ Saved</p>}
                <CostTable costRows={costRows} />
                <p style={{ fontSize: 11.5, color: '#64798d', marginTop: 8 }}>With a single carton type, all three methods land on the same number — the split only differs once you mix carton types in Load Planning.</p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: '#34201a', border: '1px solid #5a3226', borderRadius: 12, padding: 14, fontSize: 13.5, color: '#f2977e' }}>
            Doesn&apos;t fit — {result.reason}
          </div>
        )
      )}
    </div>
  )
}

function CostTable({ costRows, showCarton }: { costRows: CostRow[]; showCarton?: boolean }) {
  return (
    <table className="data-table" style={{ fontSize: 12.5 }}>
      <thead>
        <tr>
          {showCarton && <th>Carton</th>}
          {showCarton && <th>Qty</th>}
          <th>Weight/carton</th>
          <th>Volume/carton</th>
          <th>Avg ₱/carton</th>
          <th>By Volume ₱/carton</th>
          <th>By Weight ₱/carton</th>
        </tr>
      </thead>
      <tbody>
        {costRows.map((r, i) => (
          <tr key={i}>
            {showCarton && <td>{r.box.name}</td>}
            {showCarton && <td>{r.qty}</td>}
            <td>{r.unitWeight ? `${r.unitWeight} kg` : '—'}</td>
            <td>{r.unitVolumeL.toFixed(2)} L</td>
            <td>{r.avgPrice.toFixed(2)}</td>
            <td>{r.volumePrice.toFixed(2)}</td>
            <td>{r.weightPrice.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

let svgIdSeq = 0

function TopView({ truckL, truckW, rows, cols, footL, footW }: { truckL: number; truckW: number; rows: number; cols: number; footL: number; footW: number }) {
  const [patternId] = useState(() => `hatch-${svgIdSeq++}`)
  const scale = Math.min(360 / truckL, 220 / truckW)
  const truckPxL = truckL * scale, truckPxW = truckW * scale
  const boxPxL = footL * scale, boxPxW = footW * scale
  const cells: React.ReactNode[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push(
        <rect key={`${row}-${col}`} x={col * boxPxL} y={row * boxPxW} width={Math.max(boxPxL - 2, 0)} height={Math.max(boxPxW - 2, 0)}
          fill="#2c3d52" stroke="#e37a42" strokeWidth={1} />
      )
    }
  }
  const usedPxL = cols * boxPxL, usedPxW = rows * boxPxW
  return (
    <svg viewBox={`0 0 ${truckPxL + 4} ${truckPxW + 4}`} width="100%" height={Math.max(truckPxW + 4, 120)} style={{ maxWidth: 400, display: 'block' }}>
      <defs>
        <pattern id={patternId} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#0f1b28" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#26374a" strokeWidth={3} />
        </pattern>
      </defs>
      <rect x={1} y={1} width={truckPxL} height={truckPxW} fill="#16232f" stroke="#93a4b6" strokeWidth={1.5} />
      {usedPxL < truckPxL && <rect x={usedPxL} y={0} width={truckPxL - usedPxL} height={truckPxW} fill={`url(#${patternId})`} />}
      {usedPxW < truckPxW && <rect x={0} y={usedPxW} width={truckPxL} height={truckPxW - usedPxW} fill={`url(#${patternId})`} />}
      {cells}
    </svg>
  )
}

function SideView({ truckH, layers, layerH }: { truckH: number; layers: number; layerH: number }) {
  const [patternId] = useState(() => `hatchv-${svgIdSeq++}`)
  const sScale = Math.min(120 / truckH, 40)
  const truckPxH = truckH * sScale, layerPxH = layerH * sScale
  const layerRects: React.ReactNode[] = []
  for (let i = 0; i < layers; i++) {
    layerRects.push(
      <rect key={i} x={1} y={truckPxH - (i + 1) * layerPxH} width={140} height={Math.max(layerPxH - 2, 0)} fill="#2c3d52" stroke="#e37a42" strokeWidth={1} />
    )
  }
  const usedPxH = layers * layerPxH
  return (
    <svg viewBox={`0 0 144 ${truckPxH + 4}`} width="100%" height={Math.max(truckPxH + 4, 120)} style={{ maxWidth: 180, display: 'block', margin: '0 auto' }}>
      <defs>
        <pattern id={patternId} width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#0f1b28" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#26374a" strokeWidth={3} />
        </pattern>
      </defs>
      <rect x={1} y={1} width={140} height={truckPxH} fill="#16232f" stroke="#93a4b6" strokeWidth={1.5} />
      {usedPxH < truckPxH && <rect x={1} y={1} width={140} height={truckPxH - usedPxH} fill={`url(#${patternId})`} />}
      {layerRects}
    </svg>
  )
}

// ==================== Tab 2: Load Planning (mixed / recommend) ====================

function LoadPlanningTab({ trucks, truckTypeLabel, boxes, onSave, onSaved }: {
  trucks: Truck[]; truckTypeLabel: (t: Truck) => string | null; boxes: PackBox[]; onSave: SaveFn; onSaved: () => void
}) {
  const [truckId, setTruckId] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const [rows, setRows] = useState<Row[]>([{ key: rowKeySeq++, boxId: null, qty: '' }])

  function addRow() { setRows((prev) => [...prev, { key: rowKeySeq++, boxId: null, qty: '' }]) }
  function removeRow(key: number) { setRows((prev) => prev.filter((r) => r.key !== key)) }
  function updateRow(key: number, patch: Partial<Row>) { setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r))) }

  const items: FitItem[] = useMemo(() => {
    return rows
      .map((row) => ({ box: boxes.find((b) => b.id === row.boxId) ?? null, qty: Number(row.qty) || 0 }))
      .filter((r): r is FitItem => !!r.box && r.qty > 0)
  }, [rows, boxes])

  const selectedTruck = useMemo(() => trucks.find((t) => t.id === truckId) ?? null, [trucks, truckId])
  const selectedTruckValid = selectedTruck ? truckHasValidDims(selectedTruck) : false

  const singleResult = useMemo(() => {
    if (!selectedTruck || !selectedTruckValid || items.length === 0) return null
    return checkFit(selectedTruck, items)
  }, [selectedTruck, selectedTruckValid, items])

  const recommendation = useMemo(() => {
    if (selectedTruck || items.length === 0) return null
    const validTrucks = trucks.filter(truckHasValidDims)
    const evaluated = validTrucks.map((t) => ({ truck: t, res: checkFit(t, items) }))
    const fitting = evaluated.filter((e) => e.res.fits).sort((a, b) => b.res.ratio - a.res.ratio)
    const notFitting = evaluated.filter((e) => !e.res.fits).sort((a, b) => b.res.ratio - a.res.ratio)
    return { fitting, shown: fitting.length ? fitting : notFitting.slice(0, 3) }
  }, [trucks, selectedTruck, items])

  const totalPrice = Number(price) || 0
  const costRows = useMemo(() => (totalPrice > 0 ? computeCostBreakdown(items, totalPrice) : []), [items, totalPrice])

  async function handleSave() {
    if (costRows.length === 0) return
    setSaving(true)
    setSaveError('')
    setSaved(false)
    const err = await onSave('plan', selectedTruck?.plate_no ?? null, totalPrice, costRows)
    setSaving(false)
    if (err) { setSaveError(err); return }
    setSaved(true)
    onSaved()
  }

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Truck (optional — leave blank to see which trucks fit)</label>
            <select className="form-select" value={truckId} onChange={(e) => setTruckId(e.target.value)}>
              <option value="">Recommend from all trucks</option>
              {trucks.map((t) => <option key={t.id} value={t.id}>{t.plate_no}{truckTypeLabel(t) ? ` — ${truckTypeLabel(t)}` : ''}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Trip Price (optional, for cost/carton)</label>
            <input type="number" className="form-input" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 5000" />
          </div>
        </div>
        {selectedTruck && !selectedTruckValid && (
          <p style={{ fontSize: 12, color: '#e0a94a', marginTop: 10 }}>This truck has no cargo box dimensions set — go to Trucks to fill them in first.</p>
        )}
        {selectedTruck && selectedTruckValid && (
          <p style={{ fontSize: 12, color: '#64798d', marginTop: 10 }}>Cargo box: {selectedTruck.length_cm}×{selectedTruck.width_cm}×{selectedTruck.height_cm} cm</p>
        )}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#93a4b6', margin: 0 }}>Cartons</h2>
          <button className="btn btn-primary" onClick={addRow}>+ Add Carton</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row) => {
            const box = boxes.find((b) => b.id === row.boxId) ?? null
            return (
              <div key={row.key} style={{ border: '1px dashed #28394a', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <BoxPicker boxes={boxes} value={row.boxId} onChange={(id) => updateRow(row.key, { boxId: id })} />
                  </div>
                  <div style={{ width: 100 }}>
                    <input type="number" placeholder="Qty" className="form-input" value={row.qty} onChange={(e) => updateRow(row.key, { qty: e.target.value })} />
                  </div>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(row.key)} style={{ background: 'none', border: 'none', color: '#f2977e', fontSize: 12, cursor: 'pointer', padding: '7px 0' }}>Remove</button>
                  )}
                </div>
                {box && (
                  <p style={{ fontSize: 11.5, color: '#64798d', marginTop: 6 }}>
                    {box.length_cm}×{box.width_cm}×{box.height_cm} cm · {getPackingQty(box)} pcs/carton{getUnitWeight(box) ? ` · ${getUnitWeight(box)} kg/carton` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {costRows.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, color: '#93a4b6', margin: 0 }}>Cost per Carton (₱{totalPrice.toLocaleString()} total)</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => exportCostBreakdown(costRows, selectedTruck?.plate_no ?? 'load')}>Export Excel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Record'}</button>
            </div>
          </div>
          {saveError && <p style={{ fontSize: 12.5, color: '#f2977e', marginBottom: 8 }}>{saveError}</p>}
          {saved && <p style={{ fontSize: 12.5, color: '#86d494', marginBottom: 8 }}>✓ Saved</p>}
          <CostTable costRows={costRows} showCarton />
          <p style={{ fontSize: 11.5, color: '#64798d', marginTop: 8 }}>Weight-based column uses only cartons with a weight on file; missing weights are excluded from that method&apos;s split.</p>
        </div>
      )}

      {selectedTruck && selectedTruckValid && singleResult && (
        <div style={{ marginBottom: 12 }}>
          <FitCard title={selectedTruck.plate_no} truck={selectedTruck} res={singleResult} />
        </div>
      )}

      {recommendation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          <div style={{
            borderRadius: 8, padding: '9px 14px', fontSize: 13.5, fontWeight: 700,
            background: recommendation.fitting.length > 0 ? '#17301f' : '#34201a',
            color: recommendation.fitting.length > 0 ? '#86d494' : '#f2977e',
          }}>
            {recommendation.fitting.length > 0
              ? `Found ${recommendation.fitting.length} truck${recommendation.fitting.length > 1 ? 's' : ''} that fit this load, best floor utilization first`
              : 'No truck fits this whole load — closest matches shown below'}
          </div>
          {recommendation.shown.map(({ truck, res }) => (
            <FitCard key={truck.id} title={truck.plate_no} truck={truck} res={res} compact />
          ))}
        </div>
      )}

      <p style={{ fontSize: 11.5, color: '#64798d' }}>
        Floor-area estimate: each carton type stacks in its own columns using its best single orientation; not a full 3D packing optimizer — confirm by trial loading near full capacity.
      </p>
    </div>
  )
}

function FitCard({ title, truck, res, compact }: { title: string; truck: Truck; res: FitResult; compact?: boolean }) {
  const pct = Math.min(res.ratio * 100, 999)
  return (
    <div className="card" style={{ padding: 14, borderColor: res.fits ? '#274734' : '#4a2e25' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontWeight: 700, color: '#e9eef3' }}>{title}</span>
        <span className={`badge ${res.fits ? 'badge-green' : 'badge-red'}`}>{pct.toFixed(0)}% floor</span>
      </div>
      <p style={{ fontSize: 12, color: '#64798d', marginBottom: 8 }}>
        {truck.length_cm}×{truck.width_cm}×{truck.height_cm} cm · {res.totalBoxes.toLocaleString()} cartons, {res.totalUnits.toLocaleString()} pcs
      </p>
      <div style={{ height: 8, borderRadius: 4, background: '#1c2b3a', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 4, width: `${Math.min(pct, 100)}%`, background: res.fits ? '#3fa855' : '#c8503a' }} />
      </div>
      {!compact && (
        <table className="data-table" style={{ fontSize: 12, marginTop: 10 }}>
          <thead><tr><th>Carton</th><th>Qty</th><th>Per column</th><th>Columns</th><th>Pcs</th></tr></thead>
          <tbody>
            {res.perProduct.map((p, i) => (
              <tr key={i}>
                <td>{p.box.name}</td>
                <td>{p.qty}</td>
                {p.possible ? (<><td>{p.layers}</td><td>{p.columnsNeeded}</td><td>{p.unitQty.toLocaleString()}</td></>) : (<td colSpan={3} style={{ color: '#f2977e' }}>{p.reason}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {compact && res.perProduct.some((p) => !p.possible) && (
        <p style={{ fontSize: 12, color: '#f2977e', marginTop: 6 }}>{res.perProduct.find((p) => !p.possible)?.reason}</p>
      )}
    </div>
  )
}

function CalculationHistory({ refreshKey }: { refreshKey: number }) {
  const [records, setRecords] = useState<CalcRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.resolve(
      supabase.from('load_calculations').select('*').order('created_at', { ascending: false }).limit(200)
    )
      .then(({ data }) => setRecords(data || []))
      .finally(() => setLoading(false))
  }, [refreshKey])

  async function handleDelete(id: string) {
    await supabase.from('load_calculations').delete().eq('id', id)
    setRecords((prev) => prev.filter((r) => r.id !== id))
  }

  function exportAll() {
    const data: Record<string, string | number>[] = []
    for (const rec of records) {
      for (const item of rec.items) {
        data.push({
          Date: new Date(rec.created_at).toLocaleString(),
          Mode: rec.mode === 'single' ? 'Single Carton' : 'Load Planning',
          Truck: rec.truck_plate_no ?? '',
          'Total Price': rec.total_price ?? '',
          Carton: item.box_name,
          Qty: item.qty,
          'Weight/carton (kg)': item.unit_weight || '',
          'Volume/carton (L)': item.unit_volume_l.toFixed(2),
          'Avg Price/carton': item.avg_price.toFixed(2),
          'Volume-based Price/carton': item.volume_price.toFixed(2),
          'Weight-based Price/carton': item.weight_price.toFixed(2),
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'History')
    XLSX.writeFile(wb, 'load_calculator_history.xlsx')
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #26374a' }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: '#93a4b6', margin: 0 }}>Saved Calculations ({records.length})</h2>
        {records.length > 0 && <button className="btn btn-primary" onClick={exportAll}>Export Excel</button>}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Mode</th><th>Truck</th><th>Total Price</th><th>Cartons</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#64798d' }}>Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#64798d' }}>No saved calculations yet</td></tr>
            ) : records.map((rec) => (
              <tr key={rec.id}>
                <td>{new Date(rec.created_at).toLocaleString()}</td>
                <td>{rec.mode === 'single' ? 'Single Carton' : 'Load Planning'}</td>
                <td>{rec.truck_plate_no || '—'}</td>
                <td>{rec.total_price != null ? rec.total_price.toLocaleString() : '—'}</td>
                <td>{rec.items.map((i) => `${i.box_name} ×${i.qty}`).join(', ')}</td>
                <td><button className="action-btn action-delete" onClick={() => handleDelete(rec.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BoxPicker({ boxes, value, onChange }: { boxes: PackBox[]; value: string | null; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = boxes.find((b) => b.id === value) ?? null

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const q = query.trim().toLowerCase()
    return boxes.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 20)
  }, [boxes, query])

  if (selected && !open) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #28394a', borderRadius: 8, padding: '9px 12px', fontSize: 14, background: '#101a24' }}>
        <span style={{ flex: 1, color: '#e9eef3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.name}</span>
        <button onClick={() => { setOpen(true); setQuery('') }} style={{ background: 'none', border: 'none', color: '#7fb2ff', fontSize: 12, cursor: 'pointer' }}>Change</button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search carton by name…"
        className="form-input"
      />
      {open && query.trim() && (
        <div style={{ position: 'absolute', zIndex: 10, marginTop: 4, width: '100%', maxHeight: 220, overflowY: 'auto', background: '#16232f', border: '1px solid #28394a', borderRadius: 8, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
          {matches.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: '#64798d' }}>No matches</div>
          ) : (
            matches.map((b) => (
              <button
                key={b.id}
                onClick={() => { onChange(b.id); setOpen(false); setQuery('') }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid #1e2c3a', cursor: 'pointer' }}
              >
                <div style={{ fontSize: 12.5, color: '#e9eef3' }}>{b.name}</div>
                <div style={{ fontSize: 11, color: '#64798d' }}>{b.length_cm}×{b.width_cm}×{b.height_cm} cm</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
