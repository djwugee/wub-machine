use wasm_bindgen::prelude::*;
use ndarray::{Array1, Array2, Array3, s, Axis};
use ndarray_stats::QuantileExt;
use rustfft::FftPlanner;
use num_complex::Complex;
use std::f32::consts::PI;

pub mod audio_analysis;
pub mod beat_detector;
pub mod remix_core;

use audio_analysis::AudioAnalysis;
use beat_detector::BeatTracker;
use remix_core::RemixEngine;

#[wasm_bindgen]
pub struct WubMachine {
    sample_rate: u32,
    audio_data: Option<Vec<f32>>,
    analysis: Option<AudioAnalysisResult>,
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct AudioAnalysisResult {
    pub tempo: f32,
    pub beats: Vec<f32>,
    pub bars: Vec<(f32, f32)>,
    pub chromagrams: Vec<f32>, // Flattened chroma vectors
    pub loudness: Vec<f32>,
    pub sections: Vec<(f32, f32)>,
}

#[wasm_bindgen]
#[derive(Clone)]
pub struct RemixResult {
    pub mixed_audio: Vec<f32>,
    pub duration_seconds: f32,
}

#[wasm_bindgen]
impl WubMachine {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32) -> WubMachine {
        WubMachine {
            sample_rate,
            audio_data: None,
            analysis: None,
        }
    }

    /// Load audio data (mono PCM float32 samples)
    #[wasm_bindgen]
    pub fn load_audio(&mut self, samples: Vec<f32>) {
        self.audio_data = Some(samples);
        self.analysis = None; // Clear previous analysis
    }

    /// Analyze loaded audio for beats, tempo, and harmonic content
    #[wasm_bindgen]
    pub fn analyze(&mut self) -> Result<(), JsValue> {
        let audio = self
            .audio_data
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No audio data loaded"))?
            .clone();

        let sr = self.sample_rate as usize;
        let analysis = AudioAnalysis::analyze(&audio, sr)?;

        self.analysis = Some(analysis);
        Ok(())
    }

    /// Get the current analysis result as JSON string
    #[wasm_bindgen]
    pub fn get_analysis_json(&self) -> Result<String, JsValue> {
        self.analysis
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No analysis performed yet"))
            .and_then(|a| {
                Ok(format!(
                    r#"{{"tempo":{},"beats":[{}],"bars":[{}],"loudness":[{}],"sections":[{}]}}"#,
                    a.tempo,
                    a.beats.iter().map(|b| format!("{}", b)).collect::<Vec<_>>().join(","),
                    a.bars.iter().map(|(s, e)| format!(r#"[{},{}]"#, s, e)).collect::<Vec<_>>().join(","),
                    a.loudness.iter().map(|l| format!("{}", l)).collect::<Vec<_>>().join(","),
                    a.sections.iter().map(|(s, e)| format!(r#"[{},{}]"#, s, e)).collect::<Vec<_>>().join(","),
                ))
            })
    }

    /// Remix audio in Dubstep style
    #[wasm_bindgen]
    pub fn remix_dubstep(&self, sample_paths: JsValue) -> Result<Vec<f32>, JsValue> {
        let audio = self
            .audio_data
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No audio data loaded"))?;

        let analysis = self
            .analysis
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Analysis required before remixing"))?;

        RemixEngine::dubstep_remix(audio, analysis, self.sample_rate as usize)
    }

    /// Remix audio in ElectroHouse style
    #[wasm_bindgen]
    pub fn remix_electrohouse(&self, sample_paths: JsValue) -> Result<Vec<f32>, JsValue> {
        let audio = self
            .audio_data
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No audio data loaded"))?;

        let analysis = self
            .analysis
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Analysis required before remixing"))?;

        RemixEngine::electrohouse_remix(audio, analysis, self.sample_rate as usize)
    }

    /// Get beat times in seconds
    #[wasm_bindgen]
    pub fn get_beats(&self) -> Result<Vec<f32>, JsValue> {
        self.analysis
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No analysis performed"))
            .map(|a| a.beats.clone())
    }

    /// Get tempo in BPM
    #[wasm_bindgen]
    pub fn get_tempo(&self) -> Result<f32, JsValue> {
        self.analysis
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No analysis performed"))
            .map(|a| a.tempo)
    }

    /// Get audio duration in seconds
    #[wasm_bindgen]
    pub fn get_duration(&self) -> Result<f32, JsValue> {
        self.audio_data
            .as_ref()
            .ok_or_else(|| JsValue::from_str("No audio data"))
            .map(|a| a.len() as f32 / self.sample_rate as f32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wub_machine_creation() {
        let wub = WubMachine::new(44100);
        assert_eq!(wub.sample_rate, 44100);
    }
}
