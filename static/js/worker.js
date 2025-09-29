importScripts('https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia-wasm.web.js');
importScripts('https://cdn.jsdelivr.net/npm/essentia.js@0.1.3/dist/essentia.js-core.js');
importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');

const essentia = new Essentia(EssentiaWASM);
const audioCtx = new AudioContext({ sampleRate: 44100 });

// --- Audio Manipulation Helpers ---
function concatAudioBuffers(buffers) {
    if (!buffers || buffers.filter(b => b).length === 0) return audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    const validBuffers = buffers.filter(b => b);
    let totalLength = validBuffers.reduce((acc, b) => acc + b.length, 0);
    if (totalLength === 0) return audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
    let newBuffer = audioCtx.createBuffer(1, totalLength, audioCtx.sampleRate);
    let offset = 0;
    for (const buffer of validBuffers) {
        newBuffer.copyToChannel(buffer.getChannelData(0), 0, offset);
        offset += buffer.length;
    }
    return newBuffer;
}

async function shiftTempo(audioBuffer, tempoRatio) {
    if (!audioBuffer || tempoRatio === 1) return audioBuffer;
    const newDuration = audioBuffer.duration / tempoRatio;
    if (newDuration === 0) return null;
    const offlineCtx = new OfflineAudioContext(1, Math.ceil(newDuration * audioCtx.sampleRate), audioCtx.sampleRate);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = tempoRatio;
    source.connect(offlineCtx.destination);
    source.start();
    return await offlineCtx.startRendering();
}

async function mixAudio(bufferA, bufferB, mix = 0.5) {
    if (!bufferA || !bufferB) return bufferA || bufferB || null;
    const length = Math.min(bufferA.length, bufferB.length);
    if (length === 0) return null;
    const offlineCtx = new OfflineAudioContext(1, length, audioCtx.sampleRate);

    const sourceA = offlineCtx.createBufferSource();
    sourceA.buffer = bufferA;
    const gainA = offlineCtx.createGain();
    gainA.gain.value = mix;
    sourceA.connect(gainA).connect(offlineCtx.destination);

    const sourceB = offlineCtx.createBufferSource();
    sourceB.buffer = bufferB;
    const gainB = offlineCtx.createGain();
    gainB.gain.value = 1.0 - mix;
    sourceB.connect(gainB).connect(offlineCtx.destination);

    sourceA.start();
    sourceB.start();
    return await offlineCtx.startRendering();
}

function getAudioPiece(audioBuffer, startTime, endTime) {
    const startSample = Math.floor(startTime * audioBuffer.sampleRate);
    const endSample = Math.floor(endTime * audioBuffer.sampleRate);
    const pieceLength = endSample - startSample;
    if (pieceLength <= 0 || startSample >= audioBuffer.length) return null;

    const piece = audioCtx.createBuffer(1, pieceLength, audioCtx.sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    const pieceData = piece.getChannelData(0);
    pieceData.set(channelData.subarray(startSample, endSample));
    return piece;
}

function sumAudioBuffers(buffers) {
    const validBuffers = buffers.filter(b => b);
    if (validBuffers.length === 0) return null;
    const maxLength = Math.max(...validBuffers.map(b => b.length));
    const newBuffer = audioCtx.createBuffer(1, maxLength, audioCtx.sampleRate);
    const outputData = newBuffer.getChannelData(0);

    for (const buffer of validBuffers) {
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
            outputData[i] = (outputData[i] || 0) + channelData[i];
        }
    }
    return newBuffer;
}

// --- Remixers ---
const remixers = {
    Dubstep: {
        // ... (full implementation from previous step)
    },
    ElectroHouse: {
        // ... (full implementation from previous step)
    },
    Beatbox: {
        are_kicks: (features) => features[1] < 30 && features[3] > 50 && features[0] > 30,
        are_snares: (features) => features[0] > 20 && features[1] > 50 && features[1] < 200 && features[2] > 0.3,
        are_hats: (features) => features[0] < 70 && features[1] > 150 && features[2] > 0.4 && features[3] > 40,

        remix: async function(audioBuffer, samples) {
            const audioVector = essentia.arrayToVector(audioBuffer.getChannelData(0));
            const segments = essentia.vectorToArray(essentia.SuperFluxNovelty({audio: audioVector}).onsets);

            const features = segments.map(start => {
                const end = start + 0.1; // 100ms segment
                const piece = getAudioPiece(audioBuffer, start, end);
                if (!piece) return null;
                const vector = essentia.arrayToVector(piece.getChannelData(0));
                const rms = essentia.RMS(vector).rms;
                const centroid = essentia.Centroid(essentia.Spectrum(vector).spectrum).centroid;
                const flatness = essentia.Flatness(essentia.Spectrum(vector).spectrum).flatness;
                const flux = essentia.Flux(essentia.Spectrum(vector).spectrum).flux;
                return { start, features: [rms * 100, centroid / 100, flatness, flux * 100] };
            }).filter(f => f);

            const kicks = features.filter(f => this.are_kicks(f.features));
            const snares = features.filter(f => this.are_snares(f.features));
            const hats = features.filter(f => this.are_hats(f.features));

            const newAudioBuffer = audioCtx.createBuffer(1, audioBuffer.length, audioBuffer.sampleRate);
            const outputData = newAudioBuffer.getChannelData(0);

            const overlaySample = (sample, time) => {
                const startSample = Math.floor(time * audioCtx.sampleRate);
                const sampleData = sample.getChannelData(0);
                for (let i = 0; i < sampleData.length && startSample + i < outputData.length; i++) {
                    outputData[startSample + i] += sampleData[i];
                }
            };

            kicks.forEach(k => overlaySample(samples.kick, k.start));
            snares.forEach(s => overlaySample(samples.snare, s.start));
            hats.forEach(h => overlaySample(samples.hat, h.start));

            return await mixAudio(audioBuffer, newAudioBuffer, 0.5);
        }
    },
    DoubleTime: {
        remix: async (audioBuffer) => {
            self.postMessage({ type: 'progress', payload: { text: 'Shifting tempo...', progress: 0.5 } });
            return await shiftTempo(audioBuffer, 2.0);
        }
    },
    Blank: {
        remix: async (audioBuffer) => {
            self.postMessage({ type: 'progress', payload: { text: 'Copying audio...', progress: 0.5 } });
            return audioBuffer;
        }
    }
};


// --- Main Worker Logic ---
async function loadSamples(style, samples_path) {
    const noteNames = ['c', 'c-sharp', 'd', 'd-sharp', 'e', 'f', 'f-sharp', 'g', 'g-sharp', 'a', 'a-sharp', 'b'];
    let samplePaths = {};

    if (style === 'Dubstep') {
        samplePaths = {
            intro: `${samples_path}dubstep/intro-eight.wav`,
            hats: `${samples_path}dubstep/hats.wav`,
            wubs: noteNames.map(n => `${samples_path}dubstep/wubs/${n.replace('#', '-sharp')}.wav`),
            wub_breaks: noteNames.map(n => `${samples_path}dubstep/break-ends/${n.replace('#', '-sharp')}.wav`),
            splashes: Array.from({length: 11}, (_, i) => `${samples_path}dubstep/splashes/splash_0${i+1}.wav`.replace(/_010/, '_10').replace(/_011/, '_11')),
            splash_ends: Array.from({length: 4}, (_, i) => `${samples_path}dubstep/splash-ends/${i+1}.wav`),
        };
    } else if (style === 'ElectroHouse') {
        samplePaths = {
            intro: `${samples_path}electrohouse/intro_16.wav`,
            body: noteNames.map(n => `${samples_path}electrohouse/body/${n.replace('#', '-sharp')}.wav`),
        };
    } else if (style === 'Beatbox') {
        samplePaths = {
            hat: `${samples_path}beatbox/hat.wav`,
            kick: `${samples_path}beatbox/kick.wav`,
            snare: `${samples_path}beatbox/snare.wav`,
        };
    }

    const samples = {};
    const promises = Object.entries(samplePaths).map(async ([key, pathOrPaths]) => {
        if (Array.isArray(pathOrPaths)) {
            const loaded = await Promise.all(pathOrPaths.map(p => fetch(p).then(res => res.arrayBuffer()).then(ab => audioCtx.decodeAudioData(ab))));
            samples[key] = loaded;
        } else {
            const res = await fetch(pathOrPaths);
            const ab = await res.arrayBuffer();
            samples[key] = await audioCtx.decodeAudioData(ab);
        }
    });
    await Promise.all(promises);
    return samples;
}

async function remix(audioData, style, samples_path) {
    self.postMessage({ type: 'progress', payload: { text: 'Loading samples...', progress: 0.05 } });
    const samples = await loadSamples(style, samples_path);

    self.postMessage({ type: 'progress', payload: { text: 'Decoding audio...', progress: 0.1 } });
    const audioBuffer = await audioCtx.decodeAudioData(audioData);

    let finalRemixBuffer;
    if (remixers[style] && typeof remixers[style].remix === 'function') {
        finalRemixBuffer = await remixers[style].remix(audioBuffer, samples);
    } else {
        // Complex remixers with analysis
        const audioVector = essentia.arrayToVector(audioBuffer.getChannelData(0));
        const rhythm = essentia.RhythmExtractor2013({ audio: audioVector });
        const analysis = {
            beats: essentia.vectorToArray(rhythm.beats_position),
            tempo: rhythm.bpm,
            keyResult: essentia.KeyExtractor({ audio: audioVector }),
            beatPitchData: [], // Populate this
            sections: [] // Populate this
        };
        finalRemixBuffer = await remixers[style].remix(audioBuffer, analysis, samples);
    }

    // ... (MP3 encoding)
}

self.onmessage = (e) => { /* ... */ };