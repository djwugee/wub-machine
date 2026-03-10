# Wub Machine Migration: Quick Reference

## 🎯 Executive Summary

Transform Wub Machine from Python (Tornado/Librosa) to **Next.js 16** with full production readiness.

| Aspect | Python | Next.js |
|--------|--------|---------|
| **Framework** | Tornado 2.0+ | Next.js 16 |
| **Language** | Python 3.7+ | TypeScript 5.3+ |
| **Audio Processing** | Librosa + NumPy | librosa.ts + Web Audio API |
| **Real-time** | Tornadio/Socket.IO | WebSockets/Server-Sent Events |
| **Deployment** | Linux/systemd | Vercel (serverless) |
| **Database** | MySQL/SQLAlchemy | PostgreSQL (optional) |

---

## 📦 Tech Stack

### Core
- **Next.js 16**: React 19, TypeScript 5.3
- **Audio**: librosa.ts, Tone.js, Web Audio API
- **State**: Zustand (small) + React Context
- **Styling**: Tailwind CSS 3.3
- **Storage**: Vercel Blob (production)

### API & Infrastructure
- **API Routes**: Next.js Route Handlers
- **Real-time**: Server-Sent Events (SSE) or WebSockets
- **Rate Limiting**: Upstash Redis
- **Error Tracking**: Sentry
- **Analytics**: Vercel Analytics

### DevOps
- **Deployment**: Vercel (production)
- **CI/CD**: GitHub Actions
- **Database**: Optional PostgreSQL via Neon/Supabase
- **Storage**: Vercel Blob
- **Monitoring**: Vercel Analytics + Sentry

---

## 📂 Directory Structure

```
wub-machine-next/
│
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home/upload page
│   ├── remixers/
│   │   └── [remixerId]/page.tsx # Remix status page
│   └── api/
│       ├── upload/route.ts      # File upload
│       ├── remix/route.ts       # Start remix
│       ├── progress/route.ts    # Real-time updates
│       └── download/route.ts    # Download output
│
├── lib/                          # Core logic
│   ├── remixers/
│   │   ├── base-remixer.ts      # Abstract base class
│   │   ├── dubstep.ts           # Dubstep (140 BPM)
│   │   └── electrohouse.ts      # ElectroHouse (128 BPM)
│   ├── audio/
│   │   ├── analysis.ts          # Beat/key detection
│   │   ├── processor.ts         # Audio utilities
│   │   ├── pitch.ts             # Pitch detection
│   │   └── worker.ts            # Web Worker logic
│   ├── samples.ts               # Sample management
│   ├── config.ts                # Configuration
│   ├── store.ts                 # Zustand stores
│   ├── env.ts                   # Environment vars
│   └── validation.ts            # Input validation
│
├── components/                   # React components
│   ├── upload-section.tsx       # File upload UI
│   ├── progress-monitor.tsx     # Real-time progress
│   ├── remix-player.tsx         # Audio player
│   ├── remix-controls.tsx       # Remix options
│   └── admin-monitor.tsx        # Admin dashboard
│
├── public/
│   ├── samples/
│   │   ├── dubstep/             # Dubstep samples
│   │   │   ├── wubs/
│   │   │   ├── break-ends/
│   │   │   ├── splashes/
│   │   │   └── splash-ends/
│   │   └── electrohouse/        # ElectroHouse samples
│   │       ├── body/
│   │       ├── splash-ends/
│   │       └── *.wav
│   └── audio/                   # Temporary processing
│
├── scripts/
│   ├── migrate-samples.sh       # Copy samples
│   └── generate-manifest.ts     # Sample manifest
│
├── types/
│   ├── remixer.ts               # Remixer types
│   ├── audio.ts                 # Audio types
│   └── api.ts                   # API response types
│
├── styles/
│   ├── globals.css              # Global styles
│   └── components/              # Component styles
│
├── middleware.ts                 # Middleware (auth, rate limit)
├── next.config.js               # Next.js config
├── tsconfig.json                # TypeScript config
├── tailwind.config.js           # Tailwind config
├── package.json                 # Dependencies
└── MIGRATION_STRATEGY.md         # This guide
```

---

## 🔄 Remixer Implementation Checklist

### Base Remixer Class
```typescript
// lib/remixers/base-remixer.ts
✅ Constructor with file + audioContext
✅ Abstract remix() method
✅ updateProgress() for UI updates
✅ Error handling
✅ Progress tracking (0-1)
```

### Dubstep Remixer (140 BPM)
```typescript
// lib/remixers/dubstep.ts
✅ searchSamples() - Find pitch-matched beats
✅ compileIntro() - 4-bar intro from samples
✅ compileBody() - Main remix with wubs
✅ compileSplashes() - Add splash effects
✅ getMixFactor() - Balance wub vs original
✅ concatenateAudio() - Join sections
```

### ElectroHouse Remixer (128 BPM)
```typescript
// lib/remixers/electrohouse.ts
✅ readPattern() - Load melody patterns
✅ synthesizeBody() - Melodic body
✅ noteSequencing() - Note timing
✅ buildCompilation() - Build sections
✅ splashSequencing() - Add percussion
```

---

## 🔧 Key Algorithms

### 1. Beat/Tempo Detection
```typescript
// Input: Raw audio float32 array
// Output: { bpm: number, beats: number[] }

const { bpm, beats } = librosa.beatTrack({ 
  y: audioData, 
  sr: 44100 
});
```

### 2. Pitch Detection (Chroma Features)
```typescript
// Detect dominant pitch class (0-11) in segment
const chromagram = librosa.featureChromaStft({ y, sr });
const energy = chromagram.reduce((a, b) => 
  a.map((v, i) => v + b[i])
);
const pitch = energy.indexOf(Math.max(...energy));
```

### 3. Loudness Analysis
```typescript
// Determine how much to emphasize wubs
const rms = librosa.featureRms({ y });
const avgLoudness = rms.reduce((a, b) => a + b) / rms.length;
const mixFactor = avgLoudness > 0.5 ? 0.3 : 0.8; // Inverse
```

### 4. Sample Time-Stretching
```typescript
// Match sample duration to beat interval
const beatInterval = beat2 - beat1; // seconds
const sampleDuration = sample.length / sr;
const factor = beatInterval / sampleDuration;
const stretched = tempoStretch(sample, factor);
```

### 5. Pitch Transposition
```typescript
// Move sample to match detected key
const currentKey = detectKey(segment);
const targetKey = keys[index % 12];
const semitones = (targetKey - currentKey + 12) % 12;
const transposed = pitchShift(sample, semitones);
```

---

## 🚀 Deployment Checklist

### Pre-Deployment
- [ ] All tests passing
- [ ] Build succeeds (`npm run build`)
- [ ] No TypeScript errors
- [ ] Environment variables set
- [ ] Sample files in `/public/samples/`
- [ ] Audio library versions compatible
- [ ] Rate limiting configured
- [ ] Error tracking (Sentry) configured
- [ ] Analytics enabled

### Vercel Deployment
```bash
# Connect GitHub repo
vercel link

# Deploy to staging
vercel deploy --prod

# Monitor
vercel logs
vercel analytics
```

### Environment Variables (.env.local)
```
NEXT_PUBLIC_APP_URL=https://yourdomain.com
NEXT_PUBLIC_REMIX_TIMEOUT=600
NEXT_PUBLIC_MAX_CONCURRENT=4
NEXT_PUBLIC_MAX_FILE_SIZE=52428800

DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SENTRY_DSN=https://...
VERCEL_BLOB_WRITE_TOKEN=...
```

### Post-Deployment
- [ ] Test upload workflow
- [ ] Monitor remix performance
- [ ] Check error tracking
- [ ] Verify storage cleanup
- [ ] Load test with concurrent remixes
- [ ] Test across browsers
- [ ] Verify sample playback quality

---

## 📊 Performance Targets

| Metric | Target | Actual |
|--------|--------|--------|
| Upload (10MB) | < 30s | TBD |
| Dubstep remix (3min song) | < 5min | TBD |
| ElectroHouse remix (3min song) | < 5min | TBD |
| First Contentful Paint | < 2s | TBD |
| Time to Interactive | < 4s | TBD |
| Core Web Vitals (CLS) | < 0.1 | TBD |
| Concurrent remixes | 4+ | TBD |

---

## 🐛 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Audio buffer clipping | Loud samples | Apply -6dB gain before mixing |
| Pitch detection fails | Silent/noise segments | Require SNR > 3dB |
| Beats misaligned | Tempo detection wrong | Use multiple tempo hypotheses |
| Memory overflow | Large file buffers | Implement chunked processing |
| Samples out of sync | Sample rate mismatch | Always resample to 44.1kHz |
| Upload slow | Network | Implement chunked uploads |
| Remix stalls | Browser crash risk | Use Web Workers, add timeouts |

---

## 📈 Monitoring Dashboard Metrics

Track these KPIs:
1. **Remix Success Rate**: remixes_complete / (remixes_complete + remixes_failed)
2. **Avg Remix Time**: Duration for typical 3-min song
3. **Queue Depth**: Items waiting to be processed
4. **Concurrent Remixes**: Active remixes at any time
5. **Storage Used**: Total bytes of output + uploads
6. **Error Rate**: Errors per hour
7. **User Satisfaction**: Remix quality feedback
8. **Uptime**: 99.9%+ target

---

## 🔐 Security Best Practices

✅ **Input Validation**
- File size limits (50MB)
- MIME type verification
- File extension whitelist

✅ **Rate Limiting**
- 10 remixes/hour per IP
- 50MB upload/hour per IP
- Implement with Upstash Redis

✅ **Data Privacy**
- Delete files after 7 days
- Use private blob storage
- HTTPS only
- CORS restrictions

✅ **Error Handling**
- Never expose internal paths
- Log errors securely
- Sanitize error messages

---

## 📚 Sample Asset Manifest

### Dubstep Samples
```
samples/dubstep/
├── wubs/ (12 chromatic notes: C, C#, D, D#, E, F, F#, G, G#, A, A#, B)
├── break-ends/ (12 chromatic break endings)
├── splashes/ (11 splash effects)
├── splash-ends/ (4 splash endings)
├── hats.wav (hi-hat layer)
└── intro-eight.wav (8-bar intro)
```

### ElectroHouse Samples
```
samples/electrohouse/
├── body/ (12 chromatic synth notes)
├── splash-ends/ (4 splash endings)
├── intro_16.wav (16-bar intro)
├── beat_0.wav through beat_3.wav (drum hits)
├── splash.wav (impact)
└── build.wav (build-up)
```

**Total**: ~50-60 WAV files, ~30-50MB combined

---

## 🎓 Learning Resources

- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **librosa.ts**: https://github.com/myshell-ai/librosa.ts
- **Tone.js**: https://tonejs.org/
- **Next.js**: https://nextjs.org/docs
- **React 19**: https://react.dev
- **TypeScript**: https://typescriptlang.org

---

## 🤝 Integration Checklist

- [ ] **Audio Analysis**: Librosa.ts working
- [ ] **Web Audio**: AudioContext + decoding functional
- [ ] **Real-time Updates**: SSE or WebSocket connected
- [ ] **File Storage**: Vercel Blob storing files
- [ ] **Database**: Optional, for stats/history
- [ ] **Error Tracking**: Sentry capturing events
- [ ] **Analytics**: Page views and events tracked
- [ ] **Rate Limiting**: Redis queue functional
- [ ] **Notifications**: Toast notifications working
- [ ] **SoundCloud**: OAuth setup (future)

---

## 🚨 Rollout Plan

### Phase 1: Staging (1 week)
- Deploy to staging environment
- Internal testing (remix quality, performance)
- Load testing (simulate 100 concurrent users)
- Cross-browser testing

### Phase 2: Beta (1 week)
- Limited public access (invite-only)
- Monitor error rates and performance
- Gather user feedback
- Fix critical issues

### Phase 3: Production (rolling)
- Gradual rollout (10% → 50% → 100%)
- Monitor all metrics continuously
- Maintain Python version as fallback
- Document all issues and resolutions

### Phase 4: Deprecation (TBD)
- Set sunset date for Python version
- Migrate user data if applicable
- Archive Python codebase

---

## 📞 Support & Troubleshooting

### Debug Mode
```typescript
// Enable debug logging
localStorage.setItem('DEBUG_REMIX', 'true');

// Check remix progress
window.remixStore.getState().jobs;
```

### Common Commands
```bash
# Dev server
npm run dev

# Build check
npm run build

# Type check
npm run type-check

# Run tests
npm test

# Format code
npm run format

# Lint
npm run lint
```

### Getting Help
1. Check browser console for errors
2. Check Sentry dashboard for exceptions
3. Review Vercel logs: `vercel logs`
4. Check performance in DevTools > Performance tab
5. Review Network tab for failed requests

---

## 💡 Advanced Tips

### Optimization
- Cache analyzed audio samples
- Use AudioWorklet for synthesis
- Implement memory pooling
- Batch process multiple jobs
- Lazy-load samples on demand

### Quality
- Increase FFT size for better frequency resolution
- Use multiple beat hypotheses
- Implement crossfading between sections
- Add spectral analysis for better key detection
- Implement A/B testing for remix algorithms

### Scalability
- Deploy on Vercel's Edge Network
- Use API Route caching
- Implement distributed audio processing
- Queue remixes across multiple instances
- Use Redis for inter-process communication

---

**Last Updated**: March 2026  
**Target Go-Live**: 16 weeks from start  
**Maintenance Mode**: Ongoing  

For detailed implementation, see **IMPLEMENTATION_GUIDE.md** and **MIGRATION_STRATEGY.md**.
