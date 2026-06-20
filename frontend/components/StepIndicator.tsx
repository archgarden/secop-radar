'use client'

import Link from 'next/link'

interface StepIndicatorProps {
  clienteId: string
  procesoId: string
  current: number
}

export default function StepIndicator({ clienteId, procesoId, current }: StepIndicatorProps) {
  const steps = [
    { label: 'Procesos', href: `/procesos/${clienteId}` },
    { label: 'Resumen', href: `/procesos/resumen?cliente_id=${clienteId}&proceso_id=${procesoId}` },
    { label: 'Pre-selección', href: `/preseleccion?cliente_id=${clienteId}&proceso_id=${procesoId}` },
    { label: 'Pliego', href: `/pliego?cliente_id=${clienteId}&proceso_id=${procesoId}` },
  ]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link
            href={s.href}
            style={{
              fontSize: 12,
              fontWeight: current === i ? 700 : 400,
              color: current === i ? 'var(--orange)' : current > i ? 'var(--text)' : 'var(--text-sec)',
              textDecoration: 'none',
              padding: '4px 10px',
              borderRadius: 4,
              background: current === i ? 'rgba(249,115,22,.12)' : 'transparent',
              border: '1px solid ' + (current === i ? 'var(--orange)' : 'var(--border)'),
            }}
          >
            {s.label}
          </Link>
          {i < steps.length - 1 && <span style={{ color: 'var(--text-sec)' }}>→</span>}
        </div>
      ))}
    </div>
  )
}
