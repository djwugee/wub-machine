'use client';

import { Music2, Zap } from 'lucide-react';
import type { RemixStyle } from '@/types';

interface RemixStyleSelectorProps {
  selectedStyle: RemixStyle;
  onStyleChange: (style: RemixStyle) => void;
  disabled?: boolean;
}

export default function RemixStyleSelector({
  selectedStyle,
  onStyleChange,
  disabled,
}: RemixStyleSelectorProps) {
  const styles: Array<{ id: RemixStyle; label: string; description: string; icon: React.ReactNode }> = [
    {
      id: 'dubstep',
      label: 'Dubstep',
      description: 'Heavy bass drops and wobble effects',
      icon: <Zap className="w-6 h-6" />,
    },
    {
      id: 'electrohouse',
      label: 'Electro House',
      description: 'Uplifting rhythms and synth stabs',
      icon: <Music2 className="w-6 h-6" />,
    },
  ];

  return (
    <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-400/30 rounded-xl p-6">
      <h3 className="text-lg font-semibold mb-4">Choose Remix Style</h3>
      <div className="grid grid-cols-1 gap-3">
        {styles.map((style) => (
          <button
            key={style.id}
            onClick={() => onStyleChange(style.id)}
            disabled={disabled}
            className={`p-4 rounded-lg border-2 transition-all text-left ${
              selectedStyle === style.id
                ? 'border-purple-400 bg-purple-500/20 shadow-lg shadow-purple-500/20'
                : 'border-gray-600/50 hover:border-purple-400/50 bg-gray-900/50 hover:bg-gray-900/80'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-start gap-3">
              <div className="text-purple-400 mt-1">{style.icon}</div>
              <div>
                <p className="font-semibold text-white">{style.label}</p>
                <p className="text-sm text-gray-400">{style.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
