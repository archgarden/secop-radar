'use client'

import { useEffect, useState } from 'react'

export type BackgroundMode = 'mesh' | 'waves' | 'gradient' | 'particles' | 'orbs'

const STORAGE_KEY = 'secop-radar-bg-mode'
const DEFAULT_MODE: BackgroundMode = 'orbs'

export function useBackgroundMode() {
  const [mode, setMode] = useState<BackgroundMode>(DEFAULT_MODE)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null
    if (saved && isValidMode(saved)) {
      setMode(saved as BackgroundMode)
    }
  }, [])

  const changeMode = (next: BackgroundMode) => {
    setMode(next)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }

  return { mode, changeMode, mounted }
}

function isValidMode(value: string): value is BackgroundMode {
  return ['mesh', 'waves', 'gradient', 'particles', 'orbs'].includes(value)
}
