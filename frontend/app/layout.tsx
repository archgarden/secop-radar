import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SECOP Radar',
  description: 'Pre-Auditor Automatizado de Licitaciones',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" style={{
      '--t-bg': '#0f1117',
      '--t-card': '#1a1d27',
      '--t-border': '#2a2d3a',
      '--t-text': '#f1f5f9',
      '--t-textsec': '#64748b',
      '--t-orange': '#f97316',
      '--t-header': '#0a0d14',
      '--t-herobg': '#141720',
      '--t-card2': '#1e2130',
    } as React.CSSProperties}>
      <body>{children}</body>
    </html>
  )
}
