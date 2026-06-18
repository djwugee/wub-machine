"use client"

import { useCallback, useEffect, useState } from "react"
import { getDB, type RemixProject } from "@/lib/db"
import { STYLE_META, type RemixStyle } from "@/lib/audio/engine"

export interface SaveRemixInput {
  originalFileName: string
  originalFileSize: number
  style: RemixStyle
  wavBlob: Blob
  tempo: number
  beats: number[]
  duration: number
}

/**
 * Manages the persisted remix library in IndexedDB. Each saved remix is stored
 * as a project with its rendered WAV bytes so it can be replayed offline.
 */
export function useLibrary() {
  const [projects, setProjects] = useState<RemixProject[]>([])
  const [loading, setLoading] = useState(true)
  const [storage, setStorage] = useState<{ used: number; quota: number }>({ used: 0, quota: 0 })

  const refresh = useCallback(async () => {
    try {
      const db = await getDB()
      const [all, quota] = await Promise.all([db.getAllProjects(), db.getStorageQuota()])
      setProjects(all)
      setStorage(quota)
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const saveRemix = useCallback(
    async (input: SaveRemixInput) => {
      const db = await getDB()
      await db.requestPersistentStorage()
      const audioData = await input.wavBlob.arrayBuffer()
      const now = Date.now()
      const project: RemixProject = {
        id: `proj_${now}_${Math.random().toString(36).slice(2, 8)}`,
        name: `${stripExt(input.originalFileName)} — ${label(input.style)}`,
        originalFileName: input.originalFileName,
        originalFileSize: input.originalFileSize,
        createdAt: now,
        updatedAt: now,
        remixes: [
          {
            id: `rmx_${now}`,
            style: input.style,
            audioData,
            tempo: input.tempo,
            beats: input.beats,
            duration: input.duration,
            createdAt: now,
          },
        ],
      }
      await db.saveProject(project)
      await refresh()
      return project.id
    },
    [refresh],
  )

  const deleteProject = useCallback(
    async (id: string) => {
      const db = await getDB()
      await db.deleteProject(id)
      await refresh()
    },
    [refresh],
  )

  return { projects, loading, storage, saveRemix, deleteProject, refresh }
}

function stripExt(name: string) {
  return name.replace(/\.[^/.]+$/, "")
}

function label(style: RemixStyle) {
  return STYLE_META[style]?.label ?? style
}
