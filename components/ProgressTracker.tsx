'use client';

import type { RemixStyle } from '@/types';

interface ProgressTrackerProps {
  progress: number;
  style: RemixStyle;
}

export default function ProgressTracker({ progress, style }: ProgressTrackerProps) {
  const stages = [
    { name: 'Analyzing', min: 0, max: 20 },
    { name: 'Processing', min: 20, max: 40 },
    { name: 'Detecting Beats', min: 40, max: 60 },
    { name: 'Applying Effects', min: 60, max: 80 },
    { name: 'Finalizing', min: 80, max: 100 },
  ];

  const currentStage = stages.find((s) => progress >= s.min && progress < s.max);

  return (
    <div className="bg-gray-900/50 border border-gray-700/50 rounded-xl p-6 space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <p className="text-lg font-semibold text-white">
            {currentStage?.name || 'Completed'}
          </p>
          <p className="text-sm text-gray-400 capitalize">
            {style} remix generation
          </p>
        </div>
        <p className="text-2xl font-bold text-purple-400">{progress}%</p>
      </div>

      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
        <div
          className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-5 gap-2">
        {stages.map((stage, idx) => (
          <div key={stage.name} className="text-center">
            <div
              className={`w-2 h-2 rounded-full mx-auto mb-1 ${
                progress >= stage.max
                  ? 'bg-green-500'
                  : progress >= stage.min
                  ? 'bg-purple-500 animate-pulse'
                  : 'bg-gray-700'
              }`}
            />
            <p className="text-xs text-gray-500">{idx + 1}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
