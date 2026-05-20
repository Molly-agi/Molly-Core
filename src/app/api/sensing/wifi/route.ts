/**
 * WiFi Sensing API - Real-time presence detection
 *
 * GET: Returns current WiFi sensing state (networks, bluetooth devices, presence)
 * POST: Control the sensor (start/stop/calibrate)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  WiFiCSISensor,
  getWiFiSensor,
  type PresenceState,
  type WifiNetwork,
  type BluetoothDevice,
} from '@/ai/sensing/wifi-csi-sensing';

interface SensingResponse {
  status: 'active' | 'inactive' | 'calibrating';
  presence: PresenceState;
  networks: WifiNetwork[];
  bluetoothDevices: BluetoothDevice[];
  targets: Array<{
    id: string;
    distance: number;
    angle: number;
    strength: number;
    type: 'person' | 'device' | 'unknown';
    moving: boolean;
    label?: string;
    lastSeen: number;
  }>;
  stats: {
    mode: string;
    readingsCollected: number;
    uptime: number;
  };
}

// Convert WiFi networks and bluetooth devices to radar targets
function generateTargets(
  networks: WifiNetwork[],
  btDevices: BluetoothDevice[],
  presence: PresenceState
): SensingResponse['targets'] {
  const targets: SensingResponse['targets'] = [];
  const now = Date.now();

  // Convert strong WiFi networks to targets (signal-based positioning)
  networks
    .filter((n) => n.rssi > -80) // Only strong signals
    .slice(0, 10)
    .forEach((network, i) => {
      // Convert RSSI to distance (rough approximation)
      // -30 dBm = very close, -90 dBm = far
      const normalizedRssi = Math.max(0, Math.min(1, (network.rssi + 90) / 60));
      const distance = 1 - normalizedRssi; // Closer = stronger signal

      // Distribute networks around the radar
      const angle = (i * 36 + network.channel * 15) % 360;

      targets.push({
        id: `wifi_${network.bssid}`,
        distance,
        angle,
        strength: normalizedRssi,
        type: 'device',
        moving: false,
        label: network.ssid || 'Hidden Network',
        lastSeen: network.lastSeen,
      });
    });

  // Convert Bluetooth devices to targets
  btDevices
    .filter((d) => d.rssi > -85)
    .forEach((device, i) => {
      const normalizedRssi = Math.max(0, Math.min(1, (device.rssi + 90) / 60));
      const distance = 1 - normalizedRssi;
      const angle = (i * 45 + 22) % 360;

      targets.push({
        id: `bt_${device.address}`,
        distance,
        angle,
        strength: normalizedRssi,
        type:
          device.type === 'phone' || device.type === 'wearable'
            ? 'person'
            : 'device',
        moving: device.type === 'phone' || device.type === 'wearable',
        label: device.name || 'Unknown Device',
        lastSeen: device.lastSeen,
      });
    });

  // Add presence detection as a target if detected
  if (presence.detected && presence.confidence > 0.5) {
    targets.push({
      id: 'presence_main',
      distance: 0.3 + Math.random() * 0.2,
      angle: Math.random() * 360,
      strength: presence.confidence,
      type: 'person',
      moving: presence.movement,
      label:
        presence.estimatedCount > 1
          ? `${presence.estimatedCount} people`
          : 'Person',
      lastSeen: now,
    });
  }

  return targets;
}

let sensorInstance: WiFiCSISensor | null = null;

export async function GET(): Promise<NextResponse<SensingResponse>> {
  try {
    // Get or create sensor in android mode (uses real phone WiFi)
    if (!sensorInstance) {
      sensorInstance = getWiFiSensor({
        mode: 'android', // Real WiFi sensing
        sampleRate: 2,
        sensitivity: 0.7,
        calibrationDuration: 3,
      });
    }

    // Start if not running
    if (!sensorInstance.isActive()) {
      await sensorInstance.start();
    }

    const presence = sensorInstance.getPresenceState();
    const networks = sensorInstance.getNearbyNetworks();
    const btDevices = sensorInstance.getBluetoothDevices();
    const stats = sensorInstance.getStats();

    const targets = generateTargets(networks, btDevices, presence);

    return NextResponse.json({
      status: sensorInstance.isActive() ? 'active' : 'inactive',
      presence,
      networks,
      bluetoothDevices: btDevices,
      targets,
      stats: {
        mode: stats.mode,
        readingsCollected: stats.readingsCollected,
        uptime: stats.uptime,
      },
    });
  } catch (error) {
    console.error('[WiFi Sensing API] Error:', error);

    // Return empty state on error
    return NextResponse.json({
      status: 'inactive',
      presence: {
        detected: false,
        confidence: 0,
        estimatedCount: 0,
        movement: false,
        movementIntensity: 0,
        breathingDetected: false,
        activeZones: [],
        lastChange: Date.now(),
        stateDuration: 0,
      },
      networks: [],
      bluetoothDevices: [],
      targets: [],
      stats: {
        mode: 'error',
        readingsCollected: 0,
        uptime: 0,
      },
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { action } = body;

    if (!sensorInstance) {
      sensorInstance = getWiFiSensor({ mode: 'android' });
    }

    switch (action) {
      case 'start':
        await sensorInstance.start();
        return NextResponse.json({ success: true, message: 'Sensor started' });

      case 'stop':
        await sensorInstance.stop();
        return NextResponse.json({ success: true, message: 'Sensor stopped' });

      case 'calibrate':
        await sensorInstance.calibrate();
        return NextResponse.json({
          success: true,
          message: 'Calibration complete',
        });

      default:
        return NextResponse.json(
          { success: false, message: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[WiFi Sensing API] POST Error:', error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}
