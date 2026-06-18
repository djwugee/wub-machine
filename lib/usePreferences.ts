"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { DEFAULT_PARAMS, type RemixParams, type RemixStyle } from "@/lib/audio/engine"

const STORAGE_KEY = "wub-machine:preferences:v1"

export interface Preferences {
  style: RemixStyle
  params: RemixParams
  volume: number
  autoPreview: boolean
  useSlicedDrums: boolean
}

const DEFAULT_PREFERENCES: Preferences = {
  style: "dubstep",
  params: DEFAULT_PARAMS,
  volume: 0.9,
  autoPreview: true,
  useSlicedDrums: false,
}

function load(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<Preferences>
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      params: {
        dubstep: { ...DEFAULT_PARAMS.dubstep, ...parsed.params?.dubstep },
        electrohouse: { ...DEFAULT_PARAMS.electrohouse, ...parsed.params?.electrohouse },
      },
    }
  } catch {
    return DEFAULT_PREFERENCES
  }
}

/**
 * Persisted user preferences (last style, effect params, volume) backed by
 * localStorage so settings survive reloads — fully client-side.
 */
export function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [hydrated, setHydrated] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setPrefs(load())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
      } catch {
        /* storage may be full or blocked; ignore */
      }
    }, 250)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [prefs, hydrated])

  const setStyle = useCallback((style: RemixStyle) => {
    setPrefs((p) => ({ ...p, style }))
  }, [])

  const setVolume = useCallback((volume: number) => {
    setPrefs((p) => ({ ...p, volume }))
  }, [])

  const setAutoPreview = useCallback((autoPreview: boolean) => {
    setPrefs((p) => ({ ...p, autoPreview }))
  }, [])

  const setUseSlicedDrums = useCallback((useSlicedDrums: boolean) => {
    setPrefs((p) => ({ ...p, useSlicedDrums }))
  }, [])

  const updateParams = useCallback(
    <S extends RemixStyle>(style: S, patch: Partial<RemixParams[S]>) => {
      setPrefs((p) => ({
        ...p,
        params: {
          ...p.params,
          [style]: { ...p.params[style], ...patch },
        },
      }))
    },
    [],
  )

  return { prefs, hydrated, setStyle, setVolume, setAutoPreview, setUseSlicedDrums, updateParams }
}
