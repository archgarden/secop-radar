'use client'

import { useState } from 'react'
import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

type Tab = 'financiera' | 'residual' | 'pab' | 'experiencia' | 'mipyme'

function fmtCOP(n: number) {
  if (!n && n !== 0) return '—'
  return `$${n.toLocaleString('es-CO', { maximumFractionDigits: 0 })}`
}

export default function CalculadorasPage() {
  const [active, setActive] = useState<Tab>('financiera')

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
        <Link href="/procesos/1" style={{ color: 'var(--text-sec)', fontSize: 13 }}>Procesos</Link>
        <span style={{ color: 'var(--orange)', fontSize: 13, fontWeight: 600 }}>Calculadoras</span>
        <div style={{ marginLeft: 'auto' }}>
          <ThemeToggle />
        </div>
      </nav>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 }}>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 24,
          marginBottom: 24,
        }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>Calculadoras de licitación</h1>
          <p style={{ color: 'var(--text-sec)', fontSize: 13 }}>
            Herramientas embebidas para evaluar viabilidad financiera y técnica antes de participar.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          <TabButton active={active} id="financiera" label="Capacidad financiera" onClick={setActive} />
          <TabButton active={active} id="residual" label="Capacidad residual" onClick={setActive} />
          <TabButton active={active} id="pab" label="Precio artificialmente bajo" onClick={setActive} />
          <TabButton active={active} id="experiencia" label="Experiencia SMMLV" onClick={setActive} />
          <TabButton active={active} id="mipyme" label="Tamaño empresarial" onClick={setActive} />
        </div>

        {active === 'financiera' && <CapacidadFinanciera />}
        {active === 'residual' && <CapacidadResidual />}
        {active === 'pab' && <PrecioBajo />}
        {active === 'experiencia' && <ExperienciaSMMLV />}
        {active === 'mipyme' && <Mipyme />}
      </main>
    </div>
  )
}

function TabButton({ active, id, label, onClick }: { active: Tab; id: Tab; label: string; onClick: (t: Tab) => void }) {
  const isActive = active === id
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        background: isActive ? 'var(--orange)' : 'var(--surface)',
        color: isActive ? '#fff' : 'var(--text)',
        border: `1px solid ${isActive ? 'var(--orange)' : 'var(--border)'}`,
        padding: '8px 16px',
        borderRadius: 6,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function InputRow({ label, value, onChange, type = 'number', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sec)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 14,
        }}
      />
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 24,
    }}>
      {children}
    </div>
  )
}

function CapacidadFinanciera() {
  const [form, setForm] = useState({
    activo_corriente: '', pasivo_corriente: '', activo_total: '', pasivo_total: '',
    patrimonio: '', utilidad_operacional: '', gastos_intereses: '',
  })
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const calcular = async () => {
    setLoading(true)
    const res = await fetch(`${API}/calculadoras/capacidad-financiera`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activo_corriente: +form.activo_corriente,
        pasivo_corriente: +form.pasivo_corriente,
        activo_total: +form.activo_total,
        pasivo_total: +form.pasivo_total,
        patrimonio: +form.patrimonio,
        utilidad_operacional: +form.utilidad_operacional,
        gastos_intereses: +form.gastos_intereses,
      }),
    })
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Capacidad financiera</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <InputRow label="Activo corriente" value={form.activo_corriente} onChange={v => setForm({ ...form, activo_corriente: v })} />
        <InputRow label="Pasivo corriente" value={form.pasivo_corriente} onChange={v => setForm({ ...form, pasivo_corriente: v })} />
        <InputRow label="Activo total" value={form.activo_total} onChange={v => setForm({ ...form, activo_total: v })} />
        <InputRow label="Pasivo total" value={form.pasivo_total} onChange={v => setForm({ ...form, pasivo_total: v })} />
        <InputRow label="Patrimonio" value={form.patrimonio} onChange={v => setForm({ ...form, patrimonio: v })} />
        <InputRow label="Utilidad operacional" value={form.utilidad_operacional} onChange={v => setForm({ ...form, utilidad_operacional: v })} />
        <InputRow label="Gastos por intereses" value={form.gastos_intereses} onChange={v => setForm({ ...form, gastos_intereses: v })} />
      </div>
      <button onClick={calcular} disabled={loading} style={{ marginTop: 16, background: 'var(--orange)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
        {loading ? 'Calculando...' : 'Calcular'}
      </button>
      {result && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(result.indicadores).map(([key, item]: [string, any]) => (
            <div key={key} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 500, textTransform: 'capitalize' }}>{key.replace('_', ' ')}</span>
                <span style={{ color: 'var(--orange)', fontWeight: 700 }}>{item.valor}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2 }}>{item.formula}</div>
              <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 4 }}>{item.interpretacion}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function CapacidadResidual() {
  const [form, setForm] = useState({
    presupuesto_proceso: '', plazo_proceso_meses: '', anticipo_pct: '', ingresos_operacionales_anuales: '',
  })
  const [contratos, setContratos] = useState<{ valor: string; plazo_meses: string }[]>([])
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const calcular = async () => {
    setLoading(true)
    const res = await fetch(`${API}/calculadoras/capacidad-residual`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        presupuesto_proceso: +form.presupuesto_proceso,
        plazo_proceso_meses: +form.plazo_proceso_meses,
        anticipo_pct: +form.anticipo_pct,
        ingresos_operacionales_anuales: +form.ingresos_operacionales_anuales,
        contratos_vigentes: contratos.map(c => ({ valor: +c.valor, plazo_meses: +c.plazo_meses })),
      }),
    })
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Capacidad residual</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <InputRow label="Presupuesto proceso" value={form.presupuesto_proceso} onChange={v => setForm({ ...form, presupuesto_proceso: v })} />
        <InputRow label="Plazo proceso (meses)" value={form.plazo_proceso_meses} onChange={v => setForm({ ...form, plazo_proceso_meses: v })} />
        <InputRow label="% Anticipo" value={form.anticipo_pct} onChange={v => setForm({ ...form, anticipo_pct: v })} />
        <InputRow label="Ingresos operacionales anuales" value={form.ingresos_operacionales_anuales} onChange={v => setForm({ ...form, ingresos_operacionales_anuales: v })} />
      </div>
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Contratos vigentes</div>
        {contratos.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input placeholder="Valor" value={c.valor} onChange={e => {
              const copy = [...contratos]
              copy[i].valor = e.target.value
              setContratos(copy)
            }} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6 }} />
            <input placeholder="Plazo meses" value={c.plazo_meses} onChange={e => {
              const copy = [...contratos]
              copy[i].plazo_meses = e.target.value
              setContratos(copy)
            }} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6 }} />
            <button onClick={() => setContratos(contratos.filter((_, idx) => idx !== i))} style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '0 12px', borderRadius: 6, cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setContratos([...contratos, { valor: '', plazo_meses: '' }])} style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>+ Agregar contrato</button>
      </div>
      <button onClick={calcular} disabled={loading} style={{ marginTop: 16, background: 'var(--orange)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
        {loading ? 'Calculando...' : 'Calcular'}
      </button>
      {result && (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ResultBox label="Ingresos mensuales" value={fmtCOP(result.ingresos_mensuales)} />
          <ResultBox label="Obligaciones mensuales" value={fmtCOP(result.obligaciones_mensuales)} />
          <ResultBox label="Capacidad residual mensual" value={fmtCOP(result.capacidad_residual_mensual)} />
          <ResultBox label="Requerido nuevo mensual" value={fmtCOP(result.requerido_nuevo_mensual)} />
          <ResultBox label="Relación" value={result.relacion ? `${result.relacion}x` : '—'} />
          <ResultBox label="¿Capacidad suficiente?" value={result.capacidad_suficiente ? 'Sí' : 'No'} color={result.capacidad_suficiente ? 'var(--green)' : 'var(--red)'} />
        </div>
      )}
    </Card>
  )
}

function PrecioBajo() {
  const [presupuesto, setPresupuesto] = useState('')
  const [ofertas, setOfertas] = useState('')
  const [umbral, setUmbral] = useState('70')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const calcular = async () => {
    setLoading(true)
    const lista = ofertas.split('\n').map(o => parseFloat(o.trim())).filter(o => !isNaN(o))
    const res = await fetch(`${API}/calculadoras/precio-artificialmente-bajo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presupuesto_oficial: +presupuesto, ofertas: lista, umbral_pct: +umbral }),
    })
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Precio artificialmente bajo</h2>
      <InputRow label="Presupuesto oficial" value={presupuesto} onChange={setPresupuesto} />
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sec)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ofertas (una por línea)</label>
        <textarea value={ofertas} onChange={e => setOfertas(e.target.value)} rows={5} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 10, borderRadius: 6, fontSize: 14 }} />
      </div>
      <InputRow label="Umbral % del precio de referencia" value={umbral} onChange={setUmbral} />
      <button onClick={calcular} disabled={loading} style={{ marginTop: 8, background: 'var(--orange)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
        {loading ? 'Calculando...' : 'Calcular'}
      </button>
      {result && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <ResultBox label="Precio de referencia" value={fmtCOP(result.precio_referencia)} />
            <ResultBox label="Límite bajo" value={fmtCOP(result.limite_bajo)} />
            <ResultBox label="Alerta" value={result.alerta ? 'Sí' : 'No'} color={result.alerta ? 'var(--red)' : 'var(--green)'} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.ofertas.map((o: any, i: number) => (
              <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span>Oferta {i + 1}</span>
                <div>
                  <span style={{ fontWeight: 600, marginRight: 12 }}>{fmtCOP(o.oferta)}</span>
                  <span style={{ color: o.artificialmente_bajo ? 'var(--red)' : 'var(--green)', fontSize: 12, fontWeight: 600 }}>
                    {o.porcentaje_referencia}% {o.artificialmente_bajo && '(Bajo)'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}

function ExperienciaSMMLV() {
  const [contratos, setContratos] = useState<{ valor: string; fecha_inicio: string; fecha_fin: string }[]>([])
  const [smmlv, setSmmlv] = useState('1423500')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const calcular = async () => {
    setLoading(true)
    const res = await fetch(`${API}/calculadoras/experiencia-smmlv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contratos: contratos.map(c => ({ valor: +c.valor, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin })),
        smmlv: smmlv ? +smmlv : null,
      }),
    })
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Experiencia en SMMLV</h2>
      <InputRow label="SMMLV" value={smmlv} onChange={setSmmlv} />
      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Contratos ejecutados</div>
        {contratos.map((c, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input placeholder="Valor" value={c.valor} onChange={e => { const copy = [...contratos]; copy[i].valor = e.target.value; setContratos(copy) }} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6 }} />
            <input type="date" value={c.fecha_inicio} onChange={e => { const copy = [...contratos]; copy[i].fecha_inicio = e.target.value; setContratos(copy) }} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6 }} />
            <input type="date" value={c.fecha_fin} onChange={e => { const copy = [...contratos]; copy[i].fecha_fin = e.target.value; setContratos(copy) }} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: 8, borderRadius: 6 }} />
            <button onClick={() => setContratos(contratos.filter((_, idx) => idx !== i))} style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '0 12px', borderRadius: 6, cursor: 'pointer' }}>✕</button>
          </div>
        ))}
        <button onClick={() => setContratos([...contratos, { valor: '', fecha_inicio: '', fecha_fin: '' }])} style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>+ Agregar contrato</button>
      </div>
      <button onClick={calcular} disabled={loading} style={{ marginTop: 16, background: 'var(--orange)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
        {loading ? 'Calculando...' : 'Calcular'}
      </button>
      {result && (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <ResultBox label="Valor total" value={fmtCOP(result.total_valor)} />
          <ResultBox label="Total años" value={`${result.total_anos}`} />
          <ResultBox label="Total SMMLV" value={`${result.total_smmlv.toLocaleString('es-CO')} SMMLV`} />
        </div>
      )}
    </Card>
  )
}

function Mipyme() {
  const [sector, setSector] = useState('servicios')
  const [empleados, setEmpleados] = useState('')
  const [ingresos, setIngresos] = useState('')
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const calcular = async () => {
    setLoading(true)
    const res = await fetch(`${API}/calculadoras/mipyme`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sector, empleados: +empleados, ingresos_anuales: +ingresos }),
    })
    setResult(await res.json())
    setLoading(false)
  }

  return (
    <Card>
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Clasificación MIPYME</h2>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-sec)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sector</label>
        <select value={sector} onChange={e => setSector(e.target.value)} style={{ width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 6, fontSize: 14 }}>
          <option value="manufacturero">Manufacturero</option>
          <option value="servicios">Servicios</option>
          <option value="comercio">Comercio</option>
        </select>
      </div>
      <InputRow label="Número de empleados" value={empleados} onChange={setEmpleados} />
      <InputRow label="Ingresos anuales" value={ingresos} onChange={setIngresos} />
      <button onClick={calcular} disabled={loading} style={{ marginTop: 8, background: 'var(--orange)', color: '#fff', border: 'none', padding: '10px 22px', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
        {loading ? 'Calculando...' : 'Calcular'}
      </button>
      {result && (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <ResultBox label="Categoría por empleados" value={result.categoria_por_empleados} />
          <ResultBox label="Categoría por ingresos" value={result.categoria_por_ingresos} />
          <ResultBox label="Categoría final" value={result.categoria_final.toUpperCase()} color="var(--orange)" />
        </div>
      )}
    </Card>
  )
}

function ResultBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || 'var(--text)', fontWeight: 700, fontSize: 15 }}>{value}</div>
    </div>
  )
}
