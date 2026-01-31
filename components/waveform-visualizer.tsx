'use client';

import { useEffect, useRef, useState } from 'react';

interface WaveformVisualizerProps {
  audioBuffer: AudioBuffer | null;
  currentTime?: number;
  beats?: number[];
  className?: string;
}

export function WaveformVisualizer({
  audioBuffer,
  currentTime = 0,
  beats = [],
  className = '',
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current || dimensions.width === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions
    canvas.width = dimensions.width * 2; // 2x for retina
    canvas.height = dimensions.height * 2;
    ctx.scale(2, 2);

    // Clear canvas
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    // Get audio data
    const channelData = audioBuffer.getChannelData(0);
    const duration = audioBuffer.duration;
    const samplesPerPixel = Math.floor(channelData.length / dimensions.width);

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = 'hsl(158, 100%, 45%)'; // Primary color
    ctx.lineWidth = 1.5;

    for (let x = 0; x < dimensions.width; x++) {
      const start = Math.floor(x * samplesPerPixel);
      const end = Math.floor((x + 1) * samplesPerPixel);

      let min = 1;
      let max = -1;

      for (let i = start; i < end && i < channelData.length; i++) {
        const sample = channelData[i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      const yMin = ((1 - min) / 2) * dimensions.height;
      const yMax = ((1 - max) / 2) * dimensions.height;

      if (x === 0) {
        ctx.moveTo(x, dimensions.height / 2);
      }

      ctx.lineTo(x, yMax);
      ctx.lineTo(x, yMin);
    }

    ctx.stroke();

    // Draw beats
    if (beats.length > 0) {
      ctx.strokeStyle = 'hsl(281, 100%, 60%)'; // Accent color
      ctx.lineWidth = 1;

      for (const beat of beats) {
        const x = (beat / duration) * dimensions.width;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, dimensions.height);
        ctx.stroke();
      }
    }

    // Draw playhead
    if (currentTime > 0 && duration > 0) {
      const playheadX = (currentTime / duration) * dimensions.width;

      ctx.strokeStyle = 'hsl(0, 0%, 98%)'; // Foreground color
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, dimensions.height);
      ctx.stroke();

      // Glow effect
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'hsl(158, 100%, 45%)';
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }, [audioBuffer, dimensions, currentTime, beats]);

  return (
    <div ref={containerRef} className={`waveform-container ${className}`}>
      <canvas
        ref={canvasRef}
        className="waveform-canvas"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
