# Wub Machine - Quick Start Guide

Get the app running in 5 minutes.

## Step 1: Prerequisites

Make sure you have installed:
- **Node.js 18+** - https://nodejs.org/
- **Rust** - https://rustup.rs/
- **wasm-pack** - `cargo install wasm-pack`

Verify installation:
```bash
node --version        # v18.0.0+
cargo --version       # cargo 1.56+
wasm-pack --version   # wasm-pack 1.3+
```

## Step 2: Clone & Install

```bash
# Clone or download the project
cd wub-machine

# Install dependencies
npm install
```

## Step 3: Build WASM Module

```bash
# Navigate to WASM directory
cd wasm

# Build for production
bash build.sh

# Output goes to: ../public/wasm/

# Return to root
cd ..
```

## Step 4: Start Development Server

```bash
npm run dev
```

Opens at **http://localhost:3000**

## Step 5: Test It Out

1. **Upload Audio** - Drag an MP3 or WAV file into the upload zone
2. **Wait for Analysis** - ~1-2 seconds for beat/tempo detection
3. **Select Style** - Choose Dubstep or ElectroHouse
4. **Generate Remix** - Click "Generate Remix" (~2-3 seconds)
5. **Play & Download** - Listen and download as WAV

## Common Issues

### "WASM module not found"
```bash
# Rebuild WASM
cd wasm && bash build.sh && cd ..

# Verify output exists
ls public/wasm/
```

### "Audio format not supported"
- Use MP3, WAV, M4A, or OGG
- Test with a small file first (1-2 MB)

### Browser tab freezes during analysis
- This is normal for large files
- Processing happens entirely in browser
- Try a shorter audio file (30-60 seconds)

### Storage full
```bash
# Clear IndexedDB cache in DevTools
# Application → IndexedDB → wub-machine → Clear
```

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Run production build locally
npm start

# Type checking
npm run typecheck

# Linting
npm run lint

# WASM tests
cd wasm && cargo test
```

## File Structure (Key Files)

```
├── app/page.tsx              # Main UI
├── components/               # React components
├── lib/                      # Utilities & hooks
├── wasm/                     # Rust code
├── public/wasm/              # Compiled WASM (after build)
└── public/samples/           # Optional sample files
```

## Next Steps

1. **Add Sample Files** (Optional)
   - Create `/public/samples/` directory
   - Add WAV files in `/public/samples/dubstep/` and `/public/samples/electrohouse/`
   - See `/DEPLOYMENT.md` for structure

2. **Deploy to Production**
   ```bash
   npm install -g vercel
   vercel
   ```

3. **Customize Styling**
   - Edit `/app/globals.css`
   - Modify Tailwind in `/tailwind.config.ts`

4. **Add Features**
   - Extend WASM algorithms in `/wasm/src/`
   - Add React components in `/components/`
   - Use hooks from `/lib/`

## Useful Resources

- **WASM Module Docs**: `/wasm/README.md`
- **Deployment Guide**: `/DEPLOYMENT.md`
- **Project Overview**: `/PROJECT_SUMMARY.md`
- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **Rust Book**: https://doc.rust-lang.org/book/

## Quick Debugging

### Check WASM Load
Open browser DevTools Console:
```javascript
// Should see success message
// "[v0] WASM module loaded successfully"
```

### Monitor Audio Analysis
```javascript
// Appears in console during upload
// "[v0] Analysis complete: { tempo: 120.5, beatCount: 120, ... }"
```

### View Cached Projects
```javascript
// In DevTools Console
const db = await getDB();
const projects = await db.getAllProjects();
console.log(projects);
```

## Performance Tips

- Use **Chrome/Edge** for best WebAssembly performance
- Start with **small audio files** (30-60 seconds)
- Close other tabs to free memory
- WASM processing uses **single thread** (normal)

## Security Notes

- **No audio uploaded to servers** - all processing in browser
- **IndexedDB is local-only** - no cloud sync by default
- **Files stored in browser cache** - cleared with browser data

## Getting Help

1. Check console for `[v0]` debug logs
2. Review error messages carefully
3. Verify WASM built successfully
4. Test with sample audio file
5. Try in different browser

---

**Ready to remix?** Start with Step 1 above!

For more details, see `/PROJECT_SUMMARY.md` or `/DEPLOYMENT.md`
