use wasm_bindgen::prelude::*;
use ndarray::Array1;
use crate::AudioAnalysisResult;
use std::f32::consts::PI;

/// Musical section phases for remix structure
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SectionPhase {
    Intro,
    Build,
    Drop,
    Breakdown,
}

/// Core remix engine for Dubstep and ElectroHouse styles
pub struct RemixEngine;

impl RemixEngine {
    /// Remix audio in Dubstep style with heavy bass and wobble effects
    pub fn dubstep_remix(
        audio: &[f32],
        analysis: &AudioAnalysisResult,
        sample_rate: usize,
    ) -> Result<Vec<f32>, JsValue> {
        // Dubstep remix strategy:
        // 1. Identify high-energy beats using chromatic analysis
        // 2. Apply heavy bass emphasis to original
        // 3. Create wobble effects through dynamic filtering
        // 4. Add dramatic drops and silence sections
        // 5. Layer with beat-locked percussion

        if audio.is_empty() || analysis.beats.is_empty() {
            return Ok(audio.to_vec());
        }

        let mut remixed = vec![0.0; audio.len()];

        // Step 1: Apply cascading bass filters (progressive lowpass)
        let bass_filtered = Self::apply_bass_emphasis(audio, sample_rate, 80.0, 200.0)?;
        let sub_bass = Self::apply_bass_emphasis(audio, sample_rate, 30.0, 80.0)?;

        // Step 2: Detect energy peaks for drop placement
        let energy_profile = Self::compute_energy_envelope(&analysis.loudness);
        let drops = Self::detect_drops(&analysis.loudness, &analysis.beats)?;

        // Step 3: Build remix with beat-locked sections
        let mut beat_idx = 0;
        let beat_interval = if !analysis.beats.is_empty() {
            60.0 / analysis.tempo
        } else {
            0.5
        };

        for sample_idx in 0..audio.len() {
            let current_time = sample_idx as f32 / sample_rate as f32;

            // Determine section: intro, build, drop, or breakdown
            let section_phase = Self::get_section_phase(&current_time, &analysis.sections);

            // Mix based on section
            match section_phase {
                SectionPhase::Intro => {
                    // Intro: emphasis on original + subtle bass
                    remixed[sample_idx] = audio[sample_idx] * 0.4 + bass_filtered[sample_idx] * 0.3;
                }
                SectionPhase::Build => {
                    // Build: progressive bass introduction
                    let build_intensity = (current_time / 30.0).min(1.0); // Ramp over 30s
                    remixed[sample_idx] = audio[sample_idx] * (1.0 - build_intensity * 0.5)
                        + bass_filtered[sample_idx] * build_intensity * 0.6;
                }
                SectionPhase::Drop => {
                    // Drop: heavy bass + wobble + silence gaps
                    if Self::is_in_silence_gap(current_time, beat_interval) {
                        remixed[sample_idx] = 0.0; // Silence for impact
                    } else {
                        let wobble = (current_time * 2.0 * std::f32::consts::PI * 3.5).sin();
                        remixed[sample_idx] = (bass_filtered[sample_idx] * 0.9
                            + sub_bass[sample_idx] * (0.5 + wobble * 0.3))
                            * 0.8;
                    }
                }
                SectionPhase::Breakdown => {
                    // Breakdown: return to melodic content with bass undertone
                    remixed[sample_idx] = audio[sample_idx] * 0.6 + sub_bass[sample_idx] * 0.2;
                }
            }
        }

        // Step 4: Apply dynamics compression for punch
        Self::apply_compression(&mut remixed, 0.5, 4.0)?;

        // Step 5: Normalize
        Self::normalize(&mut remixed);

        Ok(remixed)
    }

    /// Remix audio in ElectroHouse style with rhythmic sequencing
    pub fn electrohouse_remix(
        audio: &[f32],
        analysis: &AudioAnalysisResult,
        sample_rate: usize,
    ) -> Result<Vec<f32>, JsValue> {
        // ElectroHouse remix strategy:
        // 1. Identify strong beats for kick placement
        // 2. Create uplifting harmonic content through filtering
        // 3. Add rhythmic synth stabs on musical downbeats
        // 4. Build energy with progressive arrangements
        // 5. Layer with pitch-shifted harmonics

        if audio.is_empty() || analysis.beats.is_empty() {
            return Ok(audio.to_vec());
        }

        let mut remixed = vec![0.0; audio.len()];

        // Step 1: Determine beat structure and tempo
        let tempo = analysis.tempo;
        let beat_interval = 60.0 / tempo;

        // Step 2: Apply mid-range emphasis (ElectroHouse characteristic)
        let mid_filtered = Self::apply_midrange_emphasis(audio, sample_rate)?;

        // Step 3: Create rhythmic grid
        let bar_length = beat_interval * 4.0; // 4 beats per bar
        let kick_pattern = Self::generate_kick_pattern(8); // 8-beat pattern
        let synth_pattern = Self::generate_synth_pattern(8); // Synth stab pattern

        // Step 4: Build remix with beat-locked pattern
        for (beat_idx, &beat_time) in analysis.beats.iter().enumerate() {
            let pattern_idx = beat_idx % kick_pattern.len();
            let sample_pos = (beat_time * sample_rate as f32) as usize;

            if sample_pos >= audio.len() {
                break;
            }

            let chunk_size = ((beat_interval * 0.9) * sample_rate as f32) as usize;
            let chunk_end = (sample_pos + chunk_size).min(audio.len());

            if kick_pattern[pattern_idx] {
                // Kick drum: emphasize bass and add punch
                for i in sample_pos..chunk_end {
                    remixed[i] += audio[i] * 0.5 + mid_filtered[i] * 0.4;
                }
            }

            if synth_pattern[pattern_idx] {
                // Synth stab: shorter duration, higher amplitude
                let stab_size = (chunk_size / 2).min(chunk_end - sample_pos);
                for i in 0..stab_size {
                    if sample_pos + i < audio.len() {
                        remixed[sample_pos + i] += mid_filtered[sample_pos + i] * 0.6;
                    }
                }
            }
        }

        // Step 5: Add uplifting reverb-like effect through delay
        Self::apply_uplifting_delay(&mut remixed, sample_rate, beat_interval)?;

        // Step 6: Apply gentle compression for polish
        Self::apply_compression(&mut remixed, 0.6, 3.0)?;

        // Step 7: Normalize
        Self::normalize(&mut remixed);

        Ok(remixed)
    }

    /// Detect drop sections (low-energy regions)
    fn detect_drops(loudness: &[f32], beats: &[f32]) -> Result<Vec<(f32, f32)>, JsValue> {
        let mut drops = Vec::new();

        if loudness.len() < 10 || beats.len() < 4 {
            return Ok(drops);
        }

        let threshold = Self::percentile(loudness, 0.25)?;

        let mut in_drop = false;
        let mut drop_start = 0.0;

        for (idx, &loudness_val) in loudness.iter().enumerate() {
            if loudness_val < threshold && !in_drop {
                in_drop = true;
                drop_start = idx as f32 / (loudness.len() as f32) * 1000.0; // Approximate time
            } else if loudness_val >= threshold && in_drop {
                in_drop = false;
                let drop_end = idx as f32 / (loudness.len() as f32) * 1000.0;
                if drop_end - drop_start > 0.5 {
                    // Minimum drop length: 500ms
                    drops.push((drop_start, drop_end));
                }
            }
        }

        Ok(drops)
    }

    /// Apply bass emphasis filter (low-pass boost)
    fn apply_bass_emphasis(audio: &[f32], sample_rate: usize, low_freq: f32, high_freq: f32) -> Result<Vec<f32>, JsValue> {
        // Simple first-order low-pass filter with emphasis
        let mut filtered = vec![0.0; audio.len()];
        let alpha = 2.0 * std::f32::consts::PI * low_freq / (sample_rate as f32);

        let mut prev = audio[0];
        filtered[0] = prev;

        for i in 1..audio.len() {
            filtered[i] = alpha * audio[i] + (1.0 - alpha) * prev;
            prev = filtered[i];
        }

        // Boost bass region
        for val in filtered.iter_mut() {
            *val *= 1.5;
        }

        Ok(filtered)
    }

    /// Apply spectral processing (compression, EQ)
    fn apply_spectral_processing(audio: &[f32], sample_rate: usize) -> Result<Vec<f32>, JsValue> {
        // Simple dynamic range compression
        let mut processed = audio.to_vec();

        let threshold = 0.5;
        let ratio = 4.0;

        for val in processed.iter_mut() {
            if val.abs() > threshold {
                let excess = val.abs() - threshold;
                let compressed = threshold + excess / ratio;
                *val = if *val > 0.0 { compressed } else { -compressed };
            }
        }

        Ok(processed)
    }

    /// Normalize audio to prevent clipping (-1.0 to 1.0 range)
    fn normalize(audio: &mut [f32]) {
        let max = audio
            .iter()
            .map(|x| x.abs())
            .fold(0.0, f32::max)
            .max(0.001);

        for val in audio.iter_mut() {
            *val /= max;
        }
    }

    /// Compute percentile of array
    fn percentile(data: &[f32], p: f32) -> Result<f32, JsValue> {
        if data.is_empty() {
            return Ok(0.0);
        }

        let mut sorted = data.to_vec();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

        let idx = ((p * sorted.len() as f32) as usize).min(sorted.len() - 1);
        Ok(sorted[idx])
    }

    /// Compute energy envelope from loudness profile
    fn compute_energy_envelope(loudness: &[f32]) -> Vec<f32> {
        if loudness.is_empty() {
            return vec![];
        }

        let mut envelope = vec![0.0; loudness.len()];
        let window_size = 10.max(loudness.len() / 100);

        for i in 0..loudness.len() {
            let start = i.saturating_sub(window_size / 2);
            let end = (i + window_size / 2).min(loudness.len());

            let avg = loudness[start..end].iter().sum::<f32>() / (end - start) as f32;
            envelope[i] = avg;
        }

        envelope
    }

    /// Determine musical section phase based on analysis
    fn get_section_phase(current_time: &f32, sections: &[(f32, f32)]) -> SectionPhase {
        let song_duration = sections.last().map(|(_, end)| end).copied().unwrap_or(180.0);
        let time_position = current_time / song_duration; // 0-1

        // Heuristic section breakdown:
        // 0.0-0.2: Intro
        // 0.2-0.4: Build
        // 0.4-0.6: Drop (main beat)
        // 0.6-1.0: Breakdown/outro

        match time_position {
            x if x < 0.2 => SectionPhase::Intro,
            x if x < 0.4 => SectionPhase::Build,
            x if x < 0.7 => SectionPhase::Drop,
            _ => SectionPhase::Breakdown,
        }
    }

    /// Check if current time is within a silence gap (for build tension)
    fn is_in_silence_gap(current_time: f32, beat_interval: f32) -> bool {
        let beat_position = current_time % (beat_interval * 4.0);
        // Create silence at end of every 4-beat bar
        beat_position > beat_interval * 3.5
    }

    /// Apply dynamic range compression for punch and clarity
    fn apply_compression(audio: &mut [f32], threshold: f32, ratio: f32) -> Result<(), JsValue> {
        let attack_time = 0.005; // 5ms attack
        let release_time = 0.1; // 100ms release

        let mut envelope = 1.0;

        for sample in audio.iter_mut() {
            let input_level = sample.abs();

            if input_level > threshold {
                let excess = input_level - threshold;
                let compressed = threshold + excess / ratio;
                envelope = (envelope + (compressed - input_level) * 0.1).clamp(0.1, 1.0);
            } else {
                envelope = (envelope + 0.1).clamp(0.1, 1.0);
            }

            *sample *= envelope;
        }

        Ok(())
    }

    /// Apply mid-range emphasis (characteristic ElectroHouse sound)
    fn apply_midrange_emphasis(audio: &[f32], sample_rate: usize) -> Result<Vec<f32>, JsValue> {
        // Simple bandpass filter emphasizing 1-4 kHz (uplifting frequency range)
        let mut filtered = audio.to_vec();

        // Apply two-pole shelving filter for mid-range boost
        let q = 1.4; // Resonance
        let freq = 2000.0; // Center frequency
        let gain = 1.5; // Boost amount

        let w0 = 2.0 * PI * freq / sample_rate as f32;
        let alpha = w0.sin() / (2.0 * q);

        let a0 = 1.0 + alpha;
        let _a1 = -2.0 * w0.cos();
        let _a2 = 1.0 - alpha;
        let b0 = 1.0 + alpha * gain;
        let _b1 = -2.0 * w0.cos();
        let _b2 = 1.0 - alpha * gain;

        // Simple first-order approximation
        let mut prev = filtered[0];
        for i in 1..filtered.len() {
            let curr = filtered[i];
            filtered[i] = (prev * 0.3 + curr * 0.7) * gain;
            prev = curr;
        }

        Ok(filtered)
    }

    /// Generate kick drum pattern (true/false for each beat in 8-beat measure)
    fn generate_kick_pattern(length: usize) -> Vec<bool> {
        // Classic 4/4 kick pattern: kick on 1, 3, 5 (with variation)
        let mut pattern = vec![false; length];
        pattern[0] = true; // Beat 1
        pattern[2] = true; // Beat 3
        pattern[4] = true; // Beat 5
        pattern[6] = true; // Beat 7 (fills)
        pattern
    }

    /// Generate synth stab pattern (true/false for each beat in 8-beat measure)
    fn generate_synth_pattern(length: usize) -> Vec<bool> {
        // Synth stabs on upbeats (2, 4, 6, 8) for contrast
        let mut pattern = vec![false; length];
        pattern[1] = true; // Beat 2
        pattern[3] = true; // Beat 4
        pattern[5] = true; // Beat 6
        pattern[7] = true; // Beat 8
        pattern
    }

    /// Apply uplifting delay effect for ElectroHouse characteristic sound
    fn apply_uplifting_delay(
        audio: &mut [f32],
        sample_rate: usize,
        beat_interval: f32,
    ) -> Result<(), JsValue> {
        // Create a quarter-note delay (one quarter of beat interval)
        let delay_samples = ((beat_interval / 4.0) * sample_rate as f32) as usize;

        if delay_samples == 0 || delay_samples > audio.len() {
            return Ok(());
        }

        let mut delayed = vec![0.0; audio.len()];

        for i in delay_samples..audio.len() {
            // Mix original with delayed version (1:1 ratio for uplifting effect)
            delayed[i] = audio[i] * 0.7 + audio[i - delay_samples] * 0.3;
        }

        audio.copy_from_slice(&delayed);
        Ok(())
    }
}
