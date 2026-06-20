'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import StepIndicator from '@/components/StepIndicator'
import ClientProfilePanel from '@/components/ClientProfilePanel'

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

interface Analisis {
  id: number
  proceso_id: number
  cliente_id: number
  score_preseleccion: number
  recomendacion: string
  faltantes: string[]
  riesgos: string[]
  detalle: AnalisisDetalle
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

export default function PreseleccionPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 48 }}>Cargando...</div>}>
      <PreseleccionContent />
    </Suspense>
  )
}
