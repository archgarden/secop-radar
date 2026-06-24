'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface ClientePerfil {
  cliente_id: number
  nit: string | null
  razon_social: string | null
  vigencia_rup: string | null
  municipio: string | null
  unspsc: string[]
  departamentos: string[]
  patrimonio: number | null
  ingresos: number | null
  experiencia_valor_total: number
  experiencia_cantidad: number
  fuentes: Record<string, string>
}

interface Props {
  clienteId: number
  compact?: boolean
  onLoaded?: (perfil: ClientePerfil) => void
}

function fmtCOP(n: number | null) {
  if (!n) return '—'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1).replace('.', ',')}B`
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`
  return `$${n.toLocaleString('es-CO')}`
}

function labelUNSPSC(code: string) {
  const prefix = code.slice(0, 4)
  if (prefix === '7214') return 'Infraestructura pública'
  if (prefix === '7212') return 'Edificación'
  if (prefix === '7215') return 'Mantenimiento'
  if (prefix === '8110') return 'Consultoría'
  return code
}

export function useClientePerfil(clienteId: number) {
  const [perfil, setPerfil] = useState<ClientePerfil | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${API}/clientes/${clienteId}/perfil`)
      .then(async r => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
      .then((data: ClientePerfil) => {
        if (cancelled) return
        setPerfil(data)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [clienteId])

  return { perfil, loading, error }
}

export default function ClientProfilePanel({ clienteId, compact = false, onLoaded }: Props) {
  const { perfil, loading, error } = useClientePerfil(clienteId)
  const [expanded, setExpanded] = useState(!compact)

  useEffect(() => {
    if (perfil && onLoaded) onLoaded(perfil)
  }, [perfil, onLoaded])

  if (loading) {
    return (
      <div style={cardStyle}>
        <div style={{ color: 'var(--text-sec)', fontSize: 12 }}>Cargando perfil extraído...</div>
      </div>
    )
  }

  if (error || !perfil) {
    return (
      <div style={{ ...cardStyle, borderColor: 'rgba(239,68,68,.35)', background: 'rgba(239,68,68,.06)' }}>
        <div style={{ color: 'var(--red)', fontSize: 12 }}>{error || 'Perfil no disponible'}</div>
      </div>
    )
  }

  const tieneExtraccion = perfil.nit || perfil.razon_social || perfil.unspsc.length > 0 || perfil.departamentos.length > 0

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: compact ? 0 : 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 6,
          background: 'rgba(249,115,22,.15)', border: '1px solid rgba(249,115,22,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--orange)' }}>P</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
            {perfil.razon_social || `Cliente #${perfil.cliente_id}`}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {perfil.nit && <Badge color="blue" label={`NIT ${perfil.nit}`} />}
            {perfil.vigencia_rup && <Badge color="green" label={`RUP vigente hasta ${perfil.vigencia_rup}`} />}
            {!tieneExtraccion && <Badge color="red" label="Sin documentos extraídos" />}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link
            href={`/clientes/${clienteId}/perfil`}
            style={{
              background: 'transparent', border: '1px solid var(--orange)', color: 'var(--orange)',
              borderRadius: 5, padding: '4px 10px', fontSize: 11, textDecoration: 'none',
            }}
          >Editar perfil</Link>
          {compact && (
            <button
              onClick={() => setExpanded(e => !e)}
              style={{
                background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-sec)',
                borderRadius: 5, padding: '4px 10px', fontSize: 11, cursor: 'pointer',
              }}
            >
              {expanded ? 'Ocultar' : 'Ver perfil'}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <>
          <div style={{ height: 1, background: 'var(--border)', margin: '12px 0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr 1fr' : '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Metric label="Patrimonio líquido" value={fmtCOP(perfil.patrimonio)} />
            <Metric label="Ingresos operacionales" value={fmtCOP(perfil.ingresos)} />
            <Metric label="Experiencia acreditada" value={`${perfil.experiencia_cantidad} contratos · ${fmtCOP(perfil.experiencia_valor_total)}`} />
          </div>

          {perfil.municipio && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Municipio de operación principal</div>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: 'rgba(249,115,22,.12)', color: 'var(--orange)', fontWeight: 600 }}>{perfil.municipio}</span>
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Departamentos habilitados</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {perfil.departamentos.length > 0 ? perfil.departamentos.map(d => (
                <span key={d} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(34,197,94,.12)', color: 'var(--green)', fontWeight: 500 }}>{d}</span>
              )) : <span style={{ fontSize: 11, color: 'var(--text-sec)' }}>—</span>}
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Códigos UNSPSC</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {perfil.unspsc.length > 0 ? perfil.unspsc.map(u => (
                <span key={u} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 3, background: 'rgba(59,130,246,.12)', color: 'var(--blue)', fontWeight: 500 }}>{u} · {labelUNSPSC(u)}</span>
              )) : <span style={{ fontSize: 11, color: 'var(--text-sec)' }}>—</span>}
            </div>
          </div>

          {Object.keys(perfil.fuentes).length > 0 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 9, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Fuentes de los datos extraídos</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(perfil.fuentes).map(([campo, archivo]) => (
                  <div key={campo} style={{ fontSize: 10, color: 'var(--text-sec)' }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{campo.replace(/_/g, ' ')}</span>
                    {' · '}
                    <span style={{ fontFamily: 'monospace', opacity: .8 }}>{archivo}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Badge({ label, color }: { label: string; color: 'green' | 'blue' | 'red' | 'orange' }) {
  const map: Record<string, { bg: string; text: string }> = {
    green: { bg: 'rgba(34,197,94,.12)', text: 'var(--green)' },
    blue: { bg: 'rgba(59,130,246,.12)', text: 'var(--blue)' },
    red: { bg: 'rgba(239,68,68,.12)', text: 'var(--red)' },
    orange: { bg: 'rgba(249,115,22,.12)', text: 'var(--orange)' },
  }
  const c = map[color]
  return (
    <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: c.bg, color: c.text, fontWeight: 600 }}>
      {label}
    </span>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: 'var(--text-sec)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '16px',
}
