'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AnimatedBackground from '@/components/AnimatedBackground'
import BackgroundModePicker from '@/components/BackgroundModePicker'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const DEPARTAMENTOS = [
  'CUNDINAMARCA', 'BOGOTÁ D.C.', 'ANTIOQUIA', 'VALLE DEL CAUCA',
  'ATLÁNTICO', 'SANTANDER', 'BOLÍVAR', 'NARIÑO', 'CÓRDOBA',
  'BOYACÁ', 'CAUCA', 'TOLIMA', 'META', 'HUILA', 'CASANARE',
]

const UNSPSC_OPCIONES = [
  { code: '72140000', label: 'Infraestructura pública' },
  { code: '72120000', label: 'Edificación' },
  { code: '72150000', label: 'Mantenimiento' },
  { code: '81100000', label: 'Consultoría' },
  { code: '72130000', label: 'Construcción especializada' },
  { code: '72141000', label: 'Carreteras y vías' },
  { code: '72151000', label: 'Mantenimiento de edificios' },
  { code: '72100000', label: 'Servicios de construcción' },
]

function labelUNSPSC(code: string) {
  const found = UNSPSC_OPCIONES.find(o => o.code === code)
  if (found) return found.label
  if (code.startsWith('7214')) return 'Infraestructura pública'
  if (code.startsWith('7212')) return 'Edificación'
  if (code.startsWith('7215')) return 'Mantenimiento'
  if (code.startsWith('8110')) return 'Consultoría'
  return 'Código UNSPSC'
}

function fmtCOP(n: number) {
  if (!n) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
  return `$${n.toLocaleString('es-CO')}`
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '11px 14px',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
  transition: 'border-color 150ms',
}

export default function NuevoCliente() {
  const router = useRouter()
  const [paso, setPaso] = useState(1)
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    presupuesto_min: '',
    presupuesto_max: '',
  })
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [unspsc_codes, setUnspsc] = useState<string[]>([])
  const [unspscInput, setUnspscInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const totalPasos = 3
  const progreso = (paso / totalPasos) * 100

  function toggleDep(d: string) {
    setDepartamentos(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }
  function addUnspsc(raw: string) {
    const code = raw.trim()
    if (!/^\d{8}$/.test(code)) {
      setError('El código UNSPSC debe tener 8 dígitos numéricos')
      return
    }
    if (unspsc_codes.includes(code)) {
      setError('Este código ya fue agregado')
      return
    }
    setUnspsc(prev => [...prev, code])
    setUnspscInput('')
    setError('')
  }
  function removeUnspsc(code: string) {
    setUnspsc(prev => prev.filter(c => c !== code))
  }

  function validarPaso() {
    setError('')
    if (paso === 1) {
      if (!form.nombre || !form.email) { setError('Nombre y email son obligatorios'); return false }
    }
    if (paso === 2) {
      if (departamentos.length === 0) { setError('Selecciona al menos un departamento'); return false }
      if (unspsc_codes.length === 0) { setError('Selecciona al menos un código UNSPSC'); return false }
    }
    if (paso === 3) {
      const min = parseInt(form.presupuesto_min) || 0
      const max = parseInt(form.presupuesto_max) || 0
      if (min < 0 || max < 0) { setError('Los presupuestos no pueden ser negativos'); return false }
      if (max > 0 && max < min) { setError('El presupuesto máximo debe ser mayor al mínimo'); return false }
    }
    return true
  }

  function siguiente() {
    if (!validarPaso()) return
    setPaso(p => Math.min(totalPasos, p + 1))
  }
  function atras() {
    setPaso(p => Math.max(1, p - 1))
    setError('')
  }

  async function submit() {
    if (!validarPaso()) return
    setLoading(true)
    try {
      const r = await fetch(`${API}/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: form.nombre,
          email: form.email,
          presupuesto_min: parseInt(form.presupuesto_min) || 0,
          presupuesto_max: parseInt(form.presupuesto_max) || 0,
          departamentos,
          unspsc_codes,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      const cliente = await r.json()
      router.push(`/clientes/${cliente.id}/documentos`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al registrar cliente')
    } finally {
      setLoading(false)
    }
  }

  const resumen = {
    nombre: form.nombre || 'Sin nombre',
    email: form.email || 'Sin email',
    departamentos,
    unspsc: unspsc_codes,
    min: parseInt(form.presupuesto_min) || 0,
    max: parseInt(form.presupuesto_max) || 0,
  }

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

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 28, alignItems: 'start' }}>

          {/* ── COLUMNA IZQUIERDA: Wizard ── */}
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Crear perfil de búsqueda</h1>
            <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 24 }}>
              Configura en 3 pasos el radar de oportunidades para tu empresa.
            </p>

            {/* Progreso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
              {[1, 2, 3].map(p => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: paso >= p ? 'var(--orange)' : 'var(--surface)',
                    border: `1px solid ${paso >= p ? 'var(--orange)' : 'var(--border)'}`,
                    color: paso >= p ? '#fff' : 'var(--text-sec)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    transition: 'all 200ms ease',
                  }}>
                    {p}
                  </div>
                  {p < totalPasos && (
                    <div style={{
                      flex: 1, height: 3, borderRadius: 2,
                      background: paso > p ? 'var(--orange)' : 'var(--border)',
                      transition: 'background 200ms ease',
                    }} />
                  )}
                </div>
              ))}
            </div>

            {/* Card del paso */}
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 28,
              minHeight: 340,
              transition: 'all 200ms ease',
            }}>
              {paso === 1 && (
                <div style={{ animation: 'fadeIn 250ms ease' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Datos de contacto</h2>
                  <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 24 }}>¿A quién enviamos las alertas?</p>

                  <div style={{ marginBottom: 18 }}>
                    <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Nombre / Razón social
                    </label>
                    <input
                      style={inputStyle}
                      value={form.nombre}
                      onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                      placeholder="Constructora XYZ SAS"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Email de alertas
                    </label>
                    <input
                      style={inputStyle}
                      type="email"
                      value={form.email}
                      onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                      placeholder="contacto@empresa.com"
                    />
                  </div>
                </div>
              )}

              {paso === 2 && (
                <div style={{ animation: 'fadeIn 250ms ease' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Zona y rubro</h2>
                  <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 20 }}>Selecciona dónde y en qué sectores buscas procesos.</p>

                  <div style={{ marginBottom: 22 }}>
                    <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Departamentos de interés
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {DEPARTAMENTOS.map(d => {
                        const sel = departamentos.includes(d)
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDep(d)}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 4,
                              fontSize: 12,
                              cursor: 'pointer',
                              border: sel ? '1px solid var(--orange)' : '1px solid var(--border)',
                              background: sel ? 'rgba(249,115,22,.12)' : 'var(--bg)',
                              color: sel ? 'var(--orange)' : 'var(--text-sec)',
                              fontWeight: sel ? 600 : 400,
                              transition: 'all 150ms',
                            }}
                          >
                            {d}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Códigos UNSPSC
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input
                        style={{ ...inputStyle, flex: 1 }}
                        type="text"
                        inputMode="numeric"
                        maxLength={8}
                        value={unspscInput}
                        onChange={e => setUnspscInput(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUnspsc(unspscInput) } }}
                        placeholder="Código de 8 dígitos"
                      />
                      <button
                        type="button"
                        onClick={() => addUnspsc(unspscInput)}
                        style={{
                          background: 'var(--orange)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          padding: '10px 16px',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Añadir
                      </button>
                    </div>

                    {unspsc_codes.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {unspsc_codes.map(code => (
                          <div key={code} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'rgba(59,130,246,.12)',
                            border: '1px solid rgba(59,130,246,.35)',
                            borderRadius: 4,
                            padding: '6px 10px',
                            fontSize: 12,
                            color: 'var(--text)',
                          }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{code}</span>
                            <span style={{ color: 'var(--text-sec)' }}>{labelUNSPSC(code)}</span>
                            <button
                              type="button"
                              onClick={() => removeUnspsc(code)}
                              style={{ background: 'none', border: 'none', color: 'var(--red)', fontSize: 14, cursor: 'pointer', padding: 0, lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 8 }}>Sugerencias rápidas:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {UNSPSC_OPCIONES.map(op => {
                        const sel = unspsc_codes.includes(op.code)
                        return (
                          <button
                            key={op.code}
                            type="button"
                            onClick={() => addUnspsc(op.code)}
                            disabled={sel}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 4,
                              fontSize: 11,
                              cursor: sel ? 'default' : 'pointer',
                              border: sel ? '1px solid var(--green)' : '1px solid var(--border)',
                              background: sel ? 'rgba(34,197,94,.12)' : 'var(--bg)',
                              color: sel ? 'var(--green)' : 'var(--text-sec)',
                              fontWeight: sel ? 600 : 400,
                            }}
                          >
                            {op.code} · {op.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {paso === 3 && (
                <div style={{ animation: 'fadeIn 250ms ease' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Rango presupuestal</h2>
                  <p style={{ color: 'var(--text-sec)', fontSize: 13, marginBottom: 24 }}>Define el tamaño de los procesos que te interesan.</p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Presupuesto mínimo (COP)
                      </label>
                      <input
                        style={inputStyle}
                        type="number"
                        value={form.presupuesto_min}
                        onChange={e => setForm(p => ({ ...p, presupuesto_min: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Presupuesto máximo (COP)
                      </label>
                      <input
                        style={inputStyle}
                        type="number"
                        value={form.presupuesto_max}
                        onChange={e => setForm(p => ({ ...p, presupuesto_max: e.target.value }))}
                        placeholder="Sin límite"
                      />
                    </div>
                  </div>

                  <div style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: 16,
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                      Revisa tu perfil antes de crearlo
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                      <div><span style={{ color: 'var(--text-sec)' }}>Empresa:</span> <span style={{ color: 'var(--text)', fontWeight: 500 }}>{resumen.nombre}</span></div>
                      <div><span style={{ color: 'var(--text-sec)' }}>Alertas:</span> <span style={{ color: 'var(--text)' }}>{resumen.email}</span></div>
                      <div><span style={{ color: 'var(--text-sec)' }}>Departamentos:</span> <span style={{ color: 'var(--text)' }}>{resumen.departamentos.join(', ') || '—'}</span></div>
                      <div><span style={{ color: 'var(--text-sec)' }}>UNSPSC:</span> <span style={{ color: 'var(--text)' }}>{resumen.unspsc.join(', ') || '—'}</span></div>
                      <div><span style={{ color: 'var(--text-sec)' }}>Presupuesto:</span> <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{fmtCOP(resumen.min)} – {resumen.max ? fmtCOP(resumen.max) : 'Sin límite'}</span></div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid var(--red)',
                  color: 'var(--red)',
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  marginTop: 20,
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28 }}>
                <button
                  type="button"
                  onClick={atras}
                  disabled={paso === 1}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    color: paso === 1 ? 'var(--text-sec)' : 'var(--text)',
                    padding: '10px 22px',
                    borderRadius: 6,
                    fontSize: 14,
                    cursor: paso === 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Atrás
                </button>

                {paso < totalPasos ? (
                  <button
                    type="button"
                    onClick={siguiente}
                    style={{
                      background: 'var(--orange)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 28px',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Siguiente
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={loading}
                    style={{
                      background: loading ? 'var(--border)' : 'var(--orange)',
                      color: '#fff',
                      border: 'none',
                      padding: '10px 28px',
                      borderRadius: 6,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? 'Creando...' : 'Crear perfil'}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── COLUMNA DERECHA: Resumen animado ── */}
          <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 24,
            position: 'sticky',
            top: 80,
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
              Resumen del perfil
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 8,
                background: 'rgba(249,115,22,.15)',
                border: '1px solid rgba(249,115,22,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 700, color: 'var(--orange)',
              }}>
                {resumen.nombre.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {resumen.nombre}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {resumen.email}
                </div>
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />

            <ResumenFila label="Departamentos" vacio="Ninguno seleccionado">
              {resumen.departamentos.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {resumen.departamentos.map(d => (
                    <span key={d} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(34,197,94,.12)', color: 'var(--green)' }}>{d}</span>
                  ))}
                </div>
              ) : null}
            </ResumenFila>

            <ResumenFila label="Códigos UNSPSC" vacio="Ninguno añadido">
              {resumen.unspsc.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {resumen.unspsc.map(code => (
                    <div key={code} style={{ fontSize: 12, color: 'var(--text)' }}>
                      <span style={{ fontFamily: 'monospace', color: '#3b82f6', fontWeight: 600 }}>{code}</span>
                      {' · '}
                      <span style={{ color: 'var(--text-sec)' }}>{labelUNSPSC(code)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </ResumenFila>

            <ResumenFila label="Presupuesto" vacio="Sin definir">
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--orange)' }}>
                {fmtCOP(resumen.min)} – {resumen.max ? fmtCOP(resumen.max) : 'Sin límite'}
              </div>
            </ResumenFila>

            <div style={{
              marginTop: 20,
              padding: 12,
              background: 'var(--bg)',
              borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 4 }}>Completado</div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${progreso}%`,
                  height: '100%',
                  background: 'var(--orange)',
                  transition: 'width 250ms ease',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-sec)', marginTop: 6, textAlign: 'right' }}>
                Paso {paso} de {totalPasos}
              </div>
            </div>
          </div>

        </div>
      </main>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function ResumenFila({ label, vacio, children }: { label: string; vacio: string; children: React.ReactNode }) {
  const tiene = children !== null && children !== false
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{label}</div>
      {tiene ? children : <span style={{ fontSize: 12, color: 'var(--text-sec)', fontStyle: 'italic' }}>{vacio}</span>}
    </div>
  )
}
