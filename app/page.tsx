'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, Play, Download, Loader } from 'lucide-react';
import AudioUploadZone from '@/components/AudioUploadZone';
import RemixStyleSelector from '@/components/RemixStyleSelector';
import ProgressTracker from '@/components/ProgressTracker';
import AudioPlayer from '@/components/AudioPlayer';
import { useWasm } from '@/lib/useWasm';
import type { RemixStyle } from '@/types';

export default function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [remixStyle, setRemixStyle] = useState<RemixStyle>('dubstep');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [remixProgress, setRemixProgress] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [remixedAudio, setRemixedAudio] = useState<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wasmRef = useWasm();

  // Handle audio file upload
  const handleFileUpload = async (file: File) => {
    try {
      setError(null);
      setAudioFile(file);
      setIsAnalyzing(true);
      setAnalysisResult(null);
      setRemixedAudio(null);

      // Decode audio file
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // Convert to mono
      const monoAudio = audioBuffer.getChannelData(0);
      const monoArray = Array.from(monoAudio);

      // Analyze with WASM
      const wasm = await wasmRef.current;
      if (wasm) {
        wasm.load_audio(monoArray);
        wasm.analyze();

        const analysis = JSON.parse(wasm.get_analysis_json());
        setAnalysisResult({
          tempo: wasm.get_tempo(),
          beats: wasm.get_beats(),
          duration: wasm.get_duration(),
          details: analysis,
        });

        console.log('[v0] Analysis complete:', {
          tempo: wasm.get_tempo(),
          beatCount: wasm.get_beats().length,
          duration: wasm.get_duration(),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze audio';
      setError(message);
      console.error('[v0] Analysis error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Handle remix generation
  const handleStartRemix = async () => {
    if (!audioFile || !analysisResult || !wasmRef.current.current) {
      setError('Please upload and analyze an audio file first');
      return;
    }

    try {
      setError(null);
      setIsRemixing(true);
      setRemixProgress(0);

      const wasm = await wasmRef.current;

      // Simulate remix with progress updates
      for (let i = 0; i <= 100; i += 10) {
        setRemixProgress(i);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Perform actual remix
      let remixedData: Float32Array;

      if (remixStyle === 'dubstep') {
        remixedData = wasm.remix_dubstep();
      } else {
        remixedData = wasm.remix_electrohouse();
      }

      setRemixedAudio(remixedData);
      setRemixProgress(100);

      console.log('[v0] Remix complete:', {
        style: remixStyle,
        outputLength: remixedData.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Remix failed';
      setError(message);
      console.error('[v0] Remix error:', err);
    } finally {
      setIsRemixing(false);
    }
  };

  // Handle download
  const handleDownload = async () => {
    if (!remixedAudio || !audioFile) return;

    try {
      // Create WAV file
      const sampleRate = 44100;
      const wav = encodeWav(remixedAudio, sampleRate);
      const blob = new Blob([wav], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);

      // Download
      const a = document.createElement('a');
      a.href = url;
      const baseName = audioFile.name.replace(/\.[^/.]+$/, '');
      a.download = `${baseName}-${remixStyle}.wav`;
      a.click();

      URL.revokeObjectURL(url);
      console.log('[v0] Download initiated:', a.download);
    } catch (err) {
      console.error('[v0] Download error:', err);
      setError('Failed to download remix');
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-black text-white">
      {/* Header */}
      <header className="border-b border-purple-500/20 bg-black/40 backdrop-blur-lg">
        <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
          <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
            Wub Machine
          </h1>
          <p className="text-purple-300/80 text-lg">
            Transform your music into stunning remixes—entirely in your browser
          </p>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 gap-8">
          {/* Upload Section */}
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-400/30 rounded-xl p-8">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <Upload className="w-6 h-6" />
                Upload Your Track
              </h2>
              <AudioUploadZone onFileSelect={handleFileUpload} isLoading={isAnalyzing} />
            </div>

            {/* Analysis Results */}
            {analysisResult && (
              <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-400/30 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Analysis Results</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Tempo:</span>
                    <span className="text-white font-semibold">
                      {analysisResult.tempo.toFixed(1)} BPM
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Duration:</span>
                    <span className="text-white font-semibold">
                      {analysisResult.duration.toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Beats Detected:</span>
                    <span className="text-white font-semibold">
                      {analysisResult.beats.length}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Remix Section */}
          <div className="space-y-6">
            {/* Style Selector */}
            <RemixStyleSelector
              selectedStyle={remixStyle}
              onStyleChange={setRemixStyle}
              disabled={!analysisResult || isRemixing}
            />

            {/* Remix Button */}
            <button
              onClick={handleStartRemix}
              disabled={!analysisResult || isRemixing || isAnalyzing}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-lg transition-all duration-300 flex items-center justify-center gap-2"
            >
              {isRemixing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Remixing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Generate Remix
                </>
              )}
            </button>

            {/* Progress Tracker */}
            {isRemixing && (
              <ProgressTracker progress={remixProgress} style={remixStyle} />
            )}

            {/* Audio Player */}
            {remixedAudio && (
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-400/30 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Remixed Audio</h3>
                <AudioPlayer audioData={remixedAudio} sampleRate={44100} />
                <button
                  onClick={handleDownload}
                  className="w-full mt-4 py-3 px-4 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download Remix
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/// Helper function to encode WAV file
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;

  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const setUint32 = (offset: number, value: number) => {
    view.setUint32(offset, value, true);
  };
  const setUint16 = (offset: number, value: number) => {
    view.setUint16(offset, value, true);
  };

  setUint32(0, 0x46464952); // "RIFF"
  setUint32(4, 36 + dataSize);
  setUint32(8, 0x45564157); // "WAVE"
  setUint32(12, 0x20746d66); // "fmt "
  setUint32(16, 16); // Subchunk1Size
  setUint16(20, 1); // AudioFormat (PCM)
  setUint16(22, numChannels);
  setUint32(24, sampleRate);
  setUint32(28, byteRate);
  setUint16(32, blockAlign);
  setUint16(34, bitsPerSample);
  setUint32(36, 0x61746164); // "data"
  setUint32(40, dataSize);

  // Write PCM data
  let index = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    index += 2;
  }

  return buffer;
}
