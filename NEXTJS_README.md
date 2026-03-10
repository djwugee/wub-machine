# Wub Machine - Next.js GUI

A modern, production-ready Next.js application that transforms the original Python-based Wub Machine into a fully operational web-based remix engine. This application enables users to upload audio tracks and remix them into Dubstep (140 BPM) or Electro House (128 BPM) styles using AI-powered beat detection and audio synthesis.

## Project Structure

```
wub-machine/
├── app/
│   ├── api/                           # Backend API routes
│   │   ├── upload/                    # File upload endpoint
│   │   ├── remix/
│   │   │   ├── dubstep/              # Dubstep remix processor
│   │   │   └── electrohouse/         # Electro House remix processor
│   │   ├── progress/[sessionId]/     # Progress streaming (SSE)
│   │   ├── results/[sessionId]/      # Remix results endpoint
│   │   ├── audio/stream/[sessionId]/ # Audio download endpoint
│   │   └── health/                   # Health check endpoint
│   ├── components/                    # React components
│   │   ├── RemixerCard.tsx           # Remixer style selector
│   │   ├── UploadZone.tsx            # Drag-drop file upload
│   │   ├── AudioPlayer.tsx           # Audio playback widget
│   │   ├── ProgressIndicator.tsx     # Real-time progress tracker
│   │   └── RemixResults.tsx          # Results display & download
│   ├── layout.tsx                    # Root layout with metadata
│   ├── page.tsx                      # Home page
│   └── globals.css                   # Global styles & design tokens
├── lib/
│   ├── audio/
│   │   ├── analyzer.ts               # Beat/key/tempo detection (FFT-based)
│   │   ├── processor.ts              # Dubstep & Electro House processors
│   │   └── sampleManager.ts          # Audio sample loading & caching
│   ├── server/
│   │   ├── sessionManager.ts         # Session state management
│   │   └── errorHandler.ts           # Centralized error handling
│   ├── store.ts                      # Zustand state management
│   ├── api-client.ts                 # API client with SSE support
│   └── validation.ts                 # Input validation schemas (Zod)
├── workers/
│   └── audioProcessor.ts             # Web Worker for background processing
├── public/
│   ├── samples/                      # Audio sample assets
│   │   ├── dubstep/                 # Dubstep samples
│   │   └── electrohouse/            # Electro House samples
│   └── ...                          # Static assets
├── scripts/
│   └── sync-samples.js              # Sample asset synchronization script
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript configuration
├── next.config.js                    # Next.js configuration
├── tailwind.config.ts                # Tailwind CSS configuration
├── vercel.json                       # Vercel deployment config
└── .env.example                      # Environment variables template
```

## Key Features

### Frontend
- **Modern UI**: Built with React 19 and Tailwind CSS
- **Drag-and-Drop Upload**: Intuitive file upload with validation
- **Real-Time Progress**: Server-Sent Events (SSE) for live progress updates
- **Audio Playback**: WaveSurfer.js integration for result preview
- **Responsive Design**: Mobile-first, works on all devices
- **Dark Mode Support**: Theme-aware design with Tailwind CSS

### Backend
- **RESTful API**: Modular endpoint structure with proper HTTP semantics
- **Session Management**: In-memory session storage with automatic cleanup
- **Error Handling**: Centralized error handling with typed error responses
- **Input Validation**: Zod-based validation for all inputs
- **Server-Sent Events**: Real-time progress streaming without polling
- **Serverless**: Vercel serverless function integration

### Audio Processing
- **Beat Detection**: FFT-based spectral flux onset detection
- **Key Detection**: Chromatic energy histogram method
- **Tempo Estimation**: BPM calculation from inter-beat intervals
- **Audio Synthesis**: Real-time waveform generation for remixes
- **Web Worker Integration**: Background processing without UI blocking
- **Sample Management**: Lazy loading and in-memory caching

### Remixers
- **Dubstep (140 BPM)**: Wobble bass synthesis with aggressive breakdowns
- **Electro House (128 BPM)**: Driving basslines with energetic hi-hats

## Getting Started

### Prerequisites
- Node.js 18+ and npm/pnpm/yarn/bun
- 4GB RAM minimum for audio processing
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# Clone the repository
git clone https://github.com/djwugee/wub-machine.git
cd wub-machine

# Install dependencies
npm install
# or: pnpm install, yarn install, bun install

# Synchronize sample assets from Python project
npm run sync-samples

# Create environment file
cp .env.example .env.local
```

### Development

```bash
# Start development server
npm run dev

# Open http://localhost:3000 in your browser

# Build for production
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

## Environment Variables

Create a `.env.local` file:

```env
# Application
NEXT_PUBLIC_APP_NAME=Wub Machine
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000

# Sentry Error Tracking (Optional)
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_ERROR_TRACKING=true

# Processing Configuration
NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=100
NEXT_PUBLIC_SESSION_TIMEOUT_MS=3600000
```

## API Endpoints

### Upload
- **POST** `/api/upload`
  - Upload audio file
  - Returns: `{ sessionId, message }`

### Remix Processing
- **POST** `/api/remix/dubstep` - Start Dubstep remix
- **POST** `/api/remix/electrohouse` - Start Electro House remix
  - Body: `{ sessionId }`
  - Returns: `{ sessionId, message, status }`

### Progress Streaming
- **GET** `/api/progress/[sessionId]` (Server-Sent Events)
  - Stream: `{ status, step, progress, message }`

### Results
- **GET** `/api/results/[sessionId]`
  - Returns: `{ sessionId, duration, metadata }`

### Audio Download
- **GET** `/api/audio/stream/[sessionId]`
  - Streams: WAV audio file

### Health Check
- **GET** `/api/health`
  - Returns: `{ status, version, sessions, uptime }`

## Architecture

### State Management
Uses **Zustand** for lightweight, TypeScript-first state management:
- Remix selection (Dubstep/Electro House)
- Upload progress
- Processing state
- Results storage

### Audio Processing Pipeline
1. **Upload** → File validation & session creation
2. **Analysis** → FFT-based beat, key, tempo detection
3. **Processing** → Audio synthesis & sample placement
4. **Mixing** → Layering and dynamic range control
5. **Export** → WAV file generation & download

### Error Handling
- Centralized error handler with typed error responses
- Zod validation for inputs
- Graceful degradation with user-friendly error messages
- Sentry integration for error tracking (optional)

## Performance Optimization

### Frontend
- Code splitting by route
- Static asset preloading
- Lazy component loading
- CSS-in-JS optimization

### Backend
- Serverless function optimization (max 60s timeout)
- In-memory session storage with TTL
- Efficient FFT computation
- Web Worker thread pooling

### Audio
- Sample caching in memory
- Lazy loading for unused samples
- Optimized buffer management
- Streaming downloads

## Testing

### Manual Testing Checklist
- [ ] Upload valid audio files
- [ ] Verify beat detection accuracy
- [ ] Test both remixer styles
- [ ] Check progress updates in real-time
- [ ] Verify audio download
- [ ] Test error handling (invalid files, large files)
- [ ] Mobile responsiveness
- [ ] Dark mode toggle

### Browser Support
- Chrome 90+
- Firefox 88+
- Safari 15+
- Edge 90+

## Deployment

### Vercel (Recommended)

```bash
# Connect GitHub repository
# Vercel automatically detects Next.js
# Deploy with one click

# Environment variables are managed in Vercel dashboard
```

### Local Deployment

```bash
# Build for production
npm run build

# Start production server
npm start

# Server runs on http://localhost:3000
```

## Advanced Configuration

### Extending Remixers
To add new remixer styles:

1. Create processor class in `lib/audio/processor.ts`
2. Add samples to `public/samples/[style]/`
3. Create API route in `app/api/remix/[style]/route.ts`
4. Add remixer option to `app/components/RemixerCard.tsx`

### Custom Sample Management
Update `lib/audio/sampleManager.ts`:
```typescript
private initializeRegistry(): void {
  this.registry.yournewstyle = [
    { name: 'sample-1', path: '/samples/yournewstyle/sample-1.wav', ... },
    // ... more samples
  ]
}
```

### Monitoring & Analytics
Enable Sentry error tracking:
```env
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
SENTRY_DSN=https://your-dsn-with-secret@sentry.io/project-id
```

## Troubleshooting

### Issue: "Web Audio API not supported"
- Use a modern browser (Chrome 25+, Firefox 26+, Safari 15+)
- Web Audio API requires secure context (HTTPS or localhost)

### Issue: "Sample files not found"
```bash
# Re-sync samples from Python project
npm run sync-samples

# Verify samples exist in public/samples/
ls public/samples/dubstep/
```

### Issue: "Remix processing timeout"
- Default timeout is 60 seconds for serverless functions
- Increase `maxDuration` in API route if needed
- Optimize audio processing algorithm

### Issue: "Session expires"
- Sessions expire after 15 minutes of inactivity
- Check `SESSION_TTL` in `lib/server/sessionManager.ts`

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes and test locally
4. Commit with clear messages: `git commit -m "feat: add new feature"`
5. Push to your fork: `git push origin feature/my-feature`
6. Create a Pull Request

## License

MIT License - See original wub-machine repository for details

## Credits

**Original Wub Machine**: [Peter Sobot](https://github.com/psobot/wub-machine)
**Next.js Migration**: Built with Next.js 16, React 19, and Vercel's serverless platform

## Support

For issues and questions:
1. Check existing GitHub issues
2. Review API documentation in this README
3. Check browser console for error logs
4. Enable Sentry for detailed error tracking

## Roadmap

- [ ] WebGL waveform visualization
- [ ] Real-time audio synthesis preview
- [ ] Custom remixer style creation
- [ ] Remix history & saved presets
- [ ] Social sharing & collaboration
- [ ] Advanced EQ and effects
- [ ] Mobile app (React Native)

---

**Last Updated**: March 2024
**Version**: 1.0.0
**Status**: Production Ready
