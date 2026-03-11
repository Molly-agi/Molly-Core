'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface PurgeButtonProps {
  onManualHeal: () => void;
  isLoading: boolean;
}

/**
 * Manual Purge button — lives at the top of the Terminal view.
 * Requires a confirm tap to avoid accidental triggers on mobile.
 */
export function PurgeButton({ onManualHeal, isLoading }: PurgeButtonProps) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleClick = () => {
    if (armed) {
      // Second tap — fire it
      setArmed(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      onManualHeal();
    } else {
      // First tap — arm with 3s window
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), 3000);
    }
  };

  return (
    <div className="flex justify-end px-2 py-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isLoading}
        className={
          armed
            ? 'h-8 gap-2 font-bold uppercase text-[10px] tracking-widest border-red-500/50 text-red-400 animate-pulse'
            : 'h-8 gap-2 font-bold uppercase text-[10px] tracking-widest border-green-500/30 text-green-400'
        }
      >
        <RefreshCw className="size-3" />
        {armed ? 'Tap again to confirm' : 'Manual Purge'}
      </Button>
    </div>
  );
}
