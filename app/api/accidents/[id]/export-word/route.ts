import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
} from 'docx'

const SEVERITY_LABEL: Record<string, string> = {
  L1: 'L1 — Minor', L2: 'L2 — General', L3: 'L3 — Serious', L4: 'L4 — Major',
}
const STATUS_LABEL: Record<string, string> = {
  pending: 'Reported — awaiting classification', in_progress: 'Investigating',
  pending_review: 'Pending Verification', closed: 'Closed',
}

function cell(text: string, opts?: { bold?: boolean; shaded?: boolean; width?: number }) {
  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts?.shaded ? { type: ShadingType.SOLID, color: 'EFE9DF', fill: 'EFE9DF' } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts?.bold })] })],
  })
}

function labeledRow(label: string, value: string) {
  return new TableRow({ children: [cell(label, { bold: true, shaded: true, width: 30 }), cell(value || '—', { width: 70 })] })
}

const noBorder = {
  top: { style: BorderStyle.SINGLE, size: 2, color: 'D8D0BF' },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D8D0BF' },
  left: { style: BorderStyle.SINGLE, size: 2, color: 'D8D0BF' },
  right: { style: BorderStyle.SINGLE, size: 2, color: 'D8D0BF' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'D8D0BF' },
  insideVertical: { style: BorderStyle.SINGLE, size: 2, color: 'D8D0BF' },
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const { data: report } = await supabase.from('accident_reports').select('*').eq('id', id).single()
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 })

  const [{ data: truck }, { data: driver }, { data: assignee }] = await Promise.all([
    supabase.from('trucks').select('plate_no, owner_id').eq('id', report.truck_id).single(),
    supabase.from('employees').select('full_name').eq('id', report.driver_id).single(),
    report.assigned_to ? supabase.from('employees').select('full_name').eq('id', report.assigned_to).single() : Promise.resolve({ data: null }),
  ])
  const { data: owner } = truck?.owner_id
    ? await supabase.from('truck_owners').select('name').eq('id', truck.owner_id).single()
    : { data: null }

  const latencyMin = Math.round((new Date(report.reported_at).getTime() - new Date(report.occurred_at).getTime()) / 60000)

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      children: [
        new Paragraph({
          children: [new TextRun({ text: 'Delivery & Truck', bold: true, size: 20, color: 'C85A26' })],
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 100, after: 200 },
          children: [new TextRun({ text: 'Accident / Incident Report' })],
        }),
        new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: `Report ID: ${report.id}  ·  Generated: ${new Date().toLocaleString()}`, size: 18, color: '6F6555' })],
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 }, children: [new TextRun('Incident Details')] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorder,
          rows: [
            labeledRow('Truck', truck?.plate_no || '—'),
            labeledRow('Truck Owner', owner?.name || '—'),
            labeledRow('Driver', driver?.full_name || '—'),
            labeledRow('Occurred At', new Date(report.occurred_at).toLocaleString()),
            labeledRow('Reported At', new Date(report.reported_at).toLocaleString()),
            labeledRow('Report Latency', `${latencyMin} minute(s)`),
            labeledRow('Location', report.location || '—'),
            labeledRow('Severity', report.severity_level ? SEVERITY_LABEL[report.severity_level] : 'Not yet classified'),
            labeledRow('Status', STATUS_LABEL[report.status] || report.status),
            labeledRow('Assigned To', assignee?.full_name || '—'),
          ],
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 }, children: [new TextRun('Description')] }),
        new Paragraph({ spacing: { after: 200 }, children: [new TextRun(report.description || '—')] }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 }, children: [new TextRun('At the Scene')] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorder,
          rows: [
            labeledRow('Stopped vehicle safely', report.stopped_safely ? 'Yes' : 'No'),
            labeledRow('Ensured everyone was safe', report.ensured_safety ? 'Yes' : 'No'),
            labeledRow('Notified supervisor', report.notified_manager ? 'Yes' : 'No'),
          ],
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 }, children: [new TextRun('Investigation')] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorder,
          rows: [
            labeledRow('Notified insurance', report.notified_insurance ? 'Yes' : 'No'),
            labeledRow('Notified customer', report.notified_customer ? 'Yes' : 'No'),
            labeledRow('Root cause', report.root_cause || '—'),
            labeledRow('Corrective action', report.corrective_action || '—'),
          ],
        }),

        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 120 }, children: [new TextRun('Verification & Sign-off')] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: noBorder,
          rows: [
            labeledRow('Result', report.verification_result === 'pass' ? 'Passed — closed' : report.verification_result === 'fail' ? 'Failed — sent back' : '—'),
            labeledRow('Verified By', report.verified_by || '—'),
            labeledRow('Verified Date', report.verified_at || '—'),
            labeledRow('Notes', report.verification_notes || '—'),
          ],
        }),

        new Paragraph({ spacing: { before: 500 }, children: [new TextRun({ text: '' })] }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
          rows: [
            new TableRow({
              children: [
                new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [
                  new Paragraph({ spacing: { before: 600 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000' } }, children: [new TextRun('Driver Signature / Date')] }),
                ] }),
                new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, children: [
                  new Paragraph({ spacing: { before: 600 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: '000000' } }, children: [new TextRun('Supervisor Signature / Date')] }),
                ] }),
              ],
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 600 },
          children: [new TextRun({ text: 'Generated by Delivery & Truck — Accident Reporting', size: 14, color: 'A89D88' })],
        }),
      ],
    }],
  })

  const buffer = await Packer.toBuffer(doc)
  const filename = `accident-report-${truck?.plate_no || id}-${report.occurred_at.slice(0, 10)}.docx`

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
