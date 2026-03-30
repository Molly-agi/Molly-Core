/**
 * Test script for WiFi CSI Sensing Module
 *
 * Run with: npx tsx src/ai/sensing/test-wifi-sensing.ts
 */

import {
  WiFiCSISensor,
  formatPresenceState,
  type PresenceState,
  type MovementEvent,
  type SignalReading,
  type BluetoothDevice,
  type WifiNetwork,
} from './wifi-csi-sensing';

async function main() {
  console.log(
    '╔══════════════════════════════════════════════════════════════╗'
  );
  console.log(
    '║           MOLLY WIFI CSI SENSING TEST                        ║'
  );
  console.log(
    '╚══════════════════════════════════════════════════════════════╝'
  );
  console.log('');

  // Detect available mode
  let mode: 'android' | 'bluetooth' | 'rssi' | 'simulation' = 'simulation';

  // Check for Termux (Android)
  try {
    const { execSync } = await import('child_process');
    execSync('which termux-wifi-scaninfo', { stdio: 'ignore' });
    mode = 'android';
    console.log('📱 Detected: Android/Termux - using WiFi scanning');
  } catch {
    // Check for Linux WiFi
    try {
      const { execSync } = await import('child_process');
      const result = execSync('cat /proc/net/wireless 2>/dev/null | wc -l')
        .toString()
        .trim();
      if (parseInt(result) > 2) {
        mode = 'rssi';
        console.log('🐧 Detected: Linux WiFi - using RSSI monitoring');
      }
    } catch {
      // Check for Bluetooth
      try {
        const { execSync } = await import('child_process');
        execSync('which hcitool || which bluetoothctl', { stdio: 'ignore' });
        mode = 'bluetooth';
        console.log('📶 Detected: Bluetooth available - using BT scanning');
      } catch {
        console.log('🔄 No hardware detected - using simulation mode');
      }
    }
  }

  // Create sensor
  const sensor = new WiFiCSISensor({
    mode,
    sampleRate: 5,
    sensitivity: 0.6,
    calibrationDuration: 5,
    zones: [
      {
        name: 'room',
        bounds: { x1: 0, y1: 0, x2: 1, y2: 1 },
        alertOnPresence: true,
      },
    ],
  });

  // Set up event listeners
  sensor.on('presence', (state: PresenceState) => {
    console.log('\n' + formatPresenceState(state));
  });

  sensor.on('movement', (event: MovementEvent) => {
    const icon =
      event.type === 'enter' ? '🚶 →' : event.type === 'exit' ? '← 🚶' : '⚡';
    console.log(`\n${icon} MOVEMENT EVENT: ${event.type.toUpperCase()}`);
    console.log(`   Confidence: ${(event.confidence * 100).toFixed(0)}%`);
    console.log(`   Details: ${event.details}`);
  });

  sensor.on('reading', (reading: SignalReading) => {
    // Log every 10th reading to avoid spam
    if (Math.random() < 0.1) {
      console.log(
        `   📡 RSSI: ${reading.rssi.toFixed(1)} dBm | Source: ${reading.source}`
      );
    }
  });

  sensor.on('bluetoothDeviceFound', (device: BluetoothDevice) => {
    console.log(
      `\n📲 NEW BLUETOOTH DEVICE: ${device.name} (${device.address})`
    );
    console.log(`   RSSI: ${device.rssi} dBm | Type: ${device.type}`);
  });

  sensor.on(
    'networkChange',
    (change: { network: WifiNetwork; previousRssi: number; delta: number }) => {
      console.log(`\n📶 NETWORK SIGNAL CHANGE: ${change.network.ssid}`);
      console.log(
        `   RSSI: ${change.previousRssi} → ${change.network.rssi} (Δ${change.delta > 0 ? '+' : ''}${change.delta})`
      );
    }
  );

  // Start the sensor
  console.log('\n⏳ Starting sensor and calibrating...\n');
  await sensor.start();

  console.log('\n✅ Sensor running. Press Ctrl+C to stop.\n');
  console.log('Monitoring for presence, movement, and breathing...\n');

  // Keep running
  process.on('SIGINT', async () => {
    console.log('\n\n🛑 Stopping sensor...');
    await sensor.stop();

    // Print stats
    const stats = sensor.getStats();
    console.log('\n📊 SESSION STATS:');
    console.log(`   Mode: ${stats.mode}`);
    console.log(`   Readings collected: ${stats.readingsCollected}`);
    console.log(`   Uptime: ${(stats.uptime / 1000).toFixed(0)}s`);

    const networks = sensor.getNearbyNetworks();
    if (networks.length > 0) {
      console.log(`\n📶 Networks detected: ${networks.length}`);
      networks.slice(0, 5).forEach((n) => {
        console.log(
          `   - ${n.ssid || '(hidden)'}: ${n.rssi} dBm (ch ${n.channel})`
        );
      });
    }

    const devices = sensor.getBluetoothDevices();
    if (devices.length > 0) {
      console.log(`\n📲 Bluetooth devices: ${devices.length}`);
      devices.slice(0, 5).forEach((d) => {
        console.log(`   - ${d.name}: ${d.rssi} dBm (${d.type})`);
      });
    }

    process.exit(0);
  });
}

main().catch(console.error);
