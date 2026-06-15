import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'SECOP Radar',
  description: 'Pre-Auditor Automatizado de Licitaciones',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
