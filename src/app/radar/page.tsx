'use client';

/**
 * WiFi CSI Radar Page
 *
 * Full-screen radar display for presence detection.
 * Access at: /radar
 *
 * Supports two modes:
 * 1. MollyBrowser App: Uses native WiFi/Bluetooth scanning via MollySensing JS interface
 * 2. Server API: Falls back to server-side sensing API
 */

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { WiFiRadar } from '@/components/sensing/WiFiRadar';
import { useDeviceOrientation } from '@/hooks/useDeviceOrientation';

// Declare MollySensing interface from Android app
declare global {
  interface Window {
    MollySensing?: {
      startScanning: (intervalMs?: number) => boolean;
      stopScanning: () => void;
      scan: () => string;
      getResults: () => string;
      isWifiEnabled: () => boolean;
      isBluetoothEnabled: () => boolean;
    };
    onMollySensingUpdate?: (jsonStr: string) => void;
  }
}

interface DetectedTarget {
  id: string;
  distance: number;
  angle: number;
  strength: number;
  type: 'person' | 'device' | 'unknown';
  moving: boolean;
  label?: string;
  lastSeen: number;
}

interface SensingData {
  status: 'active' | 'inactive' | 'calibrating';
  targets: DetectedTarget[];
  stats: {
    mode: string;
    readingsCollected: number;
    uptime: number;
  };
}

interface NativeScanResult {
  networks: Array<{
    ssid: string;
    bssid: string;
    rssi: number;
    frequency: number;
    channel: number;
  }>;
  bluetoothDevices: Array<{
    address: string;
    name: string;
    rssi: number;
    type: string;
  }>;
  networkCount: number;
  deviceCount: number;
}

// Convert native scan results to radar targets
function convertToTargets(data: NativeScanResult): DetectedTarget[] {
  const targets: DetectedTarget[] = [];

  // Convert WiFi networks
  data.networks
    .filter((n) => n.rssi > -80)
    .slice(0, 10)
    .forEach((network, i) => {
      const normalizedRssi = Math.max(0, Math.min(1, (network.rssi + 90) / 60));
      const distance = 1 - normalizedRssi;
      const angle = (i * 36 + network.channel * 15) % 360;

      targets.push({
        id: `wifi_${network.bssid}`,
        distance,
        angle,
        strength: normalizedRssi,
        type: 'device',
        moving: false,
        label: network.ssid || 'Hidden',
        lastSeen: Date.now(),
      });
    });

  // Convert Bluetooth devices
  data.bluetoothDevices
    .filter((d) => d.rssi > -85)
    .forEach((device, i) => {
      const normalizedRssi = Math.max(0, Math.min(1, (device.rssi + 90) / 60));
      const distance = 1 - normalizedRssi;
      const angle = (i * 45 + 22) % 360;

      const isPersonDevice =
        device.type === 'phone' ||
        device.name?.toLowerCase().includes('phone') ||
        device.name?.toLowerCase().includes('watch') ||
        device.name?.toLowerCase().includes('galaxy') ||
        device.name?.toLowerCase().includes('iphone');

      targets.push({
        id: `bt_${device.address}`,
        distance,
        angle,
        strength: normalizedRssi,
        type: isPersonDevice ? 'person' : 'device',
        moving: isPersonDevice,
        label: device.name || 'Unknown',
        lastSeen: Date.now(),
      });
    });

  return targets;
}

export default function RadarPage() {
  const [radarSize, setRadarSize] = useState(350);
  const { orientation, requestPermission } = useDeviceOrientation();
  const [permissionDismissed, setPermissionDismissed] = useState(false);
  const [sensingData, setSensingData] = useState<SensingData | null>(null);
  const [sensingError, setSensingError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [sensingMode, setSensingMode] = useState<
    'native' | 'api' | 'detecting'
  >('detecting');
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check if MollySensing is available (running in MollyBrowser app)
  useEffect(() => {
    const checkNative = () => {
      if (typeof window !== 'undefined' && window.MollySensing) {
        console.log('[Radar] Native MollySensing detected - using phone WiFi');
        setSensingMode('native');
        return true;
      }
      return false;
    };

    // Check immediately and after a short delay (interface might load async)
    if (!checkNative()) {
      setTimeout(() => {
        if (!checkNative()) {
          console.log('[Radar] No native sensing - using server API');
          setSensingMode('api');
        }
      }, 500);
    }

    // Listen for native updates
    window.onMollySensingUpdate = (jsonStr: string) => {
      try {
        const data = JSON.parse(jsonStr) as NativeScanResult;
        const targets = convertToTargets(data);
        setSensingData({
          status: 'active',
          targets,
          stats: {
            mode: 'native-android',
            readingsCollected: data.networkCount + data.deviceCount,
            uptime: Date.now(),
          },
        });
        setSensingError(null);
      } catch (e) {
        console.error('[Radar] Failed to parse native data:', e);
      }
    };

    return () => {
      window.onMollySensingUpdate = undefined;
    };
  }, []);

  // Poll sensing data (native or API)
  const pollSensing = useCallback(async () => {
    if (sensingMode === 'native' && window.MollySensing) {
      // Use native Android scanning
      try {
        const jsonStr = window.MollySensing.getResults();
        const data = JSON.parse(jsonStr) as NativeScanResult;
        const targets = convertToTargets(data);
        setSensingData({
          status: 'active',
          targets,
          stats: {
            mode: 'native-android',
            readingsCollected: data.networkCount + data.deviceCount,
            uptime: Date.now(),
          },
        });
        setSensingError(null);
      } catch (e) {
        setSensingError(`Native scan error: ${e}`);
      }
    } else {
      // Fall back to server API
      try {
        const response = await fetch('/api/sensing/wifi');
        if (response.ok) {
          const data = await response.json();
          setSensingData(data);
          setSensingError(null);
        } else {
          setSensingError(`API error: ${response.status}`);
        }
      } catch (err) {
        setSensingError(`Network error: ${err}`);
      }
    }
  }, [sensingMode]);

  // Start/stop polling when radar is powered on/off
  const handlePowerToggle = useCallback(
    (isOn: boolean) => {
      console.log('Radar power:', isOn ? 'ON' : 'OFF', 'Mode:', sensingMode);
      setIsPolling(isOn);

      if (isOn) {
        // Start scanning
        if (sensingMode === 'native' && window.MollySensing) {
          window.MollySensing.startScanning(1000);
        }
        pollSensing(); // Immediate first poll
      } else {
        // Stop scanning
        if (sensingMode === 'native' && window.MollySensing) {
          window.MollySensing.stopScanning();
        }
      }
    },
    [sensingMode, pollSensing]
  );

  // Polling loop
  useEffect(() => {
    if (!isPolling) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    pollIntervalRef.current = setInterval(pollSensing, 1000);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isPolling, pollSensing]);

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

      {/* Sensing Status */}
      {(sensingData || sensingMode !== 'detecting') && (
        <div
          style={{
            marginBottom: '8px',
            padding: '8px 16px',
            backgroundColor: '#111',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '11px',
            color:
              sensingMode === 'native'
                ? '#0f0'
                : sensingData?.status === 'active'
                  ? '#ff0'
                  : '#666',
          }}
        >
          {sensingMode === 'native'
            ? '📱 NATIVE'
            : sensingMode === 'api'
              ? '☁️ SERVER'
              : '⏳ DETECTING'}{' '}
          |{' '}
          {sensingData ? (
            <>
              TARGETS: {sensingData.targets.length} | READINGS:{' '}
              {sensingData.stats.readingsCollected}
            </>
          ) : (
            'POWER ON to start'
          )}
          {sensingError && (
            <span style={{ color: '#f00' }}> | {sensingError}</span>
          )}
        </div>
      )}

      {/* Radar Display - NOW WITH REAL DATA */}
      <WiFiRadar
        size={radarSize}
        targets={sensingData?.targets} // REAL WiFi targets from API
        deviceOrientation={orientation.permitted ? orientation : undefined}
        showControls={true}
        onPowerToggle={handlePowerToggle}
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
        <p>
          {sensingMode === 'native'
            ? '📱 Using phone WiFi/Bluetooth - REAL DATA'
            : 'Open in MollyBrowser app for real WiFi scanning'}
        </p>
        <p style={{ marginTop: '4px' }}>
          MOLLY-CORE v1.0 |{' '}
          {sensingMode === 'native' ? 'Native Sensing' : 'Server Sensing'}
        </p>
      </div>
    </div>
  );
}
