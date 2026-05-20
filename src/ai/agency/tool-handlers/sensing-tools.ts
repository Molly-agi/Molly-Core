/**
 * @fileOverview Sensing Tool Handlers
 *
 * Handles WiFi CSI sensing, Bluetooth scanning, router monitoring,
 * and presence detection for Molly's security system.
 */

import {
  getWiFiSensor,
  resetWiFiSensor,
  checkPresence,
  formatPresenceState,
  type WiFiSensorConfig,
  type RouterConfig,
  type SensingMode,
} from '../../sensing/wifi-csi-sensing';
import type { ToolResult, ToolHandlerMap } from './types';

async function handleWifiSensing(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  switch (action) {
    case 'start': {
      const mode = (params.mode as SensingMode) || 'simulation';
      const sensitivity = (params.sensitivity as number) || 0.5;
      const sampleRate = (params.sampleRate as number) || 10;

      const config: Partial<WiFiSensorConfig> = {
        mode,
        sensitivity,
        sampleRate,
      };

      // Router config if provided
      if (params.routerIp) {
        config.router = {
          ip: params.routerIp as string,
          username: (params.routerUsername as string) || 'admin',
          password: (params.routerPassword as string) || '',
          type: (params.routerType as RouterConfig['type']) || 'generic',
          apiEndpoint: params.routerEndpoint as string | undefined,
          pollInterval: params.pollInterval as number | undefined,
        };
        config.mode = 'router';
      }

      // Known devices
      if (params.knownDevices) {
        config.knownDevices = params.knownDevices as string[];
      }

      const sensor = getWiFiSensor(config);
      await sensor.start();

      return {
        success: true,
        output: `WiFi sensing started in ${sensor.getConfig().mode} mode\nSensitivity: ${sensitivity}\nSample rate: ${sampleRate}Hz`,
      };
    }

    case 'stop': {
      const sensor = getWiFiSensor();
      await sensor.stop();
      return { success: true, output: 'WiFi sensing stopped' };
    }

    case 'status': {
      const sensor = getWiFiSensor();
      const stats = sensor.getStats();
      const presence = sensor.getPresenceState();

      return {
        success: true,
        output: `Mode: ${stats.mode}
Running: ${stats.isRunning}
Calibrated: ${stats.calibrated}
Readings: ${stats.readingsCollected}
Presence: ${presence.detected ? 'DETECTED' : 'None'}
Confidence: ${(presence.confidence * 100).toFixed(0)}%
Est. count: ${presence.estimatedCount}
Movement: ${presence.movement ? 'Yes' : 'No'}`,
      };
    }

    case 'presence': {
      const state = await checkPresence();
      return { success: true, output: formatPresenceState(state) };
    }

    case 'calibrate': {
      const sensor = getWiFiSensor();
      const calibration = await sensor.calibrate();
      return {
        success: true,
        output: `Calibration complete:
Baseline RSSI: ${calibration.baselineRssi.toFixed(1)} dBm
Baseline noise: ${calibration.baselineNoise.toFixed(1)} dBm
Threshold: ${calibration.rssiThreshold.toFixed(2)}`,
      };
    }

    case 'devices': {
      const sensor = getWiFiSensor();
      const devices = sensor.getConnectedDevices();

      if (devices.length === 0) {
        return {
          success: true,
          output: 'No devices detected. Make sure router mode is enabled.',
        };
      }

      const formatted = devices
        .map(
          (d) =>
            `${d.isKnown ? '✓' : '⚠'} ${d.name || d.hostname || d.mac}
   MAC: ${d.mac}
   IP: ${d.ip || 'N/A'}
   Signal: ${d.rssi ? `${d.rssi} dBm` : 'N/A'}
   Band: ${d.connection}
   Type: ${d.deviceType || 'unknown'}
   Vendor: ${d.vendor || 'unknown'}`
        )
        .join('\n\n');

      return {
        success: true,
        output: `Connected Devices (${devices.length}):\n\n${formatted}`,
      };
    }

    case 'unknownDevices': {
      const sensor = getWiFiSensor();
      const devices = sensor.getUnknownDevices();

      if (devices.length === 0) {
        return { success: true, output: 'No unknown devices detected.' };
      }

      const formatted = devices
        .map(
          (d) =>
            `⚠ ${d.name || d.hostname || 'Unknown Device'}
   MAC: ${d.mac}
   IP: ${d.ip || 'N/A'}
   Signal: ${d.rssi ? `${d.rssi} dBm` : 'N/A'}
   Band: ${d.connection}
   First seen: ${new Date(d.firstSeen).toLocaleString()}
   Vendor: ${d.vendor || 'unknown'}`
        )
        .join('\n\n');

      return {
        success: true,
        output: `⚠ UNKNOWN DEVICES (${devices.length}):\n\n${formatted}`,
      };
    }

    case 'registerDevice': {
      const mac = params.mac as string;
      if (!mac) {
        return { success: false, output: 'MAC address required' };
      }

      const sensor = getWiFiSensor();
      sensor.registerKnownDevice(mac);

      return {
        success: true,
        output: `Device registered as known: ${mac}`,
      };
    }

    case 'bluetooth': {
      const sensor = getWiFiSensor();
      const devices = sensor.getBluetoothDevices();

      if (devices.length === 0) {
        return {
          success: true,
          output:
            'No Bluetooth devices detected. Make sure Bluetooth mode is enabled.',
        };
      }

      const formatted = devices
        .map(
          (d) =>
            `${d.isTracked ? '✓' : '•'} ${d.name || 'Unknown'}
   Address: ${d.address}
   RSSI: ${d.rssi} dBm
   Type: ${d.type}
   Last seen: ${new Date(d.lastSeen).toLocaleTimeString()}`
        )
        .join('\n\n');

      return {
        success: true,
        output: `Bluetooth Devices (${devices.length}):\n\n${formatted}`,
      };
    }

    case 'networks': {
      const sensor = getWiFiSensor();
      const networks = sensor.getNearbyNetworks();

      if (networks.length === 0) {
        return { success: true, output: 'No WiFi networks detected.' };
      }

      const sorted = networks.sort((a, b) => b.rssi - a.rssi);
      const formatted = sorted
        .map(
          (n) =>
            `${n.ssid || '[Hidden]'} (${n.rssi} dBm)
   BSSID: ${n.bssid}
   Channel: ${n.channel}
   Freq: ${n.frequency} MHz`
        )
        .join('\n\n');

      return {
        success: true,
        output: `Nearby Networks (${networks.length}):\n\n${formatted}`,
      };
    }

    case 'readings': {
      const count = (params.count as number) || 20;
      const sensor = getWiFiSensor();
      const readings = sensor.getReadings(count);

      if (readings.length === 0) {
        return {
          success: true,
          output: 'No readings yet. Start sensing first.',
        };
      }

      const formatted = readings
        .slice(-10)
        .map(
          (r) =>
            `[${new Date(r.timestamp).toLocaleTimeString()}] RSSI: ${r.rssi.toFixed(1)} dBm | Quality: ${r.quality.toFixed(0)}% | Source: ${r.source}`
        )
        .join('\n');

      return {
        success: true,
        output: `Recent Readings (last 10 of ${readings.length}):\n\n${formatted}`,
      };
    }

    case 'reset': {
      resetWiFiSensor();
      return { success: true, output: 'WiFi sensor reset' };
    }

    case 'configureRouter': {
      const ip = params.ip as string;
      const username = (params.username as string) || 'admin';
      const password = params.password as string;
      const type = (params.type as RouterConfig['type']) || 'generic';

      if (!ip || !password) {
        return { success: false, output: 'Router IP and password required' };
      }

      const config: Partial<WiFiSensorConfig> = {
        mode: 'router',
        router: {
          ip,
          username,
          password,
          type,
          pollInterval: (params.pollInterval as number) || 5000,
        },
      };

      resetWiFiSensor();
      const sensor = getWiFiSensor(config);
      await sensor.start();

      return {
        success: true,
        output: `Router monitoring configured and started
Router: ${type} at ${ip}
Poll interval: ${config.router?.pollInterval}ms`,
      };
    }

    default:
      return {
        success: false,
        output: `Unknown wifiSensing action: ${action}. Available: start, stop, status, presence, calibrate, devices, unknownDevices, registerDevice, bluetooth, networks, readings, reset, configureRouter`,
      };
  }
}

async function handleSecurityPerimeter(
  params: Record<string, unknown>
): Promise<ToolResult> {
  const action = params.action as string;

  switch (action) {
    case 'arm': {
      const sensor = getWiFiSensor();

      if (!sensor.isActive()) {
        // Auto-start in best available mode
        const config: Partial<WiFiSensorConfig> = {
          mode: (params.mode as SensingMode) || 'simulation',
          sensitivity: 0.7,
        };

        if (params.routerIp) {
          config.mode = 'router';
          config.router = {
            ip: params.routerIp as string,
            username: (params.routerUsername as string) || 'admin',
            password: (params.routerPassword as string) || '',
            type: (params.routerType as RouterConfig['type']) || 'generic',
          };
        }

        resetWiFiSensor();
        const newSensor = getWiFiSensor(config);
        await newSensor.start();
      }

      return {
        success: true,
        output: `🛡️ PERIMETER ARMED
Mode: ${sensor.getConfig().mode}
Sensitivity: HIGH
Status: Monitoring for intruders...`,
      };
    }

    case 'disarm': {
      const sensor = getWiFiSensor();
      await sensor.stop();

      return {
        success: true,
        output: '🔓 PERIMETER DISARMED',
      };
    }

    case 'status': {
      const sensor = getWiFiSensor();
      const presence = sensor.getPresenceState();
      const unknownDevices = sensor.getUnknownDevices();

      const status = sensor.isActive() ? 'ARMED' : 'DISARMED';
      const threat =
        unknownDevices.length > 0
          ? 'ALERT'
          : presence.detected
            ? 'ACTIVITY'
            : 'CLEAR';

      return {
        success: true,
        output: `🛡️ PERIMETER STATUS: ${status}
Threat Level: ${threat}
Unknown Devices: ${unknownDevices.length}
Presence Detected: ${presence.detected ? 'YES' : 'NO'}
Movement: ${presence.movement ? 'ACTIVE' : 'None'}
Confidence: ${(presence.confidence * 100).toFixed(0)}%`,
      };
    }

    case 'threats': {
      const sensor = getWiFiSensor();
      const unknownDevices = sensor.getUnknownDevices();
      const presence = sensor.getPresenceState();

      if (unknownDevices.length === 0 && !presence.detected) {
        return { success: true, output: '✓ No threats detected' };
      }

      const lines: string[] = ['⚠️ THREAT REPORT:'];

      if (unknownDevices.length > 0) {
        lines.push(`\n${unknownDevices.length} UNKNOWN DEVICE(S):`);
        for (const d of unknownDevices) {
          lines.push(`  • ${d.mac} (${d.vendor || 'unknown vendor'})`);
          lines.push(
            `    ${d.connection} | ${d.rssi ? `${d.rssi} dBm` : 'Signal unknown'}`
          );
          lines.push(
            `    First seen: ${new Date(d.firstSeen).toLocaleString()}`
          );
        }
      }

      if (presence.detected && presence.estimatedCount > 0) {
        lines.push(`\nPRESENCE DETECTED:`);
        lines.push(`  • Estimated ${presence.estimatedCount} person(s)`);
        lines.push(
          `  • Movement: ${presence.movement ? 'Active' : 'Stationary'}`
        );
        lines.push(
          `  • Confidence: ${(presence.confidence * 100).toFixed(0)}%`
        );
      }

      return { success: true, output: lines.join('\n') };
    }

    default:
      return {
        success: false,
        output: `Unknown securityPerimeter action: ${action}. Available: arm, disarm, status, threats`,
      };
  }
}

export const sensingToolHandlers: ToolHandlerMap = {
  wifiSensing: handleWifiSensing,
  securityPerimeter: handleSecurityPerimeter,
};
