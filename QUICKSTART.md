# Quick Start Guide - Wub Machine Next.js GUI

Get up and running with Wub Machine in 5 minutes.

## Step 1: Clone & Install (2 min)

```bash
# Clone the repository
git clone https://github.com/djwugee/wub-machine.git
cd wub-machine

# Install dependencies
npm install

# Sync sample assets
npm run sync-samples
```

## Step 2: Configure Environment (1 min)

```bash
# Copy environment template
cp .env.example .env.local

# Edit .env.local (optional - defaults work locally)
# NEXT_PUBLIC_API_URL=http://localhost:3000
```

## Step 3: Start Development Server (1 min)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Step 4: Test the App (1 min)

1. Select a remix style (Dubstep or Electro House)
2. Upload a test audio file (MP3, WAV, OGG, FLAC)
3. Click "Start Remix"
4. Watch progress in real-time
5. Download your remix when complete

## What You Get

### Pre-Configured
- Full-stack Next.js application
- React 19 components
- Tailwind CSS styling
- TypeScript throughout
- API routes ready to use
- Real-time progress updates
- Audio player

### Ready to Customize
- Add database integration
- Implement user accounts
- Deploy to Vercel
- Add more remixer styles
- Extend with new features

## Common Commands

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run start           # Start production server
npm run lint            # Check code quality
npm run type-check      # TypeScript verification

# Utilities
npm run sync-samples    # Update sample files
```

## Project Structure Quick Reference

```
app/                    → Frontend & API
├── components/        → React components
├── api/              → Backend endpoints
└── page.tsx          → Home page

lib/                    → Shared utilities
├── audio/            → Audio processing
├── server/           → Server utilities
└── store.ts          → State management

public/                 → Static assets
└── samples/          → Audio samples
```

## Troubleshooting

### Issue: Modules not found
```bash
# Clean install
rm -rf node_modules
npm install
```

### Issue: Port 3000 already in use
```bash
# Use different port
npm run dev -- -p 3001
```

### Issue: Audio samples missing
```bash
# Sync samples again
npm run sync-samples
```

### Issue: TypeScript errors
```bash
# Check types
npm run type-check

# Fix eslint issues
npm run lint
```

## Next Steps

1. **Understand the Code**
   - Read `NEXTJS_README.md`
   - Check `lib/audio/analyzer.ts` for audio processing
   - Review API routes in `app/api/`

2. **Deploy to Vercel**
   - Push to GitHub
   - Import project in Vercel dashboard
   - Add environment variables
   - Deploy with one click

3. **Add Features**
   - User authentication (Supabase, Auth0)
   - Database (PostgreSQL, MongoDB)
   - Remix history
   - Social sharing

4. **Customize**
   - Change colors in `tailwind.config.ts`
   - Add new remixer styles
   - Modify audio processing
   - Extend API with new endpoints

## Key Features

### What Works Now
- Upload audio files (MP3, WAV, OGG, FLAC)
- Analyze beats, key, and tempo
- Generate Dubstep remixes (140 BPM)
- Generate Electro House remixes (128 BPM)
- Real-time progress updates
- Download processed audio
- Responsive mobile UI

### What's Next
- Database integration for history
- User accounts & authentication
- Preset management
- Advanced effects
- WebGL waveform visualization

## Resources

- **Next.js Docs**: https://nextjs.org/docs
- **React Docs**: https://react.dev
- **Tailwind CSS**: https://tailwindcss.com
- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

## Support

- Check error logs in browser console
- Review server logs: `npm run dev` output
- Read full docs: `NEXTJS_README.md`
- Technical details: `IMPLEMENTATION_GUIDE.md`

## API Endpoints Reference

```
POST   /api/upload                          Upload audio
POST   /api/remix/dubstep                   Start Dubstep remix
POST   /api/remix/electrohouse              Start Electro House remix
GET    /api/progress/[sessionId]            Stream progress (SSE)
GET    /api/results/[sessionId]             Get results
GET    /api/audio/stream/[sessionId]        Download audio
GET    /api/health                          Health check
```

## Environment Variables

All optional - defaults work for local development:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SENTRY_DSN=                     # Error tracking
NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=100          # 100MB default
```

---

**Happy Remixing!** 

For detailed information, see [NEXTJS_README.md](NEXTJS_README.md)
