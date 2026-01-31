'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Volume2, VolumeX, Download } from 'lucide-react';
import { AudioEngine } from '@/lib/audio/audio-engine';
import { downloadAsMP3OrWav } from '@/lib/audio/audio-export';

interface AudioPlayerProps {
  audioBuffer: AudioBuffer | null;
  audioEngine: AudioEngine | null;
  filename?: string;
  onTimeUpdate?: (time: number) => void;
}

export function AudioPlayer({
  audioBuffer,
  audioEngine,
  filename = 'remix',
  onTimeUpdate,
}: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (audioBuffer) {
      setDuration(audioBuffer.duration);
      setCurrentTime(0);
    }
  }, [audioBuffer]);

  useEffect(() => {
    if (!isPlaying || !audioEngine) return;

    const interval = setInterval(() => {
      const time = audioEngine.getCurrentTime();
      setCurrentTime(time);
      onTimeUpdate?.(time);

      if (time >= duration && duration > 0) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isPlaying, audioEngine, duration, onTimeUpdate]);

  const handlePlayPause = useCallback(() => {
    if (!audioEngine || !audioBuffer) return;

    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      audioEngine.play(audioBuffer);
      setIsPlaying(true);
    }
  }, [isPlaying, audioEngine, audioBuffer]);

  const handleSeek = useCallback(
    (value: number[]) => {
      if (!audioEngine || !audioBuffer) return;

      const newTime = value[0];
      setCurrentTime(newTime);

      if (isPlaying) {
        audioEngine.stop();
        // Create a new buffer starting at the new time (simplified)
        audioEngine.play(audioBuffer);
      }
    },
    [audioEngine, audioBuffer, isPlaying]
  );

  const handleVolumeChange = useCallback((value: number[]) => {
    setVolume(value[0]);
    setIsMuted(value[0] === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
    setVolume(isMuted ? 0.8 : 0);
  }, [isMuted]);

  const handleDownload = useCallback(async () => {
    if (!audioBuffer || !audioEngine) return;

    const audioContext = audioEngine.getContext();
    if (!audioContext) return;

    try {
      await downloadAsMP3OrWav(audioContext, audioBuffer, `${filename}.wav`);
    } catch (error) {
      console.error('Download failed:', error);
    }
  }, [audioBuffer, audioEngine, filename]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="outline"
          onClick={handlePlayPause}
          disabled={!audioBuffer}
          className="h-12 w-12 rounded-full border-primary/50 hover:bg-primary/20 hover:border-primary"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </Button>

        <div className="flex-1 space-y-1">
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            disabled={!audioBuffer}
            className="audio-player-slider"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={toggleMute}
            disabled={!audioBuffer}
            className="h-9 w-9"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[isMuted ? 0 : volume]}
            max={1}
            step={0.01}
            onValueChange={handleVolumeChange}
            disabled={!audioBuffer}
            className="w-24"
          />
        </div>

        <Button
          size="icon"
          variant="outline"
          onClick={handleDownload}
          disabled={!audioBuffer}
          className="h-9 w-9"
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
