'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/* ─────────────────────────────────────────────
   DATOS DE EJEMPLO — 8 procesos reales Colombia
───────────────────────────────────────────────*/
const PROCESOS = [
  {
    id: 1,
    score: 94,
    entidad: 'Instituto de Desarrollo Urbano',
    departamento: 'Bogotá D.C.',
    objeto: 'Construcción y rehabilitación de malla vial local en las localidades de Kennedy, Bosa y Ciudad Bolívar — Grupo 3',
    presupuesto: 4836000000,
    cierre: '2026-06-18',
    numero: 'IDU-LP-2026-003',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.72141100',
    requisitos: [
      { ok: true,  texto: 'Experiencia en obras viales' },
      { ok: true,  texto: 'Capacidad financiera K>1.5' },
      { ok: true,  texto: 'RUP vigente' },
      { ok: false, texto: 'Certificado ISO 9001' },
      { ok: false, texto: 'Ingeniero residente especializado' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
  {
    id: 2,
    score: 87,
    entidad: 'Alcaldía Municipal de Cajicá',
    departamento: 'Cundinamarca',
    objeto: 'Mejoramiento de la infraestructura educativa de la Institución Educativa Zipacón, sede principal — obras civiles y adecuaciones',
    presupuesto: 2574439664,
    cierre: '2026-06-22',
    numero: 'CAJ-MC-2026-041',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.72120000',
    requisitos: [
      { ok: true,  texto: 'Experiencia en edificación' },
      { ok: true,  texto: 'Capacidad financiera K>1.2' },
      { ok: true,  texto: 'RUP vigente' },
      { ok: true,  texto: 'Ingeniero civil matriculado' },
      { ok: false, texto: 'Certificación RETIE' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
  {
    id: 3,
    score: 81,
    entidad: 'INVIAS',
    departamento: 'Cundinamarca',
    objeto: 'Rehabilitación de la carretera Bogotá–Villeta, sector La Vega–Villeta, corredor nacional Ruta 50 — intervención integral de pavimento flexible',
    presupuesto: 8400000000,
    cierre: '2026-06-20',
    numero: 'INVIAS-LP-2026-117',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.72141000',
    requisitos: [
      { ok: true,  texto: 'Experiencia en vías nacionales' },
      { ok: true,  texto: 'Capacidad financiera K>2.0' },
      { ok: false, texto: 'RUP vigente' },
      { ok: false, texto: 'Equipo mínimo acreditado' },
      { ok: false, texto: 'Ingeniero vial especializado' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
  {
    id: 4,
    score: 76,
    entidad: 'Metro de Bogotá S.A.',
    departamento: 'Bogotá D.C.',
    objeto: 'Obras de infraestructura complementaria para la Primera Línea del Metro de Bogotá — adecuación de accesos y conectividad peatonal',
    presupuesto: 3034467825,
    cierre: '2026-07-05',
    numero: 'METRO-LP-2026-008',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.72141100',
    requisitos: [
      { ok: true,  texto: 'Experiencia en infraestructura urbana' },
      { ok: true,  texto: 'Capacidad financiera K>1.8' },
      { ok: true,  texto: 'RUP vigente' },
      { ok: false, texto: 'Certificación en obras subterráneas' },
      { ok: false, texto: 'Seguro todo riesgo construcción' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
  {
    id: 5,
    score: 68,
    entidad: 'E.S.E Hospital Diógenes Troncoso',
    departamento: 'Cundinamarca',
    objeto: 'Construcción de la nueva unidad de cuidados intensivos y urgencias del Hospital Diógenes Troncoso de Puerto Salgar',
    presupuesto: 1821447112,
    cierre: '2026-06-29',
    numero: 'ESE-MC-2026-012',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.72120000',
    requisitos: [
      { ok: true,  texto: 'Experiencia en edificaciones hospitalarias' },
      { ok: false, texto: 'Capacidad financiera K>1.5' },
      { ok: true,  texto: 'RUP vigente' },
      { ok: false, texto: 'Arquitecto con tarjeta profesional' },
      { ok: false, texto: 'Certificación NSR-10' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
  {
    id: 6,
    score: 61,
    entidad: 'Municipio de Zipaquirá',
    departamento: 'Cundinamarca',
    objeto: 'Mantenimiento y mejoramiento de la red de alcantarillado sanitario y pluvial del casco urbano del municipio de Zipaquirá',
    presupuesto: 984000000,
    cierre: '2026-07-12',
    numero: 'ZIP-MC-2026-029',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.72151000',
    requisitos: [
      { ok: true,  texto: 'Experiencia en redes de servicios públicos' },
      { ok: true,  texto: 'RUP vigente' },
      { ok: false, texto: 'Capacidad financiera K>1.2' },
      { ok: false, texto: 'Ingeniero sanitario' },
      { ok: false, texto: 'Certificación ambiental' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
  {
    id: 7,
    score: 55,
    entidad: 'AEROCIVIL',
    departamento: 'Bogotá D.C.',
    objeto: 'Consultoría para la actualización del Plan de Expansión y Modernización de la infraestructura aeroportuaria de la red regional',
    presupuesto: 560000000,
    cierre: '2026-07-18',
    numero: 'AERO-MC-2026-055',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.81101500',
    requisitos: [
      { ok: true,  texto: 'Experiencia en consultoría de infraestructura' },
      { ok: false, texto: 'Especialista en infraestructura aeroportuaria' },
      { ok: true,  texto: 'RUP vigente' },
      { ok: false, texto: 'Certificación OACI' },
      { ok: false, texto: 'Experiencia internacional verificable' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
  {
    id: 8,
    score: 44,
    entidad: 'Fondo Colombia en Paz',
    departamento: 'Cundinamarca',
    objeto: 'Construcción de viviendas de interés social en zonas rurales del Municipio de Guaduas como parte del programa de sustitución de cultivos',
    presupuesto: 1584351744,
    cierre: '2026-07-25',
    numero: 'FCP-MC-2026-003',
    url: 'https://www.secop.gov.co/',
    unspsc: 'V1.72120000',
    requisitos: [
      { ok: true,  texto: 'Experiencia en VIS rural' },
      { ok: false, texto: 'Capacidad financiera K>1.0' },
      { ok: false, texto: 'RUP vigente' },
      { ok: false, texto: 'Componente social acreditado' },
      { ok: false, texto: 'Certificación en zonas de posconflicto' },
    ],
    documentos: ['Propuesta técnica','Propuesta económica','RUP','Estados financieros','Certificados de experiencia','Pólizas','Paz y salvo SENA','RIT'],
  },
]

const ACTIVIDAD = [
  { color: '#15803d', msg: 'Nuevo proceso detectado — IDU — Construcción malla vial Kennedy', tiempo: 'hace 2 min' },
  { color: '#1e3a5f', msg: 'Score actualizado — INVIAS Ruta 50 — ahora 81/100', tiempo: 'hace 8 min' },
  { color: '#b45309', msg: 'Adenda publicada — Hospital Diógenes Troncoso — revisa cambios en pliego', tiempo: 'hace 23 min' },
  { color: '#15803d', msg: 'Nuevo proceso detectado — Alcaldía Cajicá — IE Zipacón obras civiles', tiempo: 'hace 41 min' },
  { color: '#c0392b', msg: 'Cierre en 2 días — INVIAS LP-2026-117 — ¡acción requerida!', tiempo: 'hace 1 hora' },
  { color: '#15803d', msg: 'Nuevo proceso detectado — Metro de Bogotá — conectividad PLMB', tiempo: 'hace 1h 15min' },
  { color: '#b45309', msg: 'Adenda en proceso IDU-LP-2026-003 — nueva fecha de cierre', tiempo: 'hace 2 horas' },
  { color: '#1e3a5f', msg: 'Radar completado — 8 procesos compatibles — 3 urgentes', tiempo: 'hace 3 horas' },
]

/* ─────────────────────────────────────────────
   COMPONENTE: Partículas de fondo (canvas puro)
───────────────────────────────────────────────*/
function ParticlesCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf: number
    const COUNT = 55

    const resize = () => {
      canvas.width  = canvas.offsetWidth
      canvas.height = canvas.offsetHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type Particle = { x: number; y: number; vx: number; vy: number; r: number; op: number }
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x:  Math.random() * canvas.width,
      y:  Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r:  Math.random() * 1.4 + 0.4,
      op: Math.random() * 0.18 + 0.04,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0) p.x = canvas.width
        if (p.x > canvas.width)  p.x = 0
        if (p.y < 0) p.y = canvas.height
        if (p.y > canvas.height) p.y = 0
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(100,95,88,${p.op})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }}
    />
  )
}

/* ─────────────────────────────────────────────
   COMPONENTE: Línea de escaneo (una sola vez)
───────────────────────────────────────────────*/
function ScanLine() {
  const [visible, setVisible] = useState(true)
  useEffect(() => { const t = setTimeout(() => setVisible(false), 700); return () => clearTimeout(t) }, [])
  if (!visible) return null
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, height: 2,
      background: 'linear-gradient(90deg, transparent 0%, #e8601c 40%, #ff8a4c 50%, #e8601c 60%, transparent 100%)',
      boxShadow: '0 0 12px 2px rgba(232,96,28,0.7)',
      animation: 'scan-sweep 0.6s cubic-bezier(0.4,0,0.6,1) forwards',
      zIndex: 99, pointerEvents: 'none',
    }} />
  )
}

/* ─────────────────────────────────────────────
   COMPONENTE: Score badge SVG con arco animado
───────────────────────────────────────────────*/
function ScoreBadge({ score, size = 44, delay = 0 }: { score: number; size?: number; delay?: number }) {
  const r = (size / 2) - 4
  const circ = 2 * Math.PI * r
  const target = circ * (1 - score / 100)
  const color = score >= 90 ? '#15803d' : score >= 70 ? '#1e3a5f' : score >= 50 ? '#b45309' : '#c0392b'
  const trackColor = score >= 90 ? 'rgba(21,128,61,0.12)' : score >= 70 ? 'rgba(30,58,95,0.12)' : score >= 50 ? 'rgba(180,83,9,0.12)' : 'rgba(192,57,43,0.12)'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* pista de fondo */}
        <circle cx={size/2} cy={size/2} r={r} fill={trackColor} stroke={color} strokeWidth={2} strokeOpacity={0.18} />
        {/* arco animado */}
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={target}
          className="score-arc"
          style={{
            '--circ': circ,
            '--target': target,
            animationDelay: `${delay}ms`,
          } as React.CSSProperties}
        />
      </svg>
      {/* número centrado */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 13, color,
      }}>
        {score}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   UTILIDADES
───────────────────────────────────────────────*/
function fmtCOP(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(0)}M`
  return '$' + n.toLocaleString('es-CO')
}

function fmtFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d} ${meses[m - 1]} ${y}`
}

function diasRestantes(iso: string) {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const cierre = new Date(iso); cierre.setHours(0,0,0,0)
  return Math.round((cierre.getTime() - hoy.getTime()) / 86400000)
}

function scoreColor(s: number) {
  if (s >= 90) return '#15803d'
  if (s >= 70) return '#1e3a5f'
  if (s >= 50) return '#b45309'
  return '#c0392b'
}

/* ─────────────────────────────────────────────
   HOOK: contador animado
───────────────────────────────────────────────*/
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3) }

function useCounter(target: number, duration = 1200) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (target === 0) return
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      setVal(Math.round(easeOutCubic(t) * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

/* ─────────────────────────────────────────────
   COMPONENTE: Reloj en tiempo real
───────────────────────────────────────────────*/
function LiveClock() {
  const [hora, setHora] = useState('')
  useEffect(() => {
    const tick = () => setHora(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{hora}</span>
}

/* ─────────────────────────────────────────────
   COMPONENTE: Tarjeta KPI
───────────────────────────────────────────────*/
function KpiCard({ label, sub, children }: { label: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{
      flex: 1,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      padding: '24px 28px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1, color: '#1a1714', letterSpacing: '-1px' }}>
        {children}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-sec)', marginTop: 10 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: '#15803d', marginTop: 4 }}>{sub}</div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   COMPONENTE: Panel lateral
───────────────────────────────────────────────*/
function PanelLateral({ proceso, onClose }: { proceso: typeof PROCESOS[0]; onClose: () => void }) {
  const [seccion, setSeccion] = useState<Record<string, boolean>>({
    requisitos: true, calc: false, docs: false,
  })
  const [costos, setCostos] = useState('')
  const [aiu, setAiu] = useState('28')
  const [docsCheck, setDocsCheck] = useState<boolean[]>(proceso.documentos.map(() => false))

  const costosN = parseFloat(costos.replace(/\./g, '').replace(',', '.')) || 0
  const aiuN = parseFloat(aiu) / 100 || 0
  const propuesta = costosN * (1 + aiuN)
  const margen = proceso.presupuesto > 0 ? ((propuesta / proceso.presupuesto) - 1) * 100 : 0
  const requisitosOk = proceso.requisitos.filter(r => r.ok).length
  const docsOk = docsCheck.filter(Boolean).length
  const dias = diasRestantes(proceso.cierre)

  function toggle(k: string) {
    setSeccion(p => ({ ...p, [k]: !p[k] }))
  }

  return (
    <div
      className="panel-slide-in"
      style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 480, background: '#faf9f6',
        borderLeft: '1px solid var(--border)',
        zIndex: 50, overflowY: 'auto', display: 'flex', flexDirection: 'column',
      }}
    >
      {/* cabecera panel */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 0, background: '#faf9f6', zIndex: 1,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-sec)', marginBottom: 6 }}>
              Análisis de proceso
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>
              {proceso.entidad}
            </div>
            <div style={{ color: 'var(--text-sec)', fontSize: 12, marginTop: 4 }}>{proceso.numero}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ScoreBadge score={proceso.score} delay={100} />
            <button onClick={onClose} style={{
              background: 'var(--border)', border: 'none', color: 'var(--text-sec)',
              width: 32, height: 32, borderRadius: 4, fontSize: 18, lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          </div>
        </div>
        <div style={{
          marginTop: 14, padding: '10px 14px',
          background: 'var(--surface)', borderRadius: 4,
          fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.6,
        }}>
          {proceso.objeto}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12 }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>{fmtCOP(proceso.presupuesto)}</span>
          <span style={{ color: dias <= 7 ? '#c0392b' : 'var(--text-sec)' }}>
            {dias <= 0 ? 'CERRADO' : `Cierra en ${dias} día${dias !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* cuerpo */}
      <div style={{ padding: '0 0 40px' }}>

        {/* REQUISITOS */}
        <SeccionPanel titulo="CHECKLIST DE REQUISITOS" abierta={seccion.requisitos} onToggle={() => toggle('requisitos')}>
          <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>Cumples {requisitosOk} de {proceso.requisitos.length} requisitos</span>
              <BarraProgreso valor={requisitosOk} total={proceso.requisitos.length} color="#1e3a5f" />
            </div>
            {proceso.requisitos.map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 0',
                borderBottom: i < proceso.requisitos.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: r.ok ? 'rgba(21,128,61,0.1)' : 'rgba(192,57,43,0.1)',
                  border: `1px solid ${r.ok ? '#15803d' : '#c0392b'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, color: r.ok ? '#15803d' : '#c0392b', fontWeight: 700,
                }}>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: 13, color: r.ok ? 'var(--text)' : 'var(--text-sec)' }}>{r.texto}</span>
              </div>
            ))}
          </div>
        </SeccionPanel>

        {/* CALCULADORA */}
        <SeccionPanel titulo="CALCULADORA DE PROPUESTA" abierta={seccion.calc} onToggle={() => toggle('calc')}>
          <div style={{ padding: '16px 24px' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-sec)', display: 'block', marginBottom: 6 }}>
                Costos directos (COP)
              </label>
              <input
                type="text"
                value={costos}
                onChange={e => setCostos(e.target.value)}
                placeholder="Ej: 3500000000"
                style={{
                  width: '100%', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 4,
                  padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none',
                }}
              />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-sec)', display: 'block', marginBottom: 6 }}>
                AIU (%)
              </label>
              <input
                type="number"
                value={aiu}
                onChange={e => setAiu(e.target.value)}
                style={{
                  width: '100%', background: 'var(--surface)',
                  border: '1px solid var(--border)', borderRadius: 4,
                  padding: '10px 12px', color: 'var(--text)', fontSize: 14, outline: 'none',
                }}
              />
            </div>
            {propuesta > 0 && (
              <div style={{
                background: 'var(--surface)', borderRadius: 4,
                padding: '16px 18px', border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-sec)', marginBottom: 8 }}>
                  Valor propuesta
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#1a1714', letterSpacing: '-0.5px' }}>
                  {fmtCOP(propuesta)}
                </div>
                <div style={{ marginTop: 10, fontSize: 12 }}>
                  <span style={{ color: 'var(--text-sec)' }}>vs. presupuesto oficial: </span>
                  <span style={{
                    display: 'inline-block', marginLeft: 6,
                    padding: '2px 8px', borderRadius: 3, fontSize: 11, fontWeight: 700,
                    background: Math.abs(margen) < 15 ? 'rgba(21,128,61,0.1)' : 'rgba(192,57,43,0.1)',
                    color: Math.abs(margen) < 15 ? '#15803d' : '#c0392b',
                  }}>
                    {margen > 0 ? '+' : ''}{margen.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </SeccionPanel>

        {/* DOCUMENTOS */}
        <SeccionPanel titulo="DOCUMENTOS A PREPARAR" abierta={seccion.docs} onToggle={() => toggle('docs')}>
          <div style={{ padding: '16px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>{docsOk} de {proceso.documentos.length} listos</span>
              <BarraProgreso valor={docsOk} total={proceso.documentos.length} color="#15803d" />
            </div>
            {proceso.documentos.map((doc, i) => (
              <div
                key={i}
                onClick={() => setDocsCheck(p => { const n = [...p]; n[i] = !n[i]; return n })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 0', cursor: 'pointer',
                  borderBottom: i < proceso.documentos.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                  background: docsCheck[i] ? '#15803d' : 'transparent',
                  border: `1px solid ${docsCheck[i] ? '#15803d' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#000', fontWeight: 700,
                }}>
                  {docsCheck[i] ? '✓' : ''}
                </div>
                <span style={{ fontSize: 13, color: docsCheck[i] ? 'var(--text-sec)' : 'var(--text)', textDecoration: docsCheck[i] ? 'line-through' : 'none' }}>
                  {doc}
                </span>
              </div>
            ))}
          </div>
        </SeccionPanel>
      </div>
    </div>
  )
}

function SeccionPanel({ titulo, abierta, onToggle, children }: {
  titulo: string; abierta: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          color: 'var(--text-sec)',
        }}
      >
        <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 500 }}>{titulo}</span>
        <span style={{ fontSize: 16, transform: abierta ? 'rotate(90deg)' : 'none', transition: 'transform 200ms' }}>▸</span>
      </button>
      {abierta && children}
    </div>
  )
}

function BarraProgreso({ valor, total, color }: { valor: number; total: number; color: string }) {
  const pct = total > 0 ? (valor / total) * 100 : 0
  return (
    <div style={{ width: 80, height: 4, background: 'var(--border)', borderRadius: 2 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 300ms' }} />
    </div>
  )
}

/* ─────────────────────────────────────────────
   PÁGINA PRINCIPAL
───────────────────────────────────────────────*/
export default function Dashboard() {
  const [filtro, setFiltro] = useState<'todos' | 'score70' | 'urgente' | 'grande'>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [panelProceso, setPanelProceso] = useState<typeof PROCESOS[0] | null>(null)
  const [hoverId, setHoverId] = useState<number | null>(null)
  const [tooltipId, setTooltipId] = useState<number | null>(null)
  const tickerRef = useRef<HTMLDivElement>(null)

  // KPI counters
  const encontrados  = useCounter(PROCESOS.length)
  const totalCOP     = useCounter(Math.round(PROCESOS.reduce((a, p) => a + p.presupuesto, 0) / 1_000_000))
  const sinRevisar   = useCounter(PROCESOS.filter(p => p.score >= 70).length)
  const diasProximo  = useCounter(Math.min(...PROCESOS.map(p => diasRestantes(p.cierre))))

  // Filtrado
  const procesados = PROCESOS.filter(p => {
    if (busqueda && !p.entidad.toLowerCase().includes(busqueda.toLowerCase()) &&
        !p.objeto.toLowerCase().includes(busqueda.toLowerCase())) return false
    if (filtro === 'score70') return p.score >= 70
    if (filtro === 'urgente') return diasRestantes(p.cierre) <= 7
    if (filtro === 'grande')  return p.presupuesto >= 1_000_000_000
    return true
  })

  const tickerItems = [...ACTIVIDAD, ...ACTIVIDAD]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── HEADER ── */}
      <header style={{
        height: 52,
        background: '#1e3a5f',
        borderBottom: '1px solid #16304f',
        display: 'flex', alignItems: 'center',
        padding: '0 28px',
        position: 'sticky', top: 0, zIndex: 40,
        boxShadow: '0 2px 8px rgba(30,58,95,0.2)',
        overflow: 'hidden',
      }}>
        <ScanLine />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative', zIndex: 1 }}>
          {/* Punto con pulse suave + tooltip */}
          <div style={{ position: 'relative' }} className="status-dot-wrap">
            <span
              className="pulse-status"
              title="Sistema activo — monitoreando SECOP II"
              style={{
                display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
                background: '#e8601c', cursor: 'default',
              }}
            />
          </div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '0.06em', color: '#ffffff' }}>
            SECOP RADAR
          </span>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginLeft: 4 }}>
            monitoreando SECOP II en tiempo real
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
            <LiveClock />
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: '50%', background: '#4ade80',
            boxShadow: '0 0 6px rgba(74,222,128,0.9)',
          }} />
          <span style={{ fontSize: 11, color: '#4ade80', letterSpacing: '0.04em' }}>SISTEMA ACTIVO</span>
        </div>
      </header>

      {/* ── HERO KPIs ── */}
      <div className="fade-in-up" style={{
        background: '#e8601c',
        borderBottom: '1px solid #d4541a',
        padding: '28px 28px',
      }}>
        <div style={{ display: 'flex', gap: 16, maxWidth: 1400, margin: '0 auto' }}>
          <KpiCard label="Encontrados hoy" sub="+3 vs ayer ↑">
            {encontrados}
          </KpiCard>
          <KpiCard label="En oportunidades" sub="COP disponibles">
            ${totalCOP.toLocaleString('es-CO')}M
          </KpiCard>
          <KpiCard label="Para analizar" sub="score ≥70, sin revisar">
            {sinRevisar}
          </KpiCard>
          <KpiCard label="Próximo cierre" sub="⚠ urgente">
            <span style={{ color: diasProximo <= 7 ? '#c0392b' : '#1a1714' }}>
              {diasProximo} días
            </span>
          </KpiCard>
        </div>
      </div>

      {/* ── TABLA ── */}
      <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <ParticlesCanvas />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: 1400, width: '100%', margin: '0 auto', padding: '28px 28px' }}>

        {/* toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#1a1714' }}>
              Oportunidades compatibles hoy
            </h2>
            <p style={{ color: 'var(--text-sec)', fontSize: 12, marginTop: 2 }}>
              {procesados.length} proceso{procesados.length !== 1 ? 's' : ''} · ordenados por compatibilidad
            </p>
          </div>
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar entidad u objeto..."
            style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '8px 14px', color: 'var(--text)',
              fontSize: 13, outline: 'none', width: 260,
            }}
          />
        </div>

        {/* filtros rápidos */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {([
            ['todos',   'Todos'],
            ['score70', 'Score ≥70'],
            ['urgente', 'Cierre urgente'],
            ['grande',  '>$1.000M'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFiltro(key)}
              style={{
                padding: '6px 14px', borderRadius: 4, fontSize: 12, fontWeight: 500,
                border: '1px solid',
                borderColor: filtro === key ? '#e8601c' : 'var(--border)',
                background: filtro === key ? 'rgba(232,96,28,0.08)' : 'transparent',
                color: filtro === key ? '#e8601c' : 'var(--text-sec)',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* tabla */}
        <div className="fade-in-up" style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f0ede8', borderBottom: '1px solid var(--border)' }}>
                {['SCORE','ENTIDAD','OBJETO','PRESUPUESTO','CIERRE','ACCIÓN'].map(col => (
                  <th key={col} style={{
                    padding: '11px 16px', textAlign: col === 'PRESUPUESTO' ? 'right' : 'left',
                    fontSize: 10, fontWeight: 500, letterSpacing: '0.1em',
                    textTransform: 'uppercase', color: 'var(--text-sec)',
                  }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {procesados.map((p, i) => {
                const dias = diasRestantes(p.cierre)
                const isHover = hoverId === p.id
                return (
                  <tr
                    key={p.id}
                    onMouseEnter={() => setHoverId(p.id)}
                    onMouseLeave={() => setHoverId(null)}
                    className="row-enter"
                    style={{
                      borderBottom: i < procesados.length - 1 ? '1px solid var(--border)' : 'none',
                      background: isHover ? '#f0ede8' : 'transparent',
                      transition: 'background 150ms, box-shadow 150ms',
                      animationDelay: `${i * 80}ms`,
                      boxShadow: isHover ? 'inset 4px 0 0 #e8601c' : 'inset 4px 0 0 transparent',
                    }}
                  >
                    {/* score badge SVG */}
                    <td style={{ padding: '14px 16px' }}>
                      <ScoreBadge score={p.score} delay={i * 80 + 400} />
                    </td>

                    {/* entidad */}
                    <td style={{ padding: '14px 16px', minWidth: 180 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: '#1a1714' }}>{p.entidad}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-sec)', marginTop: 3 }}>{p.departamento}</div>
                    </td>

                    {/* objeto con tooltip */}
                    <td
                      style={{ padding: '14px 16px', maxWidth: 300, position: 'relative' }}
                      onMouseEnter={() => setTooltipId(p.id)}
                      onMouseLeave={() => setTooltipId(null)}
                    >
                      <div style={{
                        fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.5,
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>
                        {p.objeto}
                      </div>
                      {tooltipId === p.id && (
                        <div style={{
                          position: 'absolute', left: 0, top: '100%', zIndex: 30,
                          background: '#ffffff', border: '1px solid var(--border)',
                          borderRadius: 4, padding: '10px 14px',
                          fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                          width: 340, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                          pointerEvents: 'none',
                        }}>
                          {p.objeto}
                        </div>
                      )}
                    </td>

                    {/* presupuesto */}
                    <td style={{ padding: '14px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{
                        fontSize: 14, fontWeight: 700,
                        color: p.presupuesto >= 1_000_000_000 ? '#15803d' : '#1a1714',
                      }}>
                        {fmtCOP(p.presupuesto)}
                      </span>
                    </td>

                    {/* cierre */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>{fmtFecha(p.cierre)}</div>
                      <div style={{
                        fontSize: 11, fontWeight: 600, marginTop: 3,
                        color: dias <= 3 ? '#c0392b' : dias <= 7 ? '#b45309' : 'var(--text-sec)',
                      }}>
                        {dias <= 0 ? 'CERRADO' : `${dias}d restantes`}
                        {dias <= 7 && dias > 0 && ' ⚠'}
                      </div>
                    </td>

                    {/* acción */}
                    <td style={{ padding: '14px 16px' }}>
                      <button
                        onClick={() => setPanelProceso(p)}
                        style={{
                          background: isHover ? '#e8601c' : 'rgba(232,96,28,0.08)',
                          border: '1px solid rgba(232,96,28,0.35)',
                          color: isHover ? '#fff' : '#e8601c',
                          padding: '7px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                          cursor: 'pointer', transition: 'all 100ms', whiteSpace: 'nowrap',
                        }}
                      >
                        Analizar →
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </div>
      </main>

      {/* ── TICKER INFERIOR ── */}
      <div style={{
        borderTop: '1px solid #16304f',
        background: '#1e3a5f',
        height: 36, overflow: 'hidden',
        display: 'flex', alignItems: 'center',
      }}>
        <div
          ref={tickerRef}
          style={{
            display: 'flex', gap: 64, whiteSpace: 'nowrap',
            animation: 'ticker-scroll 40s linear infinite',
          }}
        >
          {tickerItems.map((a, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span className="pulse-dot" style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: a.color, flexShrink: 0,
              }} />
              <span style={{ color: 'rgba(255,255,255,0.65)' }}>{a.msg}</span>
              <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
              <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{a.tiempo}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── OVERLAY ── */}
      {panelProceso && (
        <>
          <div
            onClick={() => setPanelProceso(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
              zIndex: 49, backdropFilter: 'blur(2px)',
            }}
          />
          <PanelLateral proceso={panelProceso} onClose={() => setPanelProceso(null)} />
        </>
      )}
    </div>
  )
}
