'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ColombiaMap from '@/components/ColombiaMap'

const C = {
  bg: '#0f1117',
  card: '#1a1d27',
  surface: '#1a1d27',
  border: '#2a2d3a',
  text: '#f1f5f9',
  textSec: '#64748b',
  orange: '#f97316',
  orangeH: '#ea580c',
  blue: '#3b82f6',
  green: '#22c55e',
  red: '#ef4444',
  yellow: '#f59e0b',
  header: '#0a0d14',
}

function useCountUp(target: number, duration = 1600, delay = 0) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    let raf: number
    const startTimeout = setTimeout(() => {
      let start: number | null = null
      const step = (timestamp: number) => {
        if (!start) start = timestamp
        const progress = Math.min((timestamp - start) / duration, 1)
        const eased = 1 - Math.pow(1 - progress, 3)
        setValue(eased * target)
        if (progress < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => { clearTimeout(startTimeout); cancelAnimationFrame(raf) }
  }, [target, duration, delay])
  return value
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [email, setEmail] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    const onResize = () => setIsMobile(window.innerWidth <= 900)
    window.addEventListener('scroll', onScroll)
    window.addEventListener('resize', onResize)
    onResize()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const navLinks = [
    { label: 'Radar', href: '#radar' },
    { label: 'Pre-selección', href: '#analytics' },
    { label: 'Pliegos', href: '#procurement' },
    { label: 'Calculadoras', href: '#calculadoras' },
    { label: 'Comenzar', href: '/clientes/nuevo' },
  ]

  const countProcesos = useCountUp(186, 1600, 300)
  const countScore = useCountUp(56.7, 1600, 500)
  const countHours = useCountUp(4, 1200, 700)
  const countProgress = useCountUp(78, 1600, 300)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      {/* ── NAVBAR ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
        background: scrolled ? 'rgba(10,13,20,.95)' : 'rgba(10,13,20,.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${C.border}`,
        height: 64,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 28px',
        transition: 'background 200ms ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: C.orange,
            boxShadow: '0 0 0 0 rgba(249,115,22,.7)',
            animation: 'pulse-status 2.2s ease-in-out infinite',
          }} />
          <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '2px', textTransform: 'uppercase' }}>
            SECOP <span style={{ color: C.orange }}>RADAR</span>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          {!isMobile && (
            <div style={{ display: 'flex', gap: 24 }}>
              {navLinks.map(l => (
                <a key={l.label} href={l.href} style={{
                  color: C.textSec, fontSize: 12, fontWeight: 500, letterSpacing: '.04em',
                  textDecoration: 'none', transition: 'color 150ms',
                }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.textSec)}>
                  {l.label}
                </a>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <a href="#" style={{ color: C.textSec }} aria-label="Configuración">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </a>
            <a href="#" style={{ color: C.textSec }} aria-label="Notificaciones">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </a>
            <Link href="/clientes/nuevo" style={{
              background: C.orange, color: '#fff', fontSize: 12, fontWeight: 700,
              padding: '8px 16px', borderRadius: 4, textDecoration: 'none', letterSpacing: '.04em',
              transition: 'background 150ms',
            }} onMouseEnter={e => (e.currentTarget.style.background = C.orangeH)} onMouseLeave={e => (e.currentTarget.style.background = C.orange)}>
              Comenzar
            </Link>
          </div>

          {isMobile && (
            <button onClick={() => setMobileMenuOpen(o => !o)} style={{
              background: 'none', border: 'none', color: C.text,
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          )}
        </div>
      </nav>

      {mobileMenuOpen && (
        <div style={{
          position: 'fixed', top: 64, left: 0, right: 0, zIndex: 999,
          background: C.header, borderBottom: `1px solid ${C.border}`, padding: 16,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {navLinks.map(l => (
            <a key={l.label} href={l.href} style={{ color: C.text, fontSize: 14 }} onClick={() => setMobileMenuOpen(false)}>{l.label}</a>
          ))}
          <Link href="/clientes/nuevo" style={{ color: C.orange, fontWeight: 700 }}>Comenzar</Link>
        </div>
      )}

      {/* ── HERO ── */}
      <section style={{
        position: 'relative', minHeight: '100vh', paddingTop: 64,
        display: 'flex', alignItems: 'center', overflow: 'hidden',
      }}>
        {/* Background image with overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            linear-gradient(90deg, ${C.bg} 0%, rgba(15,17,23,.92) 45%, rgba(15,17,23,.65) 100%),
            url('/images/hero-bg.jpg')
          `,
          backgroundSize: 'cover', backgroundPosition: 'center',
        }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(circle at 70% 40%, rgba(249,115,22,.12), transparent 50%)',
        }} />

        <div style={{ position: 'relative', zIndex: 2, width: '100%', maxWidth: 1200, margin: '0 auto', padding: '80px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 48, alignItems: 'center' }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                border: `1px solid ${C.border}`, borderRadius: 4,
                background: 'rgba(10,13,20,.7)', padding: '6px 12px', marginBottom: 24,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
                <span style={{ fontSize: 10, color: C.textSec, letterSpacing: '.12em', textTransform: 'uppercase' }}>Radar de licitaciones SECOP II</span>
              </div>

              <h1 style={{
                fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-1px', marginBottom: 20,
              }}>
                NO PIERDAS NINGÚN<br />
                <span style={{ color: C.orange }}>PROCESO COMPATIBLE</span>
              </h1>

              <p style={{ color: C.textSec, fontSize: 16, lineHeight: 1.7, maxWidth: 520, marginBottom: 32 }}>
                SECOP RADAR monitorea SECOP II automáticamente, filtra licitaciones por el perfil de tu empresa
                y te alerta solo cuando aparecen procesos nuevos y compatibles con tu capacidad.
              </p>

              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <Link href="/clientes/nuevo" style={{
                  background: C.orange, color: '#fff', fontSize: 13, fontWeight: 700,
                  padding: '12px 24px', borderRadius: 4, textDecoration: 'none', letterSpacing: '.04em',
                  transition: 'background 150ms',
                }} onMouseEnter={e => (e.currentTarget.style.background = C.orangeH)} onMouseLeave={e => (e.currentTarget.style.background = C.orange)}>
                  COMENZAR AHORA
                </Link>
                <a href="#radar" style={{
                  background: 'transparent', color: C.text, fontSize: 13, fontWeight: 700,
                  padding: '12px 24px', borderRadius: 4, textDecoration: 'none', letterSpacing: '.04em',
                  border: `1px solid ${C.border}`, transition: 'all 150ms',
                }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.orange; e.currentTarget.style.color = C.orange }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}>
                  CÓMO FUNCIONA
                </a>
              </div>
            </div>

            {/* Premium live data card */}
            <div style={{
              background: 'rgba(26,29,39,0.65)', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 24, backdropFilter: 'blur(14px) saturate(140%)', boxShadow: '0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}>
              {/* header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 16 }}>
                <span style={{ fontSize: 10, color: C.textSec, letterSpacing: '.12em' }}>RADAR: CLIENTE_001</span>
                <span style={{ fontSize: 10, color: C.green, fontWeight: 700, letterSpacing: '.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: C.green,
                    boxShadow: '0 0 0 0 rgba(34,197,94,0.7)', animation: 'pulse-status 2.2s ease-in-out infinite',
                  }} />
                  ACTIVO
                </span>
              </div>

              {/* central metric */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: C.textSec, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>Procesos compatibles detectados</div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-1.5px' }}>{Math.round(countProcesos)}</span>
                  <span style={{ fontSize: 12, color: C.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg>
                    +12% este mes
                  </span>
                </div>
              </div>

              {/* sparkline */}
              <svg width="100%" height="90" viewBox="0 0 320 90" fill="none" style={{ overflow: 'visible', display: 'block', marginBottom: 18 }}>
                <defs>
                  <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff7a20" stopOpacity="0.5"/>
                    <stop offset="60%" stopColor="#ff7a20" stopOpacity="0.1"/>
                    <stop offset="100%" stopColor="#ff7a20" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path
                  d="M4 70 C 40 70, 60 55, 90 48 C 120 41, 150 35, 180 28 C 210 21, 240 18, 270 12 C 290 9, 305 6, 316 4 L 316 90 L 4 90 Z"
                  fill="url(#sparkGrad)"
                  className="spark-area"
                />
                <path
                  d="M4 70 C 40 70, 60 55, 90 48 C 120 41, 150 35, 180 28 C 210 21, 240 18, 270 12 C 290 9, 305 6, 316 4"
                  stroke="#ff7a20"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  className="spark-line"
                />
                <circle cx="316" cy="4" r="5" fill="#fff" stroke="#ff7a20" strokeWidth="2.5" className="spark-dot" />
              </svg>

              {/* secondary metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div style={{ background: 'rgba(10,13,20,0.5)', border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
                  <div style={{ fontSize: 10, color: C.textSec, letterSpacing: '.08em', marginBottom: 6 }}>SCORE PROMEDIO</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{countScore.toFixed(1)}</div>
                    <div style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>+2.4%</div>
                  </div>
                </div>
                <div style={{ background: 'rgba(10,13,20,0.5)', border: `1px solid ${C.border}`, borderRadius: 6, padding: 14 }}>
                  <div style={{ fontSize: 10, color: C.textSec, letterSpacing: '.08em', marginBottom: 6 }}>ACTUALIZACIÓN</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>{Math.round(countHours)}h</div>
                    <div style={{ fontSize: 9, color: C.green, fontWeight: 700, letterSpacing: '.04em', border: `1px solid ${C.green}`, borderRadius: 4, padding: '2px 6px' }}>REAL-TIME</div>
                  </div>
                </div>
              </div>

              {/* alert banner */}
              <div style={{ background: 'rgba(10,13,20,0.55)', border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', background: C.yellow,
                  boxShadow: '0 0 0 0 rgba(245,158,11,0.7)', animation: 'pulse-status 2.2s ease-in-out infinite',
                }} />
                <div>
                  <div style={{ fontSize: 9, color: C.textSec, letterSpacing: '.08em', marginBottom: 2 }}>ÚLTIMA ALERTA</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Nueva licitación de obra civil en Bogotá detectada</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ANÁLISIS TÉCNICO Y ESTRUCTURAL ── */}
      <section id="radar" style={{ padding: '100px 24px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ width: 3, height: 28, background: C.orange }} />
            <h2 style={{ fontSize: 14, color: C.textSec, letterSpacing: '.16em', textTransform: 'uppercase', fontWeight: 700 }}>
              Filtros por perfil de tu empresa
            </h2>
          </div>
          <p style={{ color: C.textSec, fontSize: 14, marginBottom: 48, marginLeft: 15 }}>
            El radar busca procesos de SECOP II que coincidan con donde trabajas, en qué especializas y cuánto puedes ejecutar.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
            {/* Left: visual */}
            <div style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: 32, position: 'relative', overflow: 'hidden', minHeight: 360,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(circle at 30% 30%, rgba(249,115,22,.15), transparent 60%)',
              }} />
              <svg width="280" height="220" viewBox="0 0 280 220" style={{ position: 'relative', zIndex: 2 }}>
                <defs>
                  <radialGradient id="radarSweep" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor={C.orange} stopOpacity=".7"/>
                    <stop offset="100%" stopColor={C.orange} stopOpacity=".05"/>
                  </radialGradient>
                </defs>
                {/* Radar rings */}
                <circle cx="140" cy="110" r="90" fill="none" stroke={C.orange} strokeWidth="1" strokeOpacity=".25"/>
                <circle cx="140" cy="110" r="65" fill="none" stroke={C.orange} strokeWidth="1" strokeOpacity=".25"/>
                <circle cx="140" cy="110" r="40" fill="none" stroke={C.orange} strokeWidth="1" strokeOpacity=".25"/>
                {/* Crosshairs */}
                <line x1="140" y1="20" x2="140" y2="200" stroke={C.orange} strokeWidth="1" strokeOpacity=".25"/>
                <line x1="50" y1="110" x2="230" y2="110" stroke={C.orange} strokeWidth="1" strokeOpacity=".25"/>
                {/* Sweep sector with rotation */}
                <g className="radar-sweep">
                  <path d="M140 110 L140 20 A90 90 0 0 1 215 65 Z" fill="url(#radarSweep)" stroke={C.orange} strokeWidth="1" strokeOpacity=".5"/>
                  <line x1="140" y1="110" x2="215" y2="65" stroke={C.orange} strokeWidth="2" strokeOpacity=".8"/>
                </g>
                {/* Blips with pulse */}
                <circle cx="170" cy="70" r="4" fill={C.orange} className="radar-blip" style={{ animationDelay: '0s' }}/>
                <circle cx="110" cy="95" r="3" fill={C.blue} className="radar-blip" style={{ animationDelay: '.4s' }}/>
                <circle cx="185" cy="130" r="3" fill={C.green} className="radar-blip" style={{ animationDelay: '.8s' }}/>
                <circle cx="140" cy="155" r="2" fill={C.textSec} className="radar-blip" style={{ animationDelay: '1.2s' }}/>
              </svg>
            </div>

            {/* Right: cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.green, marginBottom: 10 }}>Filtros Inteligentes</h3>
                <p style={{ color: C.textSec, fontSize: 13, lineHeight: 1.6 }}>
                  Configura departamentos donde operas, códigos UNSPSC de tu especialidad (infraestructura, edificación, mantenimiento, consultoría) y rango presupuestal. El radar hace el resto.
                </p>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Score de Compatibilidad</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.orange }}>25%</div>
                    <div style={{ fontSize: 10, color: C.textSec, letterSpacing: '.08em' }}>DEPARTAMENTO</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>25%</div>
                    <div style={{ fontSize: 10, color: C.textSec, letterSpacing: '.08em' }}>UNSPSC</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: C.blue }}>50%</div>
                    <div style={{ fontSize: 10, color: C.textSec, letterSpacing: '.08em' }}>PRESUPUESTO + PLAZO</div>
                  </div>
                </div>
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Alertas Automáticas</h3>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textSec, marginBottom: 6 }}>
                    <span>FRECUENCIA DEL RADAR</span><span>CADA 4H</span>
                  </div>
                  <div style={{ height: 5, background: C.border, borderRadius: 3 }}>
                    <div style={{ width: '75%', height: '100%', background: C.green, borderRadius: 3 }} />
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.textSec, marginBottom: 6 }}>
                    <span>SOLO PROCESOS NUEVOS</span><span>100%</span>
                  </div>
                  <div style={{ height: 5, background: C.border, borderRadius: 3 }}>
                    <div style={{ width: '100%', height: '100%', background: C.orange, borderRadius: 3 }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DASHBOARD PREVIEW ── */}
      <section id="procurement" style={{ padding: '100px 24px', background: C.header }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: 800, marginBottom: 12 }}>Todo el ciclo en un solo panel</h2>
            <p style={{ color: C.textSec, fontSize: 15 }}>Desde detectar el proceso hasta preparar la propuesta: pre-selección, análisis de pliego, calculadoras y documentos.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {/* Recent awards */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em' }}>Procesos Compatibles</h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              </div>
              {[
                { id: 'CO1.REQ.10494100', name: 'Mantenimiento vial INVIAS', entity: 'Distrito Capital', value: '75%' },
                { id: 'CO1.REQ.10393586', name: 'Mejoramiento vías ICCU', entity: 'Cundinamarca', value: '50%' },
                { id: 'CO1.REQ.10512956', name: 'Vías urbanas San Bernardo', entity: 'Cundinamarca', value: '50%' },
              ].map((c, i) => (
                <div key={i} style={{ borderBottom: i < 2 ? `1px solid ${C.border}` : 'none', padding: '14px 0' }}>
                  <div style={{ fontSize: 10, color: C.textSec, marginBottom: 4 }}>{c.id}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{c.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: C.textSec }}>{c.entity}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>{c.value}</span>
                  </div>
                </div>
              ))}
              <Link href="/clientes/nuevo" style={{
                display: 'block', width: '100%', marginTop: 16, padding: '10px', background: 'transparent', border: `1px solid ${C.border}`,
                color: C.text, fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: 'pointer', textAlign: 'center', textDecoration: 'none',
              }}>CONFIGURAR PERFIL</Link>
            </div>

            {/* Benchmarking */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em' }}>Contratos Similares</h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: 160, gap: 12 }}>
                {[
                  { label: 'VIAL', h: '55%' },
                  { label: 'EDIFICACIÓN', h: '38%' },
                  { label: 'ACUEDUCTO', h: '72%' },
                  { label: 'CONSULTORÍA', h: '45%' },
                ].map((b, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{ width: '100%', height: 120, background: C.bg, borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0, height: b.h,
                        background: i === 2 ? C.orange : C.border, borderRadius: '4px 4px 0 0',
                      }} />
                    </div>
                    <span style={{ fontSize: 10, color: C.textSec }}>{b.label}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, padding: 12, background: C.bg, borderRadius: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.green }} />
                  <span style={{ fontSize: 11, color: C.text }}>Inteligencia de mercado activa</span>
                </div>
                <p style={{ fontSize: 10, color: C.textSec, lineHeight: 1.5 }}>Consulta contratos históricos adjudicados por UNSPSC y departamento para definir tu estrategia de precios.</p>
              </div>
            </div>

            {/* Geo intelligence */}
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.08em' }}>Cobertura por Departamento</h3>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="2"><polygon points="1 6 22 3 13 21 11 13 1 6"/></svg>
              </div>
              <div style={{
                height: 280, background: C.bg, borderRadius: 6, position: 'relative', overflow: 'hidden',
                backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(42,45,58,.8) 0%, transparent 40%), radial-gradient(circle at 70% 60%, rgba(42,45,58,.6) 0%, transparent 35%)',
              }}>
                <ColombiaMap />
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 10, color: C.textSec, marginBottom: 2 }}>TODOS LOS DEPARTAMENTOS</div>
                  <div style={{ fontSize: 10, color: C.textSec }}>32 DPTOS + BOGOTÁ D.C.</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.textSec }}>Cundinamarca, Antioquia, Valle...</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MÓDULOS ── */}
      <section id="modulos" style={{ padding: '100px 24px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: 800, marginBottom: 12 }}>Todas las vistas del radar</h2>
            <p style={{ color: C.textSec, fontSize: 15 }}>Navega entre los módulos para detectar, analizar y postularte a licitaciones.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {[
              { label: 'Dashboard', desc: 'Panel de control y seguimiento', href: '/dashboard', icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
              { label: 'Procesos', desc: 'Lista de procesos compatibles', href: '/procesos/CO1.REQ.10494100', icon: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0' },
              { label: 'Pre-selección', desc: 'Checklist y comparación de docs', href: '/preseleccion', icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
              { label: 'Pliegos', desc: 'Análisis de requisitos', href: '/pliego', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8' },
              { label: 'Calculadoras', desc: 'AIU y herramientas de precio', href: '/calculadoras', icon: 'M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M8 6h8 M8 10h8 M8 14h5 M8 18h3' },
              { label: 'Nuevo cliente', desc: 'Configurar perfil de empresa', href: '/clientes/nuevo', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M16 7h6 M19 4v6' },
            ].map((m, i) => (
              <Link key={i} href={m.href} style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: 24,
                textDecoration: 'none', color: C.text, transition: 'all 160ms',
                display: 'flex', flexDirection: 'column', gap: 12,
              }} onMouseEnter={e => { e.currentTarget.style.borderColor = C.orange; e.currentTarget.style.transform = 'translateY(-3px)' }} onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'none' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={m.icon} />
                </svg>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{m.label}</div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{m.desc}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ padding: '100px 24px', textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 16 }}>
            EMPIEZA A GANAR<br />
            <span style={{ color: C.orange }}>MÁS LICITACIONES</span>
          </h2>
          <p style={{ color: C.textSec, fontSize: 15, lineHeight: 1.7, marginBottom: 32 }}>
            Deja de revisar SECOP II a mano. SECOP RADAR encuentra los procesos compatibles con tu empresa y te da las herramientas para decidir en qué ofertar.
          </p>

          <form onSubmit={e => { e.preventDefault(); alert(`Solicitud enviada para: ${email}`); setEmail('') }} style={{
            display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <input
              type="email"
              placeholder="CORREO INSTITUCIONAL"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 4,
                padding: '12px 18px', color: C.text, fontSize: 13, minWidth: 280,
                outline: 'none',
              }}
            />
            <button type="submit" style={{
              background: C.orange, color: '#fff', border: 'none', borderRadius: 4,
              padding: '12px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'background 150ms',
            }} onMouseEnter={e => (e.currentTarget.style.background = C.orangeH)} onMouseLeave={e => (e.currentTarget.style.background = C.orange)}>
              SOLICITAR ACCESO
            </button>
          </form>

          <p style={{ color: C.textSec, fontSize: 10, marginTop: 20, letterSpacing: '.04em' }}>
            PARA CONSTRUCTORAS E INGENIEROS COLOMBIANOS
          </p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: C.header, borderTop: `1px solid ${C.border}`, padding: '40px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 24 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: 6 }}>
              SECOP <span style={{ color: C.orange }}>RADAR</span>
            </div>
            <p style={{ color: C.textSec, fontSize: 10, letterSpacing: '.04em' }}>
              Pre-Auditor Automatizado de Licitaciones SECOP II<br />
              Para constructoras e ingenieros colombianos.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 24 }}>
            {['Radar', 'Pre-selección', 'Calculadoras', 'API'].map(l => (
              <a key={l} href="#" style={{ color: C.textSec, fontSize: 11, textDecoration: 'none' }}>{l}</a>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, color: C.textSec }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>
          </div>
        </div>
      </footer>
    </div>
  )
}
