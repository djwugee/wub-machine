# Wub Machine - Python to TypeScript/Next.js Port

## Overview

This document describes the direct port of the original Wub Machine Python remixer code to TypeScript for client-side execution in Next.js using the Web Audio API.

## Original Python Architecture

The original Wub Machine was built with:
- **Echo Nest Remix API** - Music analysis and audio manipulation
- **Python multiprocessing** - Parallel processing and memory efficiency
- **Command-line tools** - ffmpeg, lame, soundstretch, shntool
- **Flask/Tornado** - Web server and real-time progress updates
- **MySQL** - Remix tracking database

## Ported Next.js Architecture

The ported version maintains the original algorithm logic while adapting to browser constraints:
- **Web Audio API** - Client-side audio processing
- **TypeScript** - Type-safe implementation
- **React Hooks** - State management and progress tracking
- **IndexedDB** - Optional local storage (no server required)
- **Static Export** - Fully client-side deployment

## File Structure

### Original Python Files → TypeScript Ports

| Original Python | Ported TypeScript | Purpose |
|-----------------|-------------------|---------|
| `remixer.py` | `remix-base.ts` | Base remixer class and utilities |
| `remixers/dubstep.py` | `remixer-dubstep-ported.ts` | Dubstep remix algorithm |
| `remixers/electrohouse.py` | `remixer-electrohouse-ported.ts` | ElectroHouse remix algorithm |
| `helpers/fastmodify.py` | Integrated into remixers | Time-stretching functionality |
| `server.py` | `app/page.tsx` | Main application logic |

### Audio Samples

The original audio samples are preserved and must be located in `/public/samples/`:

```
public/samples/
├── dubstep/
│   ├── intro-eight.wav          # 8-bar intro sample
│   ├── hats.wav                 # Hi-hat pattern
│   ├── wubs/                    # Wub bass samples (12 notes, chromatic)
│   │   ├── c.wav
│   │   ├── c-sharp.wav
│   │   ├── d.wav
│   │   └── ... (all 12 chromatic notes)
│   ├── break-ends/              # Break samples (12 notes, chromatic)
│   │   └── ... (same structure as wubs)
│   ├── splashes/                # Percussion splashes
│   │   ├── splash_01.wav
│   │   └── ... (11 total)
│   └── splash-ends/             # Ending samples
│       ├── 1.wav
│       └── ... (4 total)
└── electrohouse/
    ├── intro_16.wav             # 16-bar intro sample
    ├── body/                    # Body synth samples (12 notes, chromatic)
    │   ├── c.wav
    │   └── ... (all 12 chromatic notes)
    └── splash-ends/             # Ending samples
        ├── 1.wav
        └── ... (4 total)
```

**Total: 58 WAV files**

## Key Algorithm Ports

### 1. Dubstep Remixer

#### Original Python Logic:
```python
def compileSection(self, j, section, hats):
    s1 = self.searchSamples(j, self.tonic)
    s2 = self.searchSamples(j, (self.tonic + 3) % 12)  # minor 3rd
    s3 = self.searchSamples(j, (self.tonic + 9) % 12)  # minor 7th
    
    # Pattern: 8x tonic, 2x m3, 2x m7, repeat
    onebar = AudioQuantumList()
    for k in xrange(0, 2):
        for i in xrange(0, 8):
            onebar.append(s1[i % len(s1)])
        for i in xrange(8, 12):
            onebar.append(s2[i % len(s2)])
        for i in xrange(12, 16):
            onebar.append(s3[i % len(s3)])
```

#### Ported TypeScript:
```typescript
private async compileSection(sectionIndex: number): Promise<AudioBuffer[]> {
  const s1 = this.searchSamples(sectionIndex, this.tonic);
  const s2 = this.searchSamples(sectionIndex, (this.tonic + 3) % 12);
  const s3 = this.searchSamples(sectionIndex, (this.tonic + 9) % 12);
  
  const pattern: number[] = [];
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 8; i++) {
      pattern.push(s1[i % s1.length]);
    }
    for (let i = 0; i < 4; i++) {
      pattern.push(s2[i % s2.length]);
    }
    for (let i = 0; i < 4; i++) {
      pattern.push(s3[i % s3.length]);
    }
  }
  // ... rest of implementation
}
```

### 2. ElectroHouse Remixer

#### Pattern Format (section.txt):
```
# Two spaces per sixteenth note
# Numbers 0-11: semitones from root (tonic)
# "-": tie/hold previous note
# "  ": rest

0 - 0 - 2   0 - 11  0 - 3 - 5 -     
```

#### Original Python Parser:
```python
def readPattern(filename):
    pattern = []
    for s in f:
        pattern.extend([''.join(x) for x in zip(*[list(s[z::2]) for z in xrange(2)])])
    
    bar = []
    for sixteenth in pattern:
        if sixteenth == "  ":
            bar.append(note())  # rest
        elif sixteenth == "- ":
            last = bar.pop()
            bar.append(note(last.pitch, last.length+1))  # extend
        else:
            bar.append(note(int(sixteenth)))  # note
```

#### Ported TypeScript:
```typescript
private readPattern(patternText: string): Note[] {
  const notes: Note[] = [];
  
  for (const line of lines) {
    for (let i = 0; i < chars.length; i += 2) {
      const chunk = (chars[i] || ' ') + (chars[i + 1] || ' ');
      
      if (chunk === '  ') {
        notes.push({ pitch: null, length: 1 });
      } else if (chunk === '- ') {
        if (notes.length > 0) {
          notes[notes.length - 1].length += 1;
        }
      } else {
        const num = parseInt(chunk.trim());
        if (!isNaN(num)) {
          notes.push({ pitch: num, length: 1 });
        }
      }
    }
  }
  return notes;
}
```

### 3. Time Stretching

**Original:** Used `soundstretch` binary for high-quality time stretching

**Ported:** Linear interpolation in Web Audio API
```typescript
private async timeStretch(buffer: AudioBuffer, ratio: number): Promise<AudioBuffer> {
  const newLength = Math.floor(buffer.length / ratio);
  const stretched = this.audioContext.createBuffer(...);
  
  for (let i = 0; i < newLength; i++) {
    const sourceIndex = i * ratio;
    const index = Math.floor(sourceIndex);
    const frac = sourceIndex - index;
    
    destData[i] = sourceData[index] * (1 - frac) + sourceData[index + 1] * frac;
  }
}
```

## Differences from Original

### Functionality Preserved:
- ✅ Exact remix algorithm structure
- ✅ Beat detection and pitch matching
- ✅ Key detection (tonic) and tempo analysis
- ✅ Sample selection logic (searchSamples, getSamples)
- ✅ Mix factor computation
- ✅ Section compilation patterns
- ✅ Progress tracking and callbacks
- ✅ All original audio samples

### Adaptations Required:
- ⚠️ **Echo Nest API** → Web Audio API analysis (simplified)
- ⚠️ **Multiprocessing** → Single-threaded with Web Workers (optional)
- ⚠️ **soundstretch** → Linear interpolation time-stretching
- ⚠️ **shntool** → AudioBuffer concatenation
- ⚠️ **lame MP3 encoding** → MediaRecorder or WAV export
- ⚠️ **Server-side file I/O** → Client-side Blob/File API

### Trade-offs:
| Feature | Original | Ported | Impact |
|---------|----------|--------|--------|
| Music Analysis | Echo Nest (sophisticated) | Web Audio (basic) | Remix quality may vary |
| Time Stretching | soundstretch (high quality) | Linear interpolation | Possible artifacts |
| Processing | Multi-core Python | Single-threaded JS | Slower for long files |
| Memory | Efficient (streams) | Browser limited | Max ~200MB files |

## Usage

### Prerequisites:
1. Audio samples must be in `/public/samples/` directory
2. Samples must match exact file names and structure
3. Browser must support Web Audio API

### Running:
```bash
npm install
npm run dev
```

### Sample Loading:
The ported code loads samples dynamically:
```typescript
const sample = await this.loadSample('/samples/dubstep/wubs/c.wav');
```

If samples are missing, you'll see:
```
Failed to fetch /samples/dubstep/wubs/c.wav: please ensure all samples are available
```

**Solution:** Copy the `samples/` directory to `public/samples/`

## Testing the Port

To verify the port maintains original behavior:

1. **Test with simple input:** Use a 4/4 song at ~140 BPM
2. **Check pattern adherence:** Dubstep should follow 8-2-2 beat pattern
3. **Verify samples used:** All 12 chromatic notes should be accessible
4. **Compare structure:** Intro → Sections → Ending format
5. **Listen for artifacts:** Time-stretching quality check

## Future Enhancements

Potential improvements while maintaining algorithm fidelity:
- Better pitch detection (ML-based)
- Higher quality time-stretching (Rubber Band library port)
- Web Worker implementation for parallelism
- Offline rendering for better performance
- Progressive sample loading
- WASM port of original C code for speed

## Credits

**Original Wub Machine:**
- Author: Peter Sobot <hi@petersobot.com>
- Version: v1 (Jan 2011), v2 (Aug-Sept 2011)
- Based on code by Ben Lacker (2009-02-24)

**Next.js Port:**
- Ported to TypeScript/Web Audio API for client-side execution
- Maintains original algorithm structure and sample usage
- Adapted for modern web standards
