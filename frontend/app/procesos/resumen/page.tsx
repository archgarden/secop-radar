'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Proceso {
  id: number
  numero_proceso: string
  entidad: string
  objeto: string
  presupuesto: number
  departamento: string | null
  unspsc_code: string | null
  url_documento: string | null
  tiene_adenda: boolean
  score_match: number
  fecha_cierre: string | null
  fecha_publicacion: string | null
}

function fmtCOP(n: number) {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
  return `$${n.toLocaleString('es-CO')}`
}

function duracionDias(inicio: string | null, fin: string | null) {
  if (!inicio || !fin) return null
  const diff = new Date(fin).getTime() - new Date(inicio).getTime()
  return Math.round(diff / 86400000)
}

function diasRestantes(fin: string | null) {
  if (!fin) return null
  const diff = new Date(fin).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

function ResumenContent() {
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('cliente_id')
  const procesoId = searchParams.get('proceso_id')

  const [proceso, setProceso] = useState<Proceso | null>(null)
  const [modalidad, setModalidad] = useState<{ modalidad: string; descripcion: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clienteId || !procesoId) {
      setLoading(false)
      setError('Faltan parámetros cliente_id o proceso_id en la URL')
      return
    }

    fetch(`${API}/procesos/${procesoId}`)
      .then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then((data: Proceso) => {
        setProceso(data)
        if (data.presupuesto > 0) {
          fetch(`${API}/modalidad/recomendada/${data.presupuesto}`)
            .then(r => r.json())
            .then(setModalidad)
        }
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [clienteId, procesoId])

  const restantes = proceso?.fecha_cierre ? diasRestantes(proceso.fecha_cierre) : null
  const duracion = proceso?.fecha_publicacion && proceso?.fecha_cierre
    ? duracionDias(proceso.fecha_publicacion, proceso.fecha_cierre)
    : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <nav style={{
        background: 'var(--header)',
        borderBottom: '1px solid var(--border)',
        padding: '0 28px',
        display: 'flex',
        alignItems: 'center',
        height: 56,
        gap: 28,
        boxShadow: '0 2px 20px rgba(0,0,0,.5)',
        position: 'relative',
        zIndex: 1,
      }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} className="pulse-status" />
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15, letterSpacing: '3px', textTransform: 'uppercase' }}>
          SECOP RADAR
        </span>
        <Link href="/dashboard" style={{ color: 'var(--text-sec)', fontSize: 13 }}>Dashboard</Link>
        <Link href={`/procesos/${clienteId || ''}`} style={{ color: 'var(--text-sec)', fontSize: 13 }}>Procesos</Link>
        <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>Resumen del proceso</span>
      </nav>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        {loading ? (
          <div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 48 }}>Cargando proceso...</div>
        ) : error ? (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            padding: 16,
            borderRadius: 6,
            fontSize: 14,
          }}>{error}</div>
        ) : proceso ? (
          <>
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-sec)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                {proceso.numero_proceso}
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, lineHeight: 1.3 }}>
                {proceso.entidad}
              </h1>
              <p style={{ color: 'var(--text-sec)', fontSize: 14, lineHeight: 1.6 }}>
                {proceso.objeto}
              </p>
            </div>

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                Información general
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                <Info label="Presupuesto oficial" value={fmtCOP(proceso.presupuesto)} />
                <Info label="Modalidad recomendada" value={modalidad?.modalidad || '—'} sub={modalidad?.descripcion} />
                <Info label="Departamento" value={proceso.departamento || '—'} />
                <Info label="UNSPSC" value={proceso.unspsc_code || '—'} />
                <Info label="Fecha de publicación" value={proceso.fecha_publicacion ? new Date(proceso.fecha_publicacion).toLocaleDateString('es-CO') : '—'} />
                <Info label="Fecha de cierre" value={proceso.fecha_cierre ? new Date(proceso.fecha_cierre).toLocaleDateString('es-CO') : '—'} />
                <Info label="Duración estimada" value={duracion !== null ? `${duracion} días` : '—'} />
                <Info label="Días restantes" value={restantes !== null ? `${restantes} días` : '—'} color={restantes !== null && restantes <= 7 ? 'var(--red)' : undefined} />
                <Info label="Adenda" value={proceso.tiene_adenda ? 'Sí' : 'No'} />
                <Info label="Score de match" value={`${proceso.score_match}%`} />
              </div>
            </div>

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                Análisis SECOP Radar
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link
                  href={`/preseleccion?cliente_id=${clienteId}&proceso_id=${procesoId}`}
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 16,
                    textDecoration: 'none',
                    color: 'var(--text)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 4 }}>Pre-selección</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange)' }}>Ver análisis →</div>
                </Link>
                <Link
                  href={`/pliego?cliente_id=${clienteId}&proceso_id=${procesoId}`}
                  style={{
                    flex: 1,
                    minWidth: 180,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 16,
                    textDecoration: 'none',
                    color: 'var(--text)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 4 }}>Análisis de pliego</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange)' }}>Ver requisitos →</div>
                </Link>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link
                href={`/procesos/${clienteId}`}
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '10px 22px',
                  borderRadius: 6,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                ← Volver a procesos
              </Link>
              {proceso.url_documento && (
                <a
                  href={proceso.url_documento.startsWith('http') ? proceso.url_documento : 'https://www.secop.gov.co/'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    border: '1px solid var(--border)',
                    color: 'var(--text-sec)',
                    padding: '10px 22px',
                    borderRadius: 6,
                    fontSize: 14,
                    textDecoration: 'none',
                  }}
                >
                  Ver en SECOP II ↗
                </a>
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

function Info({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || 'var(--text)', fontWeight: 600, fontSize: 14 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

export default function ResumenPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 48 }}>Cargando...</div>}>
      <ResumenContent />
    </Suspense>
  )
}
