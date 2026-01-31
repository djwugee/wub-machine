export type RemixStyle = 'dubstep' | 'electrohouse';

export interface AnalysisResult {
  tempo: number;
  beats: number[];
  bars: Array<[number, number]>;
  chromagrams: number[];
  loudness: number[];
  sections: Array<[number, number]>;
}

export interface RemixOptions {
  style: RemixStyle;
  intensity?: number; // 0-100
  preserveOriginal?: number; // 0-100 blend amount
}

export interface RemixResult {
  audioData: Float32Array;
  duration: number;
  metadata: {
    style: RemixStyle;
    tempo: number;
    sourceFileName: string;
  };
}
