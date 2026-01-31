'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Zap, Music2 } from 'lucide-react';

export interface RemixSettings {
  style: 'dubstep' | 'electrohouse';
  intensity: number;
  preserveVocals: boolean;
  additionalEffects: boolean;
}

interface RemixControlsProps {
  settings: RemixSettings;
  onChange: (settings: RemixSettings) => void;
  onRemix: () => void;
  disabled?: boolean;
  isProcessing?: boolean;
}

export function RemixControls({
  settings,
  onChange,
  onRemix,
  disabled,
  isProcessing,
}: RemixControlsProps) {
  return (
    <Card className="glass-card border-primary/20">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Remix Settings
        </CardTitle>
        <CardDescription>
          Customize your remix style and parameters
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Style Selection */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Remix Style</Label>
          <RadioGroup
            value={settings.style}
            onValueChange={(value) =>
              onChange({ ...settings, style: value as 'dubstep' | 'electrohouse' })
            }
            disabled={disabled}
            className="grid grid-cols-2 gap-4"
          >
            <div>
              <RadioGroupItem
                value="dubstep"
                id="dubstep"
                className="peer sr-only"
              />
              <Label
                htmlFor="dubstep"
                className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 cursor-pointer transition-all"
              >
                <Music2 className="h-8 w-8 mb-3" />
                <div className="text-center space-y-1">
                  <div className="font-semibold">Dubstep</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Heavy wobble bass, half-time drums, dramatic drops
                  </div>
                </div>
              </Label>
            </div>
            <div>
              <RadioGroupItem
                value="electrohouse"
                id="electrohouse"
                className="peer sr-only"
              />
              <Label
                htmlFor="electrohouse"
                className="flex flex-col items-center justify-between rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 cursor-pointer transition-all"
              >
                <Zap className="h-8 w-8 mb-3" />
                <div className="text-center space-y-1">
                  <div className="font-semibold">Electro House</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Four-on-the-floor beats, synth layers, progressive builds
                  </div>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>

        {/* Intensity */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <Label className="text-base font-semibold">Intensity</Label>
            <span className="text-sm text-muted-foreground">
              {Math.round(settings.intensity * 100)}%
            </span>
          </div>
          <Slider
            value={[settings.intensity]}
            onValueChange={(value) =>
              onChange({ ...settings, intensity: value[0] })
            }
            min={0}
            max={1}
            step={0.01}
            disabled={disabled}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">
            How aggressively to remix the original track
          </p>
        </div>

        {/* Preserve Vocals */}
        <div className="flex items-center justify-between space-x-2 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="preserve-vocals" className="text-base font-semibold cursor-pointer">
              Preserve Vocals
            </Label>
            <p className="text-xs text-muted-foreground">
              Keep vocal elements from the original track
            </p>
          </div>
          <Switch
            id="preserve-vocals"
            checked={settings.preserveVocals}
            onCheckedChange={(checked) =>
              onChange({ ...settings, preserveVocals: checked })
            }
            disabled={disabled}
          />
        </div>

        {/* Additional Effects */}
        <div className="flex items-center justify-between space-x-2 py-2">
          <div className="space-y-0.5">
            <Label htmlFor="additional-effects" className="text-base font-semibold cursor-pointer">
              Additional Effects
            </Label>
            <p className="text-xs text-muted-foreground">
              Add extra sonic elements and variations
            </p>
          </div>
          <Switch
            id="additional-effects"
            checked={settings.additionalEffects}
            onCheckedChange={(checked) =>
              onChange({ ...settings, additionalEffects: checked })
            }
            disabled={disabled}
          />
        </div>

        {/* Remix Button */}
        <Button
          onClick={onRemix}
          disabled={disabled || isProcessing}
          className="w-full h-12 text-lg font-semibold bg-primary hover:bg-primary/90"
        >
          {isProcessing ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full mr-3" />
              Processing Remix...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5 mr-2" />
              Generate Remix
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
