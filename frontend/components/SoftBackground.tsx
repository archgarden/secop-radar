'use client'

import { useEffect, useRef } from 'react'

export default function SoftBackground() {
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
}
