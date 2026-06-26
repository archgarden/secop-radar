'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AnimatedBackground from '@/components/AnimatedBackground'
import BackgroundModePicker from '@/components/BackgroundModePicker'
import ThemeToggle from '@/components/ThemeToggle'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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

interface ExtraccionApi {
  tipo_documento?: string
  nit?: string
  razon_social?: string
  vigencia?: string
  unspsc?: string[]
  departamentos?: string[]
  confianza?: number
  patrimonio?: number | null
  ingresos?: number | null
  valor?: number
  entidad?: string
  fecha_inicio?: string
  fecha_fin?: string
  texto_preview?: string
}

interface DocumentoApi {
  id: number
  cliente_id: number
  nombre: string
  filename: string
  estado: string
  extraccion?: ExtraccionApi
  fecha_subida: string
}

interface PerfilApi {
  cliente_id: number
  nit: string | null
  razon_social: string | null
  vigencia_rup: string | null
  municipio: string | null
  unspsc: string[]
  departamentos: string[]
  patrimonio: number | null
  ingresos: number | null
  experiencia_valor_total: number
  experiencia_cantidad: number
  fuentes: Record<string, string>
}

export default function DocumentosCliente() {
  const params = useParams()
  const router = useRouter()
  const clienteId = params.id as string

  const [documentos, setDocumentos] = useState<DocumentoApi[]>([])
  const [perfil, setPerfil] = useState<PerfilApi | null>(null)
  const [coreDocumentos, setCoreDocumentos] = useState<CoreDocumentos | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [justUploaded, setJustUploaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${API}/clientes/${clienteId}/documentos`).then(r => r.json()),
      fetch(`${API}/clientes/${clienteId}/perfil`).then(r => r.json()),
      fetch(`${API}/clientes/${clienteId}/core-documentos`).then(r => r.ok ? r.json() : null),
    ])
      .then(([docs, perfilData, coreData]: [DocumentoApi[], PerfilApi, CoreDocumentos | null]) => {
        setDocumentos(docs)
        setPerfil(perfilData)
        setCoreDocumentos(coreData)
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [clienteId])

  async function subirArchivo(nombre: string, file: File) {
    setUploading(nombre)
    setExtracting(nombre)
    setError('')
    const formData = new FormData()
    formData.append('nombre', nombre)
    formData.append('archivo', file)
    try {
      const r = await fetch(`${API}/clientes/${clienteId}/documentos`, {
        method: 'POST',
        body: formData,
      })
      if (!r.ok) throw new Error(await r.text())
      const nuevo = await r.json()
      setDocumentos(prev => [...prev.filter(d => d.nombre !== nombre), nuevo])
      // Refrescar perfil consolidado tras subir un documento
      const perfilData = await fetch(`${API}/clientes/${clienteId}/perfil`).then(r => r.json())
      setPerfil(perfilData)
      setJustUploaded(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(null)
      setExtracting(null)
    }
  }

  async function eliminarDocumento(id: number) {
    try {
      const r = await fetch(`${API}/documentos/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await r.text())
      setDocumentos(prev => prev.filter(d => d.id !== id))
      const perfilData = await fetch(`${API}/clientes/${clienteId}/perfil`).then(r => r.json())
      setPerfil(perfilData)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const documentosCore = coreDocumentos?.proponente || []

  function documentoCubreCore(doc: CoreDocumento, nombresSubidos: string[]): DocumentoApi | undefined {
    const terminos = [doc.nombre, ...doc.keywords]
    for (const termino of terminos) {
      if (!termino) continue
      const reqPalabras = termino.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim().split(/\s+/).filter(Boolean)
      if (reqPalabras.length === 0) continue
      for (const nombre of nombresSubidos) {
        const docPalabras = nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, ' ').trim().split(/\s+/).filter(Boolean)
        const interseccion = reqPalabras.filter(p => docPalabras.includes(p))
        if (interseccion.length >= 2 || (reqPalabras.length === 1 && interseccion.length === 1)) {
          return documentos.find(d => d.nombre === nombre)
        }
      }
    }
    return undefined
  }

  const documentosRelevantes = documentosCore.filter(d => !d.no_aplica)
  const documentosCumplidos = documentosRelevantes.filter(d => documentoCubreCore(d, documentos.map(x => x.nombre)))
  const progreso = documentosRelevantes.length ? Math.min(Math.round((documentosCumplidos.length / documentosRelevantes.length) * 100), 100) : 0

  function fmtCOP(n: number | null) {
    if (!n) return '—'
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
    if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
    return `$${n.toLocaleString('es-CO')}`
  }

  function labelUNSPSC(code: string) {
    const prefix = code.slice(0, 4)
    if (prefix === '7214') return 'Infraestructura pública'
    if (prefix === '7212') return 'Edificación'
    if (prefix === '7215') return 'Mantenimiento'
    if (prefix === '8110') return 'Consultoría'
    return code
  }

  useEffect(() => {
    if (justUploaded && progreso === 100) {
      const t = setTimeout(() => router.push('/dashboard'), 2500)
      return () => clearTimeout(t)
    }
  }, [justUploaded, progreso, router])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      <AnimatedBackground />
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
        <Link href="/clientes/nuevo" style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>+ Cliente</Link>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <BackgroundModePicker />
          <ThemeToggle />
        </div>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Documentos de postulación</h1>
        <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 24 }}>
          Sube los documentos básicos que necesitarás para presentar ofertas en SECOP II. SECOP Radar extrae automáticamente los datos clave de cada archivo.
        </p>

        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: 20,
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Progreso</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: progreso === 100 ? 'var(--green)' : 'var(--orange)' }}>{progreso}%</span>
          </div>
          <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${progreso}%`,
              height: '100%',
              background: progreso === 100 ? 'var(--green)' : 'var(--orange)',
              transition: 'width 300ms ease',
            }} />
          </div>
          {progreso === 100 && justUploaded && (
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
              ✓ Todos los documentos listos. Redirigiendo al dashboard...
            </div>
          )}
        </div>

        {!loading && perfil && (
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 18,
            marginBottom: 24,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Perfil extraído del cliente</div>
              {perfil.razon_social && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{perfil.razon_social}</div>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <MiniMetric label="NIT" value={perfil.nit || '—'} />
              <MiniMetric label="RUP vigente hasta" value={perfil.vigencia_rup || '—'} />
              <MiniMetric label="Patrimonio líquido" value={fmtCOP(perfil.patrimonio)} />
              <MiniMetric label="Ingresos operacionales" value={fmtCOP(perfil.ingresos)} />
              <MiniMetric label="Experiencia acreditada" value={`${perfil.experiencia_cantidad} contratos · ${fmtCOP(perfil.experiencia_valor_total)}`} />
              <MiniMetric label="UNSPSC" value={perfil.unspsc.length > 0 ? perfil.unspsc.map(u => `${u} · ${labelUNSPSC(u)}`).join(', ') : '—'} />
            </div>
            {perfil.municipio && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Municipio de operación principal</div>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: 'rgba(249,115,22,.12)', color: 'var(--orange)', fontWeight: 600 }}>{perfil.municipio}</span>
              </div>
            )}
            {perfil.departamentos.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {perfil.departamentos.map(d => (
                  <span key={d} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: 'rgba(34,197,94,.12)', color: 'var(--green)', fontWeight: 500 }}>{d}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 40 }}>Cargando documentos y extracciones...</div>
        ) : documentosCore.length === 0 ? (
          <div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 40 }}>Core de documentos no disponible.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {documentosCore.map(docCore => {
              const doc = documentoCubreCore(docCore, documentos.map(d => d.nombre))
              const nombre = docCore.nombre
              const isUploading = uploading === nombre
              const isExtracting = extracting === nombre
              const noAplica = docCore.no_aplica
              return (
                <div key={docCore.id} style={{
                  background: noAplica ? 'rgba(100,116,139,0.08)' : 'var(--surface)',
                  border: `1px solid ${doc ? 'rgba(34,197,94,.35)' : noAplica ? 'var(--border)' : 'var(--border)'}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                  opacity: noAplica ? 0.7 : 1,
                }}>
                  <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: doc ? 'rgba(34,197,94,.15)' : noAplica ? 'rgba(100,116,139,.15)' : 'rgba(239,68,68,.1)',
                      border: `1px solid ${doc ? 'var(--green)' : noAplica ? 'var(--text-sec)' : 'var(--red)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {doc ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : noAplica ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-sec)" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{nombre}</div>
                        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: docCore.frecuencia_label === 'obligatorio' ? 'var(--green)' : docCore.frecuencia_label === 'frecuente' ? 'var(--yellow)' : 'var(--text-sec)', fontWeight: 600 }}>
                          {docCore.frecuencia_label}
                        </span>
                        {noAplica && <span style={{ fontSize: 9, color: 'var(--text-sec)', fontWeight: 600 }}>No aplica</span>}
                      </div>
                      {doc && (
                        <div style={{ fontSize: 11, color: 'var(--text-sec)', marginTop: 2 }}>
                          {doc.filename} · {new Date(doc.fecha_subida).toLocaleDateString('es-CO')}
                        </div>
                      )}
                      {isExtracting && (
                        <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="pulse-status" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)' }} />
                          Extrayendo datos del documento...
                        </div>
                      )}
                    </div>
                    {doc ? (
                      <button
                        onClick={() => eliminarDocumento(doc.id)}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          color: 'var(--text-sec)',
                          borderRadius: 4,
                          padding: '6px 12px',
                          fontSize: 12,
                          cursor: 'pointer',
                        }}
                      >
                        Cambiar
                      </button>
                    ) : (
                      <label style={{
                        background: isUploading || noAplica ? 'var(--border)' : 'var(--orange)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 4,
                        padding: '6px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: isUploading || noAplica ? 'not-allowed' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        {isUploading && (
                          <span style={{ width: 10, height: 10, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        )}
                        {isUploading ? 'Subiendo...' : noAplica ? 'No aplica' : 'Subir'}
                        <input
                          type="file"
                          style={{ display: 'none' }}
                          disabled={isUploading || noAplica}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) subirArchivo(nombre, file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                  </div>
                  {doc?.extraccion && !isExtracting && (
                    <ExtraccionCard extraccion={doc.extraccion} fmtCOP={fmtCOP} labelUNSPSC={labelUNSPSC} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid var(--red)',
            color: 'var(--red)',
            padding: '10px 14px',
            borderRadius: 4,
            fontSize: 13,
            marginTop: 16,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{
              background: 'var(--orange)',
              color: '#fff',
              border: 'none',
              padding: '9px 24px',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ir al dashboard
          </button>
          <Link
            href="/clientes/nuevo"
            style={{
              border: '1px solid var(--border)',
              color: 'var(--text-sec)',
              padding: '9px 24px',
              borderRadius: 4,
              fontSize: 14,
            }}
          >
            Registrar otro cliente
          </Link>
        </div>
      </main>
    </div>
  )
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  const display = value.length > 60 ? `${value.slice(0, 58)}…` : value
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }} title={value}>{display}</div>
    </div>
  )
}

function ExtraccionCard({ extraccion, fmtCOP, labelUNSPSC }: { extraccion: ExtraccionApi; fmtCOP: (n: number | null) => string; labelUNSPSC: (c: string) => string }) {
  const tipo = extraccion.tipo_documento
  const confianza = extraccion.confianza || 0
  return (
    <div style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: 'var(--orange)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>
          {tipo === 'rup' && 'Datos extraídos del RUP'}
          {tipo === 'estados_financieros' && 'Datos extraídos de estados financieros'}
          {tipo === 'certificado_experiencia' && 'Datos extraídos de certificado de experiencia'}
          {!tipo && 'Extracción'}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-sec)' }}>
          Confianza: {confianza >= 0.9 ? 'Alta' : confianza >= 0.6 ? 'Media' : 'Baja'}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {extraccion.nit && <MiniMetric label="NIT" value={extraccion.nit} />}
        {extraccion.razon_social && <MiniMetric label="Razón social" value={extraccion.razon_social} />}
        {extraccion.vigencia && <MiniMetric label="Vigencia" value={extraccion.vigencia} />}
        {extraccion.patrimonio !== undefined && extraccion.patrimonio !== null && <MiniMetric label="Patrimonio" value={fmtCOP(extraccion.patrimonio)} />}
        {extraccion.ingresos !== undefined && extraccion.ingresos !== null && <MiniMetric label="Ingresos" value={fmtCOP(extraccion.ingresos)} />}
        {extraccion.valor !== undefined && extraccion.valor !== null && <MiniMetric label="Valor experiencia" value={fmtCOP(extraccion.valor)} />}
        {extraccion.entidad && <MiniMetric label="Entidad" value={extraccion.entidad} />}
        {extraccion.fecha_inicio && extraccion.fecha_fin && (
          <MiniMetric label="Vigencia experiencia" value={`${extraccion.fecha_inicio} → ${extraccion.fecha_fin}`} />
        )}
      </div>
      {extraccion.unspsc && extraccion.unspsc.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>UNSPSC</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {extraccion.unspsc.map(u => (
              <span key={u} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: 'rgba(59,130,246,.12)', color: 'var(--blue)', fontWeight: 500 }}>{u} · {labelUNSPSC(u)}</span>
            ))}
          </div>
        </div>
      )}
      {extraccion.departamentos && extraccion.departamentos.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 9, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Departamentos</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {extraccion.departamentos.map(d => (
              <span key={d} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 3, background: 'rgba(34,197,94,.12)', color: 'var(--green)', fontWeight: 500 }}>{d}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
