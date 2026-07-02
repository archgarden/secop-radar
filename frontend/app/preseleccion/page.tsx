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

interface FaltanteDetallado {
  categoria: string
  item: string
  requerido: string
  actual: string
  diferencia: string
  score: number
}

interface CoreDocumento {
  id: string
  nombre: string
  categoria: string
  tipo_core: string
  obligatorio: boolean
  keywords: string[]
  frecuencia_absoluta: number
  frecuencia_relativa: number
  requerido_en_pliego: number
  requerido_relativo: number
  frecuencia_label: string
  procesos_analizados: number
  no_aplica?: boolean
}

interface CoreDocumentos {
  version?: string
  fecha_generacion?: string
  fuente?: string
  procesos_analizados?: number
  umbrales?: { obligatorio: number; frecuente: number }
  proponente?: CoreDocumento[]
  pliego?: CoreDocumento[]
  calidad?: CoreDocumento[]
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
  documentos_base_fijos?: CoreDocumentos
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
    faltantes_detallados?: FaltanteDetallado[]
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

function categoriaColor(c: string) {
  if (c === 'experiencia') return '#3b82f6'
  if (c === 'capacidad_financiera') return '#22c55e'
  if (c === 'capacidad_residual') return '#f59e0b'
  if (c === 'documento') return '#ef4444'
  if (c === 'ubicacion') return '#a855f7'
  if (c === 'rubro') return '#a855f7'
  if (c === 'presupuesto') return '#f59e0b'
  if (c === 'vigencia') return '#ef4444'
  return '#64748b'
}

function categoriaLabel(c: string) {
  const map: Record<string, string> = {
    experiencia: 'EXPERIENCIA',
    capacidad_financiera: 'CAPACIDAD FINANCIERA',
    capacidad_residual: 'CAPACIDAD RESIDUAL',
    documento: 'DOCUMENTO',
    ubicacion: 'UBICACIÓN',
    rubro: 'RUBRO',
    presupuesto: 'PRESUPUESTO',
    vigencia: 'VIGENCIA',
  }
  return map[c] || c.toUpperCase()
}

function coreCategoriaLabel(c: string) {
  const map: Record<string, string> = {
    proponente: 'Documentos del proponente',
    pliego: 'Anexos del pliego',
    calidad: 'Documentos de calidad / técnicos',
  }
  return map[c] || c
}

function coreFrecuenciaColor(label: string) {
  if (label === 'obligatorio') return 'var(--green)'
  if (label === 'frecuente') return 'var(--yellow)'
  return 'var(--text-sec)'
}

function documentoSubido(doc: CoreDocumento, subidos: string[]): boolean {
  const terminos = [doc.nombre, ...doc.keywords]
  for (const termino of terminos) {
    if (!termino) continue
    const reqPalabras = termino.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim().split(/\s+/).filter(Boolean)
    if (reqPalabras.length === 0) continue
    for (const nombre of subidos) {
      const docPalabras = nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim().split(/\s+/).filter(Boolean)
      const interseccion = reqPalabras.filter(p => docPalabras.includes(p))
      if (interseccion.length >= 2 || (reqPalabras.length === 1 && interseccion.length === 1)) {
        return true
      }
    }
  }
  return false
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
                <ClientProfilePanel clienteId={Number(clienteId)} compact />
              </div>
            )}

            {/* ── Diferencias exactas: requisito vs perfil ── */}
            {analisis.detalle.faltantes_detallados && analisis.detalle.faltantes_detallados.length > 0 && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 24,
                marginBottom: 24,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                  Diferencias exactas (requerido vs perfil)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {analisis.detalle.faltantes_detallados.map((f, i) => (
                    <div key={i} style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: 14,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '.06em',
                          color: categoriaColor(f.categoria),
                          border: `1px solid ${categoriaColor(f.categoria)}`,
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}>
                          {categoriaLabel(f.categoria)}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{f.item}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, fontSize: 12, marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 2 }}>REQUERIDO</div>
                          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{f.requerido}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 2 }}>PERFIL ACTUAL</div>
                          <div style={{ color: 'var(--text)', fontWeight: 500 }}>{f.actual}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 2 }}>DIFERENCIA</div>
                          <div style={{ color: 'var(--red)', fontWeight: 500 }}>{f.diferencia}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-sec)' }}>
                        Score parcial: <span style={{ fontWeight: 600, color: f.score >= 80 ? 'var(--green)' : f.score >= 50 ? '#facc15' : 'var(--red)' }}>{f.score}%</span>
                      </div>
                    </div>
                  ))}
                </div>
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

            {/* Core de documentos base fijos */}
            {analisis.detalle.documentos_base_fijos && clienteId && (
              <CoreDocumentosPanel
                core={analisis.detalle.documentos_base_fijos}
                subidos={analisis.detalle.documentos_subidos}
                clienteId={Number(clienteId)}
              />
            )}
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

function CoreDocumentosPanel({ core, subidos, clienteId }: { core: CoreDocumentos; subidos: string[]; clienteId: number }) {
  const [categoriaActiva, setCategoriaActiva] = useState<'proponente' | 'pliego' | 'calidad'>('proponente')
  const [frecuenciaFiltro, setFrecuenciaFiltro] = useState<'todos' | 'obligatorio' | 'frecuente' | 'segun_pliego'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [mostrarNoAplica, setMostrarNoAplica] = useState(true)
  const [noAplicaIds, setNoAplicaIds] = useState<Set<string>>(() => {
    const ids = new Set<string>()
    ;(['proponente', 'pliego', 'calidad'] as const).forEach(c => {
      core[c]?.forEach(doc => {
        if (doc.no_aplica) ids.add(doc.id)
      })
    })
    return ids
  })
  const [guardando, setGuardando] = useState<string | null>(null)

  const categorias = (['proponente', 'pliego', 'calidad'] as const).filter(c => (core[c]?.length || 0) > 0)
  const docs = core[categoriaActiva] || []

  const toggleNoAplica = async (docId: string) => {
    const siguiente = new Set(noAplicaIds)
    if (siguiente.has(docId)) {
      siguiente.delete(docId)
    } else {
      siguiente.add(docId)
    }
    setNoAplicaIds(siguiente)
    setGuardando(docId)
    try {
      const res = await fetch(`${API}/clientes/${clienteId}/documentos-no-aplica`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentos_no_aplica: Array.from(siguiente) }),
      })
      if (!res.ok) throw new Error(await res.text())
    } catch (err: any) {
      alert('Error guardando preferencia: ' + err.message)
      // Revertir en caso de error
      const revertido = new Set(noAplicaIds)
      if (revertido.has(docId)) revertido.delete(docId)
      else revertido.add(docId)
      setNoAplicaIds(revertido)
    } finally {
      setGuardando(null)
    }
  }

  const docsFiltrados = docs.filter(doc => {
    const matchFrecuencia = frecuenciaFiltro === 'todos' || doc.frecuencia_label === frecuenciaFiltro
    const q = busqueda.toLowerCase()
    const matchBusqueda = !q ||
      doc.nombre.toLowerCase().includes(q) ||
      doc.keywords.some(k => k.toLowerCase().includes(q))
    const matchNoAplica = mostrarNoAplica || !noAplicaIds.has(doc.id)
    return matchFrecuencia && matchBusqueda && matchNoAplica
  })

  const docsVisiblesRelevantes = docs.filter(doc => !noAplicaIds.has(doc.id))
  const subidosCount = docsVisiblesRelevantes.filter(d => documentoSubido(d, subidos)).length
  const pendientesCount = docsVisiblesRelevantes.length - subidosCount
  const progreso = docsVisiblesRelevantes.length ? Math.round((subidosCount / docsVisiblesRelevantes.length) * 100) : 0

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 24,
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Core de documentos base
        </div>
        {core.procesos_analizados ? (
          <div style={{ fontSize: 11, color: 'var(--text-sec)' }}>
            Basado en {core.procesos_analizados} pliegos analizados
          </div>
        ) : null}
      </div>

      {/* Tabs de categoría */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {categorias.map(categoria => (
          <button
            key={categoria}
            onClick={() => { setCategoriaActiva(categoria); setBusqueda(''); setFrecuenciaFiltro('todos') }}
            style={{
              background: categoriaActiva === categoria ? 'var(--blue)' : 'transparent',
              color: categoriaActiva === categoria ? '#fff' : 'var(--text-sec)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {coreCategoriaLabel(categoria)}
          </button>
        ))}
      </div>

      {/* Filtros y búsqueda */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={frecuenciaFiltro}
          onChange={e => setFrecuenciaFiltro(e.target.value as any)}
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}
        >
          <option value="todos">Todas las frecuencias</option>
          <option value="obligatorio">Obligatorio</option>
          <option value="frecuente">Frecuente</option>
          <option value="segun_pliego">Según pliego</option>
        </select>
        <input
          type="text"
          placeholder="Buscar documento..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          style={{
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
            flex: 1,
            minWidth: 180,
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-sec)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={mostrarNoAplica}
            onChange={e => setMostrarNoAplica(e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
          Mostrar no aplica
        </label>
      </div>

      {/* Resumen */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <DocStat label="Relevantes" value={docsVisiblesRelevantes.length} color="var(--text)" />
        <DocStat label="Subidos" value={subidosCount} color="var(--green)" />
        <DocStat label="Pendientes" value={pendientesCount} color={pendientesCount > 0 ? 'var(--red)' : 'var(--green)'} />
        <DocStat label="Progreso" value={progreso} color={progreso >= 80 ? 'var(--green)' : progreso >= 50 ? 'var(--yellow)' : 'var(--red)'} />
      </div>

      {/* Lista de documentos */}
      <div style={{ display: 'grid', gap: 8 }}>
        {docsFiltrados.map(doc => {
          const subido = documentoSubido(doc, subidos)
          const pct = Math.round((doc.requerido_relativo || 0) * 100)
          const noAplica = noAplicaIds.has(doc.id)
          return (
            <div
              key={doc.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: noAplica ? 'rgba(100,116,139,0.08)' : 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
                opacity: noAplica ? 0.7 : 1,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: subido ? 'var(--green)' : noAplica ? 'var(--text-sec)' : 'var(--red)',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 4 }}>
                  {doc.nombre}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-sec)' }}>
                    Requerido en {pct}% de los pliegos
                  </div>
                  <div style={{ flex: 1, minWidth: 80, maxWidth: 160, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: pct >= 70 ? 'var(--green)' : pct >= 30 ? 'var(--yellow)' : 'var(--text-sec)' }} />
                  </div>
                  {doc.frecuencia_label ? (
                    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: coreFrecuenciaColor(doc.frecuencia_label), fontWeight: 600 }}>
                      {doc.frecuencia_label}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                onClick={() => toggleNoAplica(doc.id)}
                disabled={guardando === doc.id}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: noAplica ? 'var(--text-sec)' : 'transparent',
                  color: noAplica ? '#fff' : 'var(--text-sec)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  cursor: 'pointer',
                }}
              >
                {guardando === doc.id ? 'Guardando...' : noAplica ? 'No aplica' : 'Marcar no aplica'}
              </button>
            </div>
          )
        })}
        {docsFiltrados.length === 0 && (
          <div style={{ color: 'var(--text-sec)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            No hay documentos que coincidan con los filtros.
          </div>
        )}
      </div>
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
