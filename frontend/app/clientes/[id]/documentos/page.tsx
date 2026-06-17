'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AnimatedBackground from '@/components/AnimatedBackground'
import BackgroundModePicker from '@/components/BackgroundModePicker'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const DOCUMENTOS_REQUERIDOS = [
  'RUP vigente (Registro Único de Proponentes)',
  'Estados financieros con corte (año anterior)',
  'Certificados de experiencia en SMMLV',
  'Paz y salvo de parafiscales (SENA, ICBF, Caja)',
  'Póliza de seriedad de la oferta',
  'Propuesta técnica',
  'Propuesta económica',
  'Carta de presentación de oferta',
]

interface DocumentoApi {
  id: number
  cliente_id: number
  nombre: string
  filename: string
  estado: string
  fecha_subida: string
}

export default function DocumentosCliente() {
  const params = useParams()
  const router = useRouter()
  const clienteId = params.id as string

  const [documentos, setDocumentos] = useState<DocumentoApi[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`${API}/clientes/${clienteId}/documentos`)
      .then(r => r.json())
      .then((data: DocumentoApi[]) => { setDocumentos(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [clienteId])

  async function subirArchivo(nombre: string, file: File) {
    setUploading(nombre)
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al subir')
    } finally {
      setUploading(null)
    }
  }

  async function eliminarDocumento(id: number) {
    try {
      const r = await fetch(`${API}/documentos/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(await r.text())
      setDocumentos(prev => prev.filter(d => d.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al eliminar')
    }
  }

  const subidos = documentos.map(d => d.nombre)
  const progreso = Math.round((subidos.length / DOCUMENTOS_REQUERIDOS.length) * 100)

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
        <BackgroundModePicker />
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Documentos de postulación</h1>
        <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 24 }}>
          Sube los documentos básicos que necesitarás para presentar ofertas en SECOP II.
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
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-sec)', textAlign: 'center', padding: 40 }}>Cargando...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {DOCUMENTOS_REQUERIDOS.map(nombre => {
              const doc = documentos.find(d => d.nombre === nombre)
              const isUploading = uploading === nombre
              return (
                <div key={nombre} style={{
                  background: 'var(--surface)',
                  border: `1px solid ${doc ? 'rgba(34,197,94,.35)' : 'var(--border)'}`,
                  borderRadius: 6,
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: doc ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.1)',
                    border: `1px solid ${doc ? 'var(--green)' : 'var(--red)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {doc ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{nombre}</div>
                    {doc && (
                      <div style={{ fontSize: 11, color: 'var(--text-sec)', marginTop: 2 }}>
                        {doc.filename} · {new Date(doc.fecha_subida).toLocaleDateString('es-CO')}
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
                      background: isUploading ? 'var(--border)' : 'var(--orange)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '6px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: isUploading ? 'not-allowed' : 'pointer',
                    }}>
                      {isUploading ? 'Subiendo...' : 'Subir'}
                      <input
                        type="file"
                        style={{ display: 'none' }}
                        disabled={isUploading}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (file) subirArchivo(nombre, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
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
