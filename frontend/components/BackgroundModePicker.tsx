'use client'

import { useBackgroundMode, type BackgroundMode } from './useBackgroundMode'

const MODES: { value: BackgroundMode; label: string }[] = [
  { value: 'orbs', label: 'Orbes' },
  { value: 'mesh', label: 'Malla' },
  { value: 'waves', label: 'Olas' },
  { value: 'gradient', label: 'Degradado' },
  { value: 'particles', label: 'Partículas' },
]

export default function BackgroundModePicker() {
  const { mode, changeMode, mounted } = useBackgroundMode()

  if (!mounted) {
    return (
      <span style={{
        color: 'var(--text-sec)',
        fontSize: 12,
        marginLeft: 'auto',
      }}>
        Fondo: Orbes
      </span>
    )
  }

  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginLeft: 'auto',
      color: 'var(--text-sec)',
      fontSize: 12,
      cursor: 'pointer',
    }}>
      <span>Fondo</span>
      <select
        value={mode}
        onChange={e => changeMode(e.target.value as BackgroundMode)}
        style={{
          background: 'var(--surface)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 12,
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {MODES.map(m => (
          <option key={m.value} value={m.value}>{m.label}</option>
        ))}
      </select>
    </label>
  )
}
