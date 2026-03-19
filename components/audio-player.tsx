"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Download, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  audioUrl: string;
  fileName: string;
  onReset: () => void;
}

export function AudioPlayer({ audioUrl, fileName, onReset }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Format time in mm:ss
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Initialize audio analyzer for visualization
  useEffect(() => {
    if (!audioRef.current || !canvasRef.current) return;

    const audio = audioRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const initAnalyser = () => {
      if (audioContextRef.current) return;

      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;

      const source = audioContextRef.current.createMediaElementSource(audio);
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
    };

    const draw = () => {
      if (!analyserRef.current || !ctx) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;

      ctx.fillStyle = "rgba(17, 17, 17, 0.3)";
      ctx.fillRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height;

        // Create gradient from primary to secondary color
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, "#00d4ff");
        gradient.addColorStop(0.5, "#7c3aed");
        gradient.addColorStop(1, "#ff00aa");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    audio.addEventListener("play", () => {
      initAnalyser();
      if (audioContextRef.current?.state === "suspended") {
        audioContextRef.current.resume();
      }
      draw();
    });

    audio.addEventListener("pause", () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Handle time updates
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.volume = volume || 1;
      setIsMuted(false);
    } else {
      audio.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const handleDownload = useCallback(() => {
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = fileName.replace(/\.[^/.]+$/, "") + "_wub_remix.wav";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioUrl, fileName]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-[var(--card)] rounded-2xl p-6 border border-[var(--border)] wub-glow">
        <audio ref={audioRef} src={audioUrl} />

        {/* Visualization */}
        <div className="waveform-container mb-6 h-32">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            width={600}
            height={128}
          />
        </div>

        {/* Track info */}
        <div className="mb-4 text-center">
          <h3 className="text-lg font-semibold text-[var(--foreground)] truncate">
            {fileName.replace(/\.[^/.]+$/, "")} (Wub Machine Remix)
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Your remix is ready!
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-[var(--muted)]"
            style={{
              background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${
                (currentTime / duration) * 100
              }%, var(--muted) ${(currentTime / duration) * 100}%, var(--muted) 100%)`,
            }}
          />
          <div className="flex justify-between text-xs text-[var(--muted-foreground)] mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {/* Volume */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 rounded-full appearance-none cursor-pointer bg-[var(--muted)]"
            />
          </div>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className={cn(
              "p-4 rounded-full transition-all duration-300",
              "bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]",
              "hover:shadow-lg hover:shadow-[var(--primary)]/30 hover:scale-105",
              "text-[var(--primary-foreground)]"
            )}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6 ml-0.5" />
            )}
          </button>

          {/* Download & Reset */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              title="Download remix"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onReset}
              className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
              title="Create another remix"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
