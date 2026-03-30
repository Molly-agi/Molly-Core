'use client';

/**
 * Device Orientation Hook
 *
 * Uses phone accelerometer/gyroscope/compass for direction sensing.
 * In focused mode, pointing the phone changes the radar beam direction.
 */

import { useState, useEffect, useCallback } from 'react';

export interface DeviceOrientation {
  /** Compass heading (0-360) */
  alpha: number;
  /** Front-to-back tilt (-180 to 180) */
  beta: number;
  /** Left-to-right tilt (-90 to 90) */
  gamma: number;
  /** Is orientation available? */
  available: boolean;
  /** Has permission been granted? */
  permitted: boolean;
}

export function useDeviceOrientation() {
  const [orientation, setOrientation] = useState<DeviceOrientation>(() => ({
    alpha: 0,
    beta: 0,
    gamma: 0,
    available:
      typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
    permitted: false,
  }));

  const handleOrientation = useCallback((event: DeviceOrientationEvent) => {
    setOrientation({
      alpha: event.alpha || 0,
      beta: event.beta || 0,
      gamma: event.gamma || 0,
      available: true,
      permitted: true,
    });
  }, []);

  const requestPermission = useCallback(async () => {
    // Check if DeviceOrientationEvent.requestPermission exists (iOS 13+)
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (
        DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>;
        }
      ).requestPermission === 'function'
    ) {
      try {
        const permission = await (
          DeviceOrientationEvent as unknown as {
            requestPermission: () => Promise<string>;
          }
        ).requestPermission();
        if (permission === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation);
          setOrientation((prev) => ({ ...prev, permitted: true }));
          return true;
        }
      } catch (error) {
        console.error('Error requesting device orientation permission:', error);
        return false;
      }
    } else {
      // Non-iOS or older iOS - just try to listen
      window.addEventListener('deviceorientation', handleOrientation);
      setOrientation((prev) => ({ ...prev, permitted: true }));
      return true;
    }
    return false;
  }, [handleOrientation]);

  useEffect(() => {
    // Try to auto-start on non-iOS
    if (
      typeof window !== 'undefined' &&
      'DeviceOrientationEvent' in window &&
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (
        DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>;
        }
      ).requestPermission !== 'function'
    ) {
      window.addEventListener('deviceorientation', handleOrientation);
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [handleOrientation]);

  return { orientation, requestPermission };
}

export default useDeviceOrientation;
