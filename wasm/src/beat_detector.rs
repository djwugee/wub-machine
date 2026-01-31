use ndarray::{Array1, Array2};
use std::f32::consts::PI;

/// Advanced beat tracking using onset detection and spectral flux
pub struct BeatTracker;

impl BeatTracker {
    /// Track beats using autocorrelation of onset strength
    pub fn track_beats(onset_strength: &Array1<f32>, hop_length: usize, sample_rate: usize) -> Vec<f32> {
        let mut beats = Vec::new();

        if onset_strength.len() < 2 {
            return beats;
        }

        // Compute autocorrelation to find periodicities
        let autocorr = Self::autocorrelation(onset_strength);

        // Find dominant frequency (tempo hypothesis)
        let max_lag = (sample_rate / hop_length).min(onset_strength.len() / 2);
        let mut best_lag = 1;
        let mut best_score = 0.0;

        for lag in 1..max_lag {
            if lag < autocorr.len() && autocorr[lag] > best_score {
                best_score = autocorr[lag];
                best_lag = lag;
            }
        }

        // Use best_lag to extract beats
        let threshold = Self::adaptive_threshold(onset_strength);

        let mut frame_idx = best_lag;
        while frame_idx < onset_strength.len() {
            if onset_strength[frame_idx] > threshold {
                let time_sec = (frame_idx * hop_length) as f32 / sample_rate as f32;
                beats.push(time_sec);

                // Skip ahead by best_lag to avoid duplicate detections
                frame_idx += best_lag;
            } else {
                frame_idx += 1;
            }
        }

        beats
    }

    /// Compute autocorrelation of signal (measure of periodicity)
    fn autocorrelation(signal: &Array1<f32>) -> Vec<f32> {
        let n = signal.len();
        let mean = signal.iter().sum::<f32>() / n as f32;

        let mut result = vec![0.0; n];

        for lag in 0..n {
            let mut sum = 0.0;
            for i in 0..(n - lag) {
                sum += (signal[i] - mean) * (signal[i + lag] - mean);
            }
            result[lag] = sum / (n - lag) as f32;
        }

        result
    }

    /// Compute adaptive threshold based on signal statistics
    fn adaptive_threshold(signal: &Array1<f32>) -> f32 {
        let mean = signal.iter().sum::<f32>() / signal.len() as f32;
        let variance = signal
            .iter()
            .map(|&x| (x - mean).powi(2))
            .sum::<f32>()
            / signal.len() as f32;

        mean + 1.5 * variance.sqrt()
    }

    /// Dynamic Time Warping for beat refinement
    pub fn refine_beats_dtw(
        beats: Vec<f32>,
        onset_strength: &Array1<f32>,
        hop_length: usize,
        sample_rate: usize,
    ) -> Vec<f32> {
        beats
            .into_iter()
            .map(|beat_time| {
                // Find nearest peak to beat position
                let beat_frame = (beat_time * sample_rate as f32 / hop_length as f32) as usize;
                let search_range = 10;

                let start = beat_frame.saturating_sub(search_range);
                let end = (beat_frame + search_range + 1).min(onset_strength.len());

                let (best_frame, _) = onset_strength[start..end]
                    .iter()
                    .enumerate()
                    .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                    .unwrap_or((0, &0.0));

                ((start + best_frame) * hop_length) as f32 / sample_rate as f32
            })
            .collect()
    }
}
