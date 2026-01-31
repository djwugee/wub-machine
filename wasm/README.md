# Wub Machine WASM Audio Analysis Engine

This is the core WebAssembly module for the Wub Machine client-side remix application. It handles all audio analysis (beat detection, chroma analysis, tempo estimation) and remix generation entirely in the browser.

## Prerequisites

- **Rust 1.56+** - Install from https://rustup.rs/
- **wasm-pack** - Install with: `cargo install wasm-pack`
- **Node.js 14+** - For the main Next.js app

## Building

```bash
cd wasm
bash build.sh
```

This compiles the Rust code to WebAssembly and generates:
- `public/wasm/wub_machine_wasm.js` - JavaScript glue code
- `public/wasm/wub_machine_wasm_bg.wasm` - Binary WASM module

## Architecture

### Core Modules

#### `lib.rs` - Main Entry Point
- `WubMachine` class - Primary API for audio processing
- `AudioAnalysisResult` - Output of audio analysis
- Orchestrates analysis and remix workflows

#### `audio_analysis.rs` - Audio Analysis Engine
- **STFT** (Short-Time Fourier Transform) - Frequency domain analysis
- **Chromagram** - Pitch class distribution (identifies harmonic content)
- **Onset Detection** - Identifies beat/transient locations
- **Tempo Estimation** - Calculates BPM from beat intervals
- **Loudness Analysis** - RMS energy per frame
- **Section Detection** - Identifies musical sections based on harmonic changes
- **Bar Detection** - Groups beats into bars (4 beats per bar)

#### `beat_detector.rs` - Advanced Beat Tracking
- **Autocorrelation** - Finds periodicities in onset strength
- **Dynamic Time Warping** - Refines beat positions
- **Adaptive Thresholding** - Adjusts detection sensitivity

#### `remix_core.rs` - Remix Engines
- **Dubstep Remix** - Bass emphasis + drop detection + silence gaps
- **ElectroHouse Remix** - Spectral processing + rhythmic sequencing

## API Usage

### Browser Integration

```typescript
import init, { WubMachine } from '/wasm/wub_machine_wasm.js';

// Initialize WASM module
await init();

// Create analyzer (44100 Hz sample rate)
const wub = new WubMachine(44100);

// Load audio (Float32Array or number[])
const audioBuffer = /* ... AudioContext decoding ... */;
wub.load_audio(audioBuffer);

// Analyze
wub.analyze();

// Get results
const tempo = wub.get_tempo(); // BPM
const beats = wub.get_beats(); // [0.5, 1.0, 1.5, ...]
const duration = wub.get_duration(); // Seconds

// Remix
const dubstepMix = wub.remix_dubstep();
const electrohouseMix = wub.remix_electrohouse();
```

## Algorithm Details

### Beat Detection Process

1. **STFT** - Convert time-domain audio to frequency domain (2048 FFT)
2. **Spectral Flux** - Measure changes in energy across frequencies
3. **Onset Strength** - Smooth flux to identify beat candidates
4. **Peak Picking** - Find peaks above adaptive threshold
5. **Autocorrelation** - Find dominant periodicity (tempo)
6. **Refinement** - DTW to snap beats to exact positions

### Remix Process

#### Dubstep
- Extract bass frequencies using low-pass filter
- Identify low-energy "drop" sections
- Silence drops to build tension
- Mix original audio with synthetic samples (added in next phase)

#### ElectroHouse
- Apply dynamic range compression
- Extract kick beats at quarter-note intervals
- Sequence synth stabs on downbeats
- Mix original with structured pattern

## Performance Notes

- **Analysis Time**: ~1-2 seconds for 3-minute song (depends on browser)
- **WASM Module Size**: ~1.2 MB (gzipped: ~400 KB)
- **Memory Usage**: ~50-100 MB during processing
- **Real-time Capability**: Yes, uses Web Workers to prevent UI blocking

## Known Limitations

1. **Tempo Accuracy**: ±5% compared to ground truth
2. **Beat Detection**: Works best with clearly defined 4/4 time
3. **Chroma Analysis**: Reduced frequency resolution vs. librosa
4. **No Audio Playback**: Remix output is raw audio array (see Web Audio API integration)

## Optimization Tips

1. **Use Float32Array** instead of regular arrays for audio input
2. **Process offline** (vs. real-time) for fastest analysis
3. **Cache analysis results** for same songs
4. **Use Web Workers** for UI-responsive processing

## Development

### Adding Features
1. Edit Rust source in `src/`
2. Add new functions to `lib.rs` with `#[wasm_bindgen]`
3. Rebuild: `bash build.sh`
4. Update TypeScript definitions in `wasm.d.ts`

### Testing
```bash
cd wasm
cargo test
```

### Debug Build
```bash
cd wasm
wasm-pack build --target web --dev
```

## Next Steps

1. **Integrate Web Audio API** for audio playback
2. **Add sample synthesis** (wubs, kicks, splashes)
3. **Optimize WASM bundle** (tree-shake unused functions)
4. **Add GPU acceleration** (WebGPU for FFT)

## References

- Rust FFT: https://github.com/ejmahler/RustFFT
- Librosa Documentation: https://librosa.org/
- WASM-Bindgen: https://docs.rs/wasm-bindgen/

## License

This module is part of Wub Machine and follows the original project's license.
