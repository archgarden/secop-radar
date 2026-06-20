'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import StepIndicator from '@/components/StepIndicator'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Requisito {
  id: string
  nombre: string
  tipo: string
  contexto: string
}

interface CumplimientoItem {
  requisito: Requisito
  cumple: boolean
  documento: string | null
  documento_id: number | null
}

interface AnalisisPliego {
  proceso_id: number
  cliente_id: number
  analisis_id: number
  documento_pliego: string | null
  cantidad_requisitos: number
  cantidad_cumplidos: number
  score_pliego: number
  requisitos: Requisito[]
  cumplimiento: CumplimientoItem[]
  error: string | null
}

function tipoColor(tipo: string) {
  if (tipo === 'legal') return '#3b82f6'
  if (tipo === 'financiero') return '#22c55e'
  if (tipo === 'tecnico') return '#f59e0b'
  if (tipo === 'economico') return '#a855f7'
  return '#64748b'
}

function tipoLabel(tipo: string) {
  if (tipo === 'legal') return 'LEGAL'
  if (tipo === 'financiero') return 'FINANCIERO'
  if (tipo === 'tecnico') return 'TÉCNICO'
  if (tipo === 'economico') return 'ECONÓMICO'
  return tipo.toUpperCase()
}

function PliegoContent() {
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('cliente_id')
  const procesoId = searchParams.get('proceso_id')

  const [analisis, setAnalisis] = useState<AnalisisPliego | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clienteId || !procesoId) {
      setLoading(false)
      setError('Faltan parámetros cliente_id o proceso_id en la URL')
      return
    }

    fetch(`${API}/procesos/${procesoId}/pliego/${clienteId}`, { method: 'POST' })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then((data: AnalisisPliego) => { setAnalisis(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [clienteId, procesoId])

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
        <Link href={`/preseleccion?cliente_id=${clienteId}&proceso_id=${procesoId}`} style={{ color: 'var(--text-sec)', fontSize: 13 }}>Pre-selección</Link>
        <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>Análisis de pliego</span>
      </nav>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        <StepIndicator clienteId={clienteId || ''} procesoId={procesoId || ''} current={3} />

        {loading ? (
          <div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 48 }}>Analizando pliego...</div>
        ) : error ? (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            padding: 16,
            borderRadius: 6,
            fontSize: 14,
          }}>{error}</div>
        ) : analisis ? (
          <>
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Análisis de pliego</h1>
                  <p style={{ color: 'var(--text-sec)', fontSize: 13 }}>
                    {analisis.documento_pliego || 'Pliego no identificado'} · {analisis.cantidad_requisitos} requisitos detectados
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 4 }}>Cumplimiento</div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: analisis.score_pliego >= 80 ? 'var(--green)' : analisis.score_pliego >= 50 ? 'var(--yellow)' : 'var(--red)',
                  }}>
                    {analisis.score_pliego}%
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 4 }}>
                    {analisis.cantidad_cumplidos} de {analisis.cantidad_requisitos}
                  </div>
                </div>
              </div>

              <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden', marginTop: 20 }}>
                <div style={{
                  width: `${analisis.score_pliego}%`,
                  height: '100%',
                  background: analisis.score_pliego >= 80 ? 'var(--green)' : analisis.score_pliego >= 50 ? 'var(--yellow)' : 'var(--red)',
                  transition: 'width 300ms ease',
                }} />
              </div>
            </div>

            {analisis.error && (
              <div style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,.35)',
                borderRadius: 8,
                padding: 16,
                marginBottom: 24,
                color: 'var(--red)',
                fontSize: 14,
              }}>
                {analisis.error}
              </div>
            )}

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                Requisitos detectados y cumplimiento
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {analisis.cumplimiento.map((c, i) => (
                  <div key={i} style={{
                    background: 'var(--bg)',
                    border: `1px solid ${c.cumple ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.25)'}`,
                    borderRadius: 6,
                    padding: 14,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '.06em',
                            color: tipoColor(c.requisito.tipo),
                            border: `1px solid ${tipoColor(c.requisito.tipo)}`,
                            padding: '2px 6px',
                            borderRadius: 3,
                          }}>
                            {tipoLabel(c.requisito.tipo)}
                          </span>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{c.requisito.nombre}</span>
                        </div>
                        {c.requisito.contexto && (
                          <div style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.5, marginBottom: 6 }}>
                            “{c.requisito.contexto}”
                          </div>
                        )}
                        {c.cumple ? (
                          <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 500 }}>
                            ✓ Cubierto por: {c.documento}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>
                            ✕ Documento faltante
                          </div>
                        )}
                      </div>
                      <div style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: c.cumple ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.1)',
                        border: `1px solid ${c.cumple ? 'var(--green)' : 'var(--red)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        color: c.cumple ? 'var(--green)' : 'var(--red)',
                        fontWeight: 700,
                        fontSize: 12,
                      }}>
                        {c.cumple ? '✓' : '✕'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link
                href={`/preseleccion?cliente_id=${clienteId}&proceso_id=${procesoId}`}
                style={{
                  background: 'var(--green)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Continuar a postulación →
              </Link>
              <Link
                href={`/clientes/${clienteId}/documentos`}
                style={{
                  background: 'var(--orange)',
                  color: '#fff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Subir documentos
              </Link>
              <Link
                href={`/calculadoras`}
                style={{
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '10px 22px',
                  borderRadius: 6,
                  fontSize: 14,
                  textDecoration: 'none',
                }}
              >
                Ir a calculadoras
              </Link>
            </div>
          </>
        ) : null}
      </main>
    </div>
  )
}

export default function PliegoPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 48 }}>Cargando...</div>}>
      <PliegoContent />
    </Suspense>
  )
}
