'use client';

import { useState, useEffect, useRef } from 'react';
import { Play, Pause, Volume2, Volume1, VolumeX } from 'lucide-react';

interface AudioPlayerProps {
  audioData: Float32Array;
  sampleRate: number;
}

export default function AudioPlayer({ audioData, sampleRate }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initialize audio context and buffer
  useEffect(() => {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    audioContextRef.current = ctx;

    const buffer = ctx.createBuffer(1, audioData.length, sampleRate);
    const channelData = buffer.getChannelData(0);
    channelData.set(audioData);
    audioBufferRef.current = buffer;

    setDuration(buffer.duration);

    return () => {
      if (isPlaying) {
        ctx.suspend();
      }
    };
  }, [audioData, sampleRate]);

  const handlePlayPause = () => {
    if (!audioContextRef.current || !audioBufferRef.current) return;

    if (isPlaying) {
      // Stop playback
      sourceRef.current?.stop();
      sourceRef.current = null;
      setIsPlaying(false);
    } else {
      // Start playback
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferRef.current;

      const gainNode = audioContextRef.current.createGain();
      gainNode.gain.value = volume / 100;

      source.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);

      source.start(0, currentTime);
      sourceRef.current = source;
      gainNodeRef.current = gainNode;

      setIsPlaying(true);

      // Track playback position
      const updateTimer = setInterval(() => {
        if (audioContextRef.current) {
          const elapsed = audioContextRef.current.currentTime;
          const newTime = (elapsed * sampleRate) / audioData.length;

          if (newTime >= duration) {
            setIsPlaying(false);
            setCurrentTime(0);
            sourceRef.current?.stop();
            sourceRef.current = null;
            clearInterval(updateTimer);
          } else {
            setCurrentTime(Math.min(newTime, duration));
          }
        }
      }, 100);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value, 10);
    setVolume(newVolume);

    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = newVolume / 100;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * duration;

    setCurrentTime(newTime);

    if (isPlaying) {
      sourceRef.current?.stop();
      handlePlayPause(); // Restart from new position
      setTimeout(handlePlayPause, 50);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getVolumeIcon = () => {
    if (volume === 0) return <VolumeX className="w-4 h-4" />;
    if (volume < 50) return <Volume1 className="w-4 h-4" />;
    return <Volume2 className="w-4 h-4" />;
  };

  return (
    <div className="space-y-3">
      {/* Play Controls */}
      <button
        onClick={handlePlayPause}
        className="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2"
      >
        {isPlaying ? (
          <>
            <Pause className="w-5 h-5" />
            Pause
          </>
        ) : (
          <>
            <Play className="w-5 h-5" />
            Play
          </>
        )}
      </button>

      {/* Timeline */}
      <div className="space-y-1">
        <div
          onClick={handleTimelineClick}
          className="w-full bg-gray-800 rounded-full h-2 cursor-pointer hover:bg-gray-700 transition-colors"
        >
          <div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all"
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-400">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-2">
        <div className="text-gray-400">{getVolumeIcon()}</div>
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={handleVolumeChange}
          className="flex-1 h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
        <span className="text-xs text-gray-400 w-8">{volume}%</span>
      </div>
    </div>
  );
}
