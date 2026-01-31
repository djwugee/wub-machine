/**
 * TypeScript type definitions for Wub Machine WASM module
 * Generated from Rust wasm-bindgen
 */

export interface AudioAnalysisResult {
  tempo: number;
  beats: number[];
  bars: Array<[number, number]>;
  chromagrams: number[];
  loudness: number[];
  sections: Array<[number, number]>;
}

export interface RemixResult {
  mixed_audio: number[];
  duration_seconds: number;
}

export class WubMachine {
  constructor(sample_rate: number);

  /**
   * Load mono PCM audio data (float32 samples)
   */
  load_audio(samples: Float32Array | number[]): void;

  /**
   * Analyze loaded audio for beats, tempo, chroma content
   */
  analyze(): Promise<void>;

  /**
   * Get analysis results as JSON string
   */
  get_analysis_json(): string;

  /**
   * Get beat times in seconds
   */
  get_beats(): number[];

  /**
   * Get detected tempo in BPM
   */
  get_tempo(): number;

  /**
   * Get audio duration in seconds
   */
  get_duration(): number;

  /**
   * Remix audio in Dubstep style
   */
  remix_dubstep(sample_paths?: any): Float32Array;

  /**
   * Remix audio in ElectroHouse style
   */
  remix_electrohouse(sample_paths?: any): Float32Array;
}

export function init(): Promise<void>;
