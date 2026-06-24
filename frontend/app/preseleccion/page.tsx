'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import StepIndicator from '@/components/StepIndicator'
import ClientProfilePanel from '@/components/ClientProfilePanel'
import ThemeToggle from '@/components/ThemeToggle'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface CheckItem {
  item: string
  cumple: boolean
  peso: number
  dias_restantes?: number
  faltantes?: string[]
}

interface AnalisisDetalle {
  proceso: {
    numero_proceso: string
    entidad: string
    objeto: string
    presupuesto: number
    departamento: string | null
    unspsc_code: string | null
    fecha_cierre: string | null
    url_documento: string | null
    tiene_adenda: boolean
    modalidad_estimada: string
  }
  cliente: {
    nombre: string
    departamentos: string[]
    municipio: string | null
    unspsc_codes: string[]
    presupuesto_min: number
    presupuesto_max: number
  }
  checklist: CheckItem[]
  documentos_subidos: string[]
  documentos_requeridos: string[]
  documentos_faltantes: string[]
}

interface EvalEstructurada {
  experiencia?: {
    min_contratos_requerido?: number
    contratos_cliente?: number
    valor_minimo_requerido?: number
    valor_experiencia_cliente?: number
    score?: number
  }
  capacidad_financiera?: {
    patrimonio_minimo_requerido?: number
    patrimonio_cliente?: number
    indicadores_requeridos?: string[]
    indicadores_cliente?: string[]
    indicadores_cumplidos?: number
    score?: number
  }
  capacidad_residual?: {
    min_crp_pct_requerido?: number
    crp_cliente?: number
    score?: number
  }
}

interface AnalisisPliegoData {
  requisitos_estructurados?: {
    experiencia?: {
      min_contratos?: number
      max_contratos?: number
      tipos_obra?: string[]
      valor_minimo_po_pct?: number
      valor_minimo_cop?: number
      matriz1?: {
        actividad?: string
        experiencia_general?: string
        experiencia_especifica?: string
      }
    }
    capacidad_financiera?: {
      patrimonio_minimo_po_pct?: number
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
      factores?: { nombre: string; codigo: string; puntaje_maximo: number }[]
      min_crp_pct?: number
    }
  }
  resumen_requisitos?: { campo: string; requerido: any; detalle?: any }[]
}

interface Analisis {
  id: number
  proceso_id: number
  cliente_id: number
  score_preseleccion: number
  score_pliego: number
  recomendacion: string
  faltantes: string[]
  riesgos: string[]
  detalle: AnalisisDetalle & {
    score_pliego_documental?: number
    score_pliego_estructurado?: number
    evaluacion_requisitos_estructurados?: EvalEstructurada
    cliente?: {
      perfil_financiero?: {
        patrimonio_liquido?: number
        ingresos_anuales?: number
        experiencia_valor_total?: number
        experiencia_cantidad?: number
        indicadores_financieros?: string[]
        capacidad_residual_pct?: number
        contratos_vigentes_valor?: number
      }
    }
  }
  analisis_pliego: AnalisisPliegoData
  fecha_analisis: string
}

function fmtCOP(n: number) {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
  return `$${n.toLocaleString('es-CO')}`
}

function recomendacionColor(r: string) {
  if (r === 'Participar') return 'var(--green)'
  if (r === 'Revisar manualmente') return 'var(--yellow)'
  return 'var(--red)'
}

function PreseleccionContent() {
  const searchParams = useSearchParams()
  const clienteId = searchParams.get('cliente_id')
  const procesoId = searchParams.get('proceso_id')

  const router = useRouter()
  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [postulado, setPostulado] = useState(false)

  useEffect(() => {
    if (postulado) {
      const t = setTimeout(() => router.push('/dashboard'), 2500)
      return () => clearTimeout(t)
    }
  }, [postulado, router])

  useEffect(() => {
    if (!clienteId || !procesoId) {
      setLoading(false)
      setError('Faltan parámetros cliente_id o proceso_id en la URL')
      return
    }

    fetch(`${API}/procesos/${procesoId}/preseleccion/${clienteId}`, { method: 'POST' })
      .then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then((data: Analisis) => { setAnalisis(data); setLoading(false) })
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
        <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>Pre-selección</span>
        <div style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        <StepIndicator clienteId={clienteId || ''} procesoId={procesoId || ''} current={2} />

        {loading ? (
          <div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 48 }}>Analizando proceso...</div>
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
                  <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Checklist de pre-selección</h1>
                  <p style={{ color: 'var(--text-sec)', fontSize: 13 }}>
                    {analisis.detalle.proceso.entidad} · {analisis.detalle.proceso.numero_proceso}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 4 }}>Recomendación</div>
                  <div style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: recomendacionColor(analisis.recomendacion),
                  }}>
                    {analisis.recomendacion}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 4 }}>
                    Score {analisis.score_preseleccion}/100
                  </div>
                </div>
              </div>

              <div style={{ height: 8, background: 'var(--bg)', borderRadius: 4, overflow: 'hidden', marginTop: 20 }}>
                <div style={{
                  width: `${analisis.score_preseleccion}%`,
                  height: '100%',
                  background: recomendacionColor(analisis.recomendacion),
                  transition: 'width 300ms ease',
                }} />
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
                Información del proceso
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13 }}>
                <Info label="Modalidad estimada" value={analisis.detalle.proceso.modalidad_estimada} />
                <Info label="Presupuesto oficial" value={fmtCOP(analisis.detalle.proceso.presupuesto)} />
                <Info label="Departamento" value={analisis.detalle.proceso.departamento || '—'} />
                <Info label="UNSPSC" value={analisis.detalle.proceso.unspsc_code || '—'} />
                <Info label="Fecha de cierre" value={analisis.detalle.proceso.fecha_cierre ? new Date(analisis.detalle.proceso.fecha_cierre).toLocaleString('es-CO') : '—'} />
                <Info label="Adenda" value={analisis.detalle.proceso.tiene_adenda ? 'Sí' : 'No'} />
              </div>
              <div style={{ marginTop: 16 }}>
                <Info label="Objeto" value={analisis.detalle.proceso.objeto || '—'} />
              </div>
            </div>

            {/* ── Análisis estructurado del pliego ── */}
            {analisis.analisis_pliego?.requisitos_estructurados && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 24,
                marginBottom: 24,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                  Análisis estructurado del pliego
                </div>

                {/* Score del pliego desglosado */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
                  <ScoreBox label="Score pliego" value={analisis.score_pliego} />
                  <ScoreBox label="Documental" value={analisis.detalle.score_pliego_documental ?? 0} />
                  <ScoreBox label="Estructurado" value={analisis.detalle.score_pliego_estructurado ?? 0} />
                </div>

                {/* Experiencia */}
                {analisis.analisis_pliego.requisitos_estructurados.experiencia && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>Experiencia requerida</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                      <Info label="Contratos mínimos" value={`${analisis.analisis_pliego.requisitos_estructurados.experiencia.min_contratos ?? '—'}`} />
                      <Info label="Contratos del cliente" value={`${analisis.detalle.cliente?.perfil_financiero?.experiencia_cantidad ?? 0}`} />
                      <Info label="Valor mínimo requerido" value={fmtCOP(analisis.analisis_pliego.requisitos_estructurados.experiencia.valor_minimo_cop ?? 0)} />
                      <Info label="Experiencia del cliente" value={fmtCOP(analisis.detalle.cliente?.perfil_financiero?.experiencia_valor_total ?? 0)} />
                    </div>
                    {analisis.analisis_pliego.requisitos_estructurados.experiencia.tipos_obra && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 4 }}>TIPOS DE OBRA ACEPTADOS</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {analisis.analisis_pliego.requisitos_estructurados.experiencia.tipos_obra.map((t, i) => (
                            <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, background: 'rgba(59,130,246,.12)', color: '#3b82f6' }}>{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {analisis.analisis_pliego.requisitos_estructurados.experiencia.matriz1 && (
                      <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-sec)', lineHeight: 1.5 }}>
                        <strong>Matriz 1:</strong> {analisis.analisis_pliego.requisitos_estructurados.experiencia.matriz1.actividad}<br/>
                        {analisis.analisis_pliego.requisitos_estructurados.experiencia.matriz1.experiencia_general}
                      </div>
                    )}
                  </div>
                )}

                {/* Capacidad financiera */}
                {analisis.analisis_pliego.requisitos_estructurados.capacidad_financiera && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16, marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>Capacidad financiera</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12 }}>
                      <Info label="Patrimonio mínimo requerido" value={fmtCOP(analisis.analisis_pliego.requisitos_estructurados.capacidad_financiera.patrimonio_minimo_cop ?? 0)} />
                      <Info label="Patrimonio del cliente" value={fmtCOP(analisis.detalle.cliente?.perfil_financiero?.patrimonio_liquido ?? 0)} />
                    </div>
                    {analisis.analisis_pliego.requisitos_estructurados.capacidad_financiera.indicadores_requeridos && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 4 }}>INDICADORES REQUERIDOS</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {analisis.analisis_pliego.requisitos_estructurados.capacidad_financiera.indicadores_requeridos.map((ind, i) => {
                            const clienteTiene = analisis.detalle.cliente?.perfil_financiero?.indicadores_financieros?.includes(ind) ?? false
                            return (
                              <span key={i} style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 3,
                                background: clienteTiene ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.1)',
                                color: clienteTiene ? 'var(--green)' : 'var(--red)',
                              }}>
                                {clienteTiene ? '✓' : '✕'} {ind}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {analisis.analisis_pliego.requisitos_estructurados.capacidad_financiera.matriz2?.resumen && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 4 }}>MATRIZ 2 — VALORES CONCERTADOS</div>
                        {Object.entries(analisis.analisis_pliego.requisitos_estructurados.capacidad_financiera.matriz2.resumen).map(([perfil, cats]) => (
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

                {/* Capacidad residual */}
                {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual?.requerida && (
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)', marginBottom: 10 }}>Capacidad residual</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12, marginBottom: 10 }}>
                      <Info label="CRP del cliente" value={`${analisis.detalle.cliente?.perfil_financiero?.capacidad_residual_pct ?? 0}%`} />
                      <Info label="CRP mínimo requerido" value={`${analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.min_crp_pct ?? 'No determinado'}%`} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-sec)', lineHeight: 1.6 }}>
                      {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.formula_crpc_corto_plazo && <div>• {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.formula_crpc_corto_plazo}</div>}
                      {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.formula_crpc_largo_plazo && <div>• {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.formula_crpc_largo_plazo}</div>}
                      {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.requisito_crp_crpc && <div>• {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.requisito_crp_crpc}</div>}
                    </div>
                    {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.factores && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 4 }}>FACTORES / PUNTAJE MÁXIMO</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {analisis.analisis_pliego.requisitos_estructurados.capacidad_residual.factores.map((f, i) => (
                            <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, background: 'rgba(245,158,11,.12)', color: 'var(--yellow)' }}>
                              {f.codigo}: {f.puntaje_maximo}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {clienteId && (
              <div style={{ marginBottom: 24 }}>
                <ClientProfilePanel clienteId={Number(clienteId)} />
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
                Checklist
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {analisis.detalle.checklist.map((c, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 12,
                    background: 'var(--bg)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: c.cumple ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.1)',
                      border: `1px solid ${c.cumple ? 'var(--green)' : 'var(--red)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontSize: 12,
                      color: c.cumple ? 'var(--green)' : 'var(--red)',
                      fontWeight: 700,
                    }}>
                      {c.cumple ? '✓' : '✕'}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{c.item}</div>
                      {c.dias_restantes !== undefined && c.dias_restantes !== null && (
                        <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2 }}>
                          {c.dias_restantes > 0 ? `${c.dias_restantes} días restantes` : 'Proceso vencido'}
                        </div>
                      )}
                      {c.faltantes && c.faltantes.length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>
                          Faltan: {c.faltantes.join(', ')}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>{c.peso}%</div>
                  </div>
                ))}
              </div>
            </div>

            {analisis.riesgos.length > 0 && (
              <div style={{
                background: 'rgba(245,158,11,0.08)',
                border: '1px solid rgba(245,158,11,.35)',
                borderRadius: 8,
                padding: 20,
                marginBottom: 24,
              }}>
                <div style={{ fontSize: 12, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Riesgos detectados
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 13 }}>
                  {analisis.riesgos.map((r, i) => <li key={i} style={{ marginBottom: 4 }}>{r}</li>)}
                </ul>
              </div>
            )}

            {analisis.faltantes.length > 0 && (
              <div style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,.35)',
                borderRadius: 8,
                padding: 20,
                marginBottom: 24,
              }}>
                <div style={{ fontSize: 12, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Acciones requeridas
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 13 }}>
                  {analisis.faltantes.map((f, i) => <li key={i} style={{ marginBottom: 4 }}>{f}</li>)}
                </ul>
              </div>
            )}

            {/* Documentos: comparación requeridos vs subidos */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                Comparación de documentos
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <DocStat label="Requeridos" value={analisis.detalle.documentos_requeridos.length} color="var(--text)" />
                <DocStat label="Subidos" value={analisis.detalle.documentos_subidos.length} color="var(--green)" />
                <DocStat label="Faltantes" value={analisis.detalle.documentos_faltantes.length} color={analisis.detalle.documentos_faltantes.length > 0 ? 'var(--red)' : 'var(--green)'} />
              </div>
              {analisis.detalle.documentos_faltantes.length > 0 && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 6, padding: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 6 }}>Documentos faltantes para postularse:</div>
                  <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 12 }}>
                    {analisis.detalle.documentos_faltantes.map((f, i) => <li key={i} style={{ marginBottom: 3 }}>{f}</li>)}
                  </ul>
                </div>
              )}
              {!postulado ? (
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setPostulado(true)}
                    disabled={analisis.detalle.documentos_faltantes.length > 0 || analisis.recomendacion !== 'Participar'}
                    style={{
                      background: analisis.detalle.documentos_faltantes.length > 0 || analisis.recomendacion !== 'Participar' ? 'var(--border)' : 'var(--green)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 22px',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: analisis.detalle.documentos_faltantes.length > 0 || analisis.recomendacion !== 'Participar' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Postularse ahora
                  </button>
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
                  {analisis.detalle.proceso.url_documento && (
                    <a
                      href={typeof analisis.detalle.proceso.url_documento === 'string' && analisis.detalle.proceso.url_documento.startsWith('http')
                        ? analisis.detalle.proceso.url_documento
                        : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        border: '1px solid var(--border)',
                        color: 'var(--text)',
                        padding: '10px 22px',
                        borderRadius: 6,
                        fontSize: 14,
                        textDecoration: 'none',
                      }}
                    >
                      Ver pliego en SECOP
                    </a>
                  )}
                </div>
              ) : (
                <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid var(--green)', borderRadius: 6, padding: 16 }}>
                  <div style={{ fontSize: 14, color: 'var(--green)', fontWeight: 700, marginBottom: 4 }}>✓ Postulación confirmada</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 12 }}>
                    Has iniciado el proceso de postulación para <strong>{analisis.detalle.proceso.entidad}</strong>. Revisa tu correo para los siguientes pasos y mantén tus documentos actualizados.
                  </div>
                  <Link
                    href="/dashboard"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: 'var(--green)', color: '#fff',
                      padding: '8px 16px', borderRadius: 4,
                      fontSize: 13, fontWeight: 600, textDecoration: 'none',
                    }}
                  >
                    Ir al dashboard →
                  </Link>
                </div>
              )}
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
      <div style={{ fontSize: 11, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}

function DocStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

function ScoreBox({ label, value }: { label: string; value: number }) {
  const col = value >= 80 ? 'var(--green)' : value >= 50 ? '#facc15' : 'var(--red)'
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: col, marginBottom: 4 }}>{value}%</div>
      <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    </div>
  )
}

export default function PreseleccionPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 48 }}>Cargando...</div>}>
      <PreseleccionContent />
    </Suspense>
  )
}
