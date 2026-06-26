'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import StepIndicator from '@/components/StepIndicator'
import ThemeToggle from '@/components/ThemeToggle'

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
  requisitos_estructurados: {
    tipo_proceso?: string
    complejidad_tecnica?: string
    actividad_principal?: { codigo?: string; descripcion?: string }
    experiencia?: {
      min_contratos?: number
      max_contratos?: number
      tipos_obra?: string[]
      valor_minimo_smmlv?: number
      valor_minimo_cop?: number
      fuente_valor_minimo?: string
      matriz1?: {
        actividad?: string
        experiencia_general?: string
        experiencia_especifica?: string
      }
    }
    capacidad_financiera?: {
      patrimonio_minimo_cop?: number
      indicadores_requeridos?: string[]
      matriz2?: {
        resumen?: Record<string, Record<string, { valor_minimo?: number; texto?: string }>>
      }
    }
    capacidad_residual?: {
      requerida?: boolean
      formula_crpc_corto_plazo?: string
      formula_crpc_largo_plazo?: string
      requisito_crp_crpc?: string
      min_crp_pct?: number
      factores?: { nombre: string; codigo: string; puntaje_maximo: number }[]
    }
    documentos_requeridos?: string[]
    factores_calidad?: Record<string, boolean>
    advertencias?: string[]
  }
  resumen_requisitos: { campo: string; requerido: any; detalle?: any }[]
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

function fmtCOP(n: number) {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
  return `$${n.toLocaleString('es-CO')}`
}

function fmtSMMLV(n: number | undefined) {
  if (n === undefined || n === null) return '—'
  return `${n.toLocaleString('es-CO', { maximumFractionDigits: 2 })} SMMLV`
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

    // Intentar recuperar análisis previo; si no existe, ejecutar POST.
    const run = async () => {
      try {
        let r = await fetch(`${API}/procesos/${procesoId}/pliego/${clienteId}`)
        if (r.ok) {
          const data = await r.json()
          setAnalisis(data)
          setLoading(false)
          return
        }
        if (r.status === 404) {
          r = await fetch(`${API}/procesos/${procesoId}/pliego/${clienteId}`, { method: 'POST' })
          if (!r.ok) throw new Error(await r.text())
          const data = await r.json()
          setAnalisis(data)
          setLoading(false)
          return
        }
        throw new Error(await r.text())
      } catch (err: any) {
        setError(err.message || 'Error desconocido')
        setLoading(false)
      }
    }

    run()
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
        <div style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
        </div>
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

            {/* ── Requisitos cuantitativos estructurados ── */}
            {analisis.requisitos_estructurados && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 24,
                marginBottom: 24,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                  Requisitos cuantitativos del pliego
                </div>

                {analisis.requisitos_estructurados.actividad_principal && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 14, marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Actividad principal</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                      {analisis.requisitos_estructurados.actividad_principal.descripcion}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-sec)', marginTop: 2 }}>Código: {analisis.requisitos_estructurados.actividad_principal.codigo}</div>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <StatBox label="Tipo de proceso" value={analisis.requisitos_estructurados.tipo_proceso || '—'} />
                  <StatBox label="Complejidad técnica" value={analisis.requisitos_estructurados.complejidad_tecnica || '—'} />
                  <StatBox label="Documentos requeridos" value={`${analisis.requisitos_estructurados.documentos_requeridos?.length || 0}`} />
                </div>

                {analisis.requisitos_estructurados.experiencia && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>Experiencia requerida</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 12 }}>
                      <Info label="Contratos mínimos" value={`${analisis.requisitos_estructurados.experiencia.min_contratos ?? '—'}`} />
                      <Info label="Contratos máximos" value={`${analisis.requisitos_estructurados.experiencia.max_contratos ?? '—'}`} />
                      <Info label="Valor mínimo" value={fmtCOP(analisis.requisitos_estructurados.experiencia.valor_minimo_cop || 0)} />
                      <Info label="En SMMLV" value={fmtSMMLV(analisis.requisitos_estructurados.experiencia.valor_minimo_smmlv)} />
                    </div>
                    {analisis.requisitos_estructurados.experiencia.tipos_obra && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 4 }}>TIPOS DE OBRA ACEPTADOS</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {analisis.requisitos_estructurados.experiencia.tipos_obra.map((t, i) => (
                            <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, background: 'rgba(59,130,246,.12)', color: '#3b82f6' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {analisis.requisitos_estructurados.capacidad_financiera && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>Capacidad financiera</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 12 }}>
                      <Info label="Patrimonio mínimo" value={fmtCOP(analisis.requisitos_estructurados.capacidad_financiera.patrimonio_minimo_cop || 0)} />
                      <Info label="Indicadores requeridos" value={`${analisis.requisitos_estructurados.capacidad_financiera.indicadores_requeridos?.length || 0}`} />
                    </div>
                    {analisis.requisitos_estructurados.capacidad_financiera.matriz2?.resumen && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 4 }}>MATRIZ 2 — VALORES CONCERTADOS</div>
                        {Object.entries(analisis.requisitos_estructurados.capacidad_financiera.matriz2.resumen).map(([perfil, cats]) => (
                          <div key={perfil} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase' }}>{perfil}</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {Object.entries(cats).map(([cat, val]) => (
                                <span key={cat} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, background: 'var(--surface)', color: 'var(--text-sec)' }}>
                                  {cat}: {val.texto || val.valor_minimo}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {analisis.requisitos_estructurados.capacidad_residual?.requerida && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>Capacidad residual</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 12, marginBottom: 10 }}>
                      <Info label="CRP mínimo" value={`${analisis.requisitos_estructurados.capacidad_residual.min_crp_pct ?? 'No determinado'}%`} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-sec)', lineHeight: 1.6 }}>
                      {analisis.requisitos_estructurados.capacidad_residual.formula_crpc_corto_plazo && <div>• {analisis.requisitos_estructurados.capacidad_residual.formula_crpc_corto_plazo}</div>}
                      {analisis.requisitos_estructurados.capacidad_residual.formula_crpc_largo_plazo && <div>• {analisis.requisitos_estructurados.capacidad_residual.formula_crpc_largo_plazo}</div>}
                      {analisis.requisitos_estructurados.capacidad_residual.requisito_crp_crpc && <div>• {analisis.requisitos_estructurados.capacidad_residual.requisito_crp_crpc}</div>}
                    </div>
                  </div>
                )}

                {analisis.requisitos_estructurados.advertencias && analisis.requisitos_estructurados.advertencias.length > 0 && (
                  <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,.35)', borderRadius: 6, padding: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--yellow)', fontWeight: 600, marginBottom: 6 }}>ADVERTENCIAS DEL ANÁLISIS</div>
                    <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 12 }}>
                      {analisis.requisitos_estructurados.advertencias.map((a, i) => <li key={i} style={{ marginBottom: 3 }}>{a}</li>)}
                    </ul>
                  </div>
                )}
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontWeight: 600 }}>{value}</div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>{value}</div>
      <div style={{ fontSize: 9, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
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
