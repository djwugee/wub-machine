use wasm_bindgen::prelude::*;
use ndarray::{Array1, Array2, Array3, s, Axis};
use ndarray_stats::QuantileExt;
use rustfft::FftPlanner;
use num_complex::Complex;
use std::f32::consts::PI;
use crate::AudioAnalysisResult;

/// Performs comprehensive audio analysis: beat detection, chroma analysis, tempo estimation
pub struct AudioAnalysis;

impl AudioAnalysis {
    pub fn analyze(audio: &[f32], sample_rate: usize) -> Result<AudioAnalysisResult, JsValue> {
        let hop_length = 512;
        let n_fft = 2048;

        // Compute STFT and chromagram
        let stft = Self::compute_stft(audio, n_fft, hop_length, sample_rate)?;
        let chromagram = Self::compute_chromagram(&stft, sample_rate)?;

        // Beat tracking
        let onset_strength = Self::compute_onset_strength(&stft, hop_length, sample_rate)?;
        let beats = Self::detect_beats(&onset_strength, hop_length, sample_rate)?;

        // Tempo estimation using beat positions
        let tempo = Self::estimate_tempo(&beats, sample_rate)?;

        // Loudness analysis (RMS per frame)
        let loudness = Self::compute_loudness(audio, hop_length)?;

        // Section detection (based on chromagram changes)
        let sections = Self::detect_sections(&chromagram, hop_length, sample_rate)?;

        // Bar detection (typically 4 beats per bar)
        let bars = Self::detect_bars(&beats)?;

        // Flatten chromagram for storage
        let chroma_flat = chromagram.iter().cloned().collect::<Vec<f32>>();

        Ok(AudioAnalysisResult {
            tempo,
            beats,
            bars,
            chromagrams: chroma_flat,
            loudness,
            sections,
        })
    }

    /// Compute Short-Time Fourier Transform
    fn compute_stft(
        audio: &[f32],
        n_fft: usize,
        hop_length: usize,
        sample_rate: usize,
    ) -> Result<Array2<Complex<f32>>, JsValue> {
        let n_frames = (audio.len() - n_fft) / hop_length + 1;
        let mut stft = Array2::zeros((n_fft / 2 + 1, n_frames));

        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(n_fft);

        let hann_window = Self::hann_window(n_fft);

        for frame_idx in 0..n_frames {
            let start = frame_idx * hop_length;
            let end = (start + n_fft).min(audio.len());

            let mut frame = vec![Complex::new(0.0, 0.0); n_fft];
            for (i, &sample) in audio[start..end].iter().enumerate() {
                frame[i] = Complex::new(sample * hann_window[i], 0.0);
            }

            fft.process(&mut frame);

            // Store magnitude spectrum (positive frequencies only)
            for (i, val) in frame.iter().take(n_fft / 2 + 1).enumerate() {
                stft[[i, frame_idx]] = *val;
            }
        }

        Ok(stft)
    }

    /// Compute chromagram (pitch class distribution) from STFT
    fn compute_chromagram(stft: &Array2<Complex<f32>>, sample_rate: usize) -> Result<Array2<f32>, JsValue> {
        let n_chroma = 12;
        let (n_fft_half, n_frames) = stft.dim();
        let n_fft = (n_fft_half - 1) * 2;

        let mut chromagram = Array2::zeros((n_chroma, n_frames));

        for (frame_idx, frame) in stft.columns().into_iter().enumerate() {
            // Map frequency bins to chroma bins
            for (bin, &mag_complex) in frame.iter().enumerate() {
                let magnitude = mag_complex.norm();

                // Frequency in Hz for this bin
                let freq_hz = (bin as f32 * sample_rate as f32) / n_fft as f32;

                if freq_hz > 0.0 {
                    // Convert frequency to MIDI note number
                    let midi_note = 12.0 * (freq_hz / 440.0).log2() + 69.0;
                    let chroma_bin = ((midi_note % 12.0) as usize).min(11);

                    chromagram[[chroma_bin, frame_idx]] += magnitude;
                }
            }

            // Normalize chroma frame
            let sum = chromagram.column(frame_idx).sum();
            if sum > 0.0 {
                for val in chromagram.column_mut(frame_idx).iter_mut() {
                    *val /= sum;
                }
            }
        }

        Ok(chromagram)
    }

    /// Compute onset strength (beat detection signal)
    fn compute_onset_strength(stft: &Array2<Complex<f32>>, hop_length: usize, sample_rate: usize) -> Result<Array1<f32>, JsValue> {
        let n_frames = stft.ncols();
        let mut onset_strength = Array1::zeros(n_frames);

        for frame_idx in 1..n_frames {
            let prev_frame = stft.column(frame_idx - 1);
            let curr_frame = stft.column(frame_idx);

            // Spectral flux: L2 norm of positive differences
            let mut flux = 0.0;
            for (prev_mag, curr_mag) in prev_frame.iter().zip(curr_frame.iter()) {
                let prev_norm = prev_mag.norm();
                let curr_norm = curr_mag.norm();
                let diff = (curr_norm - prev_norm).max(0.0);
                flux += diff * diff;
            }

            onset_strength[frame_idx] = flux.sqrt();
        }

        // Smooth with median filter for stability
        Self::median_filter_1d(&onset_strength, 5)
    }

    /// Detect beat times using peak picking on onset strength
    fn detect_beats(onset_strength: &Array1<f32>, hop_length: usize, sample_rate: usize) -> Result<Vec<f32>, JsValue> {
        let mut beats = Vec::new();
        let threshold = onset_strength.mean().ok_or_else(|| JsValue::from_str("Cannot compute mean"))? * 1.5;

        // Peak picking with dynamic programming
        for (idx, &strength) in onset_strength.iter().enumerate() {
            if strength > threshold && idx > 0 && idx < onset_strength.len() - 1 {
                let is_peak = strength > onset_strength[idx - 1] && strength > onset_strength[idx + 1];
                if is_peak {
                    let time_sec = (idx * hop_length) as f32 / sample_rate as f32;
                    beats.push(time_sec);
                }
            }
        }

        Ok(beats)
    }

    /// Estimate tempo from beat intervals
    fn estimate_tempo(beats: &[f32], sample_rate: usize) -> Result<f32, JsValue> {
        if beats.len() < 2 {
            return Ok(120.0); // Default tempo
        }

        let mut intervals = Vec::new();
        for i in 1..beats.len() {
            intervals.push(beats[i] - beats[i - 1]);
        }

        // Find most common interval (histogram-based)
        let median_interval = Array1::from_vec(intervals)
            .quantile_axis_mut(Axis(0), 0.5)
            .ok()
            .map(|q| q.into_scalar())
            .unwrap_or(0.5);

        // Convert interval to BPM: 60 seconds / interval = BPM
        let tempo = 60.0 / median_interval.max(0.1);

        // Clamp to reasonable range [60, 180 BPM]
        Ok(tempo.max(60.0).min(180.0))
    }

    /// Compute RMS loudness per frame
    fn compute_loudness(audio: &[f32], hop_length: usize) -> Result<Vec<f32>, JsValue> {
        let n_frames = (audio.len() - hop_length) / hop_length + 1;
        let mut loudness = Vec::with_capacity(n_frames);

        for frame_idx in 0..n_frames {
            let start = frame_idx * hop_length;
            let end = (start + hop_length).min(audio.len());

            let rms: f32 = audio[start..end]
                .iter()
                .map(|&x| x * x)
                .sum::<f32>()
                / (end - start) as f32;

            loudness.push(rms.sqrt());
        }

        Ok(loudness)
    }

    /// Detect musical sections based on chromagram change
    fn detect_sections(
        chromagram: &Array2<f32>,
        hop_length: usize,
        sample_rate: usize,
    ) -> Result<Vec<(f32, f32)>, JsValue> {
        let mut sections = Vec::new();
        let mut current_section_start = 0.0;

        let threshold = 0.3;

        for frame_idx in 1..chromagram.ncols() {
            let prev_chroma = chromagram.column(frame_idx - 1);
            let curr_chroma = chromagram.column(frame_idx);

            // Chroma distance (L2 norm)
            let distance: f32 = prev_chroma
                .iter()
                .zip(curr_chroma.iter())
                .map(|(&a, &b)| (a - b).powi(2))
                .sum::<f32>()
                .sqrt();

            if distance > threshold {
                let section_end = ((frame_idx - 1) * hop_length) as f32 / sample_rate as f32;
                if section_end - current_section_start > 1.0 {
                    // Minimum section length: 1 second
                    sections.push((current_section_start, section_end));
                }
                current_section_start = section_end;
            }
        }

        // Add final section
        let total_time = (chromagram.ncols() * hop_length) as f32 / sample_rate as f32;
        sections.push((current_section_start, total_time));

        Ok(sections)
    }

    /// Detect bars (4 beats per bar, standard 4/4 time)
    fn detect_bars(beats: &[f32]) -> Result<Vec<(f32, f32)>, JsValue> {
        let mut bars = Vec::new();

        if beats.len() < 4 {
            return Ok(bars);
        }

        for i in (0..beats.len()).step_by(4) {
            let start = beats[i];
            let end = if i + 4 < beats.len() {
                beats[i + 4]
            } else {
                beats[beats.len() - 1]
            };

            bars.push((start, end));
        }

        Ok(bars)
    }

    /// Hann window function
    fn hann_window(size: usize) -> Vec<f32> {
        (0..size)
            .map(|n| {
                let n = n as f32;
                let size = size as f32;
                0.5 * (1.0 - ((2.0 * PI * n) / (size - 1.0)).cos())
            })
            .collect()
    }

    /// Median filter for 1D signal
    fn median_filter_1d(signal: &Array1<f32>, window_size: usize) -> Result<Array1<f32>, JsValue> {
        let mut filtered = signal.clone();
        let half_window = window_size / 2;

        for i in 0..signal.len() {
            let start = i.saturating_sub(half_window);
            let end = (i + half_window + 1).min(signal.len());

            let mut window: Vec<f32> = signal[start..end].to_vec();
            window.sort_by(|a, b| a.partial_cmp(b).unwrap());

            filtered[i] = window[window.len() / 2];
        }

        Ok(filtered)
    }
}
