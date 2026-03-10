import { useRemixStore } from './store'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

export async function uploadAudio(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.message || 'Upload failed')
  }

  const data = await response.json()
  return data.sessionId
}

export async function startRemix(
  file: File,
  remixer: 'dubstep' | 'electrohouse'
): Promise<void> {
  const store = useRemixStore.getState()

  try {
    // Upload file
    store.updateProgress({
      status: 'uploading',
      step: 'upload',
      progress: 0.1,
      message: 'Uploading your track...',
    })

    const sessionId = await uploadAudio(file)

    // Start remix processing
    store.updateProgress({
      status: 'analyzing',
      step: 'beat_detection',
      progress: 0.15,
      message: 'Analyzing beat structure...',
    })

    const remixResponse = await fetch(
      `${API_BASE}/api/remix/${remixer}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sessionId }),
      }
    )

    if (!remixResponse.ok) {
      const error = await remixResponse.json()
      throw new Error(error.message || 'Remix failed')
    }

    const remixData = await remixResponse.json()

    // Subscribe to progress updates
    await subscribeToProgress(sessionId, remixer)
  } catch (error) {
    store.setIsProcessing(false)
    store.updateProgress({
      status: 'error',
      step: 'upload',
      progress: 0,
      message: 'Processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    throw error
  }
}

export async function subscribeToProgress(
  sessionId: string,
  remixer: 'dubstep' | 'electrohouse'
): Promise<void> {
  const store = useRemixStore.getState()

  try {
    const eventSource = new EventSource(
      `${API_BASE}/api/progress/${sessionId}`
    )

    eventSource.addEventListener('progress', (event: Event) => {
      const customEvent = event as MessageEvent
      const data = JSON.parse(customEvent.data)
      store.updateProgress(data)

      if (data.status === 'complete') {
        eventSource.close()
        // Fetch results
        fetchResults(sessionId, remixer)
      }
    })

    eventSource.addEventListener('error', () => {
      eventSource.close()
      store.updateProgress({
        status: 'error',
        step: 'upload',
        progress: 0,
        message: 'Connection lost',
        error: 'Lost connection to server',
      })
      store.setIsProcessing(false)
    })
  } catch (error) {
    store.updateProgress({
      status: 'error',
      step: 'upload',
      progress: 0,
      message: 'Processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    store.setIsProcessing(false)
  }
}

export async function fetchResults(
  sessionId: string,
  remixer: 'dubstep' | 'electrohouse'
): Promise<void> {
  const store = useRemixStore.getState()

  try {
    const response = await fetch(
      `${API_BASE}/api/results/${sessionId}`
    )

    if (!response.ok) {
      throw new Error('Failed to fetch results')
    }

    const data = await response.json()

    store.setResults({
      sessionId,
      remixer,
      originalFile: store.uploadedFile?.name || 'unknown',
      duration: data.duration || 0,
      downloadUrl: `${API_BASE}/api/audio/stream/${sessionId}`,
      createdAt: new Date(),
      metadata: data.metadata,
    })

    store.setIsProcessing(false)
    store.addToHistory({
      sessionId,
      remixer,
      originalFile: store.uploadedFile?.name || 'unknown',
      duration: data.duration || 0,
      downloadUrl: `${API_BASE}/api/audio/stream/${sessionId}`,
      createdAt: new Date(),
      metadata: data.metadata,
    })
  } catch (error) {
    store.updateProgress({
      status: 'error',
      step: 'export',
      progress: 0,
      message: 'Failed to retrieve results',
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    store.setIsProcessing(false)
  }
}

export async function getProgress(sessionId: string): Promise<void> {
  try {
    const response = await fetch(
      `${API_BASE}/api/progress/${sessionId}`
    )

    if (!response.ok) {
      throw new Error('Failed to get progress')
    }

    const data = await response.json()
    const store = useRemixStore.getState()
    store.updateProgress(data)
  } catch (error) {
    console.error('Failed to get progress:', error)
  }
}
