'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Proceso {
  id: number
  numero_proceso: string
  referencia_proceso: string | null
  entidad: string
  objeto: string
  presupuesto: number
  departamento: string | null
  unspsc_code: string | null
  url_documento: string | null
  estado_proceso: string | null
  modalidad: string | null
  tiene_adenda: boolean
  score_match: number
  fecha_cierre: string | null
}

function scoreColor(s: number) {
  if (s > 70) return 'var(--green)'
  if (s >= 40) return 'var(--yellow)'
  return 'var(--red)'
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-CO')
}

function esUrlSecopDirecta(url: string | null): boolean {
  return !!url && url.includes('OpportunityDetail')
}

function construirUrlSecop(proceso: Proceso): string {
  if (esUrlSecopDirecta(proceso.url_documento)) return proceso.url_documento!
  return `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?id=${encodeURIComponent(proceso.numero_proceso)}`
}

export default function ProcesosCliente() {
  const params = useParams()
  const clienteId = params.id as string
  const [procesos, setProcesos] = useState<Proceso[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('')
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarMsg, setRadarMsg] = useState('')

  useEffect(() => {
    fetch(`${API}/clientes/${clienteId}/procesos`)
      .then(r => r.json())
      .then(data => { setProcesos(data); setLoading(false) })
  }, [clienteId])

  const filtrados = procesos.filter(p =>
    !filtro ||
    p.entidad.toLowerCase().includes(filtro.toLowerCase()) ||
    p.objeto.toLowerCase().includes(filtro.toLowerCase()) ||
    (p.departamento || '').toLowerCase().includes(filtro.toLowerCase())
  )

  async function correrRadar() {
    setRadarLoading(true)
    setRadarMsg('')
    try {
      const r = await fetch(`${API}/radar/correr/${clienteId}`, { method: 'POST' })
      const data = await r.json()
      setRadarMsg(`${data.procesos_nuevos} procesos nuevos detectados`)
      const fresh = await fetch(`${API}/clientes/${clienteId}/procesos`).then(r => r.json())
      setProcesos(fresh)
    } catch {
      setRadarMsg('Error al correr radar')
    } finally {
      setRadarLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <nav style={{
        background: 'var(--header)',
        borderBottom: '1px solid var(--border)',
        padding: '0 28px',
        display: 'flex',
        alignItems: 'center',
        height: 56,
        gap: 28,
        boxShadow: '0 2px 20px rgba(0,0,0,.5)',
      }}>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} className="pulse-status" />
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15, letterSpacing: '3px', textTransform: 'uppercase' }}>
          SECOP RADAR
        </span>
        <Link href="/dashboard" style={{ color: 'var(--text-sec)', fontSize: 13 }}>Dashboard</Link>
        <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>Procesos compatibles</span>
      </nav>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600 }}>Procesos compatibles</h1>
            <p style={{ color: 'var(--text-sec)', fontSize: 13, marginTop: 4 }}>
              {procesos.length} procesos encontrados · ordenados por score de compatibilidad
            </p>
          </div>
          <button
            onClick={correrRadar}
            disabled={radarLoading}
            style={{
              background: radarLoading ? 'var(--border)' : 'var(--orange)',
              color: '#fff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: radarLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {radarLoading ? 'Corriendo radar...' : 'Actualizar radar'}
          </button>
        </div>

        {radarMsg && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--green)',
            color: 'var(--green)',
            padding: '10px 16px',
            borderRadius: 4,
            marginBottom: 16,
            fontSize: 13,
          }}>
            {radarMsg}
          </div>
        )}

        <input
          style={{
            width: '100%',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '9px 12px',
            color: 'var(--text)',
            fontSize: 14,
            outline: 'none',
            marginBottom: 16,
          }}
          placeholder="Filtrar por entidad, objeto o departamento..."
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
        />

        {loading ? (
          <div style={{ color: 'var(--text-sec)', padding: 48, textAlign: 'center' }}>Cargando procesos...</div>
        ) : filtrados.length === 0 ? (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 48,
            textAlign: 'center',
            color: 'var(--text-sec)',
          }}>
            Sin procesos para mostrar.
          </div>
        ) : (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{
                  background: 'var(--bg)',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text-sec)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500 }}>Score</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500 }}>Entidad</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500 }}>ID / Referencia SECOP II</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500 }}>Objeto</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500 }}>Depto</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500 }}>Estado</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500 }}>Presupuesto</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500 }}>Cierre</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500 }}>Flags</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500 }}>Pliego</th>
                  <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 500 }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p, i) => (
                  <tr key={p.id} style={{
                    borderBottom: i < filtrados.length - 1 ? '1px solid var(--border)' : 'none',
                    background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                  }}>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        display: 'inline-block',
                        background: `${scoreColor(p.score_match)}22`,
                        color: scoreColor(p.score_match),
                        padding: '3px 8px',
                        borderRadius: 3,
                        fontWeight: 700,
                        fontSize: 12,
                        minWidth: 44,
                        textAlign: 'center',
                      }}>
                        {p.score_match}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text)', maxWidth: 200 }}>
                      <div style={{ fontWeight: 500 }}>{p.entidad}</div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-sec)', fontSize: 12, maxWidth: 180 }}>
                      <div style={{ fontFamily: 'monospace', color: 'var(--text)' }}>{p.numero_proceso}</div>
                      {p.referencia_proceso && (
                        <div style={{ fontSize: 11, marginTop: 2 }}>Ref: {p.referencia_proceso}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-sec)', maxWidth: 280 }}>
                      <div style={{
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: '1.4',
                      }}>
                        {p.objeto || '—'}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-sec)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {p.departamento || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-sec)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {p.estado_proceso || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {p.presupuesto > 0 ? fmt(p.presupuesto) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center', color: 'var(--text-sec)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {p.fecha_cierre ? new Date(p.fecha_cierre).toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      {p.tiene_adenda && (
                        <span style={{
                          background: 'rgba(245,158,11,0.15)',
                          color: 'var(--yellow)',
                          padding: '2px 7px',
                          borderRadius: 3,
                          fontSize: 11,
                          fontWeight: 600,
                        }}>ADENDA</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <Link
                        href={`/procesos/resumen?cliente_id=${clienteId}&proceso_id=${p.id}`}
                        style={{
                          color: 'var(--orange)',
                          fontSize: 12,
                          border: '1px solid rgba(249,115,22,0.3)',
                          padding: '3px 10px',
                          borderRadius: 3,
                          textDecoration: 'none',
                          fontWeight: 600,
                        }}
                      >
                        Ver
                      </Link>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <Link
                          href={`/preseleccion?cliente_id=${clienteId}&proceso_id=${p.id}`}
                          style={{
                            background: 'var(--orange)',
                            color: '#fff',
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 3,
                            textDecoration: 'none',
                            fontWeight: 600,
                          }}
                        >
                          Postularse
                        </Link>
                        <Link
                          href={`/preseleccion?cliente_id=${clienteId}&proceso_id=${p.id}`}
                          style={{
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 3,
                            textDecoration: 'none',
                            fontWeight: 600,
                            border: '1px solid var(--border)',
                          }}
                        >
                          Pre-seleccionar
                        </Link>
                        <Link
                          href={`/pliego?cliente_id=${clienteId}&proceso_id=${p.id}`}
                          style={{
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 3,
                            textDecoration: 'none',
                            fontWeight: 600,
                            border: '1px solid var(--border)',
                          }}
                        >
                          Pliego
                        </Link>
                        <a
                          href={construirUrlSecop(p)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={esUrlSecopDirecta(p.url_documento) ? 'Abrir proceso en SECOP II' : 'Búsqueda en SECOP II (URL directa no disponible)'}
                          style={{
                            background: esUrlSecopDirecta(p.url_documento) ? 'rgba(59,130,246,.12)' : 'var(--surface)',
                            color: 'var(--blue)',
                            fontSize: 12,
                            padding: '4px 10px',
                            borderRadius: 3,
                            textDecoration: 'none',
                            fontWeight: 600,
                            border: '1px solid var(--border)',
                          }}
                        >
                          {esUrlSecopDirecta(p.url_documento) ? 'SECOP II ↗' : 'Buscar ↗'}
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
