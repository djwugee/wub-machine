import { create } from 'zustand'

export interface RemixProgress {
  status:
    | 'idle'
    | 'uploading'
    | 'analyzing'
    | 'processing'
    | 'exporting'
    | 'complete'
    | 'error'
  step:
    | 'upload'
    | 'beat_detection'
    | 'key_detection'
    | 'sample_placement'
    | 'synthesis'
    | 'mixing'
    | 'export'
  progress: number // 0-1
  message: string
  error?: string
}

export interface RemixResult {
  sessionId: string
  remixer: 'dubstep' | 'electrohouse'
  originalFile: string
  duration: number
  downloadUrl: string
  createdAt: Date
  metadata?: {
    detectedBPM?: number
    detectedKey?: string
    processingTime?: number
  }
}

interface RemixState {
  // UI State
  selectedRemixer: 'dubstep' | 'electrohouse' | null
  uploadedFile: File | null
  isProcessing: boolean

  // Progress State
  progress: RemixProgress

  // Results State
  results: RemixResult | null
  processingHistory: RemixResult[]

  // Actions
  setSelectedRemixer: (remixer: 'dubstep' | 'electrohouse') => void
  setUploadedFile: (file: File | null) => void
  setIsProcessing: (isProcessing: boolean) => void
  updateProgress: (progress: Partial<RemixProgress>) => void
  setResults: (result: RemixResult | null) => void
  addToHistory: (result: RemixResult) => void
  resetState: () => void
  clearHistory: () => void
}

const initialProgress: RemixProgress = {
  status: 'idle',
  step: 'upload',
  progress: 0,
  message: 'Ready to remix',
}

export const useRemixStore = create<RemixState>((set) => ({
  // Initial State
  selectedRemixer: null,
  uploadedFile: null,
  isProcessing: false,
  progress: initialProgress,
  results: null,
  processingHistory: [],

  // Actions
  setSelectedRemixer: (remixer) =>
    set({ selectedRemixer: remixer }),

  setUploadedFile: (file) =>
    set({ uploadedFile: file }),

  setIsProcessing: (isProcessing) =>
    set({ isProcessing }),

  updateProgress: (progressUpdate) =>
    set((state) => ({
      progress: {
        ...state.progress,
        ...progressUpdate,
      },
    })),

  setResults: (result) =>
    set({ results: result }),

  addToHistory: (result) =>
    set((state) => ({
      processingHistory: [result, ...state.processingHistory],
    })),

  resetState: () =>
    set({
      selectedRemixer: null,
      uploadedFile: null,
      isProcessing: false,
      progress: initialProgress,
      results: null,
    }),

  clearHistory: () =>
    set({ processingHistory: [] }),
}))
