'use client'
import { useEffect, useRef, useState } from 'react'

export default function HelpButton({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Help"
        style={{
          width: 26, height: 26, borderRadius: '50%', border: '1px solid #28394a', background: '#101a24',
          color: '#93a4b6', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
        }}
      >
        ?
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 32, right: 0, width: 300, maxWidth: '85vw', zIndex: 300,
          background: '#16232f', border: '1px solid #26374a', borderRadius: 10, padding: '14px 16px',
          boxShadow: '0 12px 30px rgba(0,0,0,0.45)', fontSize: 12.5, color: '#cdd8e3', lineHeight: 1.65,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#e9eef3' }}>{title}</div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', color: '#64798d', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
