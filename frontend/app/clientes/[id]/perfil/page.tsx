'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const DEPARTAMENTOS = [
  'AMAZONAS', 'ANTIOQUIA', 'ARAUCA', 'ATLÁNTICO', 'BOGOTÁ D.C.',
  'BOLÍVAR', 'BOYACÁ', 'CALDAS', 'CAQUETÁ', 'CASANARE', 'CAUCA',
  'CESAR', 'CHOCÓ', 'CÓRDOBA', 'CUNDINAMARCA', 'GUAINÍA',
  'GUAVIARE', 'HUILA', 'LA GUAJIRA', 'MAGDALENA', 'META',
  'NARIÑO', 'NORTE DE SANTANDER', 'PUTUMAYO', 'QUINDÍO',
  'RISARALDA', 'SAN ANDRÉS', 'SANTANDER', 'SUCRE', 'TOLIMA',
  'VALLE DEL CAUCA', 'VAUPÉS', 'VICHADA',
]

const INDICADORES_OPCIONES = [
  'liquidez',
  'endeudamiento',
  'cobertura',
  'rentabilidad',
]

interface ClienteApi {
  id: number
  nombre: string
  email: string
  departamentos: string
  municipio: string | null
  unspsc_codes: string
  presupuesto_min: number
  presupuesto_max: number
  patrimonio_liquido: number | null
  ingresos_anuales: number | null
  experiencia_valor_total: number | null
  experiencia_cantidad: number | null
  indicadores_financieros: string | null
  capacidad_residual_pct: number | null
  contratos_vigentes_valor: number | null
}

function parseJSON(text: string | null) {
  try { return JSON.parse(text || '[]') } catch { return [] }
}

function fmtCOP(n: number | null | undefined) {
  if (!n) return ''
  return n.toLocaleString('es-CO')
}

function parseCOP(raw: string) {
  return parseInt(raw.replace(/\D/g, ''), 10) || 0
}

export default function PerfilCliente() {
  const params = useParams()
  const router = useRouter()
  const clienteId = params.id as string

  const [cliente, setCliente] = useState<ClienteApi | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    nombre: '',
    email: '',
    municipio: '',
    presupuesto_min: '',
    presupuesto_max: '',
    patrimonio_liquido: '',
    ingresos_anuales: '',
    experiencia_valor_total: '',
    experiencia_cantidad: '',
    capacidad_residual_pct: '',
    contratos_vigentes_valor: '',
  })
  const [departamentos, setDepartamentos] = useState<string[]>([])
  const [indicadores, setIndicadores] = useState<string[]>([])

  useEffect(() => {
    fetch(`${API}/clientes`)
      .then(r => r.json())
      .then((clientes: ClienteApi[]) => {
        const c = clientes.find(x => String(x.id) === clienteId)
        if (!c) {
          setError('Cliente no encontrado')
          setLoading(false)
          return
        }
        setCliente(c)
        setForm({
          nombre: c.nombre || '',
          email: c.email || '',
          municipio: c.municipio || '',
          presupuesto_min: fmtCOP(c.presupuesto_min),
          presupuesto_max: fmtCOP(c.presupuesto_max),
          patrimonio_liquido: fmtCOP(c.patrimonio_liquido),
          ingresos_anuales: fmtCOP(c.ingresos_anuales),
          experiencia_valor_total: fmtCOP(c.experiencia_valor_total),
          experiencia_cantidad: c.experiencia_cantidad ? String(c.experiencia_cantidad) : '',
          capacidad_residual_pct: c.capacidad_residual_pct ? String(c.capacidad_residual_pct) : '',
          contratos_vigentes_valor: fmtCOP(c.contratos_vigentes_valor),
        })
        setDepartamentos(parseJSON(c.departamentos))
        setIndicadores(parseJSON(c.indicadores_financieros).map((x: string) => x.toLowerCase()))
        setLoading(false)
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [clienteId])

  function toggleDep(d: string) {
    setDepartamentos(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  function toggleInd(ind: string) {
    setIndicadores(prev => prev.includes(ind) ? prev.filter(x => x !== ind) : [...prev, ind])
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSaved(false)

    const payload = {
      nombre: form.nombre,
      email: form.email,
      departamentos,
      municipio: form.municipio.trim() || null,
      presupuesto_min: parseCOP(form.presupuesto_min),
      presupuesto_max: parseCOP(form.presupuesto_max),
      patrimonio_liquido: parseCOP(form.patrimonio_liquido) || null,
      ingresos_anuales: parseCOP(form.ingresos_anuales) || null,
      experiencia_valor_total: parseCOP(form.experiencia_valor_total) || null,
      experiencia_cantidad: parseInt(form.experiencia_cantidad, 10) || null,
      indicadores_financieros: indicadores,
      capacidad_residual_pct: parseFloat(form.capacidad_residual_pct) || null,
      contratos_vigentes_valor: parseCOP(form.contratos_vigentes_valor) || null,
    }

    try {
      const r = await fetch(`${API}/clientes/${clienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error(await r.text())
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-sec)', padding: 48, textAlign: 'center' }}>Cargando perfil...</div>
  if (error && !cliente) return <div style={{ color: 'var(--red)', padding: 48, textAlign: 'center' }}>{error}</div>

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
        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15, letterSpacing: '3px', textTransform: 'uppercase' }}>SECOP RADAR</span>
        <Link href="/dashboard" style={{ color: 'var(--text-sec)', fontSize: 13 }}>Dashboard</Link>
        <Link href={`/procesos/${clienteId}`} style={{ color: 'var(--text-sec)', fontSize: 13 }}>Procesos</Link>
        <Link href={`/clientes/${clienteId}/documentos`} style={{ color: 'var(--text-sec)', fontSize: 13 }}>Documentos</Link>
        <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>Perfil</span>
        <div style={{ marginLeft: 'auto' }}><ThemeToggle /></div>
      </nav>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Perfil de la empresa</h1>
            <p style={{ color: 'var(--text-sec)', fontSize: 13 }}>Datos financieros y de experiencia usados para evaluar pliegos.</p>
          </div>
          <Link href={`/preseleccion?cliente_id=${clienteId}&proceso_id=1`} style={{
            background: 'var(--orange)', color: '#fff', padding: '8px 16px', borderRadius: 4,
            fontSize: 13, fontWeight: 600, textDecoration: 'none',
          }}>Ver pre-selección →</Link>
        </div>

        {saved && (
          <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid var(--green)', color: 'var(--green)', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            Perfil actualizado correctamente.
          </div>
        )}

        {error && !saved && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid var(--red)', color: 'var(--red)', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <form onSubmit={submit} style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 24,
        }}>
          <Section title="Datos básicos">
            <Grid>
              <Field label="Nombre / Razón social">
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required style={inputStyle} />
              </Field>
              <Field label="Email de alertas">
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required style={inputStyle} />
              </Field>
              <Field label="Municipio de operación">
                <input value={form.municipio} onChange={e => setForm(f => ({ ...f, municipio: e.target.value }))} style={inputStyle} />
              </Field>
            </Grid>
          </Section>

          <Section title="Departamentos de interés">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DEPARTAMENTOS.map(d => {
                const sel = departamentos.includes(d)
                return (
                  <button key={d} type="button" onClick={() => toggleDep(d)} style={{
                    padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer',
                    border: sel ? '1px solid var(--orange)' : '1px solid var(--border)',
                    background: sel ? 'rgba(249,115,22,.12)' : 'var(--bg)',
                    color: sel ? 'var(--orange)' : 'var(--text-sec)',
                    fontWeight: sel ? 600 : 400,
                  }}>{d}</button>
                )
              })}
            </div>
          </Section>

          <Section title="Rango presupuestal (COP)">
            <Grid>
              <Field label="Presupuesto mínimo">
                <input value={form.presupuesto_min} onChange={e => setForm(f => ({ ...f, presupuesto_min: e.target.value }))} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Presupuesto máximo">
                <input value={form.presupuesto_max} onChange={e => setForm(f => ({ ...f, presupuesto_max: e.target.value }))} style={inputStyle} placeholder="Sin límite" />
              </Field>
            </Grid>
          </Section>

          <Section title="Perfil financiero">
            <Grid>
              <Field label="Patrimonio líquido (COP)">
                <input value={form.patrimonio_liquido} onChange={e => setForm(f => ({ ...f, patrimonio_liquido: e.target.value }))} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Ingresos anuales (COP)">
                <input value={form.ingresos_anuales} onChange={e => setForm(f => ({ ...f, ingresos_anuales: e.target.value }))} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Valor contratos vigentes (COP)">
                <input value={form.contratos_vigentes_valor} onChange={e => setForm(f => ({ ...f, contratos_vigentes_valor: e.target.value }))} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Capacidad residual (%)">
                <input value={form.capacidad_residual_pct} onChange={e => setForm(f => ({ ...f, capacidad_residual_pct: e.target.value }))} style={inputStyle} placeholder="Ej: 30" />
              </Field>
            </Grid>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, color: 'var(--text-sec)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Indicadores financieros disponibles</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {INDICADORES_OPCIONES.map(ind => {
                  const sel = indicadores.includes(ind)
                  return (
                    <button key={ind} type="button" onClick={() => toggleInd(ind)} style={{
                      padding: '6px 12px', borderRadius: 4, fontSize: 12, cursor: 'pointer', textTransform: 'capitalize',
                      border: sel ? '1px solid var(--green)' : '1px solid var(--border)',
                      background: sel ? 'rgba(34,197,94,.12)' : 'var(--bg)',
                      color: sel ? 'var(--green)' : 'var(--text-sec)',
                      fontWeight: sel ? 600 : 400,
                    }}>{ind}</button>
                  )
                })}
              </div>
            </div>
          </Section>

          <Section title="Experiencia">
            <Grid>
              <Field label="Cantidad de contratos">
                <input value={form.experiencia_cantidad} onChange={e => setForm(f => ({ ...f, experiencia_cantidad: e.target.value.replace(/\D/g, '') }))} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Valor total de experiencia (COP)">
                <input value={form.experiencia_valor_total} onChange={e => setForm(f => ({ ...f, experiencia_valor_total: e.target.value }))} style={inputStyle} placeholder="0" />
              </Field>
            </Grid>
          </Section>

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button type="submit" disabled={saving} style={{
              background: saving ? 'var(--border)' : 'var(--orange)',
              color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 6,
              fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
            }}>{saving ? 'Guardando...' : 'Guardar perfil'}</button>
            <Link href={`/procesos/${clienteId}`} style={{
              border: '1px solid var(--border)', color: 'var(--text)',
              padding: '10px 22px', borderRadius: 6, fontSize: 14, textDecoration: 'none',
            }}>← Volver a procesos</Link>
          </div>
        </form>
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 12, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', color: 'var(--text-sec)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '10px 12px',
  color: 'var(--text)',
  fontSize: 14,
  outline: 'none',
}
