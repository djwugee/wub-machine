"use client";

import { cn } from "@/lib/utils";
import { Waves, Zap } from "lucide-react";
import type { RemixStyle } from "@/lib/audio-engine";

interface RemixSelectorProps {
  onSelect: (style: RemixStyle) => void;
  disabled?: boolean;
}

const REMIX_STYLES = [
  {
    id: "dubstep" as RemixStyle,
    name: "Dubstep",
    description: "Heavy wubs and wobble bass at 140 BPM",
    icon: Waves,
    color: "var(--primary)",
    bgGradient: "from-cyan-500/20 to-blue-600/20",
  },
  {
    id: "electrohouse" as RemixStyle,
    name: "Electro House",
    description: "Driving beats and synth bass at 128 BPM",
    icon: Zap,
    color: "var(--secondary)",
    bgGradient: "from-pink-500/20 to-purple-600/20",
  },
];

export function RemixSelector({ onSelect, disabled }: RemixSelectorProps) {
  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-center mb-6 text-[var(--foreground)]">
        Choose your remix style
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REMIX_STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => onSelect(style.id)}
            disabled={disabled}
            className={cn(
              "relative p-6 rounded-xl text-left transition-all duration-300",
              "bg-[var(--card)] border border-[var(--border)]",
              "hover:border-[var(--primary)] hover:shadow-lg hover:shadow-[var(--primary)]/10",
              "focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div
              className={cn(
                "absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 bg-gradient-to-br",
                style.bgGradient,
                "group-hover:opacity-100"
              )}
            />

            <div className="relative flex items-start gap-4">
              <div
                className="p-3 rounded-lg"
                style={{ backgroundColor: `color-mix(in srgb, ${style.color} 20%, transparent)` }}
              >
                <style.icon
                  className="w-6 h-6"
                  style={{ color: style.color }}
                />
              </div>

              <div className="flex-1">
                <h3 className="text-lg font-semibold text-[var(--foreground)]">
                  {style.name}
                </h3>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                  {style.description}
                </p>
              </div>
            </div>

            <div
              className="absolute bottom-0 left-0 right-0 h-1 rounded-b-xl opacity-0 transition-opacity duration-300"
              style={{ backgroundColor: style.color }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
