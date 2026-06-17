'use client'

import React, { useEffect, useRef } from 'react'
import { useBackgroundMode, type BackgroundMode } from './useBackgroundMode'

export default function AnimatedBackground({ mode }: { mode?: BackgroundMode }) {
  const { mode: savedMode } = useBackgroundMode()
  const active = mode || savedMode
  if (active === 'waves') return <WavesBackground />
  if (active === 'gradient') return <GradientBackground />
  if (active === 'particles') return <ParticlesBackground />
  if (active === 'orbs') return <OrbsBackground />
  return <MeshBackground />
}

function MeshBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    let raf: number
    let t = 0

    const resize = () => {
      const parent = c.parentElement
      c.width = parent ? parent.offsetWidth : window.innerWidth
      c.height = parent ? parent.offsetHeight : window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type Dot = { x: number; y: number; vx: number; vy: number; r: number }
    const dots: Dot[] = []
    const count = 36
    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 1.2 + Math.random() * 2,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      t += 0.005

      for (const d of dots) {
        d.x += d.vx
        d.y += d.vy
        if (d.x < 0 || d.x > c.width) d.vx *= -1
        if (d.y < 0 || d.y > c.height) d.vy *= -1

        const alpha = 0.22 + 0.14 * Math.sin(t + d.x * 0.01 + d.y * 0.01)
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(100, 116, 139, ${alpha})`
        ctx.fill()
      }

      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const dx = dots[i].x - dots[j].x
          const dy = dots[i].y - dots[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 140) {
            const alpha = (1 - dist / 140) * 0.12
            ctx.beginPath()
            ctx.moveTo(dots[i].x, dots[i].y)
            ctx.lineTo(dots[j].x, dots[j].y)
            ctx.strokeStyle = `rgba(100, 116, 139, ${alpha})`
            ctx.lineWidth = 0.8
            ctx.stroke()
          }
        }
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <Canvas ref={ref} />
}

function WavesBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    let raf: number
    let t = 0

    const resize = () => {
      const parent = c.parentElement
      c.width = parent ? parent.offsetWidth : window.innerWidth
      c.height = parent ? parent.offsetHeight : window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const waves = [
      { y: 0.62, amplitude: 55, length: 0.008, speed: 0.01, alpha: 0.10 },
      { y: 0.68, amplitude: 75, length: 0.012, speed: 0.008, alpha: 0.08 },
      { y: 0.74, amplitude: 60, length: 0.006, speed: 0.012, alpha: 0.07 },
      { y: 0.80, amplitude: 90, length: 0.015, speed: 0.007, alpha: 0.08 },
    ]

    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      t += 1

      for (const w of waves) {
        ctx.beginPath()
        ctx.moveTo(0, c.height)
        for (let x = 0; x <= c.width; x += 5) {
          const y = c.height * w.y + Math.sin(x * w.length + t * w.speed) * w.amplitude
          ctx.lineTo(x, y)
        }
        ctx.lineTo(c.width, c.height)
        ctx.closePath()
        ctx.fillStyle = `rgba(249, 115, 22, ${w.alpha})`
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <Canvas ref={ref} />
}

function GradientBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    let raf: number
    let t = 0

    const resize = () => {
      const parent = c.parentElement
      c.width = parent ? parent.offsetWidth : window.innerWidth
      c.height = parent ? parent.offsetHeight : window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    const draw = () => {
      t += 0.002

      const x1 = c.width * (0.3 + 0.2 * Math.sin(t))
      const y1 = c.height * (0.3 + 0.2 * Math.cos(t * 0.7))
      const x2 = c.width * (0.7 + 0.2 * Math.sin(t * 0.8))
      const y2 = c.height * (0.7 + 0.2 * Math.cos(t * 0.5))

      const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
      gradient.addColorStop(0, 'rgba(15, 17, 23, 1)')
      gradient.addColorStop(0.45, 'rgba(20, 23, 32, 1)')
      gradient.addColorStop(0.55, 'rgba(26, 29, 39, 0.6)')
      gradient.addColorStop(1, 'rgba(15, 17, 23, 1)')

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, c.width, c.height)

      // Soft orb
      const orbX = c.width * (0.5 + 0.3 * Math.sin(t * 0.6))
      const orbY = c.height * (0.5 + 0.2 * Math.cos(t * 0.4))
      const orb = ctx.createRadialGradient(orbX, orbY, 0, orbX, orbY, c.width * 0.45)
      orb.addColorStop(0, 'rgba(59, 130, 246, 0.08)')
      orb.addColorStop(0.5, 'rgba(59, 130, 246, 0.02)')
      orb.addColorStop(1, 'rgba(59, 130, 246, 0)')
      ctx.fillStyle = orb
      ctx.fillRect(0, 0, c.width, c.height)

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <Canvas ref={ref} />
}

function ParticlesBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    let raf: number

    const resize = () => {
      const parent = c.parentElement
      c.width = parent ? parent.offsetWidth : window.innerWidth
      c.height = parent ? parent.offsetHeight : window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type P = { x: number; y: number; r: number; speed: number; alpha: number; wobble: number }
    const particles: P[] = []
    for (let i = 0; i < 28; i++) {
      particles.push({
        x: Math.random() * c.width,
        y: Math.random() * c.height,
        r: 1.5 + Math.random() * 2.5,
        speed: 0.2 + Math.random() * 0.4,
        alpha: 0.15 + Math.random() * 0.25,
        wobble: Math.random() * Math.PI * 2,
      })
    }

    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height)

      for (const p of particles) {
        p.y -= p.speed
        p.x += Math.sin(p.y * 0.005 + p.wobble) * 0.15
        if (p.y < -10) {
          p.y = c.height + 10
          p.x = Math.random() * c.width
        }

        // Glow
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
        g.addColorStop(0, `rgba(249, 115, 22, ${p.alpha})`)
        g.addColorStop(1, 'rgba(249, 115, 22, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2)
        ctx.fill()

        // Core
        ctx.fillStyle = `rgba(249, 115, 22, ${p.alpha + 0.15})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <Canvas ref={ref} />
}

function OrbsBackground() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    let raf: number
    let t = 0

    const resize = () => {
      const parent = c.parentElement
      c.width = parent ? parent.offsetWidth : window.innerWidth
      c.height = parent ? parent.offsetHeight : window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    type Orb = { x: number; y: number; r: number; dx: number; dy: number; color: string }
    const orbs: Orb[] = [
      { x: c.width * 0.2, y: c.height * 0.3, r: c.width * 0.25, dx: 0.15, dy: 0.08, color: '59, 130, 246' },
      { x: c.width * 0.8, y: c.height * 0.7, r: c.width * 0.3, dx: -0.12, dy: -0.1, color: '249, 115, 22' },
      { x: c.width * 0.5, y: c.height * 0.5, r: c.width * 0.2, dx: 0.08, dy: 0.12, color: '100, 116, 139' },
    ]

    const draw = () => {
      ctx.clearRect(0, 0, c.width, c.height)
      t += 0.005

      for (const o of orbs) {
        o.x += o.dx
        o.y += o.dy
        if (o.x < -o.r) o.x = c.width + o.r
        if (o.x > c.width + o.r) o.x = -o.r
        if (o.y < -o.r) o.y = c.height + o.r
        if (o.y > c.height + o.r) o.y = -o.r

        const pulse = 1 + 0.08 * Math.sin(t + o.x * 0.001)
        const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * pulse)
        g.addColorStop(0, `rgba(${o.color}, 0.55)`)
        g.addColorStop(0.5, `rgba(${o.color}, 0.22)`)
        g.addColorStop(1, 'rgba(15, 17, 23, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    draw()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <Canvas ref={ref} />
}

const Canvas = React.forwardRef<HTMLCanvasElement>(function Canvas(_, ref) {
  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
})
