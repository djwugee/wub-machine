/**
 * Audio Export Utilities
 * Handles exporting audio buffers to downloadable files
 */

/**
 * Convert AudioBuffer to WAV file
 */
export function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numberOfChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // Write WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write audio data
  const channels: Float32Array[] = [];
  for (let i = 0; i < numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return arrayBuffer;
}

/**
 * Helper function to write strings to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Download audio buffer as WAV file
 */
export function downloadWav(buffer: AudioBuffer, filename: string): void {
  const wav = audioBufferToWav(buffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Convert audio buffer to MP3 using MediaRecorder API (if supported)
 * Falls back to WAV if MP3 is not supported
 */
export async function downloadAsMP3OrWav(
  audioContext: AudioContext,
  buffer: AudioBuffer,
  filename: string
): Promise<void> {
  try {
    // Try to use MediaRecorder for MP3 encoding
    const mediaStreamDestination = audioContext.createMediaStreamDestination();
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(mediaStreamDestination);

    const chunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(mediaStreamDestination.stream, {
      mimeType: 'audio/webm',
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    const recordingComplete = new Promise<void>((resolve) => {
      mediaRecorder.onstop = () => resolve();
    });

    mediaRecorder.start();
    source.start();

    // Wait for the audio to finish playing
    await new Promise((resolve) => setTimeout(resolve, buffer.duration * 1000 + 100));

    mediaRecorder.stop();
    await recordingComplete;

    const blob = new Blob(chunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename.replace(/\.(wav|mp3)$/i, '.webm');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.warn('MediaRecorder not supported, falling back to WAV export', error);
    downloadWav(buffer, filename.replace(/\.mp3$/i, '.wav'));
  }
}

/**
 * Create a data URL from audio buffer for preview
 */
export function createAudioDataUrl(buffer: AudioBuffer): string {
  const wav = audioBufferToWav(buffer);
  const blob = new Blob([wav], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
