/**
 * Sample file paths and templates for each remix style.
 * All samples are served from /samples/ as static assets.
 */

export const KEYS = ["c", "c-sharp", "d", "d-sharp", "e", "f", "f-sharp", "g", "g-sharp", "a", "a-sharp", "b"] as const
export const KEY_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"] as const

export interface RemixTemplate {
  tempo: number
  sampleBasePath: string
  samples: Record<string, string | string[]>
}

export const DUBSTEP_TEMPLATE: RemixTemplate = {
  tempo: 140,
  sampleBasePath: "/samples/dubstep/",
  samples: {
    intro: "intro-eight.wav",
    hats: "hats.wav",
    wubs: KEYS.map((k) => `wubs/${k}.wav`),
    wubBreaks: KEYS.map((k) => `break-ends/${k}.wav`),
    splashes: [
      "splashes/splash_03.wav", "splashes/splash_04.wav", "splashes/splash_02.wav",
      "splashes/splash_01.wav", "splashes/splash_05.wav", "splashes/splash_07.wav",
      "splashes/splash_06.wav", "splashes/splash_08.wav", "splashes/splash_10.wav",
      "splashes/splash_09.wav", "splashes/splash_11.wav",
    ],
    splashEnds: [
      "splash-ends/1.wav", "splash-ends/2.wav", "splash-ends/3.wav", "splash-ends/4.wav",
    ],
  },
}

export const ELECTROHOUSE_TEMPLATE: RemixTemplate = {
  tempo: 128,
  sampleBasePath: "/samples/electrohouse/",
  samples: {
    intro: "intro_16.wav",
    body: KEYS.map((k) => `body/${k}.wav`),
    splashEnds: [
      "splash-ends/1.wav", "splash-ends/2.wav", "splash-ends/3.wav", "splash-ends/4.wav",
    ],
  },
}

/**
 * Resolve a sample path to a full URL.
 */
export function resolveSamplePath(template: RemixTemplate, relativePath: string): string {
  return template.sampleBasePath + relativePath
}

/**
 * Get the key-matched sample path for a given tonic (0-11).
 */
export function getKeyedSample(samplePaths: string[], tonic: number): string {
  return samplePaths[tonic % samplePaths.length]
}
