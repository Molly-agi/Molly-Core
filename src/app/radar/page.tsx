'use client';

/**
 * WiFi CSI Radar Page
 *
 * Full-screen radar display for presence detection.
 * Access at: /radar
 */

import { useEffect, useState, useMemo } from 'react';
import { WiFiRadar } from '@/components/sensing/WiFiRadar';
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation';

export default function RadarPage() {
  const [radarSize, setRadarSize] = useState(350);
  const { orientation, requestPermission } = useDeviceOrientation();
  const [permissionDismissed, setPermissionDismissed] = useState(false);

  // Responsive sizing
  useEffect(() => {
    const updateSize = () => {
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      setRadarSize(Math.min(minDim - 40, 500));
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Derive permission prompt visibility
  const showPermissionPrompt = useMemo(() => {
    if (permissionDismissed || orientation.permitted) return false;
    if (!orientation.available) return false;
    if (typeof window === 'undefined') return false;
    return (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (
        DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<string>;
        }
      ).requestPermission === 'function'
    );
  }, [orientation.available, orientation.permitted, permissionDismissed]);

  const handlePermissionRequest = async () => {
    const granted = await requestPermission();
    if (granted) {
      setPermissionDismissed(true);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '16px',
        paddingTop: '24px',
      }}
    >
      {/* Header */}
      <div
        style={{
          textAlign: 'center',
          marginBottom: '16px',
          fontFamily: 'monospace',
        }}
      >
        <h1
          style={{
            color: '#0f0',
            fontSize: '24px',
            fontWeight: 'bold',
            margin: 0,
            textShadow: '0 0 10px rgba(0, 255, 0, 0.5)',
          }}
        >
          MOLLY RADAR
        </h1>
        <p style={{ color: '#666', fontSize: '12px', margin: '4px 0 0' }}>
          WiFi CSI Presence Detection System
        </p>
      </div>

      {/* Permission Prompt */}
      {showPermissionPrompt && (
        <div
          style={{
            padding: '16px',
            marginBottom: '16px',
            backgroundColor: '#1a1a1a',
            borderRadius: '8px',
            border: '1px solid #333',
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#fff', fontSize: '14px', marginBottom: '12px' }}>
            Enable device orientation for focused beam control?
          </p>
          <button
            onClick={handlePermissionRequest}
            style={{
              padding: '10px 20px',
              backgroundColor: '#0a3a0a',
              color: '#0f0',
              border: '1px solid #0f0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            ENABLE ORIENTATION
          </button>
        </div>
      )}

      {/* Compass Heading (when in focused mode) */}
      {orientation.permitted && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            marginBottom: '12px',
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#666',
          }}
        >
          <span>
            HEADING:{' '}
            <span style={{ color: '#0f0' }}>
              {Math.round(orientation.alpha)}°
            </span>
          </span>
          <span>
            TILT:{' '}
            <span style={{ color: '#0f0' }}>
              {Math.round(orientation.beta)}°
            </span>
          </span>
        </div>
      )}

      {/* Radar Display */}
      <WiFiRadar
        size={radarSize}
        deviceOrientation={orientation.permitted ? orientation : undefined}
        showControls={true}
        onPowerToggle={(isOn) => {
          console.log('Radar power:', isOn ? 'ON' : 'OFF');
        }}
        onConfigChange={(config) => {
          console.log('Radar config:', config);
        }}
      />

      {/* Footer */}
      <div
        style={{
          marginTop: '16px',
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#444',
        }}
      >
        <p>Point phone to change focused beam direction</p>
        <p style={{ marginTop: '4px' }}>MOLLY-CORE v1.0 | WiFi CSI Detection</p>
      </div>
    </div>
  );
}
