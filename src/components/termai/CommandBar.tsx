/**
 * @fileOverview CommandBar — Bottom controls for the Terminal interface.
 *
 * Contains the manual purge button, risk mode toggle, voice controls,
 * clear history button, voice status indicator, and the command input form.
 *
 * Extracted from Terminal.tsx during Phase 6 hardening.
 */

'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Trash2, Volume2, VolumeX, Shield, Zap } from 'lucide-react';

interface CommandBarProps {
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  isLoading: boolean;
  isIntroducing: boolean;
  isRiskMode: boolean;
  onRiskModeChange: (value: boolean) => void;
  isVocal: boolean;
  onToggleVocal: () => void;
  isVocalizing: boolean;
  autoplayBlocked: boolean;
  onClearHistory: () => void;
}

export function CommandBar({
  command,
  onCommandChange,
  onSubmit,
  isLoading,
  isIntroducing,
  isRiskMode,
  onRiskModeChange,
  isVocal,
  onToggleVocal,
  isVocalizing,
  autoplayBlocked,
  onClearHistory,
}: CommandBarProps) {
  return (
    <>
      <div className="flex flex-col gap-4 mb-4 bg-secondary/10 p-4 rounded-xl border border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="flex items-center space-x-3 px-4">
            <Switch
              id="risk-mode"
              checked={isRiskMode}
              onCheckedChange={onRiskModeChange}
              className="data-[state=checked]:bg-purple-500"
            />
            <Label
              htmlFor="risk-mode"
              className="text-[10px] uppercase font-black tracking-[0.2em] flex items-center gap-2 cursor-pointer text-muted-foreground"
            >
              {isRiskMode ? (
                <Zap className="size-3 text-purple-400" />
              ) : (
                <Shield className="size-3 text-primary" />
              )}
              {isRiskMode ? 'SuperUser' : 'Standard'}
            </Label>
          </div>
        </div>

        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleVocal}
              className={cn(isVocalizing && 'animate-pulse')}
            >
              {isVocal ? (
                <Volume2 className="size-4 text-primary" />
              ) : (
                <VolumeX className="size-4 text-muted-foreground" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearHistory}
              className="text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-tighter flex items-center gap-2">
            {autoplayBlocked
              ? 'Tap to enable voice'
              : isVocalizing
                ? 'Vocalizing...'
                : 'Cords Ready'}
            <span
              className={cn(
                'size-1 rounded-full',
                autoplayBlocked
                  ? 'bg-yellow-400 animate-pulse'
                  : isVocalizing
                    ? 'bg-accent animate-ping'
                    : 'bg-green-500'
              )}
            />
          </div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="relative mt-auto">
        <Input
          value={command}
          onChange={(e) => onCommandChange(e.target.value)}
          placeholder="Enter command..."
          className="w-full bg-secondary/20 h-14 px-6 rounded-xl border-white/5"
          disabled={isLoading || isIntroducing}
        />
      </form>
    </>
  );
}
