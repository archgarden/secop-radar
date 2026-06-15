'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const DEPARTAMENTOS = [
  'CUNDINAMARCA', 'BOGOTÁ D.C.', 'ANTIOQUIA', 'VALLE DEL CAUCA',
  'ATLÁNTICO', 'SANTANDER', 'BOLÍVAR', 'NARIÑO', 'CÓRDOBA',
  'BOYACÁ', 'CAUCA', 'TOLIMA', 'META', 'HUILA', 'CASANARE',
]

const UNSPSC_OPCIONES = [
  { code: '72140000', label: 'Infraestructura pública (vías, puentes, obras civiles)' },
  { code: '72120000', label: 'Edificación (escuelas, hospitales, vivienda)' },
  { code: '72150000', label: 'Mantenimiento y reparaciones' },
  { code: '81100000', label: 'Servicios de ingeniería y consultoría' },
]

function InputLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
}

export default function NuevoCliente() {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    presupuesto_min: '',
    presupuesto_max: '',
  })
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [unspsc_codes, setUnspsc] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleDep(d: string) {
    setDepartamentos(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }
  function toggleUnspsc(c: string) {
    setUnspsc(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.nombre || !form.email) { setError('Nombre y email son obligatorios'); return }
    if (departamentos.length === 0) { setError('Selecciona al menos un departamento'); return }
    if (unspsc_codes.length === 0) { setError('Selecciona al menos un código UNSPSC'); return }

    setLoading(true)
    try {
      const r = await fetch(`${API}/clientes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          presupuesto_min: parseInt(form.presupuesto_min) || 0,
          presupuesto_max: parseInt(form.presupuesto_max) || 0,
          departamentos,
          unspsc_codes,
        }),
      })
      if (!r.ok) throw new Error(await r.text())
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al registrar cliente')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <nav style={{
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        height: 52,
        gap: 32,
      }}>
        <span style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 15, letterSpacing: 0.3 }}>
          SECOP Radar
        </span>
        <Link href="/dashboard" style={{ color: 'var(--text-sec)', fontSize: 13 }}>Dashboard</Link>
        <span style={{ color: 'var(--text)', fontSize: 13 }}>+ Cliente</span>
      </nav>

      <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 28 }}>Registrar cliente nuevo</h1>

        <form onSubmit={submit}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 24 }}>

            <InputLabel label="Nombre / Razón social">
              <input
                style={inputStyle}
                value={form.nombre}
                onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
                placeholder="Constructora XYZ SAS"
              />
            </InputLabel>

            <InputLabel label="Email de alertas">
              <input
                style={inputStyle}
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="contacto@empresa.com"
              />
            </InputLabel>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Presupuesto mínimo (COP)
                </label>
                <input
                  style={inputStyle}
                  type="number"
                  value={form.presupuesto_min}
                  onChange={e => setForm(p => ({ ...p, presupuesto_min: e.target.value }))}
                  placeholder="500000000"
                />
              </div>
              <div>
                <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Presupuesto máximo (COP)
                </label>
                <input
                  style={inputStyle}
                  type="number"
                  value={form.presupuesto_max}
                  onChange={e => setForm(p => ({ ...p, presupuesto_max: e.target.value }))}
                  placeholder="5000000000"
                />
              </div>
            </div>

            <InputLabel label="Departamentos de interés">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {DEPARTAMENTOS.map(d => {
                  const sel = departamentos.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => toggleDep(d)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: 3,
                        fontSize: 12,
                        cursor: 'pointer',
                        border: sel ? '1px solid var(--blue)' : '1px solid var(--border)',
                        background: sel ? 'rgba(59,130,246,0.15)' : 'var(--bg)',
                        color: sel ? 'var(--blue)' : 'var(--text-sec)',
                        fontWeight: sel ? 600 : 400,
                      }}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </InputLabel>

            <InputLabel label="Códigos UNSPSC">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {UNSPSC_OPCIONES.map(op => {
                  const sel = unspsc_codes.includes(op.code)
                  return (
                    <button
                      key={op.code}
                      type="button"
                      onClick={() => toggleUnspsc(op.code)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 4,
                        fontSize: 13,
                        cursor: 'pointer',
                        border: sel ? '1px solid var(--blue)' : '1px solid var(--border)',
                        background: sel ? 'rgba(59,130,246,0.1)' : 'var(--bg)',
                        color: sel ? 'var(--blue)' : 'var(--text)',
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      <span style={{
                        minWidth: 80,
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        fontSize: 12,
                      }}>{op.code}</span>
                      <span style={{ color: sel ? 'var(--blue)' : 'var(--text-sec)', fontSize: 12 }}>{op.label}</span>
                    </button>
                  )
                })}
              </div>
            </InputLabel>
          </div>

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

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: loading ? 'var(--border)' : 'var(--blue)',
                color: '#fff',
                border: 'none',
                padding: '9px 24px',
                borderRadius: 4,
                fontSize: 14,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Registrando...' : 'Registrar cliente'}
            </button>
            <Link
              href="/dashboard"
              style={{
                border: '1px solid var(--border)',
                color: 'var(--text-sec)',
                padding: '9px 24px',
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              Cancelar
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}
