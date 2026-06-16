'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

/* ─── Paleta ─────────────────────────────── */
const DARK = {
  bg: '#0f1117', card: '#1a1d27', cardHover: '#1e2130',
  border: '#2a2d3a', text: '#f1f5f9', textSec: '#64748b',
  orange: '#f97316', orangeH: '#ea6c0a', green: '#22c55e',
  red: '#ef4444', header: '#0a0d14', heroBg: '#141720',
}
const LIGHT = {
  bg: '#f5f5f5', card: '#ffffff', cardHover: '#f0f0f0',
  border: '#e2e2e2', text: '#111111', textSec: '#666666',
  orange: '#f97316', orangeH: '#ea6c0a', green: '#16a34a',
  red: '#dc2626', header: '#ffffff', heroBg: '#f5f5f5',
}
// Variable mutable que sub-componentes leen en cada render del padre
const C: typeof DARK = { ...DARK }
function useTheme() { return C }

/* ─── Datos ───────────────────────────────── */

interface ProcesoData {
  id: number
  entidad: string
  idProceso: string
  departamento: string
  unspsc: string
  unspscLabel: string
  tipo: string
  sector: string
  objeto: string
  presupuesto: number
  cierre: string
  docs: number
  // Calculados dinámicamente
  score?: number
  matchDepto?: boolean
  matchUNSPSC?: boolean
  matchPresupuesto?: boolean
  matchVigencia?: boolean
}

const PROCESOS: ProcesoData[] = [
  { id: 1,  entidad: 'Alcaldía de Bogotá',          idProceso: 'SECOP-2026-INF-089',   departamento: 'CUNDINAMARCA',      unspsc: '72140000', unspscLabel: 'Obra civil',      tipo: 'Infraestructura vial',  sector: 'Infrastructure',  objeto: 'Construcción y rehabilitación de malla vial local en las localidades de Kennedy, Bosa y Ciudad Bolívar — Grupo 3',                         presupuesto: 1200000000,  cierre: new Date(Date.now() + 1.5  * 86400000).toISOString(), docs: 12 },
  { id: 2,  entidad: 'INVIAS',                       idProceso: 'INVIAS-LP-2026-117',    departamento: 'CUNDINAMARCA',      unspsc: '72140000', unspscLabel: 'Obra civil',      tipo: 'Infraestructura vial',  sector: 'Infrastructure',  objeto: 'Rehabilitación de la carretera Bogotá–Villeta, sector La Vega–Villeta, corredor nacional Ruta 50',                                            presupuesto: 5200000000,  cierre: new Date(Date.now() + 22   * 86400000).toISOString(), docs: 10 },
  { id: 3,  entidad: 'Gobernación de Boyacá',        idProceso: 'BOY-LP-2026-042',       departamento: 'BOYACÁ',            unspsc: '72120000', unspscLabel: 'Edificación',     tipo: 'Construcciones',        sector: 'Infrastructure',  objeto: 'Construcción de 12 sedes educativas rurales en municipios no certificados del departamento de Boyacá — Fase II',                                   presupuesto: 3800000000,  cierre: new Date(Date.now() + 30   * 86400000).toISOString(), docs: 15 },
  { id: 4,  entidad: 'Alcaldía de Villavicencio',    idProceso: 'VCIO-LP-2026-018',      departamento: 'META',              unspsc: '72140000', unspscLabel: 'Obra civil',      tipo: 'Infraestructura vial',  sector: 'Infrastructure',  objeto: 'Mejoramiento y pavimentación de vías terciarias en los corregimientos de Apiay, Pompeya y La Concepción',                                           presupuesto: 2100000000,  cierre: new Date(Date.now() + 14   * 86400000).toISOString(), docs: 8 },
  { id: 5,  entidad: 'Gobernación de Cundinamarca',  idProceso: 'CUN-LP-2026-076',       departamento: 'CUNDINAMARCA',      unspsc: '72120000', unspscLabel: 'Edificación',     tipo: 'Construcciones',        sector: 'Infrastructure',  objeto: 'Construcción del nuevo hospital regional de segundo nivel en Fusagasugá — incluye dotación biomédica',                                          presupuesto: 8400000000,  cierre: new Date(Date.now() + 5    * 86400000).toISOString(), docs: 18 },
  { id: 6,  entidad: 'Gobernación del Valle',        idProceso: 'GVAL-CIV-2026-091',     departamento: 'VALLE DEL CAUCA',   unspsc: '72140000', unspscLabel: 'Obra civil',      tipo: 'Construcciones',        sector: 'Infrastructure',  objeto: 'Construcción de centros de desarrollo infantil en tres municipios no certificados del departamento del Valle del Cauca',                         presupuesto: 4500000000,  cierre: new Date(Date.now() + 18   * 86400000).toISOString(), docs: 14 },
  { id: 7,  entidad: 'Ministerio de Vivienda',       idProceso: 'MINV-AGU-2026-112',     departamento: 'CHOCÓ',             unspsc: '72120000', unspscLabel: 'Edificación',     tipo: 'Adecuaciones',          sector: 'Infrastructure',  objeto: 'Suministro e instalación de sistemas de potabilización para comunidades rurales en el departamento de Chocó',                                     presupuesto: 850000000,   cierre: new Date(Date.now() + 28   * 86400000).toISOString(), docs: 9 },
  { id: 8,  entidad: 'Metro de Medellín',            idProceso: 'MET-2026-TR-004',       departamento: 'ANTIOQUIA',         unspsc: '81100000', unspscLabel: 'Consultoría',     tipo: 'Infraestructura vial',  sector: 'Tech Services',    objeto: 'Consultoría para la expansión de la línea A del sistema masivo de transporte — estudios de prefactibilidad y diseños de detalle',               presupuesto: 3400000000,  cierre: new Date(Date.now() + 45   * 86400000).toISOString(), docs: 11 },
  { id: 9,  entidad: 'MinTIC',                       idProceso: 'CTIC-2026-DIG-031',     departamento: 'BOGOTÁ D.C.',       unspsc: '81100000', unspscLabel: 'Consultoría',     tipo: 'Adecuaciones',          sector: 'Tech Services',    objeto: 'Implementación de infraestructura de conectividad digital en zonas rurales y municipios PDET — fase III',                                        presupuesto: 1900000000,  cierre: new Date(Date.now() + 35   * 86400000).toISOString(), docs: 7 },
  { id: 10, entidad: 'INVIAS',                       idProceso: 'INVIAS-MET-2026-088',   departamento: 'META',              unspsc: '72140000', unspscLabel: 'Obra civil',      tipo: 'Infraestructura vial',  sector: 'Infrastructure',  objeto: 'Construcción de la segunda calzada Villavicencio–Puerto López, tramo 3 — obras de drenaje y estabilización de taludes',                         presupuesto: 12000000000, cierre: new Date(Date.now() + 25   * 86400000).toISOString(), docs: 16 },
  { id: 11, entidad: 'Gobernación del Meta',         idProceso: 'META-LP-2026-055',      departamento: 'META',              unspsc: '72120000', unspscLabel: 'Edificación',     tipo: 'Construcciones',        sector: 'Infrastructure',  objeto: 'Construcción de vivienda de interés prioritario en los municipios de Granada, San Martín y Puerto Gaitán — 340 unidades',                      presupuesto: 6200000000,  cierre: new Date(Date.now() + 20   * 86400000).toISOString(), docs: 13 },
  { id: 12, entidad: 'Alcaldía de Tunja',            idProceso: 'TUN-LP-2026-029',       departamento: 'BOYACÁ',            unspsc: '72150000', unspscLabel: 'Mantenimiento',   tipo: 'Adecuaciones',          sector: 'Infrastructure',  objeto: 'Mantenimiento correctivo y preventivo de la red vial urbana del municipio de Tunja — incluye señalización horizontal y vertical',              presupuesto: 400000000,   cierre: new Date(Date.now() + 10   * 86400000).toISOString(), docs: 6 },
  { id: 13, entidad: 'IDU Bogotá',                   idProceso: 'IDU-LP-2026-141',       departamento: 'CUNDINAMARCA',      unspsc: '72140000', unspscLabel: 'Obra civil',      tipo: 'Infraestructura vial',  sector: 'Infrastructure',  objeto: 'Construcción del intercambiador vial Avenida Boyacá con Calle 13 — puentes vehiculares y deprimidos — lote 2',                                presupuesto: 9800000000,  cierre: new Date(Date.now() + 35   * 86400000).toISOString(), docs: 20 },
  { id: 14, entidad: 'Fondo Adaptación',             idProceso: 'FAD-LP-2026-063',       departamento: 'CUNDINAMARCA',      unspsc: '72140000', unspscLabel: 'Obra civil',      tipo: 'Adecuaciones',          sector: 'Infrastructure',  objeto: 'Obras de protección y mitigación del riesgo por inundación en la cuenca baja del río Bogotá — municipios de Sibaté y Soacha',                  presupuesto: 15500000000, cierre: new Date(Date.now() + 40   * 86400000).toISOString(), docs: 17 },
]

const CLIENTE_DEMO = {
  nombre: 'Constructora Andes SAS',
  nit: '901.234.567-8',
  email: 'licitaciones@constructorandes.com',
  departamentos: ['CUNDINAMARCA', 'BOYACÁ', 'META'],
  unspsc_codes: ['72140000', '72120000'],
  unspsc_labels: ['Infraestructura pública', 'Edificación'],
  presupuesto_min: 500000000,
  presupuesto_max: 15000000000,
}

function calcularCompatibilidad(p: ProcesoData): ProcesoData {
  const c = CLIENTE_DEMO
  const matchDepto = c.departamentos.some(d => p.departamento.toUpperCase().includes(d.toUpperCase()))
  const matchUNSPSC = c.unspsc_codes.some(u => p.unspsc.startsWith(u.slice(0, 4)))
  const matchPresupuesto = p.presupuesto >= c.presupuesto_min && p.presupuesto <= c.presupuesto_max
  const diasRestantes = (new Date(p.cierre).getTime() - Date.now()) / 86400000
  const matchVigencia = diasRestantes > 15

  let score = 0
  if (matchDepto) score += 30
  if (matchUNSPSC) score += 30
  if (matchPresupuesto) score += 25
  if (matchVigencia) score += 15

  return { ...p, score, matchDepto, matchUNSPSC, matchPresupuesto, matchVigencia }
}

// Procesos evaluados contra el cliente demo
const PROCESOS_COMPATIBLES = PROCESOS.map(calcularCompatibilidad).sort((a, b) => (b.score || 0) - (a.score || 0))

type DocStatus = 'listo' | 'en_tramite' | 'pendiente'
const DOCS_SECOP: { nombre: string; estado: string; status: DocStatus }[] = [
  { nombre: 'Carta de presentación de oferta',                       estado: 'Listo',       status: 'listo' },
  { nombre: 'RUP vigente (Registro Único de Proponentes)',           estado: 'Listo',       status: 'listo' },
  { nombre: 'Estados financieros con corte (año anterior)',          estado: 'En trámite',  status: 'en_tramite' },
  { nombre: 'Certificados de experiencia en SMMLV',                  estado: 'Listo',       status: 'listo' },
  { nombre: 'Paz y salvo de parafiscales (SENA, ICBF, Caja)',       estado: 'Listo',       status: 'listo' },
  { nombre: 'Póliza de seriedad de la oferta',                       estado: 'Pendiente',   status: 'pendiente' },
  { nombre: 'Propuesta económica (formato de la entidad)',           estado: 'En trámite',  status: 'en_tramite' },
  { nombre: 'Formato de experiencia acreditada',                     estado: 'En trámite',  status: 'en_tramite' },
]

const ETAPAS_SECOP = [
  { label: 'Publicación del proceso',         done: true,    fecha: 'hace 8 días' },
  { label: 'Observaciones al pliego',         done: true,    fecha: 'hace 5 días' },
  { label: 'Respuesta a observaciones',       done: true,    fecha: 'hace 3 días' },
  { label: 'Cierre y apertura de sobres',     done: false,   fecha: 'en 2 días', urgente: true },
  { label: 'Evaluación de propuestas',        done: false,   fecha: 'estimado: +7 días' },
  { label: 'Informe de evaluación',           done: false,   fecha: 'estimado: +12 días' },
  { label: 'Traslado del informe',            done: false,   fecha: 'estimado: +14 días' },
  { label: 'Audiencia de adjudicación',       done: false,   fecha: 'estimado: +18 días' },
  { label: 'Adjudicación del contrato',       done: false,   fecha: 'estimado: +20 días' },
]

/* ─── Utils ───────────────────────────────── */
function fmtCOP(n: number) {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  return `$${Math.round(n / 1_000_000).toLocaleString('es-CO')}M`
}

function useCountdown(iso: string) {
  const [txt, setTxt] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [diffMs, setDiffMs] = useState(0)
  useEffect(() => {
    const tick = () => {
      const diff = new Date(iso).getTime() - Date.now()
      setDiffMs(diff)
      setUrgent(diff < 86400000)
      if (diff <= 0) { setTxt('CERRADO'); return }
      const d = Math.floor(diff / 86400000)
      const h = Math.floor((diff % 86400000) / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      if (d > 0) setTxt(`${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`)
      else setTxt(`${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [iso])
  return [txt, urgent, diffMs] as const
}

function easeOut(t: number) { return 1 - Math.pow(1 - t, 3) }
function useCounter(target: number) {
  const [v, setV] = useState(0)
  useEffect(() => {
    const s = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min((now - s) / 1400, 1)
      setV(Math.round(easeOut(t) * target))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return v
}

function useClock() {
  const [t, setT] = useState('')
  useEffect(() => {
    const tick = () => setT(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
  }, [])
  return t
}

/* ─── Fondo: Circuito PCB ────────────────────── */
function Particles() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current; if (!c) return
    const ctx = c.getContext('2d'); if (!ctx) return
    let raf: number

    const GRID = 32
    type Seg = { x1: number; y1: number; x2: number; y2: number; pulse: number; speed: number; offset: number }
    type Node = { x: number; y: number; r: number }
    let segs: Seg[] = []
    let nodes: Node[] = []

    const init = () => {
      const p = c.parentElement
      c.width  = p ? p.offsetWidth  : 800
      c.height = p ? p.offsetHeight : 200
      segs = []
      nodes = []

      const cols = Math.floor(c.width / GRID) + 1
      const rows = Math.floor(c.height / GRID) + 1

      // Segmentos horizontales y verticales aleatorios
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols - 1; col++) {
          if (Math.random() < 0.28) {
            segs.push({
              x1: col * GRID, y1: row * GRID,
              x2: (col + 1) * GRID, y2: row * GRID,
              pulse: 0, speed: 0.004 + Math.random() * 0.006,
              offset: Math.random() * Math.PI * 2,
            })
          }
        }
      }
      for (let row = 0; row < rows - 1; row++) {
        for (let col = 0; col < cols; col++) {
          if (Math.random() < 0.22) {
            segs.push({
              x1: col * GRID, y1: row * GRID,
              x2: col * GRID, y2: (row + 1) * GRID,
              pulse: 0, speed: 0.004 + Math.random() * 0.006,
              offset: Math.random() * Math.PI * 2,
            })
          }
        }
      }

      // Nodos en intersecciones donde hay al menos un segmento
      const nodeSet = new Set<string>()
      for (const s of segs) {
        nodeSet.add(`${s.x1},${s.y1}`)
        nodeSet.add(`${s.x2},${s.y2}`)
      }
      nodeSet.forEach(key => {
        if (Math.random() < 0.35) {
          const [x, y] = key.split(',').map(Number)
          nodes.push({ x, y, r: Math.random() < 0.2 ? 3 : 1.5 })
        }
      })
    }

    init()
    window.addEventListener('resize', init)

    // Señales viajando por los segmentos
    type Signal = { segIdx: number; progress: number; speed: number }
    const signals: Signal[] = []
    // Lanzar una señal cada ~40 frames en un segmento aleatorio
    let frameCount = 0

    let t = 0
    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      t += 0.016
      frameCount++

      if (frameCount % 38 === 0 && segs.length > 0) {
        const idx = Math.floor(Math.abs(Math.sin(frameCount * 1.7)) * segs.length)
        signals.push({ segIdx: idx % segs.length, progress: 0, speed: 0.02 + Math.abs(Math.sin(frameCount)) * 0.03 })
      }

      // Líneas base
      for (const s of segs) {
        const alpha = 0.05 + 0.04 * (0.5 + 0.5 * Math.sin(t * s.speed * 60 + s.offset))
        ctx.beginPath()
        ctx.moveTo(s.x1, s.y1)
        ctx.lineTo(s.x2, s.y2)
        ctx.strokeStyle = `rgba(249,115,22,${alpha})`
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Señales viajando
      for (let i = signals.length - 1; i >= 0; i--) {
        const sig = signals[i]
        sig.progress += sig.speed
        if (sig.progress > 1) { signals.splice(i, 1); continue }
        const s = segs[sig.segIdx]
        const x = s.x1 + (s.x2 - s.x1) * sig.progress
        const y = s.y1 + (s.y2 - s.y1) * sig.progress
        // Estela
        const tailLen = 0.25
        const tailStart = Math.max(0, sig.progress - tailLen)
        const tx = s.x1 + (s.x2 - s.x1) * tailStart
        const ty = s.y1 + (s.y2 - s.y1) * tailStart
        const grad = ctx.createLinearGradient(tx, ty, x, y)
        grad.addColorStop(0, 'rgba(251,146,60,0)')
        grad.addColorStop(1, 'rgba(251,146,60,0.55)')
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y)
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.stroke()
        // Punto de cabeza
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(147,197,253,0.9)'; ctx.fill()
      }

      // Nodos
      for (const n of nodes) {
        const alpha = 0.1 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.3 + n.x * 0.05))
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(251,146,60,${alpha})`
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', init) }
  }, [])
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0, display: 'block' }} />
}

/* ─── Panel "Mis Propuestas" ─────────────────── */
const MIS_PROPUESTAS = [
  { id: 'IDU-LP-2026-003',  entidad: 'IDU Bogotá',       estado: 'EN EVALUACIÓN', color: '#facc15', dias: 5  },
  { id: 'GDA-LP-2026-041',  entidad: 'Gob. Antioquia',   estado: 'PRESENTADA',    color: '#22c55e', dias: 12 },
  { id: 'INVIAS-LP-2026-09',entidad: 'INVIAS',            estado: 'SUBSANACIÓN',   color: '#ef4444', dias: 2  },
]

function MisPropuestasDropdown() {
  const C = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: open ? 'rgba(249,115,22,.15)' : C.card,
          border: `1px solid ${open ? C.orange : C.border}`,
          borderRadius: 6, padding: '5px 12px',
          color: open ? C.orange : C.textSec, fontSize: 12, fontWeight: 600,
          cursor: 'pointer', transition: 'all 160ms', letterSpacing: '.02em',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
        Mis propuestas
        <span style={{
          background: C.orange, color: '#fff', borderRadius: 10,
          fontSize: 9, fontWeight: 700, padding: '1px 6px', lineHeight: '16px',
        }}>{MIS_PROPUESTAS.length}</span>
        <span style={{ fontSize: 10, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320, background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 8, zIndex: 100,
          boxShadow: '0 16px 40px rgba(0,0,0,.6)',
          animation: 'row-enter .18s ease both',
        }}>
          {/* header dropdown */}
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text, letterSpacing: '.06em', textTransform: 'uppercase' }}>Mis propuestas activas</span>
            <span style={{ fontSize: 10, color: C.textSec }}>SECOP II</span>
          </div>

          {/* lista */}
          {MIS_PROPUESTAS.map((p, i) => (
            <div key={i} style={{
              padding: '12px 16px',
              borderBottom: i < MIS_PROPUESTAS.length - 1 ? `1px solid ${C.border}` : 'none',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', transition: 'background 150ms',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = C.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 6px ${p.color}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 2 }}>{p.entidad}</div>
                <div style={{ fontSize: 10, color: C.textSec, fontFamily: 'monospace' }}>{p.id}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: p.color, letterSpacing: '.06em' }}>{p.estado}</div>
                <div style={{ fontSize: 9, color: C.textSec, marginTop: 2 }}>Vence en {p.dias}d</div>
              </div>
            </div>
          ))}

          {/* footer */}
          <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
            <button style={{ background: 'none', border: 'none', color: C.orange, fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '.04em' }}>
              Ver todas las propuestas →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── Score Badge ──────────────────────────── */
function ScoreBadge({ score }: { score: number }) {
  const C = useTheme()
  const size = 52, r = 22
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const col = score >= 80 ? C.orange : score >= 60 ? '#facc15' : C.red
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={1.5} strokeOpacity={.18} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={2.5}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          className="score-arc" style={{ '--circ': circ, '--target': offset } as React.CSSProperties} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: col, lineHeight: 1 }}>{score}%</span>
      </div>
    </div>
  )
}

/* ─── Countdown cell ─────────────────────── */
function CountdownCell({ iso }: { iso: string }) {
  const C = useTheme()
  const [txt, urgent] = useCountdown(iso)
  return (
    <span style={{ color: urgent ? C.red : C.orange, fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
      {urgent && '⚠ '}{txt}
    </span>
  )
}

/* ─── Card de proceso — alto impacto ─────── */
function ProcesoCard({ p, onClick, active }: { p: ProcesoData; onClick: () => void; active: boolean }) {
  const C = useTheme()
  const [hov, setHov] = useState(false)
  const diff = new Date(p.cierre).getTime() - Date.now()
  const urgent = diff < 86400000
  const s = p.score || 0
  const scoreCol = s >= 70 ? C.orange : s >= 40 ? '#facc15' : C.red
  const accentCol = urgent ? C.red : active ? C.orange : hov ? C.orange : C.border

  const matchBadges = [
    { label: 'Depto',  ok: p.matchDepto,                                          color: C.green },
    { label: 'UNSPSC', ok: p.matchUNSPSC,                                         color: C.green },
    { label: 'COP',    ok: p.matchPresupuesto,                                    color: C.green },
    { label: 'Plazo',  ok: p.matchVigencia,                                       color: C.green },
  ]

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: active ? C.cardHover : hov ? C.cardHover : C.card,
        borderTop: `1px solid ${accentCol}`,
        borderRight: `1px solid ${accentCol}`,
        borderBottom: `1px solid ${accentCol}`,
        borderLeft: `3px solid ${scoreCol}`,
        borderRadius: 8, padding: '0', cursor: 'pointer',
        transition: 'all 180ms',
        boxShadow: active
          ? `0 0 24px rgba(249,115,22,.18), 0 4px 16px rgba(0,0,0,.4)`
          : hov
            ? `0 8px 28px rgba(0,0,0,.35)`
            : urgent
              ? `0 0 14px rgba(239,68,68,.12)`
              : `0 2px 8px rgba(0,0,0,.25)`,
        transform: hov ? 'translateY(-2px)' : 'none',
        overflow: 'hidden',
      }}>

      {/* Banda superior de color si es urgente */}
      {urgent && (
        <div style={{ height: 2, background: `linear-gradient(90deg, ${C.red}, transparent)` }} />
      )}

      <div style={{ padding: '18px 18px 0' }}>
        {/* Score grande + entidad */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
            {urgent && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 3, background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', marginBottom: 7 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.red }} className="pulse-status" />
                <span style={{ fontSize: 9, fontWeight: 700, color: C.red, letterSpacing: '.1em' }}>CIERRE URGENTE</span>
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text, lineHeight: 1.2, marginBottom: 3 }}>{p.entidad}</div>
            <div style={{ fontSize: 10, color: C.textSec, letterSpacing: '.04em' }}>ID: {p.idProceso}</div>
          </div>
          {/* Score ring grande */}
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 60, height: 60 }}>
              <svg width={60} height={60} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
                <circle cx={30} cy={30} r={25} fill="none" stroke={scoreCol} strokeWidth={2} strokeOpacity={.14} />
                <circle cx={30} cy={30} r={25} fill="none" stroke={scoreCol} strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 25}
                  strokeDashoffset={2 * Math.PI * 25 * (1 - s / 100)}
                  className="score-arc"
                  style={{ '--circ': 2 * Math.PI * 25, '--target': 2 * Math.PI * 25 * (1 - s / 100) } as React.CSSProperties}
                />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: scoreCol, lineHeight: 1 }}>{s}</span>
                <span style={{ fontSize: 8, color: scoreCol, fontWeight: 600 }}>%</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
              {matchBadges.map((b, bi) => (
                <div key={bi} title={b.ok ? `${b.label}: Cumple` : `${b.label}: No cumple`} style={{
                  width: 16, height: 16, borderRadius: 3, fontSize: 7, fontWeight: 600,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: b.ok ? `${b.color}22` : 'transparent',
                  border: `1px solid ${b.ok ? b.color : C.border}`,
                  color: b.ok ? b.color : C.textSec,
                  cursor: 'default',
                }}>{b.label[0]}</div>
              ))}
            </div>
            <div style={{ fontSize: 8, color: scoreCol, fontWeight: 700, letterSpacing: '.06em', marginTop: 3 }}>
              {s >= 70 ? 'ALTA' : s >= 40 ? 'MEDIA' : 'BAJA'}
            </div>
          </div>
        </div>

        {/* Presupuesto — protagonista */}
        <div style={{
          margin: '12px -18px', padding: '12px 18px',
          background: C.bg,
          borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 3 }}>
            Valor del contrato
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: '-1px', lineHeight: 1 }}>
            {fmtCOP(p.presupuesto)}
            <span style={{ fontSize: 12, fontWeight: 400, color: C.textSec, marginLeft: 6 }}>COP</span>
          </div>
        </div>

        {/* Descripción */}
        <p style={{
          fontSize: 12, color: C.textSec, lineHeight: 1.6, margin: '12px 0',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{p.objeto}</p>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 18px', background: C.bg,
        borderTop: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: 10, color: C.textSec, letterSpacing: '.04em', textTransform: 'uppercase' }}>Cierre:</span>
          <CountdownCell iso={p.cierre} />
        </div>
        <div style={{
          fontSize: 11, fontWeight: 600, color: hov || active ? C.orange : C.textSec,
          transition: 'color 180ms', letterSpacing: '.04em',
        }}>
          {active ? '● ACTIVO' : 'Ver análisis →'}
        </div>
      </div>
    </div>
  )
}

/* ─── Panel Seguimiento de Propuesta ─────── */
function ProposalTracker({ proceso }: { proceso: ProcesoData | null }) {
  const C = useTheme()
  const [docStatuses, setDocStatuses] = useState<DocStatus[]>(DOCS_SECOP.map(d => d.status))
  const [tab, setTab] = useState<'docs' | 'aiu' | 'etapas'>('docs')

  // ── Calculadora AIU state ──
  const [costosDirectos, setCostosDirectos] = useState('')
  const [adminPct, setAdminPct] = useState('12')
  const [imprevPct, setImprevPct] = useState('3')
  const [utilPct, setUtilPct] = useState('6')

  const cd = parseFloat(costosDirectos.replace(/\./g, '').replace(',', '.')) || 0
  const adminVal = cd * (parseFloat(adminPct) / 100 || 0)
  const imprevVal = cd * (parseFloat(imprevPct) / 100 || 0)
  const utilVal = cd * (parseFloat(utilPct) / 100 || 0)
  const aiuTotal = adminVal + imprevVal + utilVal
  const propuestaTotal = cd + aiuTotal
  const presupuestoOficial = proceso?.presupuesto || 1
  const pctSobrePresupuesto = presupuestoOficial > 0 ? (propuestaTotal / presupuestoOficial) * 100 : 0

  function fmtMillones(n: number) {
    if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
    if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
    return `$${n.toLocaleString('es-CO')}`
  }

  // ── Document readiness ──
  const listoCount = docStatuses.filter(s => s === 'listo').length
  const readiness = Math.round((listoCount / DOCS_SECOP.length) * 100)

  function cycleDocStatus(i: number) {
    setDocStatuses(prev => {
      const n = [...prev]
      n[i] = n[i] === 'listo' ? 'en_tramite' : n[i] === 'en_tramite' ? 'pendiente' : 'listo'
      return n
    })
  }

  function docStatusColor(s: DocStatus) { return s === 'listo' ? C.green : s === 'en_tramite' ? '#f59e0b' : C.red }
  function docStatusLabel(s: DocStatus) { return s === 'listo' ? 'LISTO' : s === 'en_tramite' ? 'EN TRÁMITE' : 'PENDIENTE' }

  // ── Countdown real-time ──
  const fallbackDate = '2099-12-31T23:59:59.000Z'
  const [countdownTxt, countdownUrgent] = useCountdown(proceso?.cierre || fallbackDate)

  if (!proceso) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="1.3">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <p style={{ color: C.textSec, fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
        Selecciona una oportunidad<br/>para ver el seguimiento
      </p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 0 }}>

      {/* ── Encabezado + Countdown ── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 3 }}>
          Seguimiento de Propuesta
        </div>
        <div style={{ fontSize: 10, color: C.orange, letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          ACTIVO: {proceso.idProceso}
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.4, marginBottom: 8 }}>
          {proceso.entidad}
        </div>

        {/* Countdown prominente */}
        <div style={{
          background: countdownUrgent ? 'rgba(239,68,68,.12)' : C.bg,
          border: `1px solid ${countdownUrgent ? 'rgba(239,68,68,.4)' : C.border}`,
          borderRadius: 6, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 20 }}>{countdownUrgent ? '⚠' : '⏱'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>
              Cierre del proceso
            </div>
            <div style={{
              fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: countdownUrgent ? C.red : C.orange,
              letterSpacing: '-0.5px', lineHeight: 1.1,
            }}>
              {countdownTxt}
            </div>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: C.border, margin: '14px 0' }} />

      {/* ── Score de preparación ── */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Nivel de preparación</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: readiness >= 60 ? C.orange : C.red }}>{readiness}%</span>
        </div>
        <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{
            width: `${readiness}%`, height: '100%', borderRadius: 3,
            background: readiness >= 60
              ? `linear-gradient(90deg, ${C.orange}, #fb923c)`
              : `linear-gradient(90deg, ${C.red}, #f87171)`,
            transition: 'width 600ms ease',
          }} />
        </div>
        <div style={{ fontSize: 10, color: C.textSec }}>
          {listoCount} de {DOCS_SECOP.length} documentos listos
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {([['docs', 'Documentos'], ['aiu', 'Calculadora AIU'], ['etapas', 'Etapas SECOP II']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '7px 4px', borderRadius: 5, fontSize: 10, fontWeight: 600,
            border: `1px solid ${tab === key ? C.orange : C.border}`,
            background: tab === key ? 'rgba(249,115,22,.12)' : C.bg,
            color: tab === key ? C.orange : C.textSec,
            cursor: 'pointer', transition: 'all 160ms', letterSpacing: '.02em',
          }}>{label}</button>
        ))}
      </div>

      {/* ── DOCUMENTOS (3 estados) ── */}
      {tab === 'docs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
            Documentos obligatorios — pliego de condiciones
          </div>
          {DOCS_SECOP.map((doc, i) => {
            const s = docStatuses[i]
            const col = docStatusColor(s)
            return (
              <div key={i}
                onClick={() => cycleDocStatus(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  background: C.bg,
                  border: `1px solid ${s === 'listo' ? 'rgba(34,197,94,.35)' : s === 'en_tramite' ? 'rgba(245,158,11,.35)' : 'rgba(239,68,68,.25)'}`,
                  borderRadius: 6, cursor: 'pointer', transition: 'all 160ms',
                }}>
                {/* Status icon */}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${col}`,
                  background: s === 'listo' ? 'rgba(34,197,94,.15)' : s === 'en_tramite' ? 'rgba(245,158,11,.12)' : 'rgba(239,68,68,.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 160ms',
                }}>
                  {s === 'listo' && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke={col} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {s === 'en_tramite' && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                  )}
                  {s === 'pendiente' && (
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2.5" strokeLinecap="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: s !== 'pendiente' ? C.text : C.textSec, marginBottom: 1 }}>
                    {doc.nombre}
                  </div>
                </div>
                <span style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: '.08em',
                  color: col, background: 'transparent',
                  border: `1px solid ${col}`, borderRadius: 3, padding: '2px 6px',
                  flexShrink: 0,
                }}>{docStatusLabel(s)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── CALCULADORA AIU ── */}
      {tab === 'aiu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 2 }}>
            Valor estimado de propuesta económica
          </div>

          {/* Costos directos */}
          <div>
            <div style={{ fontSize: 10, color: C.textSec, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Costos directos (materiales, mano de obra, equipos)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: C.textSec, fontWeight: 600, fontSize: 13 }}>$</span>
              <input
                type="text"
                value={costosDirectos}
                onChange={e => setCostosDirectos(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="Ej: 3500000000"
                style={{
                  flex: 1, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
                  padding: '8px 10px', color: C.text, fontSize: 13, outline: 'none',
                }}
              />
              <span style={{ color: C.textSec, fontSize: 11 }}>COP</span>
            </div>
          </div>

          {/* AIU percentages */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {([
              ['Admin. %', adminPct, setAdminPct, '10-15%'],
              ['Imprev. %', imprevPct, setImprevPct, '1-5%'],
              ['Utilidad %', utilPct, setUtilPct, '5-8%'],
            ] as const).map(([label, val, setter, hint]) => (
              <div key={label}>
                <div style={{ fontSize: 9, color: C.textSec, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {label}
                </div>
                <input
                  type="number"
                  value={val}
                  onChange={e => setter(e.target.value)}
                  min="0" max="100"
                  style={{
                    width: '100%', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4,
                    padding: '7px 8px', color: C.text, fontSize: 13, outline: 'none', textAlign: 'center',
                  }}
                />
                <div style={{ fontSize: 8, color: C.textSec, textAlign: 'center', marginTop: 2 }}>{hint}</div>
              </div>
            ))}
          </div>

          {/* Resultados — solo si hay costos directos */}
          {cd > 0 && (
            <div style={{
              background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: C.textSec }}>Subtotal costos directos</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{fmtMillones(cd)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: C.textSec }}>Administración ({adminPct}%)</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{fmtMillones(adminVal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: C.textSec }}>Imprevistos ({imprevPct}%)</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{fmtMillones(imprevVal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: C.textSec }}>Utilidad ({utilPct}%)</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{fmtMillones(utilVal)}</span>
              </div>
              <div style={{ height: 1, background: C.border }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: C.orange, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Valor AIU
                </span>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>{fmtMillones(aiuTotal)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                background: 'rgba(249,115,22,.08)', borderRadius: 4, padding: '8px 10px',
                margin: '4px -6px -4px',
              }}>
                <span style={{ fontSize: 12, color: C.orange, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  TOTAL PROPUESTA
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: C.orange, letterSpacing: '-0.5px', lineHeight: 1 }}>
                  {fmtMillones(propuestaTotal)}
                </span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 11, marginTop: 4,
              }}>
                <span style={{ color: C.textSec }}>vs. presupuesto oficial ({fmtMillones(presupuestoOficial)})</span>
                <span style={{
                  fontWeight: 700, fontSize: 13,
                  color: pctSobrePresupuesto <= 95 ? C.green : pctSobrePresupuesto > 100 ? C.red : '#f59e0b',
                }}>
                  {pctSobrePresupuesto.toFixed(1)}%
                </span>
              </div>
              <div style={{
                height: 4, background: C.border, borderRadius: 2, overflow: 'hidden', marginTop: 2,
              }}>
                <div style={{
                  width: `${Math.min(pctSobrePresupuesto, 120)}%`, height: '100%', borderRadius: 2,
                  background: pctSobrePresupuesto <= 95 ? C.green : pctSobrePresupuesto > 100 ? C.red : '#f59e0b',
                  transition: 'width 300ms ease',
                }} />
              </div>
              <div style={{ fontSize: 9, color: pctSobrePresupuesto <= 95 ? C.green : pctSobrePresupuesto > 100 ? C.red : '#f59e0b', fontWeight: 600, textAlign: 'center' }}>
                {pctSobrePresupuesto <= 95 ? '✓ Dentro del rango óptimo' : pctSobrePresupuesto > 100 ? '⚠ Excede el presupuesto oficial' : '⚡ Cercano al límite'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── ETAPAS SECOP II ── */}
      {tab === 'etapas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            Cronograma del proceso licitatorio
          </div>
          {ETAPAS_SECOP.map((e, i) => {
            const isLast = i === ETAPAS_SECOP.length - 1
            const isCurrent = !e.done && (i === 0 || ETAPAS_SECOP[i - 1].done)
            return (
              <div key={i} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                {!isLast && (
                  <div style={{
                    position: 'absolute', left: 9, top: 20, bottom: -6, width: 1,
                    background: e.done ? C.orange : C.border,
                    zIndex: 0,
                  }} />
                )}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, zIndex: 1, marginTop: 1,
                  background: e.done ? C.orange : isCurrent ? 'rgba(249,115,22,.15)' : C.bg,
                  border: `2px solid ${e.done ? C.orange : isCurrent ? C.orange : C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {e.done && (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {isCurrent && !e.done && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.orange }} />
                  )}
                </div>
                <div style={{ paddingBottom: isLast ? 0 : 18, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: isCurrent ? 600 : 400, color: e.done ? C.textSec : isCurrent ? C.text : C.textSec, lineHeight: 1.3 }}>
                    {e.label}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 2, color: (e as any).urgente ? C.red : e.done ? C.green : C.textSec }}>
                    {(e as any).urgente ? '⚠ ' : ''}{e.fecha}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ─── Línea scan ─────────────────────────── */
function ScanLine() {
  const C = useTheme()
  const [on, setOn] = useState(true)
  useEffect(() => { const t = setTimeout(() => setOn(false), 700); return () => clearTimeout(t) }, [])
  if (!on) return null
  return <div style={{
    position: 'absolute', left: 0, right: 0, height: 1, zIndex: 99, pointerEvents: 'none',
    background: `linear-gradient(90deg, transparent, ${C.orange} 40%, #ffb380 50%, ${C.orange} 60%, transparent)`,
    animation: 'scan-sweep 0.65s ease forwards',
  }} />
}

/* ─── PÁGINA (Dashboard) ────────────────── */
export default function Dashboard() {
  const clock = useClock()
  const [theme, setTheme] = useState<'dark'|'light'>('dark')
  const palette = theme === 'dark' ? DARK : LIGHT
  // Sincronizar paleta mutable con el tema activo (para sub-componentes)
  Object.assign(C, palette)
  // Inyectar CSS variables en el root para que el cambio sea inmediato en el DOM
  useEffect(() => {
    const p = theme === 'dark' ? DARK : LIGHT
    Object.assign(C, p)
    const r = document.documentElement.style
    r.setProperty('--t-bg',      p.bg)
    r.setProperty('--t-card',    p.card)
    r.setProperty('--t-border',  p.border)
    r.setProperty('--t-text',    p.text)
    r.setProperty('--t-textsec', p.textSec)
    r.setProperty('--t-orange',  p.orange)
    r.setProperty('--t-header',  p.header)
    r.setProperty('--t-herobg',  p.heroBg)
    r.setProperty('--t-card2',   p.cardHover)
  }, [theme])
  const [filtro, setFiltro] = useState('Todos')
  const [filtroDepto, setFiltroDepto] = useState('Todos')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [busq, setBusq] = useState('')
  const [activeId, setActiveId] = useState<number | null>(1)

  const [panelOpen, setPanelOpen] = useState(true)
  const cTotal = useCounter(PROCESOS_COMPATIBLES.length)
  const presupuestoTotal = PROCESOS_COMPATIBLES.reduce((a, p) => a + p.presupuesto, 0)
  const cBudget = useCounter(Math.round(presupuestoTotal / 1_000_000_000))

  const DEPTOS_COLOMBIA = [
    'AMAZONAS', 'ANTIOQUIA', 'ARAUCA', 'ATLÁNTICO', 'BOGOTÁ D.C.',
    'BOLÍVAR', 'BOYACÁ', 'CALDAS', 'CAQUETÁ', 'CASANARE', 'CAUCA',
    'CESAR', 'CHOCÓ', 'CÓRDOBA', 'CUNDINAMARCA', 'GUAINÍA',
    'GUAVIARE', 'HUILA', 'LA GUAJIRA', 'MAGDALENA', 'META',
    'NARIÑO', 'NORTE DE SANTANDER', 'PUTUMAYO', 'QUINDÍO',
    'RISARALDA', 'SAN ANDRÉS', 'SANTANDER', 'SUCRE', 'TOLIMA',
    'VALLE DEL CAUCA', 'VAUPÉS', 'VICHADA',
  ]
  const deptosUnicos = ['Todos', ...DEPTOS_COLOMBIA]
  const tiposUnicos = ['Todos', 'Infraestructura vial', 'Adecuaciones', 'Construcciones']
  const filtros = ['Todos', 'Alta compat.', 'Media compat.', 'Cierre urgente']

  const procesados = PROCESOS_COMPATIBLES.filter(p => {
    if (filtro === 'Alta compat.' && (p.score || 0) < 70) return false
    if (filtro === 'Media compat.' && ((p.score || 0) < 40 || (p.score || 0) >= 70)) return false
    if (filtro === 'Cierre urgente' && new Date(p.cierre).getTime() - Date.now() >= 86400000) return false
    if (filtroDepto !== 'Todos' && p.departamento !== filtroDepto) return false
    if (filtroTipo !== 'Todos' && p.tipo !== filtroTipo) return false
    if (busq && !p.entidad.toLowerCase().includes(busq.toLowerCase()) && !p.objeto.toLowerCase().includes(busq.toLowerCase())) return false
    return true
  })

  const activeProceso = PROCESOS_COMPATIBLES.find(p => p.id === activeId) ?? null
  const urgentes = PROCESOS_COMPATIBLES.filter(p => new Date(p.cierre).getTime() - Date.now() < 86400000).length

  const altaCompat = PROCESOS_COMPATIBLES.filter(p => (p.score || 0) >= 70).length

  const METRICAS = [
    {
      label: 'OPORTUNIDADES HOY', val: `${cTotal}`, detail: 'Procesos encontrados',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>,
      urgent: false,
    },
    {
      label: 'PRESUPUESTO AGREGADO (COP)', val: `$${cBudget}B`, detail: 'Suma de procesos',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
      urgent: false,
    },
    {
      label: 'CIERRES URGENTES', val: `${urgentes}`, detail: 'Cierre en menos de 24h',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
      urgent: true,
    },
    {
      label: 'ALTA COMPATIBILIDAD', val: `${altaCompat}`, detail: 'Score ≥ 70%, listos para proponer',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      urgent: false,
    },
  ]

  return (
    <div key={theme} style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* ── HEADER ── */}
      <header style={{
        background: C.header, borderBottom: `1px solid ${C.border}`, height: 56,
        display: 'flex', alignItems: 'center', padding: '0 28px',
        position: 'sticky', top: 0, zIndex: 40,
        boxShadow: '0 2px 20px rgba(0,0,0,.5)',
      }}>
        <ScanLine />
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32 }}>
          <span className="pulse-status" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: C.orange, flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '3px', color: C.text, textTransform: 'uppercase' }}>SECOP RADAR</span>
        </div>
        {/* Nav izquierda + Mis Propuestas juntos */}
        <nav style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {(['Dashboard', 'Clientes', 'Historial', 'Configuración'] as const).map((n, i) => (
            <button key={n} style={{
              background: i === 0 ? 'rgba(249,115,22,.12)' : 'none',
              border: i === 0 ? `1px solid rgba(249,115,22,.25)` : '1px solid transparent',
              color: i === 0 ? C.orange : C.textSec, padding: '5px 14px', borderRadius: 5,
              fontSize: 13, cursor: 'pointer', fontWeight: i === 0 ? 600 : 400,
              transition: 'all 150ms',
            }}
              onMouseEnter={e => { if (i > 0) e.currentTarget.style.color = C.text }}
              onMouseLeave={e => { if (i > 0) e.currentTarget.style.color = C.textSec }}
            >{n}</button>
          ))}
          <div style={{ width: 1, height: 20, background: C.border, margin: '0 8px' }} />
          <MisPropuestasDropdown />
        </nav>
        {/* Derecha */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: C.textSec }}>{clock}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: C.orange }} className="pulse-status" />
            <span style={{ fontSize: 12, color: C.orange, fontWeight: 600, letterSpacing: '.06em' }}>LIVE SYNC ACTIVE</span>
          </div>
          <div style={{ width: 1, height: 18, background: C.border }} />
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            style={{
              width: 30, height: 30, borderRadius: 6,
              background: 'transparent', border: `1px solid ${C.border}`,
              color: C.textSec, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.orange; e.currentTarget.style.color = C.orange }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSec }}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ height: 'calc(100vh - 56px)', display: 'flex', position: 'relative', zIndex: 1, overflow: 'hidden' }}>

        {/* ── COLUMNA IZQUIERDA — ocupa lo que deja el panel ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ─ Hero: Título + Métricas con radar de fondo ─ */}
          <div style={{
            position: 'relative', borderRadius: 10,
            background: C.heroBg,
            border: `1px solid ${C.border}`,
            padding: '28px 28px 24px',
            clipPath: 'inset(0 round 10px)',
          }}>
            <Particles />
            {/* Título */}
            <div style={{ position: 'relative', zIndex: 1, marginBottom: 14 }}>
              <h1 style={{ fontSize: 34, fontWeight: 700, color: C.text, lineHeight: 1, marginBottom: 6 }}>Control de Licitaciones</h1>
              <p style={{ fontSize: 13, color: C.textSec }}>Monitoreo automatizado de contratación pública en SECOP II — Colombia.</p>
            </div>

            {/* ─ Cliente Demo ─ */}
            <div style={{ position: 'relative', zIndex: 1, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, background: `${C.card}aa`, backdropFilter: 'blur(6px)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px' }}>
              <div style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(249,115,22,.18)', border: `1px solid rgba(249,115,22,.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.orange }}>{CLIENTE_DEMO.nombre.charAt(0)}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 3 }}>{CLIENTE_DEMO.nombre}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {CLIENTE_DEMO.departamentos.map(d => (
                    <span key={d} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(34,197,94,.15)', color: C.green, fontWeight: 500 }}>
                      {d}
                    </span>
                  ))}
                  {CLIENTE_DEMO.unspsc_labels.map(l => (
                    <span key={l} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(59,130,246,.15)', color: '#3b82f6', fontWeight: 500 }}>
                      {l}
                    </span>
                  ))}
                  <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, background: 'rgba(249,115,22,.15)', color: C.orange, fontWeight: 500 }}>
                    ${(CLIENTE_DEMO.presupuesto_min / 1_000_000).toFixed(0)}M – ${(CLIENTE_DEMO.presupuesto_max / 1_000_000_000).toFixed(1)}B
                  </span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.08em', textTransform: 'uppercase' }}>Perfil activo</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>{PROCESOS_COMPATIBLES.filter(p => (p.score || 0) >= 70).length} matches</div>
              </div>
            </div>

            {/* ─ Métricas ─ */}
            <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {METRICAS.map((m, i) => (
                <div key={i} style={{
                  background: `${C.card}cc`, backdropFilter: 'blur(6px)',
                  borderTop: `1px solid ${m.urgent ? C.orange : C.border}`,
                  borderRight: `1px solid ${m.urgent ? C.orange : C.border}`,
                  borderBottom: `1px solid ${m.urgent ? C.orange : C.border}`,
                  borderLeft: `1px solid ${m.urgent ? C.orange : C.border}`,
                  borderRadius: 8, padding: '18px 18px 16px',
                  boxShadow: m.urgent ? `0 0 16px rgba(249,115,22,.2)` : 'none',
                }}>
                  <div style={{ marginBottom: 12 }}>{m.icon}</div>
                  <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontSize: 40, fontWeight: 700, color: C.text, lineHeight: 1, letterSpacing: '-1.5px', marginBottom: 8 }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: m.urgent ? C.red : C.orange }}>{m.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ─ Filtros ─ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Row 1: Departamento + Tipo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 2 }}>Oportunidades activas</div>
                <div style={{ fontSize: 12, color: C.textSec }}>{procesados.length} procesos compatibles</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} style={{
                  background: C.card, border: `1px solid ${filtroDepto !== 'Todos' ? C.orange : C.border}`,
                  borderRadius: 6, padding: '7px 12px', color: filtroDepto !== 'Todos' ? C.orange : C.textSec,
                  fontSize: 12, outline: 'none', cursor: 'pointer', fontWeight: 500, maxWidth: 180,
                }}>
                  {deptosUnicos.map(d => <option key={d} value={d}>{d === 'Todos' ? '🏛 Todos los deptos.' : d}</option>)}
                </select>
                {tiposUnicos.map(t => (
                  <button key={t} onClick={() => setFiltroTipo(t)} style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    background: filtroTipo === t ? C.orange : 'transparent',
                    border: `1px solid ${filtroTipo === t ? C.orange : C.border}`,
                    color: filtroTipo === t ? '#fff' : C.textSec,
                    transition: 'all 160ms', whiteSpace: 'nowrap',
                  }}>{t === 'Todos' ? '🏗 Todos los tipos' : t}</button>
                ))}
              </div>
            </div>

            {/* Row 2: Score filters + search */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {filtros.map(f => (
                <button key={f} onClick={() => setFiltro(f)} style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: filtro === f ? C.orange : 'transparent',
                  border: `1px solid ${filtro === f ? C.orange : C.border}`,
                  color: filtro === f ? '#fff' : C.textSec,
                  transition: 'all 160ms',
                }}>{f}</button>
              ))}
              <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar entidad u objeto..."
                style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '6px 14px', color: C.text, fontSize: 13, outline: 'none', width: 200, marginLeft: 'auto',
                }} />
            </div>
          </div>

          {/* ─ Grid de cards ─ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {procesados.map((p, i) => (
              <div key={p.id} className="row-enter" style={{ animationDelay: `${i * 60}ms` }}>
                <ProcesoCard p={p} active={activeId === p.id} onClick={() => setActiveId(p.id === activeId ? null : p.id)} />
              </div>
            ))}
          </div>
        </div>

        {/* ── STRIP TOGGLE — entre columnas ── */}
        <div style={{
          width: 0, position: 'relative', flexShrink: 0, zIndex: 20,
        }}>
          <button
            onClick={() => setPanelOpen(o => !o)}
            title={panelOpen ? 'Colapsar panel' : 'Expandir seguimiento'}
            style={{
              position: 'absolute', left: -14, top: 20,
              width: 28, height: 28, borderRadius: '50%',
              background: C.card, border: `1px solid ${C.border}`,
              color: C.textSec, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'background 160ms, color 160ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.orange; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.color = C.textSec }}
          >
            {panelOpen ? '›' : '‹'}
          </button>
        </div>

        {/* ── COLUMNA DERECHA — colapsable ── */}
        <div style={{
          width: panelOpen ? 380 : 40,
          minWidth: panelOpen ? 380 : 40,
          borderLeft: `1px solid ${C.border}`,
          background: C.card, overflowY: panelOpen ? 'auto' : 'hidden',
          display: 'flex', flexDirection: 'column',
          transition: 'width 280ms ease, min-width 280ms ease',
          position: 'relative', flexShrink: 0,
        }}>
          {/* Etiqueta vertical cuando colapsado */}
          {!panelOpen && (
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%) rotate(-90deg)',
              whiteSpace: 'nowrap', fontSize: 10, fontWeight: 600,
              color: C.textSec, letterSpacing: '.12em', textTransform: 'uppercase',
              pointerEvents: 'none',
            }}>Seguimiento</div>
          )}

          {/* Contenido — se oculta al colapsar */}
          <div style={{
            padding: '22px 22px 24px',
            opacity: panelOpen ? 1 : 0,
            transition: 'opacity 180ms ease',
            pointerEvents: panelOpen ? 'auto' : 'none',
            minWidth: 336,
          }}>
            <ProposalTracker proceso={activeProceso} />
          </div>
        </div>
      </div>
    </div>
  )
}
