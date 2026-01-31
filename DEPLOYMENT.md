# Wub Machine - Deployment & Development Guide

Complete guide for building, testing, and deploying the Wub Machine remix application.

## Quick Start

### Prerequisites
- Node.js 18+
- Rust 1.56+
- wasm-pack
- Git

### Local Development

```bash
# 1. Install dependencies
npm install

# 2. Build WASM module
cd wasm && bash build.sh && cd ..

# 3. Start development server
npm run dev

# 4. Open http://localhost:3000
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                  Next.js React Frontend                  │
│  (App Router, TypeScript, Tailwind CSS)                  │
└──────────────────┬──────────────────────────────────────┘
                   │
        ┌──────────┼──────────┐
        │          │          │
        ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │ WASM   │ │IndexedDB
    │ Audio  │ │Projects
    │Engine  │ │& Cache
    └────────┘ └────────┘
        │
        ▼
    ┌────────────────┐
    │Web Audio API   │
    │+ Playback      │
    └────────────────┘
```

### Core Components

**1. WASM Audio Engine** (`/wasm/`)
- Rust-based audio analysis and remix generation
- STFT, beat detection, tempo estimation
- Dubstep & ElectroHouse remix algorithms
- Compiled to WebAssembly for browser execution

**2. React Frontend** (`/app/`, `/components/`)
- Audio upload and file handling
- Remix style selection
- Real-time progress tracking
- Audio playback and visualization
- Download functionality

**3. Local Storage** (`/lib/db.ts`)
- IndexedDB for project persistence
- Analysis caching for offline capability
- Project management and remixes

**4. Web Audio Processing** (`/lib/audioProcessor.ts`)
- 3-band EQ, compression, reverb
- Delay effects and stereo widening
- Frequency analysis for visualizations
- Tempo-aware audio scheduling

**5. Sample Management** (`/lib/sampleManager.ts`)
- Chromatic sample library (12 pitches)
- Caching and preloading
- Dubstep and ElectroHouse sample sets

## Build & Compilation

### WASM Build

```bash
cd wasm

# Development build (larger, easier to debug)
wasm-pack build --target web --dev

# Production build (optimized, ~1.2MB)
bash build.sh

# Run tests
cargo test
```

Output: `public/wasm/`

### Next.js Build

```bash
# Development
npm run dev

# Production
npm run build
npm run start

# Lint & type check
npm run lint
npm run typecheck
```

## Environment Setup

### Required Variables

Create `.env.local`:

```env
# Optional: API endpoint for cloud features (future)
NEXT_PUBLIC_API_URL=http://localhost:3000

# Optional: Analytics
NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn
```

### File Structure for Samples

Required samples directory structure for remix features:

```
public/samples/
├── dubstep/
│   ├── wubs/
│   │   ├── c.wav
│   │   ├── c-sharp.wav
│   │   └── ... (12 chromatic notes)
│   ├── break-ends/ (same 12 notes)
│   ├── splashes/
│   │   ├── splash_01.wav
│   │   └── ... (up to 11)
│   ├── splash-ends/ (4 files)
│   ├── hats.wav
│   └── intro-eight.wav
└── electrohouse/
    ├── body/ (12 chromatic notes)
    ├── beat_0.wav
    ├── beat_1.wav
    ├── beat_2.wav
    ├── beat_3.wav
    ├── intro_16.wav
    ├── splash.wav
    └── build.wav
```

## Performance Optimization

### Bundle Size
- WASM module: ~1.2 MB (gzipped: ~400 KB)
- React + UI: ~250 KB
- Total initial load: ~700 KB (gzipped)

### Caching Strategies

**Service Worker** (implement with Next.js)
```typescript
// public/sw.js
self.addEventListener('install', () => {
  caches.open('wub-machine-v1').then(cache => {
    cache.addAll([
      '/',
      '/wasm/wub_machine_wasm_bg.wasm',
      '/offline.html'
    ]);
  });
});
```

**IndexedDB Storage**
- Analysis results cached by audio hash
- Projects stored locally with remixes
- Automatic cleanup of old cache (30 days)

### Memory Management

```typescript
// Clear unused analysis cache
await clearOldCacheEntries(30);

// Monitor storage quota
const stats = await getCacheStats();
console.log('Storage used:', stats.estimatedSize / 1024 / 1024, 'MB');
```

## Testing

### Unit Tests (WASM)
```bash
cd wasm
cargo test
```

### Integration Tests (React)
```bash
npm run test
```

### E2E Tests
```bash
npm run test:e2e
```

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Production deployment
vercel --prod
```

**Key configuration** (`vercel.json`):
```json
{
  "buildCommand": "cd wasm && bash build.sh && cd .. && npm run build",
  "outputDirectory": ".next",
  "env": {
    "NEXT_PUBLIC_ANALYZE": "@next/bundle-analyzer"
  }
}
```

### Docker Deployment

```dockerfile
FROM rust:latest AS wasm-builder
WORKDIR /wasm
COPY wasm .
RUN cargo install wasm-pack && bash build.sh

FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY --from=wasm-builder /wasm/dist ./public/wasm
COPY . .

RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### AWS Deployment

**S3 + CloudFront**
```bash
# Build
npm run build

# Upload to S3
aws s3 sync out/ s3://wub-machine/

# Invalidate CloudFront
aws cloudfront create-invalidation --distribution-id XXXXX --paths "/*"
```

## Monitoring & Debugging

### Browser DevTools

**Performance Timeline**
1. Open DevTools → Performance tab
2. Record page load
3. Check for:
   - WASM initialization time (~200-500ms)
   - Audio decoding time (depends on file size)
   - Remix generation time (~1-2 seconds per song)

**Network**
1. Open DevTools → Network tab
2. Monitor:
   - WASM module (~1.2 MB)
   - Sample files (if needed)
   - Analysis cache hits

### Console Logging

The app includes `[v0]` prefixed logs for debugging:

```javascript
console.log('[v0] WASM module loaded');
console.log('[v0] Analysis complete:', { tempo, beatCount });
console.log('[v0] Remix complete:', { style, outputLength });
```

Filter in DevTools:
```
filter: [v0]
```

### Production Monitoring

**Error Tracking** (Sentry integration):
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.captureException(error, {
  tags: { component: 'remix-engine' },
});
```

## Troubleshooting

### WASM Module Not Loading

**Problem**: "Failed to load WASM module"

**Solution**:
1. Check WASM build completed: `ls public/wasm/`
2. Verify WASM MIME type in server config
3. Check browser console for specific error

### Audio Processing Crashes

**Problem**: Browser tab freezes during analysis

**Solution**:
1. Use Web Workers for processing
2. Implement progress tracking
3. Test with smaller audio files first

### IndexedDB Quota Exceeded

**Problem**: "QuotaExceededError"

**Solution**:
```typescript
// Request persistent storage
const granted = await requestPersistentStorage();

// Or clear old cache
await clearOldCacheEntries(7); // Keep 7 days
```

## Future Enhancements

- [ ] GPU acceleration (WebGPU) for FFT
- [ ] Multi-track mixing
- [ ] Real-time parameter control
- [ ] Sample pack sharing/downloads
- [ ] AI-powered remix suggestions
- [ ] Mobile app (React Native)
- [ ] Collaborative remixing
- [ ] Advanced visualization (Waveform, Spectrogram)

## Support & Contributing

### Reporting Issues
Open GitHub issues with:
- Browser/OS info
- Console error messages
- Steps to reproduce
- Attached audio file (if applicable)

### Contributing
1. Fork repository
2. Create feature branch
3. Implement changes (follow code style)
4. Write tests
5. Submit pull request

## License

Wub Machine © 2026. All rights reserved.

## References

- [Rust FFT](https://github.com/ejmahler/RustFFT)
- [WASM-Bindgen](https://docs.rs/wasm-bindgen/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Librosa Documentation](https://librosa.org/doc/)
- [Audio Processing (MDN)](https://developer.mozilla.org/en-US/docs/Web/Media/Audio_for_Web)
