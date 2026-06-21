'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import ClientProfilePanel from '@/components/ClientProfilePanel'
import ThemeToggle from '@/components/ThemeToggle'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

/* ─── Tipos del backend ───────────────────── */
interface ClienteApi {
  id: number
  nombre: string
  email: string
  departamentos: string
  municipio: string | null
  unspsc_codes: string
  presupuesto_min: number
  presupuesto_max: number
  activo: boolean
}

interface ProcesoApi {
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
  fecha_cierre?: string | null
  fecha_publicacion?: string | null
}

interface ContratoApi {
  nombre_entidad: string
  proveedor_adjudicado: string
  valor_del_contrato: string | number
  codigo_de_categoria_principal: string
  descripcion_del_proceso: string
  modalidad_de_contratacion: string
  estado_contrato: string
  fecha_de_firma: string
  departamento: string
  urlproceso: string
}

function parseCliente(c: ClienteApi) {
  let deps: string[] = []
  let unspsc: string[] = []
  try { deps = JSON.parse(c.departamentos || '[]') } catch {}
  try { unspsc = JSON.parse(c.unspsc_codes || '[]') } catch {}
  return { ...c, departamentos: deps, unspsc_codes: unspsc }
}

function labelUNSPSC(prefix: string) {
  if (prefix.startsWith('7214')) return 'Infraestructura pública'
  if (prefix.startsWith('7212')) return 'Edificación'
  if (prefix.startsWith('7215')) return 'Mantenimiento'
  if (prefix.startsWith('8110')) return 'Consultoría'
  return 'Otro'
}

function tipoProceso(prefix: string) {
  if (prefix.startsWith('7214')) return 'Infraestructura vial'
  if (prefix.startsWith('7212')) return 'Construcciones'
  if (prefix.startsWith('7215')) return 'Adecuaciones'
  if (prefix.startsWith('8110')) return 'Consultoría'
  return 'Otros'
}

function mapearProceso(p: ProcesoApi, cliente: ReturnType<typeof parseCliente>): ProcesoData {
  const unspscPrefix = p.unspsc_code ? p.unspsc_code.replace('V1.', '').slice(0, 4) : ''
  const cierre = p.fecha_cierre
    ? new Date(p.fecha_cierre).toISOString()
    : new Date(Date.now() + 30 * 86400000).toISOString()
  const matchDepto = cliente.departamentos.some(d =>
    (p.departamento || '').toUpperCase().includes(d.toUpperCase())
  )
  const matchUNSPSC = cliente.unspsc_codes.some(u => unspscPrefix.startsWith(u.slice(0, 4)))
  const matchPresupuesto = p.presupuesto >= cliente.presupuesto_min && p.presupuesto <= cliente.presupuesto_max
  const diasRestantes = (new Date(cierre).getTime() - Date.now()) / 86400000
  const matchVigencia = diasRestantes > 15
  const score = p.score_match || 0
  return {
    id: p.id,
    entidad: p.entidad,
    idProceso: p.numero_proceso,
    referenciaProceso: p.referencia_proceso,
    urlSecop: p.url_documento,
    estado: p.estado_proceso,
    modalidad: p.modalidad,
    departamento: p.departamento || '—',
    unspsc: unspscPrefix,
    unspscLabel: labelUNSPSC(unspscPrefix),
    tipo: tipoProceso(unspscPrefix),
    sector: 'Infrastructure',
    objeto: p.objeto,
    presupuesto: p.presupuesto,
    cierre,
    fechaPublicacion: p.fecha_publicacion,
    docs: 0,
    score,
    matchDepto,
    matchUNSPSC,
    matchPresupuesto,
    matchVigencia,
  }
}

/* ─── Datos ───────────────────────────────── */

interface ProcesoData {
  id: number
  entidad: string
  idProceso: string
  referenciaProceso: string | null
  urlSecop: string | null
  estado: string | null
  modalidad: string | null
  departamento: string
  unspsc: string
  unspscLabel: string
  tipo: string
  sector: string
  objeto: string
  presupuesto: number
  cierre: string
  fechaPublicacion: string | null | undefined
  docs: number
  // Calculados dinámicamente
  score?: number
  matchDepto?: boolean
  matchUNSPSC?: boolean
  matchPresupuesto?: boolean
  matchVigencia?: boolean
}

// Datos reales se cargan desde el backend en el componente Dashboard

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

function esUrlSecopDirecta(url: string | null): boolean {
  return !!url && url.includes('OpportunityDetail')
}

function construirUrlSecop(p: ProcesoData): string {
  if (esUrlSecopDirecta(p.urlSecop)) return p.urlSecop!
  return `https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?id=${encodeURIComponent(p.idProceso)}`
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
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState({ top: 0, right: 0 })

  const updatePos = useCallback(() => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 8, right: window.innerWidth - r.right })
    }
  }, [])

  useEffect(() => {
    if (open) { updatePos(); window.addEventListener('scroll', updatePos, true); window.addEventListener('resize', updatePos) }
    return () => { window.removeEventListener('scroll', updatePos, true); window.removeEventListener('resize', updatePos) }
  }, [open, updatePos])

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
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: open ? 'rgba(249,115,22,.15)' : 'var(--card)',
          border: `1px solid ${open ? 'var(--orange)' : 'var(--border)'}`,
          borderRadius: 6, padding: '5px 12px',
          color: open ? 'var(--orange)' : 'var(--text-sec)', fontSize: 12, fontWeight: 600,
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
          background: 'var(--orange)', color: '#fff', borderRadius: 10,
          fontSize: 9, fontWeight: 700, padding: '1px 6px', lineHeight: '16px',
        }}>{MIS_PROPUESTAS.length}</span>
        <span style={{ fontSize: 10, marginLeft: 2 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', top: pos.top, right: pos.right,
          width: 320, background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 8, zIndex: 9999,
          boxShadow: '0 16px 40px rgba(0,0,0,.6)',
          animation: 'row-enter .18s ease both',
        }}>
          {/* header dropdown */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', letterSpacing: '.06em', textTransform: 'uppercase' }}>Mis propuestas activas</span>
            <span style={{ fontSize: 10, color: 'var(--text-sec)' }}>SECOP II</span>
          </div>

          {/* lista */}
          {MIS_PROPUESTAS.map((p, i) => (
            <div key={i} style={{
              padding: '12px 16px',
              borderBottom: i < MIS_PROPUESTAS.length - 1 ? '1px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', transition: 'background 150ms',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--card-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 6px ${p.color}` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{p.entidad}</div>
                <div style={{ fontSize: 10, color: 'var(--text-sec)', fontFamily: 'monospace' }}>{p.id}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: p.color, letterSpacing: '.06em' }}>{p.estado}</div>
                <div style={{ fontSize: 9, color: 'var(--text-sec)', marginTop: 2 }}>Vence en {p.dias}d</div>
              </div>
            </div>
          ))}

          {/* footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <button style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: 12, fontWeight: 600, cursor: 'pointer', letterSpacing: '.04em' }}>
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
  const size = 52, r = 22
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - score / 100)
  const col = score >= 80 ? 'var(--orange)' : score >= 60 ? '#facc15' : 'var(--red)'
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
  const [txt, urgent] = useCountdown(iso)
  return (
    <span style={{ color: urgent ? 'var(--red)' : 'var(--orange)', fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
      {urgent && '⚠ '}{txt}
    </span>
  )
}

/* ─── Card de proceso — alto impacto ─────── */
function ProcesoCard({ p, onClick, active, clienteId }: { p: ProcesoData; onClick: () => void; active: boolean; clienteId?: number }) {
  const [hov, setHov] = useState(false)
  const diff = new Date(p.cierre).getTime() - Date.now()
  const urgent = diff < 86400000
  const s = p.score || 0
  const scoreCol = s >= 70 ? 'var(--orange)' : s >= 40 ? '#facc15' : 'var(--red)'
  const accentCol = urgent ? 'var(--red)' : active ? 'var(--orange)' : hov ? 'var(--orange)' : 'var(--border)'

  const matchBadges = [
    { label: 'Depto',  ok: p.matchDepto,                                          color: 'var(--green)' },
    { label: 'UNSPSC', ok: p.matchUNSPSC,                                         color: 'var(--green)' },
    { label: 'COP',    ok: p.matchPresupuesto,                                    color: 'var(--green)' },
    { label: 'Plazo',  ok: p.matchVigencia,                                       color: 'var(--green)' },
  ]

  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{
        background: active ? 'var(--card-hover)' : hov ? 'var(--card-hover)' : 'var(--card)',
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
        <div style={{ height: 2, background: 'linear-gradient(90deg, var(--red), transparent)' }} />
      )}

      <div style={{ padding: '18px 18px 0' }}>
        {/* Score grande + entidad */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0, marginRight: 12 }}>
            {urgent && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 3, background: 'rgba(239,68,68,.15)', border: '1px solid rgba(239,68,68,.3)', marginBottom: 7 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--red)' }} className="pulse-status" />
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--red)', letterSpacing: '.1em' }}>CIERRE URGENTE</span>
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)', lineHeight: 1.2, marginBottom: 3 }}>{p.entidad}</div>
            <div style={{ fontSize: 10, color: 'var(--text-sec)', letterSpacing: '.04em', fontFamily: 'monospace' }}>ID: {p.idProceso}</div>
            {p.referenciaProceso && (
              <div style={{ fontSize: 10, color: 'var(--text-sec)', letterSpacing: '.04em', marginTop: 2 }}>Ref: {p.referenciaProceso}</div>
            )}
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
                  border: `1px solid ${b.ok ? b.color : 'var(--border)'}`,
                  color: b.ok ? b.color : 'var(--text-sec)',
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
          background: 'var(--bg)',
          borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 3 }}>
            Valor del contrato
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-1px', lineHeight: 1 }}>
            {fmtCOP(p.presupuesto)}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-sec)', marginLeft: 6 }}>COP</span>
          </div>
        </div>

        {/* Descripción */}
        <p style={{
          fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.6, margin: '12px 0',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>{p.objeto}</p>

        {/* Estado / modalidad / publicación */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {p.estado && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: p.estado === 'Publicado' ? 'var(--green)' : 'var(--text-sec)', border: `1px solid ${p.estado === 'Publicado' ? 'var(--green)' : 'var(--border)'}`, padding: '2px 7px', borderRadius: 3 }}>
              {p.estado}
            </span>
          )}
          {p.modalidad && (
            <span style={{ fontSize: 9, color: 'var(--text-sec)', border: '1px solid var(--border)', padding: '2px 7px', borderRadius: 3 }}>
              {p.modalidad}
            </span>
          )}
          {p.fechaPublicacion && (
            <span style={{ fontSize: 9, color: 'var(--text-sec)' }}>
              Publicado {new Date(p.fechaPublicacion).toLocaleDateString('es-CO')}
            </span>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 18px', background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={'var(--text-sec)'} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span style={{ fontSize: 10, color: 'var(--text-sec)', letterSpacing: '.04em', textTransform: 'uppercase' }}>Cierre:</span>
          <CountdownCell iso={p.cierre} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href={construirUrlSecop(p)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title={esUrlSecopDirecta(p.urlSecop) ? 'Abrir proceso en SECOP II' : 'Buscar en SECOP II'}
            style={{
              fontSize: 10, fontWeight: 700,
              color: esUrlSecopDirecta(p.urlSecop) ? '#3b82f6' : 'var(--text-sec)',
              textDecoration: 'none', letterSpacing: '.03em',
            }}
          >
            {esUrlSecopDirecta(p.urlSecop) ? 'SECOP II ↗' : 'Buscar ↗'}
          </a>
          {active ? (
            <div style={{
              fontSize: 11, fontWeight: 600, color: 'var(--orange)',
              transition: 'color 180ms', letterSpacing: '.04em',
            }}>
              ● ACTIVO
            </div>
          ) : clienteId ? (
            <Link
              href={`/procesos/resumen?cliente_id=${clienteId}&proceso_id=${p.id}`}
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 11, fontWeight: 600, color: hov ? 'var(--orange-hover)' : 'var(--orange)',
                transition: 'color 180ms', letterSpacing: '.04em', textDecoration: 'none',
              }}
            >
              Ver análisis →
            </Link>
          ) : (
            <div style={{
              fontSize: 11, fontWeight: 600, color: hov ? 'var(--orange)' : 'var(--text-sec)',
              transition: 'color 180ms', letterSpacing: '.04em',
            }}>
              Ver análisis →
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── Panel Seguimiento de Propuesta ─────── */
function ProposalTracker({ proceso, cliente, contratos }: { proceso: ProcesoData | null; cliente: ClienteApi | null; contratos: ContratoApi[] }) {
  const [docStatuses, setDocStatuses] = useState<DocStatus[]>(DOCS_SECOP.map(d => d.status))
  const [tab, setTab] = useState<'docs' | 'aiu' | 'contratos' | 'etapas'>('docs')

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

  function docStatusColor(s: DocStatus) { return s === 'listo' ? 'var(--green)' : s === 'en_tramite' ? '#f59e0b' : 'var(--red)' }
  function docStatusLabel(s: DocStatus) { return s === 'listo' ? 'LISTO' : s === 'en_tramite' ? 'EN TRÁMITE' : 'PENDIENTE' }

  // ── Countdown real-time ──
  const fallbackDate = '2099-12-31T23:59:59.000Z'
  const [countdownTxt, countdownUrgent] = useCountdown(proceso?.cierre || fallbackDate)

  // ── Modalidad recomendada ──
  const [modalidad, setModalidad] = useState<{ modalidad: string; descripcion: string; smmlv: number } | null>(null)
  useEffect(() => {
    if (!proceso) return
    fetch(`${API}/modalidad/recomendada/${proceso.presupuesto}`)
      .then(r => r.json())
      .then(setModalidad)
  }, [proceso])

  if (!proceso) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 14 }}>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={'var(--text-sec)'} strokeWidth="1.3">
        <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
      <p style={{ color: 'var(--text-sec)', fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>
        Selecciona una oportunidad<br/>para ver el seguimiento
      </p>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 0 }}>

      {/* ── Encabezado + Countdown ── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 3 }}>
          Seguimiento de Propuesta
        </div>
        <div style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          ACTIVO: {proceso.idProceso}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-sec)', lineHeight: 1.4, marginBottom: 8 }}>
          {proceso.entidad}
        </div>

        {cliente && (
          <Link
            href={`/procesos/resumen?cliente_id=${cliente.id}&proceso_id=${proceso.id}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.3)',
              color: 'var(--orange)', fontSize: 11, fontWeight: 700,
              padding: '6px 12px', borderRadius: 4, textDecoration: 'none',
              marginBottom: 12, letterSpacing: '.03em',
            }}
          >
            Abrir análisis completo →
          </Link>
        )}

        {/* Countdown prominente */}
        <div style={{
          background: countdownUrgent ? 'rgba(239,68,68,.12)' : 'var(--bg)',
          border: `1px solid ${countdownUrgent ? 'rgba(239,68,68,.4)' : 'var(--border)'}`,
          borderRadius: 6, padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 20 }}>{countdownUrgent ? '⚠' : '⏱'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>
              Cierre del proceso
            </div>
            <div style={{
              fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: countdownUrgent ? 'var(--red)' : 'var(--orange)',
              letterSpacing: '-0.5px', lineHeight: 1.1,
            }}>
              {countdownTxt}
            </div>
          </div>
        </div>

        {/* Modalidad recomendada */}
        {modalidad && (
          <div style={{
            background: 'rgba(59,130,246,.08)',
            border: '1px solid rgba(59,130,246,.25)',
            borderRadius: 6,
            padding: '10px 14px',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>
              Modalidad recomendada
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', marginBottom: 3 }}>
              {modalidad.modalidad}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-sec)', lineHeight: 1.4 }}>
              {modalidad.descripcion}
            </div>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

      {/* ── Score de preparación ── */}
      <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Nivel de preparación</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: readiness >= 60 ? 'var(--orange)' : 'var(--red)' }}>{readiness}%</span>
        </div>
        <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{
            width: `${readiness}%`, height: '100%', borderRadius: 3,
            background: readiness >= 60
              ? 'linear-gradient(90deg, var(--orange), #fb923c)'
              : 'linear-gradient(90deg, var(--red), #f87171)',
            transition: 'width 600ms ease',
          }} />
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-sec)' }}>
          {listoCount} de {DOCS_SECOP.length} documentos listos
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 14 }}>
        {([['docs', 'Documentos'], ['aiu', 'Calculadora AIU'], ['contratos', 'Contratos Similares'], ['etapas', 'Etapas SECOP II']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: '7px 4px', borderRadius: 5, fontSize: 9, fontWeight: 600,
            border: `1px solid ${tab === key ? 'var(--orange)' : 'var(--border)'}`,
            background: tab === key ? 'rgba(249,115,22,.12)' : 'var(--bg)',
            color: tab === key ? 'var(--orange)' : 'var(--text-sec)',
            cursor: 'pointer', transition: 'all 160ms', letterSpacing: '.02em',
          }}>{label}</button>
        ))}
      </div>

      {/* ── DOCUMENTOS (3 estados) ── */}
      {tab === 'docs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
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
                  background: 'var(--bg)',
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
                  <div style={{ fontSize: 12, fontWeight: 500, color: s !== 'pendiente' ? 'var(--text)' : 'var(--text-sec)', marginBottom: 1 }}>
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
          <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 2 }}>
            Valor estimado de propuesta económica
          </div>

          {/* Costos directos */}
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Costos directos (materiales, mano de obra, equipos)
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--text-sec)', fontWeight: 600, fontSize: 13 }}>$</span>
              <input
                type="text"
                value={costosDirectos}
                onChange={e => setCostosDirectos(e.target.value.replace(/[^0-9.,]/g, ''))}
                placeholder="Ej: 3500000000"
                style={{
                  flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
                  padding: '8px 10px', color: 'var(--text)', fontSize: 13, outline: 'none',
                }}
              />
              <span style={{ color: 'var(--text-sec)', fontSize: 11 }}>COP</span>
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
                <div style={{ fontSize: 9, color: 'var(--text-sec)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  {label}
                </div>
                <input
                  type="number"
                  value={val}
                  onChange={e => setter(e.target.value)}
                  min="0" max="100"
                  style={{
                    width: '100%', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
                    padding: '7px 8px', color: 'var(--text)', fontSize: 13, outline: 'none', textAlign: 'center',
                  }}
                />
                <div style={{ fontSize: 8, color: 'var(--text-sec)', textAlign: 'center', marginTop: 2 }}>{hint}</div>
              </div>
            ))}
          </div>

          {/* Resultados — solo si hay costos directos */}
          {cd > 0 && (
            <div style={{
              background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-sec)' }}>Subtotal costos directos</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtMillones(cd)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-sec)' }}>Administración ({adminPct}%)</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtMillones(adminVal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-sec)' }}>Imprevistos ({imprevPct}%)</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtMillones(imprevVal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--text-sec)' }}>Utilidad ({utilPct}%)</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtMillones(utilVal)}</span>
              </div>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 10, color: 'var(--orange)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  Valor AIU
                </span>
                <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{fmtMillones(aiuTotal)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                background: 'rgba(249,115,22,.08)', borderRadius: 4, padding: '8px 10px',
                margin: '4px -6px -4px',
              }}>
                <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                  TOTAL PROPUESTA
                </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange)', letterSpacing: '-0.5px', lineHeight: 1 }}>
                  {fmtMillones(propuestaTotal)}
                </span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 11, marginTop: 4,
              }}>
                <span style={{ color: 'var(--text-sec)' }}>vs. presupuesto oficial ({fmtMillones(presupuestoOficial)})</span>
                <span style={{
                  fontWeight: 700, fontSize: 13,
                  color: pctSobrePresupuesto <= 95 ? 'var(--green)' : pctSobrePresupuesto > 100 ? 'var(--red)' : '#f59e0b',
                }}>
                  {pctSobrePresupuesto.toFixed(1)}%
                </span>
              </div>
              <div style={{
                height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 2,
              }}>
                <div style={{
                  width: `${Math.min(pctSobrePresupuesto, 120)}%`, height: '100%', borderRadius: 2,
                  background: pctSobrePresupuesto <= 95 ? 'var(--green)' : pctSobrePresupuesto > 100 ? 'var(--red)' : '#f59e0b',
                  transition: 'width 300ms ease',
                }} />
              </div>
              <div style={{ fontSize: 9, color: pctSobrePresupuesto <= 95 ? 'var(--green)' : pctSobrePresupuesto > 100 ? 'var(--red)' : '#f59e0b', fontWeight: 600, textAlign: 'center' }}>
                {pctSobrePresupuesto <= 95 ? '✓ Dentro del rango óptimo' : pctSobrePresupuesto > 100 ? '⚠ Excede el presupuesto oficial' : '⚡ Cercano al límite'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── CONTRATOS SIMILARES ── */}
      {tab === 'contratos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 2 }}>
            Histórico de adjudicaciones — {cliente ? labelUNSPSC(parseCliente(cliente).unspsc_codes[0] || '') : ''} / {cliente ? labelUNSPSC(parseCliente(cliente).unspsc_codes[1] || '') : ''}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-sec)', marginBottom: 8 }}>
            Contratos recientes en los mismos códigos UNSPSC y departamentos del cliente. Fuente: SECOP II — datos abiertos.
          </div>

          {contratos.map((c, i) => (
            <div key={i} style={{
              padding: '10px 12px', background: 'var(--bg)',
              border: '1px solid var(--border)', borderRadius: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>
                  {(c.proveedor_adjudicado || 'Sin nombre').length > 28 ? (c.proveedor_adjudicado || '').slice(0, 26) + '…' : (c.proveedor_adjudicado || 'Sin nombre')}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--orange)', flexShrink: 0, marginLeft: 8 }}>
                  {fmtCOP(Number(c.valor_del_contrato) || 0)}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-sec)', marginBottom: 2 }}>{c.nombre_entidad} — {c.fecha_de_firma ? c.fecha_de_firma.slice(0, 10) : '—'}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, background: 'rgba(245,158,11,.15)', color: '#f59e0b', fontWeight: 600 }}>
                  {c.modalidad_de_contratacion || '—'}
                </span>
              </div>
            </div>
          ))}

          <div style={{
            marginTop: 6, padding: '10px 12px',
            background: 'rgba(59,130,246,.06)', border: '1px solid rgba(59,130,246,.2)', borderRadius: 6,
          }}>
            <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>
              Inteligencia de mercado
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-sec)', lineHeight: 1.5 }}>
              Ticket promedio: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{fmtCOP(Math.round(contratos.reduce((a, c) => a + (Number(c.valor_del_contrato) || 0), 0) / (contratos.length || 1)))}</span><br />
              Competidores activos: <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{new Set(contratos.map(c => c.proveedor_adjudicado)).size}</span> en {cliente ? parseCliente(cliente).departamentos.length : 0} deptos.
            </div>
          </div>
        </div>
      )}

      {/* ── ETAPAS SECOP II ── */}
      {tab === 'etapas' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 12 }}>
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
                    background: e.done ? 'var(--orange)' : 'var(--border)',
                    zIndex: 0,
                  }} />
                )}
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, zIndex: 1, marginTop: 1,
                  background: e.done ? 'var(--orange)' : isCurrent ? 'rgba(249,115,22,.15)' : 'var(--bg)',
                  border: `2px solid ${e.done ? 'var(--orange)' : isCurrent ? 'var(--orange)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {e.done && (
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  {isCurrent && !e.done && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--orange)' }} />
                  )}
                </div>
                <div style={{ paddingBottom: isLast ? 0 : 18, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: isCurrent ? 600 : 400, color: e.done ? 'var(--text-sec)' : isCurrent ? 'var(--text)' : 'var(--text-sec)', lineHeight: 1.3 }}>
                    {e.label}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 2, color: (e as any).urgente ? 'var(--red)' : e.done ? 'var(--green)' : 'var(--text-sec)' }}>
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

/* ─── PÁGINA (Dashboard) ────────────────── */
export default function Dashboard() {
  const clock = useClock()
  const [filtro, setFiltro] = useState('Todos')
  const [filtroDepto, setFiltroDepto] = useState('Todos')
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const [busq, setBusq] = useState('')
  const [activeId, setActiveId] = useState<number | null>(1)

  const [panelOpen, setPanelOpen] = useState(true)
  const [cliente, setCliente] = useState<ClienteApi | null>(null)
  const [procesos, setProcesos] = useState<ProcesoData[]>([])
  const [contratos, setContratos] = useState<ContratoApi[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/clientes`)
      .then(r => r.json())
      .then((clientes: ClienteApi[]) => {
        if (clientes.length === 0) {
          setLoading(false)
          return
        }
        const c = clientes[0]
        setCliente(c)
        const parsed = parseCliente(c)
        return Promise.all([
          fetch(`${API}/clientes/${c.id}/procesos`).then(r => r.json()),
          fetch(`${API}/clientes/${c.id}/contratos-similares`).then(r => r.json()),
        ]).then(([procesosApi, contratosApi]) => {
          const mapped = (procesosApi as ProcesoApi[]).map(p => mapearProceso(p, parsed))
          setProcesos(mapped.sort((a, b) => (b.score || 0) - (a.score || 0)))
          setContratos(contratosApi as ContratoApi[])
          setLoading(false)
        })
      })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [])

  const cTotal = useCounter(procesos.length)
  const presupuestoTotal = procesos.reduce((a, p) => a + p.presupuesto, 0)
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
  const tiposUnicos = ['Todos', ...Array.from(new Set(procesos.map(p => p.tipo)))]
  const filtros = ['Todos', 'Alta compat.', 'Media compat.', 'Cierre urgente']

  const procesados = procesos.filter(p => {
    if (filtro === 'Alta compat.' && (p.score || 0) < 70) return false
    if (filtro === 'Media compat.' && ((p.score || 0) < 40 || (p.score || 0) >= 70)) return false
    if (filtro === 'Cierre urgente' && new Date(p.cierre).getTime() - Date.now() >= 86400000) return false
    if (filtroDepto !== 'Todos' && p.departamento !== filtroDepto) return false
    if (filtroTipo !== 'Todos' && p.tipo !== filtroTipo) return false
    if (busq && !p.entidad.toLowerCase().includes(busq.toLowerCase()) && !p.objeto.toLowerCase().includes(busq.toLowerCase())) return false
    return true
  })

  const activeProceso = procesos.find(p => p.id === activeId) ?? null
  const urgentes = procesos.filter(p => new Date(p.cierre).getTime() - Date.now() < 86400000).length

  const altaCompat = procesos.filter(p => (p.score || 0) >= 70).length

  const METRICAS = [
    {
      label: 'OPORTUNIDADES HOY', val: `${cTotal}`, detail: 'Procesos encontrados',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={'var(--orange)'} strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6M8 11h6"/></svg>,
      urgent: false,
    },
    {
      label: 'PRESUPUESTO AGREGADO (COP)', val: `$${cBudget}B`, detail: 'Suma de procesos',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={'var(--orange)'} strokeWidth="1.8" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
      urgent: false,
    },
    {
      label: 'CIERRES URGENTES', val: `${urgentes}`, detail: 'Cierre en menos de 24h',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={'var(--orange)'} strokeWidth="1.8" strokeLinecap="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
      urgent: true,
    },
    {
      label: 'ALTA COMPATIBILIDAD', val: `${altaCompat}`, detail: 'Score ≥ 70%, listos para proponer',
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={'var(--orange)'} strokeWidth="1.8" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
      urgent: false,
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'Inter, sans-serif', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* ── HEADER ── */}
      <header style={{
        background: 'var(--header)', borderBottom: '1px solid var(--border)', height: 56,
        display: 'flex', alignItems: 'center', padding: '0 28px',
        position: 'sticky', top: 0, zIndex: 40,
        boxShadow: '0 2px 20px rgba(0,0,0,.5)', overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32 }}>
          <span className="pulse-status" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--orange)', flexShrink: 0 }} />
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '3px', color: 'var(--text)', textTransform: 'uppercase' }}>SECOP RADAR</span>
        </div>
        {/* Nav izquierda + Mis Propuestas juntos */}
        <nav style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {([
            { label: 'Dashboard', href: '/dashboard', active: true },
            { label: 'Clientes', href: '/clientes/nuevo', active: false },
            { label: 'Calculadoras', href: '/calculadoras', active: false },
            { label: 'Historial', href: '#', active: false },
            { label: 'Configuración', href: '#', active: false },
          ] as const).map((n) => (
            <Link key={n.label} href={n.href} style={{
              textDecoration: 'none',
              background: n.active ? 'rgba(249,115,22,.12)' : 'none',
              border: n.active ? `1px solid rgba(249,115,22,.25)` : '1px solid transparent',
              color: n.active ? 'var(--orange)' : 'var(--text-sec)', padding: '5px 14px', borderRadius: 5,
              fontSize: 13, cursor: 'pointer', fontWeight: n.active ? 600 : 400,
              transition: 'all 150ms',
            }}
              onMouseEnter={e => { if (!n.active) e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { if (!n.active) e.currentTarget.style.color = 'var(--text-sec)' }}
            >{n.label}</Link>
          ))}
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 8px' }} />
          <MisPropuestasDropdown />
        </nav>
        {/* Derecha */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12, color: 'var(--text-sec)' }}>{clock}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)' }} className="pulse-status" />
            <span style={{ fontSize: 12, color: 'var(--orange)', fontWeight: 600, letterSpacing: '.06em' }}>LIVE SYNC ACTIVE</span>
          </div>
          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
          <ThemeToggle />
        </div>
      </header>

      {/* ── BODY ── */}
      <div style={{ height: 'calc(100vh - 56px)', display: 'flex', position: 'relative', zIndex: 1, overflow: 'hidden' }}>

        {/* ── COLUMNA IZQUIERDA — ocupa lo que deja el panel ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 28px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ─ Hero: Título + Métricas con radar de fondo ─ */}
          <div style={{
            position: 'relative', borderRadius: 10,
            background: 'var(--hero-bg)',
            border: '1px solid var(--border)',
            padding: '28px 28px 24px',
            clipPath: 'inset(0 round 10px)',
          }}>
            <Particles />
            {/* Título */}
            <div style={{ position: 'relative', zIndex: 1, marginBottom: 14 }}>
              <h1 style={{ fontSize: 34, fontWeight: 700, color: 'var(--text)', lineHeight: 1, marginBottom: 6 }}>Control de Licitaciones</h1>
              <p style={{ fontSize: 13, color: 'var(--text-sec)' }}>Monitoreo automatizado de contratación pública en SECOP II — Colombia.</p>
            </div>

            {/* ─ Cliente activo ─ */}
            <div style={{ position: 'relative', zIndex: 1, marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {cliente ? (
                  <ClientProfilePanel clienteId={cliente.id} compact />
                ) : (
                  <div style={{ background: 'var(--card)aa', backdropFilter: 'blur(6px)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>Cargando cliente...</div>
                  </div>
                )}
              </div>
              <div style={{
                width: 120, flexShrink: 0, textAlign: 'right',
                background: 'var(--card)aa', backdropFilter: 'blur(6px)',
                border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px',
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Perfil activo</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--orange)', margin: '4px 0' }}>{procesos.filter(p => (p.score || 0) >= 70).length}</div>
                <div style={{ fontSize: 10, color: 'var(--text-sec)' }}>matches</div>
              </div>
            </div>

            {/* ─ Métricas ─ */}
            <div style={{ position: 'relative', zIndex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {METRICAS.map((m, i) => (
                <div key={i} style={{
                  background: 'var(--card)cc', backdropFilter: 'blur(6px)',
                  borderTop: `1px solid ${m.urgent ? 'var(--orange)' : 'var(--border)'}`,
                  borderRight: `1px solid ${m.urgent ? 'var(--orange)' : 'var(--border)'}`,
                  borderBottom: `1px solid ${m.urgent ? 'var(--orange)' : 'var(--border)'}`,
                  borderLeft: `1px solid ${m.urgent ? 'var(--orange)' : 'var(--border)'}`,
                  borderRadius: 8, padding: '18px 18px 16px',
                  boxShadow: m.urgent ? `0 0 16px rgba(249,115,22,.2)` : 'none',
                }}>
                  <div style={{ marginBottom: 12 }}>{m.icon}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-sec)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>{m.label}</div>
                  <div style={{ fontSize: 40, fontWeight: 700, color: 'var(--text)', lineHeight: 1, letterSpacing: '-1.5px', marginBottom: 8 }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: m.urgent ? 'var(--red)' : 'var(--orange)' }}>{m.detail}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ─ Filtros ─ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Row 1: Departamento + Tipo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Oportunidades activas</div>
                <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>{procesados.length} procesos compatibles</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={filtroDepto} onChange={e => setFiltroDepto(e.target.value)} style={{
                  background: 'var(--card)', border: `1px solid ${filtroDepto !== 'Todos' ? 'var(--orange)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '7px 12px', color: filtroDepto !== 'Todos' ? 'var(--orange)' : 'var(--text-sec)',
                  fontSize: 12, outline: 'none', cursor: 'pointer', fontWeight: 500, maxWidth: 180,
                }}>
                  {deptosUnicos.map(d => <option key={d} value={d}>{d === 'Todos' ? '🏛 Todos los deptos.' : d}</option>)}
                </select>
                {tiposUnicos.map(t => (
                  <button key={t} onClick={() => setFiltroTipo(t)} style={{
                    padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    background: filtroTipo === t ? 'var(--orange)' : 'transparent',
                    border: `1px solid ${filtroTipo === t ? 'var(--orange)' : 'var(--border)'}`,
                    color: filtroTipo === t ? '#fff' : 'var(--text-sec)',
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
                  background: filtro === f ? 'var(--orange)' : 'transparent',
                  border: `1px solid ${filtro === f ? 'var(--orange)' : 'var(--border)'}`,
                  color: filtro === f ? '#fff' : 'var(--text-sec)',
                  transition: 'all 160ms',
                }}>{f}</button>
              ))}
              <input value={busq} onChange={e => setBusq(e.target.value)} placeholder="Buscar entidad u objeto..."
                style={{
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '6px 14px', color: 'var(--text)', fontSize: 13, outline: 'none', width: 200, marginLeft: 'auto',
                }} />
            </div>
          </div>

          {/* ─ Estado de carga / error ─ */}
          {loading && (
            <div style={{ color: 'var(--text-sec)', padding: 48, textAlign: 'center' }}>Cargando oportunidades reales de SECOP II...</div>
          )}
          {error && !loading && (
            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid var(--red)', color: 'var(--red)', padding: 16, borderRadius: 6, fontSize: 13 }}>
              Error: {error}
            </div>
          )}

          {/* ─ Grid de cards ─ */}
          {!loading && !error && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {procesados.map((p, i) => (
                <div key={p.id} className="row-enter" style={{ animationDelay: `${i * 60}ms` }}>
                  <ProcesoCard p={p} active={activeId === p.id} clienteId={cliente?.id} onClick={() => setActiveId(p.id === activeId ? null : p.id)} />
                </div>
              ))}
            </div>
          )}
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
              background: 'var(--card)', border: '1px solid var(--border)',
              color: 'var(--text-sec)', fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'background 160ms, color 160ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--orange)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--card)'; e.currentTarget.style.color = 'var(--text-sec)' }}
          >
            {panelOpen ? '›' : '‹'}
          </button>
        </div>

        {/* ── COLUMNA DERECHA — colapsable ── */}
        <div style={{
          width: panelOpen ? 380 : 40,
          minWidth: panelOpen ? 380 : 40,
          borderLeft: '1px solid var(--border)',
          background: 'var(--card)', overflowY: panelOpen ? 'auto' : 'hidden',
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
              color: 'var(--text-sec)', letterSpacing: '.12em', textTransform: 'uppercase',
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
            <ProposalTracker proceso={activeProceso} cliente={cliente} contratos={contratos} />
          </div>
        </div>
      </div>
    </div>
  )
}
