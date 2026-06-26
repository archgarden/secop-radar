'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import StepIndicator from '@/components/StepIndicator'
import ThemeToggle from '@/components/ThemeToggle'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface Proceso {
  id: number
  numero_proceso: string
  referencia_proceso: string | null
  titulo: string | null
  entidad: string
  objeto: string
  presupuesto: number
  departamento: string | null
  unspsc_code: string | null
  url_documento: string | null
  estado_proceso: string | null
  modalidad: string | null
  fase: string | null
  tipo_contrato: string | null
  subtipo_contrato: string | null
  duracion: number | null
  unidad_duracion: string | null
  tiene_adenda: boolean
  score_match: number
  fecha_cierre: string | null
  fecha_publicacion: string | null
}

interface Contrato {
  nombre_entidad: string
  proveedor_adjudicado: string
  valor_del_contrato: string | number
  codigo_de_categoria_principal: string
  descripcion_del_proceso: string
  modalidad_de_contratacion: string
  estado_contrato: string
  fecha_de_firma: string
  departamento: string
  urlproceso: string | { url?: string } | null
}

interface DocumentoProceso {
  id: number
  proceso_id: number
  nombre: string
  filename: string
  path: string
  url: string | null
  size_bytes: number
  es_pliego: boolean
  estado: string
  fecha_descarga: string
}

function fmtCOP(n: number) {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
  return `$${n.toLocaleString('es-CO')}`
}

function fmtBytes(n: number) {
  if (!n) return '0 B'
  if (n >= 1_073_741_824) return `${(n / 1_073_741_824).toFixed(1)} GB`
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`
  if (n >= 1_024) return `${Math.round(n / 1_024)} KB`
  return `${n} B`
}

function esUrlSecopDirecta(url: string | null): boolean {
  return !!url && url.includes('OpportunityDetail')
}

function construirUrlSecop(proceso: Proceso): string {
  if (esUrlSecopDirecta(proceso.url_documento)) return proceso.url_documento!
  return `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?id=${encodeURIComponent(proceso.numero_proceso)}`
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

function analizarObjeto(objeto: string) {
  const texto = objeto.toLowerCase()

  const actividades = [
    'construcción', 'construccion', 'mantenimiento', 'rehabilitación', 'rehabilitacion',
    'interventoría', 'interventoria', 'diseño', 'diseno', 'estudios', 'consultoría', 'consultoria',
    'adecuación', 'adecuacion', 'remodelación', 'remodelacion', 'ampliación', 'ampliacion',
    'demolición', 'demolicion', 'pavimentación', 'pavimentacion', 'señalización', 'señalizacion',
    'drenaje', 'alcantarillado', 'acueducto', 'electricidad', 'pintura', 'cubierta',
    'estructura', 'cimentación', 'cimentacion', 'vías', 'vias', 'puentes', 'edificación', 'edificacion',
    'obra civil', 'obra pública', 'obra publica', 'locativo', 'suministro', 'instalación', 'instalacion',
    'excavación', 'excavacion', 'relleno', 'compactación', 'compactacion', 'impermeabilización',
    'impermeabilizacion', 'fontanería', 'fontaneria', 'iluminación', 'iluminacion'
  ]

  const materiales = [
    'concreto', 'acero', 'asfalto', 'madera', 'ladrillo', 'cemento', 'tubería', 'tuberia',
    'cable', 'pintura', 'arena', 'grava', 'hierro', 'aluminio', 'vidrio', 'cerámica', 'ceramica',
    'pvc', 'pebd', 'geomembrana', 'geotextil', 'adoquín', 'adoquin', 'baldosa', 'malla',
    'yeso', 'estuco', 'impermeabilizante', 'sellante'
  ]

  const entregables = [
    'diseños', 'planos', 'informes', 'estudios', 'memorias', 'manuales', 'interventoría',
    'interventoria', 'obra', 'servicios', 'asesoría', 'asesoria', 'acompañamiento', 'capacitación',
    'capacitacion', 'formulación', 'formulacion', 'evaluación', 'evaluacion', 'diagnóstico', 'diagnostico'
  ]

  const encontrar = (lista: string[]) =>
    Array.from(new Set(lista.filter(p => texto.includes(p)).map(p => p.replace(/ó/g, 'ó').replace(/í/g, 'í').replace(/é/g, 'é').replace(/á/g, 'á').replace(/ú/g, 'ú'))))

  return {
    actividades: encontrar(actividades),
    materiales: encontrar(materiales),
    entregables: encontrar(entregables),
  }
}

function recomendacionPostulacion(proceso: Proceso, restantes: number | null): { texto: string; color: string } {
  if (proceso.estado_proceso === 'Cancelado') return { texto: 'NO POSTULAR — Proceso cancelado', color: 'var(--red)' }
  if (proceso.estado_proceso === 'Borrador') return { texto: 'OBSERVAR — Aún es borrador', color: '#f59e0b' }
  if (restantes !== null && restantes < 0) return { texto: 'NO POSTULAR — Cierre vencido', color: 'var(--red)' }
  if (restantes !== null && restantes <= 3) return { texto: 'URGENTE — Quedan pocos días para postular', color: '#f59e0b' }
  if (proceso.estado_proceso === 'Publicado' || proceso.estado_proceso === 'Abierto') return { texto: 'POSTULAR — Proceso activo', color: 'var(--green)' }
  if (proceso.estado_proceso === 'Evaluación' || proceso.estado_proceso === 'Seleccionado') return { texto: 'EVALUAR — Proceso en evaluación', color: '#f59e0b' }
  return { texto: 'REVISAR — Verificar estado en SECOP II', color: 'var(--text-sec)' }
}

function CaptchaModal({ proceso, onDescargar, onVolver, descargando, mensaje }: {
  proceso: Proceso
  onDescargar: () => void
  onVolver: () => void
  descargando: boolean
  mensaje: string
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,.85)',
      backdropFilter: 'blur(4px)',
      zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderTop: '3px solid var(--orange)',
        borderRadius: 8,
        maxWidth: 560,
        width: '100%',
        padding: '28px 30px',
        boxShadow: '0 24px 60px rgba(0,0,0,.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'rgba(249,115,22,.15)',
            border: '1px solid rgba(249,115,22,.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 22 }}>🔒</span>
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
              Verificación de seguridad requerida
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-sec)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Paso obligatorio · SECOP II
            </div>
          </div>
        </div>

        <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, marginBottom: 16 }}>
          Para analizar el <strong>pliego de condiciones</strong>, los <strong>anexos</strong> y los <strong>formatos oficiales</strong> de este proceso, SECOP Radar debe descargar los documentos directamente desde el portal de Colombia Compra Eficiente.
        </div>

        <div style={{
          background: 'rgba(59,130,246,.08)',
          border: '1px solid rgba(59,130,246,.25)',
          borderRadius: 6,
          padding: '14px 16px',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>
            ¿Por qué me piden esto?
          </div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
            SECOP II protege el acceso a los documentos de los procesos con un CAPTCHA (prueba de seguridad). No hay otra forma legal de obtener el pliego y los anexos reales del proceso. Al completarlo una sola vez por proceso, el sistema puede analizar la información real y darte una recomendación fundamentada.
          </div>
        </div>

        <div style={{
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '12px 16px',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>Proceso</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{proceso.entidad}</div>
          <div style={{ fontSize: 12, color: 'var(--text-sec)', fontFamily: 'monospace', marginTop: 2 }}>{proceso.numero_proceso}</div>
        </div>

        {mensaje && (
          <div style={{
            background: descargando ? 'rgba(245,158,11,.1)' : 'rgba(34,197,94,.1)',
            border: `1px solid ${descargando ? 'rgba(245,158,11,.35)' : 'rgba(34,197,94,.35)'}`,
            borderRadius: 6,
            padding: '12px 16px',
            marginBottom: 18,
            fontSize: 12,
            color: descargando ? '#f59e0b' : 'var(--green)',
            lineHeight: 1.5,
          }}>
            {descargando && <span style={{ marginRight: 8 }}>⏳</span>}{mensaje}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={onDescargar}
            disabled={descargando}
            style={{
              flex: 1,
              background: descargando ? 'var(--border)' : 'var(--orange)',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '12px 20px',
              fontSize: 13,
              fontWeight: 700,
              cursor: descargando ? 'not-allowed' : 'pointer',
              minWidth: 200,
            }}
          >
            {descargando ? 'Esperando CAPTCHA...' : '1. Abrir Chrome y resolver CAPTCHA'}
          </button>
          <button
            onClick={onVolver}
            disabled={descargando}
            style={{
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text-sec)',
              borderRadius: 6,
              padding: '12px 20px',
              fontSize: 13,
              cursor: descargando ? 'not-allowed' : 'pointer',
            }}
          >
            Volver a procesos
          </button>
        </div>
      </div>
    </div>
  )
}

function ResumenContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const clienteId = searchParams.get('cliente_id')
  const procesoId = searchParams.get('proceso_id')

  const [proceso, setProceso] = useState<Proceso | null>(null)
  const [modalidad, setModalidad] = useState<{ modalidad: string; descripcion: string } | null>(null)
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [documentos, setDocumentos] = useState<DocumentoProceso[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [descargando, setDescargando] = useState(false)
  const [msgDescarga, setMsgDescarga] = useState('')
  const [mostrarCaptchaModal, setMostrarCaptchaModal] = useState(false)

  useEffect(() => {
    if (!clienteId || !procesoId) {
      setLoading(false)
      setError('Faltan parámetros cliente_id o proceso_id en la URL')
      return
    }

    Promise.all([
      fetch(`${API}/procesos/${procesoId}`).then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      }),
      fetch(`${API}/clientes/${clienteId}/contratos-similares`).then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      }),
      fetch(`${API}/procesos/${procesoId}/documentos`).then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      }),
    ])
      .then(([data, contratosApi, documentosApi]: [Proceso, Contrato[], DocumentoProceso[]]) => {
        setProceso(data)
        setContratos(contratosApi)
        setDocumentos(documentosApi)
        if (documentosApi.length === 0 && esUrlSecopDirecta(data.url_documento)) {
          setMostrarCaptchaModal(true)
        }
        if (data.presupuesto > 0) {
          fetch(`${API}/modalidad/recomendada/${data.presupuesto}`)
            .then(r => r.json())
            .then(setModalidad)
        }
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [clienteId, procesoId])

  async function descargarDocumentos() {
    if (!procesoId) return
    setDescargando(true)
    setMsgDescarga('Se abrió Chrome. Resuelve el CAPTCHA manualmente en la ventana del navegador. Esta operación puede tardar hasta 2 minutos.')
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 130000)
      const r = await fetch(`${API}/procesos/${procesoId}/descargar-documentos`, {
        method: 'POST',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const data = await r.json()
      if (!r.ok) throw new Error(data.detail || JSON.stringify(data))
      setMsgDescarga(`Descarga finalizada: ${data.descargados} documento(s) descargado(s), ${data.errores} error(es). Redirigiendo al análisis de pliego...`)
      const docs = await fetch(`${API}/procesos/${procesoId}/documentos`).then(r => r.json())
      setDocumentos(docs)
      if (data.descargados > 0) {
        setTimeout(() => {
          setMostrarCaptchaModal(false)
          router.push(`/pliego?cliente_id=${clienteId}&proceso_id=${procesoId}`)
        }, 1500)
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMsgDescarga('La descarga tardó demasiado. Revisa si el CAPTCHA fue resuelto y actualiza la página.')
      } else {
        setMsgDescarga(err instanceof Error ? err.message : 'Error al descargar documentos')
      }
    } finally {
      setDescargando(false)
    }
  }

  const restantes = proceso?.fecha_cierre ? diasRestantes(proceso.fecha_cierre) : null
  const duracion = proceso?.fecha_publicacion && proceso?.fecha_cierre
    ? duracionDias(proceso.fecha_publicacion, proceso.fecha_cierre)
    : null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', position: 'relative', overflow: 'hidden' }}>
      {proceso && mostrarCaptchaModal && (
        <CaptchaModal
          proceso={proceso}
          onDescargar={descargarDocumentos}
          onVolver={() => window.location.href = `/procesos/${clienteId}`}
          descargando={descargando}
          mensaje={msgDescarga}
        />
      )}
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
        <div style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        <StepIndicator clienteId={clienteId || ''} procesoId={procesoId || ''} current={1} />

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-sec)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>
                    ID SECOP II
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {proceso.numero_proceso}
                  </div>
                  {proceso.referencia_proceso && (
                    <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>
                      Referencia: <span style={{ fontWeight: 600, color: 'var(--text)' }}>{proceso.referencia_proceso}</span>
                    </div>
                  )}
                </div>
                <a
                  href={construirUrlSecop(proceso)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={esUrlSecopDirecta(proceso.url_documento) ? 'Abrir proceso en SECOP II' : 'Búsqueda en SECOP II (URL directa no disponible)'}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: esUrlSecopDirecta(proceso.url_documento) ? 'rgba(59,130,246,.12)' : 'var(--bg)',
                    border: `1px solid ${esUrlSecopDirecta(proceso.url_documento) ? 'rgba(59,130,246,.3)' : 'var(--border)'}`,
                    color: 'var(--blue)', fontSize: 12, fontWeight: 700,
                    padding: '8px 14px', borderRadius: 5, textDecoration: 'none',
                    letterSpacing: '.03em', flexShrink: 0,
                  }}
                >
                  {esUrlSecopDirecta(proceso.url_documento) ? 'Ver en SECOP II ↗' : 'Buscar en SECOP II ↗'}
                </a>
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
                <Info label="ID SECOP II" value={proceso.numero_proceso} />
                <Info label="Referencia del proceso" value={proceso.referencia_proceso || '—'} />
                <Info label="Estado en SECOP II" value={proceso.estado_proceso || '—'} />
                <Info label="Modalidad" value={proceso.modalidad || '—'} />
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

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
              <Link
                href="/dashboard"
                style={{
                  background: 'var(--orange)',
                  color: '#fff',
                  padding: '10px 22px',
                  borderRadius: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Dashboard
              </Link>
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
            </div>

            {/* Documentos descargados de SECOP II */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Documentos descargados de SECOP II
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-sec)' }}>{documentos.length} documento(s)</span>
              </div>

              {documentos.length === 0 ? (
                <div style={{
                  background: 'var(--bg)',
                  border: '1px dashed var(--border)',
                  borderRadius: 6,
                  padding: '16px 18px',
                  fontSize: 12,
                  color: 'var(--text-sec)',
                  lineHeight: 1.5,
                }}>
                  No hay documentos descargados para este proceso.<br />
                  La descarga automática desde SECOP II está controlada por el scraper (variable <code style={{ color: 'var(--orange)' }}>SCOP_SCRAPER_ENABLED</code> en el backend). Cuando esté habilitada, aquí aparecerán el pliego, anexos y formatos.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {documentos.map(d => (
                    <div key={d.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '10px 14px',
                    }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.nombre}
                          {d.es_pliego && (
                            <span style={{ marginLeft: 8, fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(249,115,22,.15)', color: 'var(--orange)', fontWeight: 700 }}>PLIEGO</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-sec)', marginTop: 2 }}>
                          {fmtBytes(d.size_bytes)} · {d.estado} · {new Date(d.fecha_descarga).toLocaleString('es-CO')}
                        </div>
                      </div>
                      <a
                        href={`${API}/documentos-proceso/${d.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          background: 'rgba(59,130,246,.12)',
                          border: '1px solid rgba(59,130,246,.3)',
                          color: '#3b82f6',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '5px 10px',
                          borderRadius: 4,
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Abrir
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                Alcance y actividades del proceso
              </div>

              <div style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: 16,
                marginBottom: 16,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-sec)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                  Objeto / Descripción completa
                </div>
                <p style={{ color: 'var(--text)', fontSize: 14, lineHeight: 1.7, margin: 0, whiteSpace: 'pre-line' }}>
                  {proceso.objeto}
                </p>
                {proceso.titulo && proceso.titulo !== proceso.objeto && (
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-sec)' }}>
                    <span style={{ fontWeight: 600 }}>Nombre del procedimiento:</span> {proceso.titulo}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, fontSize: 13, marginBottom: 16 }}>
                <Info label="Duración del contrato" value={proceso.duracion ? `${proceso.duracion} ${proceso.unidad_duracion || 'días'}` : '—'} />
                <Info label="Fase actual" value={proceso.fase || '—'} />
                <Info label="Tipo de contrato" value={proceso.tipo_contrato || '—'} />
                <Info label="Subtipo" value={proceso.subtipo_contrato || '—'} />
                <Info label="Modalidad" value={proceso.modalidad || '—'} />
                <Info label="Estado" value={proceso.estado_proceso || '—'} />
              </div>

              {(() => {
                const analisis = analizarObjeto(proceso.objeto)
                return (
                  <>
                    {analisis.actividades.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-sec)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                          Actividades identificadas
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {analisis.actividades.map((a, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 3, background: 'rgba(59,130,246,.12)', color: '#3b82f6', fontWeight: 600 }}>
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {analisis.materiales.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-sec)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                          Materiales mencionados
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {analisis.materiales.map((m, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 3, background: 'rgba(34,197,94,.12)', color: 'var(--green)', fontWeight: 600 }}>
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {analisis.entregables.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-sec)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                          Entregables / productos esperados
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {analisis.entregables.map((e, i) => (
                            <span key={i} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 3, background: 'rgba(245,158,11,.12)', color: 'var(--yellow)', fontWeight: 600 }}>
                              {e}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </div>

            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 24,
              marginBottom: 24,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Decisión de postulación
                </div>
                {(() => {
                  const rec = recomendacionPostulacion(proceso, restantes)
                  return (
                    <div style={{ fontSize: 13, fontWeight: 700, color: rec.color }}>
                      {rec.texto}
                    </div>
                  )
                })()}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <CheckItem
                  ok={proceso.estado_proceso === 'Publicado' || proceso.estado_proceso === 'Abierto'}
                  label="Proceso publicado/abierto"
                  sub={proceso.estado_proceso || 'Sin estado'}
                />
                <CheckItem
                  ok={restantes === null || restantes > 7}
                  label="Tiempo suficiente para preparar oferta"
                  sub={restantes !== null ? `${restantes} días restantes` : 'Sin fecha de cierre'}
                />
                <CheckItem
                  ok={proceso.presupuesto > 0}
                  label="Presupuesto definido"
                  sub={proceso.presupuesto > 0 ? fmtCOP(proceso.presupuesto) : 'No definido'}
                />
                <CheckItem
                  ok={!!proceso.duracion}
                  label="Duración del contrato conocida"
                  sub={proceso.duracion ? `${proceso.duracion} ${proceso.unidad_duracion || 'días'}` : 'No informada'}
                />
                <CheckItem
                  ok={!proceso.tiene_adenda}
                  label="Sin adendas pendientes"
                  sub={proceso.tiene_adenda ? 'Tiene adenda' : 'Sin adenda'}
                />
                <CheckItem
                  ok={esUrlSecopDirecta(proceso.url_documento)}
                  label="URL directa disponible en SECOP II"
                  sub={esUrlSecopDirecta(proceso.url_documento) ? 'Sí' : 'Buscar manualmente'}
                />
              </div>
            </div>

            {contratos.length > 0 && (
              <details style={{ marginBottom: 24 }}>
                <summary style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '16px 24px',
                  color: 'var(--text-sec)',
                  fontSize: 12,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}>
                  Contratos similares adjudicados ({contratos.length})
                </summary>
                <div style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: 24,
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  {contratos.slice(0, 5).map((c, i) => (
                    <div key={i} style={{
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '12px 14px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                            {(c.proveedor_adjudicado || 'Sin adjudicatario').length > 45 ? `${(c.proveedor_adjudicado || '').slice(0, 43)}…` : (c.proveedor_adjudicado || 'Sin adjudicatario')}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-sec)' }}>{c.nombre_entidad} · {c.fecha_de_firma ? c.fecha_de_firma.slice(0, 10) : '—'}</div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--orange)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {fmtCOP(Number(c.valor_del_contrato) || 0)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(245,158,11,.12)', color: 'var(--yellow)', fontWeight: 600 }}>
                          {c.modalidad_de_contratacion || '—'}
                        </span>
                        <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(59,130,246,.12)', color: 'var(--blue)', fontWeight: 600 }}>
                          {c.codigo_de_categoria_principal || '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        ) : null}
      </main>
    </div>
  )
}

function CheckItem({ ok, label, sub }: { ok: boolean; label: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, border: '1px solid var(--border)' }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: ok ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.1)',
        border: `2px solid ${ok ? 'var(--green)' : 'var(--red)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {ok ? (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <polyline points="2,6 5,9 10,3" stroke="var(--green)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="3" strokeLinecap="round">
            <line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>
          </svg>
        )}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-sec)', marginTop: 1 }}>{sub}</div>}
      </div>
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
