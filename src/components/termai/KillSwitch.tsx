'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { OctagonX, Play } from 'lucide-react';
import {
  emergencyHalt,
  clearEmergencyHalt,
  getHaltStatus,
} from '@/app/actions/emergency-halt';

/**
 * Emergency Kill Switch — Always visible, cannot be hidden by Molly.
 *
 * This is a hardware-level override that immediately:
 * - Aborts all in-flight operations
 * - Prevents new autonomous actions
 * - Forces Molly into standby
 *
 * The button turns red when halt is active, green to resume.
 */
export function KillSwitch() {
  const [isHalted, setIsHalted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check halt status on mount and periodically
  useEffect(() => {
    const checkStatus = async () => {
      const status = await getHaltStatus();
      setIsHalted(status.active);
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleClick = async () => {
    setIsLoading(true);
    try {
      if (isHalted) {
        await clearEmergencyHalt();
        setIsHalted(false);
      } else {
        await emergencyHalt('Manual kill switch');
        setIsHalted(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={isHalted ? 'default' : 'destructive'}
      size="sm"
      onClick={handleClick}
      disabled={isLoading}
      className={`
        font-bold min-w-[80px]
        ${
          isHalted
            ? 'bg-green-600 hover:bg-green-700 text-white'
            : 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
        }
      `}
      title={isHalted ? 'Resume Molly' : 'EMERGENCY STOP — Halt all operations'}
    >
      {isHalted ? (
        <>
          <Play className="h-4 w-4 mr-1" />
          Resume
        </>
      ) : (
        <>
          <OctagonX className="h-4 w-4 mr-1" />
          STOP
        </>
      )}
    </Button>
  );
}
