/**
 * Unified remix orchestrator.
 * Coordinates the full remix pipeline: decode -> analyze -> remix -> encode.
 */

import {
  decodeAudioFile,
  extractMetadata,
  encodeToMp3,
  encodeToWav,
  createAudioBuffer,
  type SongMetadata,
  type ProgressCallback,
} from "./engine"
import { remixDubstep } from "./dubstep-remixer"
import { remixElectroHouse } from "./electrohouse-remixer"
import { KEY_NAMES } from "./samples"

export type RemixStyle = "dubstep" | "electrohouse"

export interface RemixResult {
  audioBuffer: AudioBuffer
  mp3Blob: Blob
  wavBlob: Blob
  metadata: SongMetadata & {
    style: RemixStyle
    key: string
    tempo: number
    newTitle: string
  }
  duration: number
}

export interface RemixProgress {
  text: string
  progress: number // 0-1
  stage: "loading" | "analyzing" | "remixing" | "encoding" | "done" | "error"
}

/**
 * Perform a full remix of an audio file.
 */
export async function performRemix(
  file: File,
  style: RemixStyle,
  onProgress: (update: RemixProgress) => void
): Promise<RemixResult> {
  try {
    // Stage 1: Load and decode
    onProgress({ text: "Loading audio file...", progress: 0.02, stage: "loading" })
    const [decoded, metadata] = await Promise.all([
      decodeAudioFile(file),
      extractMetadata(file),
    ])

    const titleDisplay = metadata.title
      ? `"${metadata.title}"`
      : file.name.replace(/\.[^.]+$/, "")

    onProgress({
      text: `Listening to ${titleDisplay}...`,
      progress: 0.05,
      stage: "analyzing",
    })

    // Stage 2: Remix
    const remixProgress: ProgressCallback = (text, progress) => {
      onProgress({
        text,
        progress: 0.05 + progress * 0.75, // Map 0-1 to 0.05-0.80
        stage: "remixing",
      })
    }

    let remixedAudio: { left: Float32Array; right: Float32Array }

    if (style === "dubstep") {
      remixedAudio = await remixDubstep(
        decoded.left,
        decoded.right,
        decoded.sampleRate,
        remixProgress
      )
    } else {
      remixedAudio = await remixElectroHouse(
        decoded.left,
        decoded.right,
        decoded.sampleRate,
        remixProgress
      )
    }

    // Stage 3: Encode
    onProgress({ text: "Encoding to MP3...", progress: 0.82, stage: "encoding" })
    const mp3Blob = await encodeToMp3(
      remixedAudio.left,
      remixedAudio.right,
      decoded.sampleRate,
      (p) => onProgress({
        text: "Encoding to MP3...",
        progress: 0.82 + p * 0.12,
        stage: "encoding",
      })
    )

    onProgress({ text: "Creating WAV backup...", progress: 0.95, stage: "encoding" })
    const wavBlob = encodeToWav(remixedAudio.left, remixedAudio.right, decoded.sampleRate)

    // Create AudioBuffer for playback
    const audioBuffer = createAudioBuffer(remixedAudio.left, remixedAudio.right, decoded.sampleRate)

    const styleName = style === "dubstep" ? "Wub Machine Remix" : "Wub Machine Electro Remix"
    const baseTitle = metadata.title || file.name.replace(/\.[^.]+$/, "")

    const result: RemixResult = {
      audioBuffer,
      mp3Blob,
      wavBlob,
      metadata: {
        ...metadata,
        style,
        key: "?", // Will be filled below
        tempo: style === "dubstep" ? 140 : 128,
        newTitle: `${baseTitle} (${styleName})`,
      },
      duration: audioBuffer.duration,
    }

    onProgress({ text: "Done!", progress: 1, stage: "done" })
    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error occurred"
    onProgress({ text: `Error: ${errorMsg}`, progress: 0, stage: "error" })
    throw error
  }
}
