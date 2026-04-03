/**
 * @fileOverview Molly's WiFi CSI (Channel State Information) Sensing Module
 *
 * Uses WiFi signal analysis to detect presence, movement, and location
 * of people without cameras. Works by analyzing how human bodies affect
 * WiFi signal propagation.
 *
 * Supported modes:
 * - RSSI (basic): Signal strength monitoring - works on most WiFi adapters
 * - CSI (advanced): Full channel state info - requires Intel 5300/Atheros/ESP32
 * - Simulation: For testing without hardware
 *
 * Capabilities:
 * - Presence detection (is someone in the room?)
 * - Motion detection (is someone moving?)
 * - Breathing detection (is someone stationary but alive?)
 * - Location estimation (where in the space?)
 * - Person counting (roughly how many people?)
 *
 * "I feel the ripples in the signal. Every movement tells a story."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { EventEmitter } from 'events';

// ============================================================
// TYPES
// ============================================================

export type SensingMode =
  | 'rssi'
  | 'csi'
  | 'simulation'
  | 'esp32'
  | 'android'
  | 'bluetooth'
  | 'router';

export interface RouterConfig {
  /** Router admin IP address */
  ip: string;
  /** Router admin username */
  username: string;
  /** Router admin password */
  password: string;
  /** Router type/brand for API selection */
  type: 'verizon' | 'netgear' | 'asus' | 'tplink' | 'ubiquiti' | 'generic';
  /** Custom API endpoint if known */
  apiEndpoint?: string;
  /** Poll interval in ms */
  pollInterval?: number;
}

export interface ConnectedDevice {
  /** Device MAC address */
  mac: string;
  /** Device IP address */
  ip?: string;
  /** Device hostname if available */
  hostname?: string;
  /** Device name/alias */
  name?: string;
  /** Signal strength (dBm) */
  rssi?: number;
  /** Connection type */
  connection: '2.4GHz' | '5GHz' | 'ethernet' | 'unknown';
  /** First seen timestamp */
  firstSeen: number;
  /** Last seen timestamp */
  lastSeen: number;
  /** Is this a known/registered device? */
  isKnown: boolean;
  /** Device type if identifiable */
  deviceType?: 'phone' | 'computer' | 'tablet' | 'iot' | 'unknown';
  /** Vendor from MAC lookup */
  vendor?: string;
}

export interface WiFiSensorConfig {
  /** Sensing mode */
  mode: SensingMode;
  /** WiFi interface name (e.g., 'wlan0') */
  interface?: string;
  /** ESP32 connection URL (for esp32 mode) */
  esp32Url?: string;
  /** Sampling rate in Hz */
  sampleRate: number;
  /** Sensitivity (0-1, higher = more sensitive to small movements) */
  sensitivity: number;
  /** Baseline calibration duration in seconds */
  calibrationDuration: number;
  /** Detection zones (named areas with coordinates) */
  zones?: DetectionZone[];
  /** Android bridge URL (for Termux/MollyBrowser integration) */
  androidBridgeUrl?: string;
  /** Target WiFi networks to monitor (BSSIDs or SSIDs) */
  targetNetworks?: string[];
  /** Bluetooth device addresses to track */
  trackedBluetoothDevices?: string[];
  /** Use phone as hotspot for extended sensing */
  useHotspotMode?: boolean;
  /** Router configuration for router mode */
  router?: RouterConfig;
  /** Known device MACs (won't trigger alerts) */
  knownDevices?: string[];
}

export interface BluetoothDevice {
  /** Device MAC address */
  address: string;
  /** Device name if available */
  name?: string;
  /** Signal strength (dBm) */
  rssi: number;
  /** Device type */
  type: 'phone' | 'wearable' | 'beacon' | 'computer' | 'unknown';
  /** Last seen timestamp */
  lastSeen: number;
  /** Is this a tracked/known device? */
  isTracked: boolean;
}

export interface WifiNetwork {
  /** Network SSID */
  ssid: string;
  /** Network BSSID (MAC) */
  bssid: string;
  /** Signal strength (dBm) */
  rssi: number;
  /** Frequency (MHz) */
  frequency: number;
  /** Channel */
  channel: number;
  /** Last seen timestamp */
  lastSeen: number;
}

export interface DetectionZone {
  /** Zone name */
  name: string;
  /** Zone bounds (normalized 0-1 for the sensing area) */
  bounds: { x1: number; y1: number; x2: number; y2: number };
  /** Alert on presence in this zone? */
  alertOnPresence: boolean;
}

export interface SignalReading {
  /** Timestamp */
  timestamp: number;
  /** Signal strength (dBm, typically -30 to -90) */
  rssi: number;
  /** Signal quality (0-100) */
  quality: number;
  /** Noise level (dBm) */
  noise: number;
  /** CSI amplitude data (if available) */
  csiAmplitude?: number[];
  /** CSI phase data (if available) */
  csiPhase?: number[];
  /** Source identifier (MAC or sensor ID) */
  source: string;
}

export interface PresenceState {
  /** Is someone present in the sensing area? */
  detected: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Estimated number of people */
  estimatedCount: number;
  /** Is there active movement? */
  movement: boolean;
  /** Movement intensity (0-1) */
  movementIntensity: number;
  /** Breathing detected (stationary presence)? */
  breathingDetected: boolean;
  /** Active zones with presence */
  activeZones: string[];
  /** Last state change timestamp */
  lastChange: number;
  /** Duration of current state in ms */
  stateDuration: number;
}

export interface MovementEvent {
  /** Event type */
  type: 'enter' | 'exit' | 'movement' | 'stillness' | 'anomaly';
  /** Zone where event occurred */
  zone?: string;
  /** Timestamp */
  timestamp: number;
  /** Confidence */
  confidence: number;
  /** Additional details */
  details: string;
}

export interface CalibrationData {
  /** Baseline RSSI (no presence) */
  baselineRssi: number;
  /** Baseline noise */
  baselineNoise: number;
  /** RSSI variance threshold for detection */
  rssiThreshold: number;
  /** CSI baseline (if available) */
  csiBaseline?: number[];
  /** Calibration timestamp */
  calibratedAt: number;
  /** Environment signature */
  environmentHash: string;
}

// ============================================================
// SIGNAL PROCESSING UTILITIES
// ============================================================

/**
 * Calculate variance of a number array
 */
function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return (
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length
  );
}

/**
 * Calculate moving average
 */
function movingAverage(values: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return result;
}

/**
 * Detect peaks in signal (for breathing/movement detection)
 */
function detectPeaks(values: number[], threshold: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    if (
      values[i] > values[i - 1] &&
      values[i] > values[i + 1] &&
      values[i] > threshold
    ) {
      peaks.push(i);
    }
  }
  return peaks;
}

/**
 * Calculate breathing rate from signal peaks (breaths per minute)
 */
function calculateBreathingRate(
  peaks: number[],
  sampleRate: number
): number | null {
  if (peaks.length < 2) return null;

  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const breathsPerSecond = sampleRate / avgInterval;
  const breathsPerMinute = breathsPerSecond * 60;

  // Normal breathing rate is 12-20 BPM
  if (breathsPerMinute >= 8 && breathsPerMinute <= 30) {
    return breathsPerMinute;
  }
  return null;
}

// ============================================================
// WIFI CSI SENSOR CLASS
// ============================================================

export class WiFiCSISensor extends EventEmitter {
  private config: WiFiSensorConfig;
  private isRunning: boolean = false;
  private calibration: CalibrationData | null = null;
  private readings: SignalReading[] = [];
  private maxReadings: number = 1000;
  private presenceState: PresenceState;
  private simulationInterval: NodeJS.Timeout | null = null;
  private esp32WebSocket: WebSocket | null = null;
  private nearbyNetworks: Map<string, WifiNetwork> = new Map();
  private bluetoothDevices: Map<string, BluetoothDevice> = new Map();
  private connectedDevices: Map<string, ConnectedDevice> = new Map();
  private scanInterval: NodeJS.Timeout | null = null;
  private routerPollInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<WiFiSensorConfig> = {}) {
    super();

    this.config = {
      mode: config.mode || 'simulation',
      interface: config.interface || 'wlan0',
      esp32Url: config.esp32Url,
      sampleRate: config.sampleRate || 10, // 10 Hz default
      sensitivity: config.sensitivity || 0.5,
      calibrationDuration: config.calibrationDuration || 10,
      zones: config.zones || [],
    };

    this.presenceState = {
      detected: false,
      confidence: 0,
      estimatedCount: 0,
      movement: false,
      movementIntensity: 0,
      breathingDetected: false,
      activeZones: [],
      lastChange: Date.now(),
      stateDuration: 0,
    };

    MollyLogger.info(
      `WiFi CSI Sensor initialized in ${this.config.mode} mode`,
      'wifi-csi'
    );
  }

  // ── Lifecycle ──

  /**
   * Start the sensor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      MollyLogger.warn('WiFi CSI Sensor already running', 'wifi-csi');
      return;
    }

    const traceId = generateTraceId();
    MollyLogger.info('Starting WiFi CSI Sensor', 'wifi-csi', {}, traceId);

    // Calibrate first if no calibration data
    if (!this.calibration) {
      await this.calibrate();
    }

    this.isRunning = true;

    switch (this.config.mode) {
      case 'simulation':
        this.startSimulation();
        break;
      case 'rssi':
        await this.startRSSIMonitoring();
        break;
      case 'esp32':
        await this.connectESP32();
        break;
      case 'csi':
        await this.startCSIMonitoring();
        break;
      case 'android':
        await this.startAndroidSensing();
        break;
      case 'bluetooth':
        await this.startBluetoothScanning();
        break;
      case 'router':
        await this.startRouterMonitoring();
        break;
    }

    this.emit('started');
    MollyLogger.info('WiFi CSI Sensor started', 'wifi-csi', {}, traceId);
  }

  /**
   * Stop the sensor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.simulationInterval) {
      clearInterval(this.simulationInterval);
      this.simulationInterval = null;
    }

    if (this.esp32WebSocket) {
      this.esp32WebSocket.close();
      this.esp32WebSocket = null;
    }

    if (this.scanInterval) {
      clearTimeout(this.scanInterval);
      this.scanInterval = null;
    }

    if (this.routerPollInterval) {
      clearTimeout(this.routerPollInterval);
      this.routerPollInterval = null;
    }

    this.emit('stopped');
    MollyLogger.info('WiFi CSI Sensor stopped', 'wifi-csi');
  }

  /**
   * Calibrate the sensor (establish baseline with no presence)
   */
  async calibrate(): Promise<CalibrationData> {
    const traceId = generateTraceId();
    MollyLogger.info(
      `Calibrating WiFi CSI Sensor for ${this.config.calibrationDuration}s`,
      'wifi-csi',
      {},
      traceId
    );

    this.emit('calibrating', { duration: this.config.calibrationDuration });

    const calibrationReadings: SignalReading[] = [];
    const startTime = Date.now();
    const duration = this.config.calibrationDuration * 1000;

    // Collect readings during calibration period
    while (Date.now() - startTime < duration) {
      const reading = await this.takeSingleReading();
      calibrationReadings.push(reading);
      await new Promise((r) => setTimeout(r, 1000 / this.config.sampleRate));
    }

    // Calculate baseline statistics
    const rssiValues = calibrationReadings.map((r) => r.rssi);
    const noiseValues = calibrationReadings.map((r) => r.noise);

    const baselineRssi =
      rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
    const baselineNoise =
      noiseValues.reduce((a, b) => a + b, 0) / noiseValues.length;
    const rssiVariance = variance(rssiValues);

    // Threshold is baseline variance + sensitivity factor
    const rssiThreshold =
      Math.sqrt(rssiVariance) * (2 - this.config.sensitivity);

    this.calibration = {
      baselineRssi,
      baselineNoise,
      rssiThreshold,
      calibratedAt: Date.now(),
      environmentHash: `env_${Date.now().toString(36)}`,
    };

    this.emit('calibrated', this.calibration);
    MollyLogger.info(
      `Calibration complete: baseline RSSI=${baselineRssi.toFixed(1)}dBm, threshold=${rssiThreshold.toFixed(2)}`,
      'wifi-csi',
      {},
      traceId
    );

    return this.calibration;
  }

  // ── Reading Methods ──

  /**
   * Take a single reading (method depends on mode)
   */
  private async takeSingleReading(): Promise<SignalReading> {
    switch (this.config.mode) {
      case 'simulation':
        return this.generateSimulatedReading();
      case 'rssi':
        return await this.readRSSI();
      case 'esp32':
        return await this.readFromESP32();
      case 'csi':
        return await this.readCSI();
      default:
        return this.generateSimulatedReading();
    }
  }

  /**
   * Generate simulated reading for testing
   */
  private generateSimulatedReading(): SignalReading {
    // Simulate realistic WiFi behavior
    const baseRssi = -55;
    const now = Date.now();

    // Add some periodic variation (simulates environment)
    const envNoise = Math.sin(now / 5000) * 2;

    // Add random noise
    const randomNoise = (Math.random() - 0.5) * 4;

    // Simulate presence (random walk)
    const presenceEffect = this.presenceState.detected
      ? Math.sin(now / 1000) * 5 + (Math.random() - 0.5) * 3
      : 0;

    const rssi = baseRssi + envNoise + randomNoise + presenceEffect;

    return {
      timestamp: now,
      rssi,
      quality: Math.max(0, Math.min(100, 100 + (rssi + 50) * 2)),
      noise: -90 + (Math.random() - 0.5) * 5,
      source: 'simulation',
    };
  }

  /**
   * Read RSSI from Linux wireless interface
   */
  private async readRSSI(): Promise<SignalReading> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Read from /proc/net/wireless
      const { stdout } = await execAsync('cat /proc/net/wireless');
      const lines = stdout.trim().split('\n');

      if (lines.length >= 3) {
        const dataLine = lines[2];
        const parts = dataLine.trim().split(/\s+/);

        // Format: interface | status | quality | level | noise | ...
        const quality = parseFloat(parts[2]) || 0;
        const level = parseFloat(parts[3]) || -70;
        const noise = parseFloat(parts[4]) || -90;

        return {
          timestamp: Date.now(),
          rssi: level,
          quality,
          noise,
          source: this.config.interface || 'wlan0',
        };
      }
    } catch (error) {
      MollyLogger.warn('Failed to read RSSI from interface', 'wifi-csi', {
        error,
      });
    }

    // Fallback to simulated
    return this.generateSimulatedReading();
  }

  /**
   * Read CSI data (requires special driver setup)
   */
  private async readCSI(): Promise<SignalReading> {
    // CSI extraction requires modified drivers (Intel 5300 CSI Tool, Atheros CSI, etc.)
    // This is a placeholder - real implementation would read from the CSI tool's output
    MollyLogger.debug(
      'CSI mode requires driver setup - using RSSI fallback',
      'wifi-csi'
    );
    return this.readRSSI();
  }

  /**
   * Read from ESP32 sensor
   */
  private async readFromESP32(): Promise<SignalReading> {
    // ESP32 sends CSI data over WebSocket/HTTP
    // This is handled by the WebSocket connection when in esp32 mode
    return this.generateSimulatedReading();
  }

  // ── Mode-specific Start Methods ──

  private startSimulation(): void {
    MollyLogger.info('Starting simulation mode', 'wifi-csi');

    const interval = 1000 / this.config.sampleRate;

    this.simulationInterval = setInterval(async () => {
      if (!this.isRunning) return;

      const reading = this.generateSimulatedReading();
      this.processReading(reading);
    }, interval);

    // Simulate random presence events
    this.simulatePresenceEvents();
  }

  private simulatePresenceEvents(): void {
    // Randomly toggle presence every 10-30 seconds for demo
    const scheduleNext = () => {
      if (!this.isRunning) return;

      const delay = 10000 + Math.random() * 20000;
      setTimeout(() => {
        if (!this.isRunning) return;

        const newPresence = !this.presenceState.detected;
        this.updatePresenceState({
          detected: newPresence,
          confidence: 0.8 + Math.random() * 0.2,
          movement: newPresence,
          movementIntensity: newPresence ? 0.5 + Math.random() * 0.5 : 0,
        });

        scheduleNext();
      }, delay);
    };

    scheduleNext();
  }

  private async startRSSIMonitoring(): Promise<void> {
    MollyLogger.info('Starting RSSI monitoring mode', 'wifi-csi');

    const interval = 1000 / this.config.sampleRate;

    const monitor = async () => {
      if (!this.isRunning) return;

      const reading = await this.readRSSI();
      this.processReading(reading);

      setTimeout(monitor, interval);
    };

    monitor();
  }

  private async startCSIMonitoring(): Promise<void> {
    MollyLogger.info('Starting CSI monitoring mode', 'wifi-csi');
    // Similar to RSSI but with full CSI data
    await this.startRSSIMonitoring();
  }

  private async connectESP32(): Promise<void> {
    if (!this.config.esp32Url) {
      throw new Error('ESP32 URL not configured');
    }

    MollyLogger.info(
      `Connecting to ESP32 at ${this.config.esp32Url}`,
      'wifi-csi'
    );

    // Note: In Node.js, would use 'ws' package
    // This is a placeholder for the WebSocket connection
    try {
      const WebSocket = (await import('ws')).default;

      this.esp32WebSocket = new WebSocket(
        this.config.esp32Url
      ) as unknown as WebSocket;

      (
        this.esp32WebSocket as unknown as {
          on: (event: string, handler: (...args: unknown[]) => void) => void;
        }
      ).on('message', (data: Buffer) => {
        try {
          const reading = JSON.parse(data.toString()) as SignalReading;
          reading.timestamp = Date.now();
          this.processReading(reading);
        } catch (e) {
          MollyLogger.warn('Failed to parse ESP32 data', 'wifi-csi', {
            error: e,
          });
        }
      });

      (
        this.esp32WebSocket as unknown as {
          on: (event: string, handler: (...args: unknown[]) => void) => void;
        }
      ).on('error', (error: Error) => {
        MollyLogger.error('ESP32 WebSocket error', 'wifi-csi', {}, error);
        this.emit('error', error);
      });

      (
        this.esp32WebSocket as unknown as {
          on: (event: string, handler: (...args: unknown[]) => void) => void;
        }
      ).on('close', () => {
        MollyLogger.info('ESP32 WebSocket closed', 'wifi-csi');
        if (this.isRunning) {
          // Reconnect after delay
          setTimeout(() => this.connectESP32(), 5000);
        }
      });
    } catch {
      MollyLogger.warn(
        'WebSocket not available, falling back to simulation',
        'wifi-csi'
      );
      this.config.mode = 'simulation';
      this.startSimulation();
    }
  }

  // ── Android/Phone-based Sensing ──

  /**
   * Start Android WiFi scanning via Termux or MollyBrowser bridge
   * Uses the phone's WiFi radio to scan nearby networks and detect signal changes
   */
  private async startAndroidSensing(): Promise<void> {
    MollyLogger.info('Starting Android WiFi sensing mode', 'wifi-csi');

    const interval = 1000 / this.config.sampleRate;

    const scanNetworks = async () => {
      if (!this.isRunning) return;

      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        // Try Termux method first (if running on Android via Termux)
        try {
          // termux-wifi-scaninfo returns JSON with nearby networks
          const { stdout } = await execAsync(
            'termux-wifi-scaninfo 2>/dev/null'
          );
          const networks = JSON.parse(stdout);

          for (const net of networks) {
            const network: WifiNetwork = {
              ssid: net.ssid || '',
              bssid: net.bssid || '',
              rssi: net.rssi || net.level || -70,
              frequency: net.frequency || 2400,
              channel: this.frequencyToChannel(net.frequency || 2400),
              lastSeen: Date.now(),
            };

            const previous = this.nearbyNetworks.get(network.bssid);
            this.nearbyNetworks.set(network.bssid, network);

            // Create a reading from the strongest/target network
            if (
              this.config.targetNetworks?.includes(network.ssid) ||
              this.config.targetNetworks?.includes(network.bssid) ||
              !this.config.targetNetworks?.length
            ) {
              const reading: SignalReading = {
                timestamp: Date.now(),
                rssi: network.rssi,
                quality: Math.max(
                  0,
                  Math.min(100, 100 + (network.rssi + 50) * 2)
                ),
                noise: -90,
                source: `android:${network.bssid}`,
              };

              this.processReading(reading);

              // Emit network change event if significant
              if (previous && Math.abs(previous.rssi - network.rssi) > 5) {
                this.emit('networkChange', {
                  network,
                  previousRssi: previous.rssi,
                  delta: network.rssi - previous.rssi,
                });
              }
            }
          }
        } catch {
          // Termux not available, try Linux iwlist
          const { stdout } = await execAsync(
            `iwlist ${this.config.interface || 'wlan0'} scan 2>/dev/null | grep -E 'ESSID|Signal level|Address'`
          );
          const lines = stdout.split('\n');

          let currentBssid = '';
          let _currentSsid = '';

          for (const line of lines) {
            if (line.includes('Address:')) {
              currentBssid = line.split('Address:')[1]?.trim() || '';
            } else if (line.includes('ESSID:')) {
              _currentSsid = line.match(/ESSID:"([^"]*)"/)?.[1] || '';
            } else if (line.includes('Signal level')) {
              const rssiMatch = line.match(/Signal level[=:](-?\d+)/);
              const rssi = rssiMatch ? parseInt(rssiMatch[1]) : -70;

              if (currentBssid) {
                const reading: SignalReading = {
                  timestamp: Date.now(),
                  rssi,
                  quality: Math.max(0, Math.min(100, 100 + (rssi + 50) * 2)),
                  noise: -90,
                  source: `linux:${currentBssid}`,
                };
                this.processReading(reading);
              }
            }
          }
        }
      } catch (error) {
        MollyLogger.debug('Android scan failed, using simulation', 'wifi-csi', {
          error,
        });
        const reading = this.generateSimulatedReading();
        reading.source = 'android:simulated';
        this.processReading(reading);
      }

      // Schedule next scan
      this.scanInterval = setTimeout(scanNetworks, interval);
    };

    scanNetworks();
  }

  /**
   * Start Bluetooth scanning for device proximity detection
   * Great for ~30ft range, detects phones, wearables, beacons
   */
  private async startBluetoothScanning(): Promise<void> {
    MollyLogger.info('Starting Bluetooth scanning mode', 'wifi-csi');

    const interval = 2000; // BT scanning is slower

    const scanBluetooth = async () => {
      if (!this.isRunning) return;

      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        // Try Termux Bluetooth API first
        try {
          const { stdout } = await execAsync(
            'termux-bluetooth-scaninfo 2>/dev/null'
          );
          const devices = JSON.parse(stdout);

          for (const dev of devices) {
            const device: BluetoothDevice = {
              address: dev.address || dev.mac || '',
              name: dev.name || 'Unknown',
              rssi: dev.rssi || -70,
              type: this.classifyBluetoothDevice(dev.name, dev.type),
              lastSeen: Date.now(),
              isTracked:
                this.config.trackedBluetoothDevices?.includes(dev.address) ||
                false,
            };

            const previous = this.bluetoothDevices.get(device.address);
            this.bluetoothDevices.set(device.address, device);

            // Emit device events
            if (!previous) {
              this.emit('bluetoothDeviceFound', device);
              MollyLogger.info(
                `Bluetooth device found: ${device.name} (${device.address})`,
                'wifi-csi'
              );
            } else if (
              device.isTracked &&
              Math.abs(previous.rssi - device.rssi) > 10
            ) {
              this.emit('bluetoothDeviceMoved', {
                device,
                previousRssi: previous.rssi,
                approaching: device.rssi > previous.rssi,
              });
            }

            // Convert to reading for presence detection
            const reading: SignalReading = {
              timestamp: Date.now(),
              rssi: device.rssi,
              quality: Math.max(0, Math.min(100, 100 + (device.rssi + 50) * 2)),
              noise: -90,
              source: `bluetooth:${device.address}`,
            };
            this.processReading(reading);
          }
        } catch {
          // Try Linux hcitool/bluetoothctl
          try {
            const { stdout } = await execAsync(
              'hcitool scan --flush 2>/dev/null || bluetoothctl scan on & sleep 3 && bluetoothctl devices'
            );
            const lines = stdout.split('\n');

            for (const line of lines) {
              const match = line.match(/([0-9A-F:]{17})\s+(.+)/i);
              if (match) {
                const device: BluetoothDevice = {
                  address: match[1],
                  name: match[2],
                  rssi: -60, // hcitool doesn't give RSSI, estimate
                  type: this.classifyBluetoothDevice(match[2]),
                  lastSeen: Date.now(),
                  isTracked:
                    this.config.trackedBluetoothDevices?.includes(match[1]) ||
                    false,
                };
                this.bluetoothDevices.set(device.address, device);
              }
            }
          } catch {
            MollyLogger.debug('Bluetooth scan unavailable', 'wifi-csi');
          }
        }

        // Clean up stale devices (not seen in 30s)
        const now = Date.now();
        for (const [address, device] of this.bluetoothDevices) {
          if (now - device.lastSeen > 30000) {
            this.bluetoothDevices.delete(address);
            this.emit('bluetoothDeviceLost', device);
          }
        }

        // Update presence based on tracked devices
        const trackedNearby = Array.from(this.bluetoothDevices.values()).filter(
          (d) => d.isTracked && d.rssi > -80
        );

        if (trackedNearby.length > 0) {
          this.updatePresenceState({
            detected: true,
            confidence: 0.9,
            estimatedCount: trackedNearby.length,
            movement: false,
            movementIntensity: 0,
          });
        }
      } catch (error) {
        MollyLogger.debug('Bluetooth scan error', 'wifi-csi', { error });
      }

      // Schedule next scan
      this.scanInterval = setTimeout(scanBluetooth, interval);
    };

    scanBluetooth();
  }

  // ── Router-based Sensing ──

  /**
   * Start monitoring via router admin API
   * Provides extended range by leveraging your router's visibility of all connected devices
   */
  private async startRouterMonitoring(): Promise<void> {
    if (!this.config.router) {
      MollyLogger.warn(
        'Router config not provided, falling back to simulation',
        'wifi-csi'
      );
      this.config.mode = 'simulation';
      this.startSimulation();
      return;
    }

    MollyLogger.info(
      `Starting router monitoring: ${this.config.router.type} at ${this.config.router.ip}`,
      'wifi-csi'
    );

    const pollInterval = this.config.router.pollInterval || 5000;

    const pollRouter = async () => {
      if (!this.isRunning) return;

      try {
        const devices = await this.fetchRouterDevices();
        const now = Date.now();

        for (const device of devices) {
          const existing = this.connectedDevices.get(device.mac);

          if (!existing) {
            // New device detected
            device.firstSeen = now;
            device.lastSeen = now;
            device.isKnown =
              this.config.knownDevices?.includes(device.mac) || false;
            this.connectedDevices.set(device.mac, device);

            this.emit('deviceConnected', device);
            MollyLogger.info(
              `New device connected: ${device.name || device.mac} (${device.connection})`,
              'wifi-csi'
            );

            // Generate presence reading for new device
            if (!device.isKnown) {
              const reading: SignalReading = {
                timestamp: now,
                rssi: device.rssi || -50,
                quality: device.rssi
                  ? Math.max(0, Math.min(100, 100 + (device.rssi + 50) * 2))
                  : 70,
                noise: -90,
                source: `router:${device.mac}`,
              };
              this.processReading(reading);
            }
          } else {
            // Update existing device
            const rssiChanged =
              device.rssi &&
              existing.rssi &&
              Math.abs(device.rssi - existing.rssi) > 5;
            existing.lastSeen = now;
            existing.rssi = device.rssi;
            existing.ip = device.ip;

            if (rssiChanged) {
              this.emit('deviceMoved', {
                device: existing,
                previousRssi: existing.rssi,
              });
            }
          }
        }

        // Check for disconnected devices (not seen in 30s)
        const deviceMacs = new Set(devices.map((d) => d.mac));
        for (const [mac, device] of this.connectedDevices) {
          if (!deviceMacs.has(mac) && now - device.lastSeen > 30000) {
            this.connectedDevices.delete(mac);
            this.emit('deviceDisconnected', device);
            MollyLogger.info(
              `Device disconnected: ${device.name || device.mac}`,
              'wifi-csi'
            );
          }
        }

        // Update presence state based on unknown devices
        const unknownDevices = Array.from(
          this.connectedDevices.values()
        ).filter((d) => !d.isKnown);
        if (unknownDevices.length > 0) {
          this.updatePresenceState({
            detected: true,
            confidence: 0.95,
            estimatedCount: unknownDevices.length,
            movement: false,
            movementIntensity: 0,
          });
        }
      } catch (error) {
        MollyLogger.warn('Router poll failed', 'wifi-csi', { error });
      }

      // Schedule next poll
      this.routerPollInterval = setTimeout(pollRouter, pollInterval);
    };

    pollRouter();
  }

  /**
   * Fetch connected devices from router admin API
   */
  private async fetchRouterDevices(): Promise<ConnectedDevice[]> {
    const router = this.config.router;
    if (!router) return [];

    try {
      switch (router.type) {
        case 'verizon':
          return await this.fetchVerizonDevices(router);
        case 'netgear':
          return await this.fetchNetgearDevices(router);
        case 'asus':
          return await this.fetchAsusDevices(router);
        case 'ubiquiti':
          return await this.fetchUbiquitiDevices(router);
        default:
          return await this.fetchGenericDevices(router);
      }
    } catch (error) {
      MollyLogger.warn('Failed to fetch router devices', 'wifi-csi', { error });
      return [];
    }
  }

  /**
   * Fetch devices from Verizon 5G router
   */
  private async fetchVerizonDevices(
    router: RouterConfig
  ): Promise<ConnectedDevice[]> {
    // Verizon routers typically use a REST API
    // Common endpoints: /api/v1/network/devices, /cgi-bin/qcmap_web_cgi
    const endpoints = [
      '/api/v1/network/devices',
      '/api/devices',
      '/cgi-bin/devices.cgi',
    ];

    for (const endpoint of endpoints) {
      try {
        const url = `http://${router.ip}${router.apiEndpoint || endpoint}`;
        const response = await fetch(url, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${router.username}:${router.password}`).toString('base64')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return this.parseVerizonResponse(data);
        }
      } catch {
        continue;
      }
    }

    // Fallback to ARP table scan
    return this.scanArpTable();
  }

  /**
   * Parse Verizon router API response
   */
  private parseVerizonResponse(data: unknown): ConnectedDevice[] {
    const devices: ConnectedDevice[] = [];
    const now = Date.now();

    // Handle various Verizon response formats
    const deviceList = Array.isArray(data)
      ? data
      : (data as Record<string, unknown>)?.devices ||
        (data as Record<string, unknown>)?.clients ||
        [];

    for (const d of deviceList as Array<Record<string, unknown>>) {
      devices.push({
        mac: (d.mac || d.macAddress || d.MAC || '').toString().toUpperCase(),
        ip: (d.ip || d.ipAddress || d.IP || '').toString(),
        hostname: (d.hostname || d.hostName || d.name || '').toString(),
        name: (d.name || d.deviceName || d.hostname || '').toString(),
        rssi:
          typeof d.rssi === 'number'
            ? d.rssi
            : typeof d.signalStrength === 'number'
              ? d.signalStrength
              : undefined,
        connection: this.parseConnectionType(
          d.band || d.frequency || d.interface
        ),
        firstSeen: now,
        lastSeen: now,
        isKnown: false,
        deviceType: this.classifyDeviceType(d.type || d.deviceType || d.name),
        vendor: this.lookupMacVendor((d.mac || '').toString()),
      });
    }

    return devices;
  }

  /**
   * Fetch devices from Netgear router
   */
  private async fetchNetgearDevices(
    router: RouterConfig
  ): Promise<ConnectedDevice[]> {
    // Netgear uses SOAP API
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
          <GetAttachDevice xmlns="urn:NETGEAR-ROUTER:service:DeviceInfo:1"/>
        </soap:Body>
      </soap:Envelope>`;

    try {
      const response = await fetch(`http://${router.ip}/soap/server_sa/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          SOAPAction: 'urn:NETGEAR-ROUTER:service:DeviceInfo:1#GetAttachDevice',
          Authorization: `Basic ${Buffer.from(`${router.username}:${router.password}`).toString('base64')}`,
        },
        body: soapBody,
      });

      if (response.ok) {
        const text = await response.text();
        return this.parseNetgearSoap(text);
      }
    } catch {
      // Fall through to ARP scan
    }

    return this.scanArpTable();
  }

  /**
   * Parse Netgear SOAP response
   */
  private parseNetgearSoap(xml: string): ConnectedDevice[] {
    const devices: ConnectedDevice[] = [];
    const now = Date.now();

    // Simple regex parsing for device entries
    const deviceRegex = /<NewDeviceInfo>([^<]+)<\/NewDeviceInfo>/g;
    let match;

    while ((match = deviceRegex.exec(xml)) !== null) {
      const parts = match[1].split('@');
      if (parts.length >= 4) {
        devices.push({
          mac: parts[1]?.toUpperCase() || '',
          ip: parts[0] || '',
          name: parts[2] || '',
          hostname: parts[2] || '',
          connection: parts[3]?.includes('5G')
            ? '5GHz'
            : parts[3]?.includes('2.4')
              ? '2.4GHz'
              : 'unknown',
          firstSeen: now,
          lastSeen: now,
          isKnown: false,
        });
      }
    }

    return devices;
  }

  /**
   * Fetch devices from ASUS router
   */
  private async fetchAsusDevices(
    router: RouterConfig
  ): Promise<ConnectedDevice[]> {
    try {
      // ASUS uses their own API format
      const response = await fetch(
        `http://${router.ip}/appGet.cgi?hook=get_clientlist()`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${router.username}:${router.password}`).toString('base64')}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return this.parseAsusResponse(data);
      }
    } catch {
      // Fall through
    }

    return this.scanArpTable();
  }

  /**
   * Parse ASUS router response
   */
  private parseAsusResponse(data: unknown): ConnectedDevice[] {
    const devices: ConnectedDevice[] = [];
    const now = Date.now();
    const clientList =
      (data as Record<string, unknown>)?.get_clientlist || data;

    if (typeof clientList === 'object' && clientList !== null) {
      for (const [mac, info] of Object.entries(
        clientList as Record<string, unknown>
      )) {
        if (mac.includes(':') && typeof info === 'object' && info !== null) {
          const client = info as Record<string, unknown>;
          devices.push({
            mac: mac.toUpperCase(),
            ip: (client.ip || '').toString(),
            name: (client.name || client.nickName || '').toString(),
            hostname: (client.name || '').toString(),
            rssi: typeof client.rssi === 'number' ? client.rssi : undefined,
            connection:
              client.isWL === 1
                ? client.curTx === '5G'
                  ? '5GHz'
                  : '2.4GHz'
                : 'ethernet',
            firstSeen: now,
            lastSeen: now,
            isKnown: false,
          });
        }
      }
    }

    return devices;
  }

  /**
   * Fetch devices from Ubiquiti UniFi controller
   */
  private async fetchUbiquitiDevices(
    router: RouterConfig
  ): Promise<ConnectedDevice[]> {
    try {
      // UniFi API login
      await fetch(`https://${router.ip}:8443/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: router.username,
          password: router.password,
        }),
      });

      // Get clients
      const response = await fetch(
        `https://${router.ip}:8443/api/s/default/stat/sta`,
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.ok) {
        const data = await response.json();
        return this.parseUbiquitiResponse(data);
      }
    } catch {
      // Fall through
    }

    return this.scanArpTable();
  }

  /**
   * Parse Ubiquiti UniFi response
   */
  private parseUbiquitiResponse(data: unknown): ConnectedDevice[] {
    const devices: ConnectedDevice[] = [];
    const now = Date.now();
    const clients = (data as Record<string, unknown>)?.data || [];

    for (const client of clients as Array<Record<string, unknown>>) {
      devices.push({
        mac: (client.mac || '').toString().toUpperCase(),
        ip: (client.ip || '').toString(),
        hostname: (client.hostname || '').toString(),
        name: (client.name || client.hostname || '').toString(),
        rssi: typeof client.rssi === 'number' ? client.rssi : undefined,
        connection: client.is_wired
          ? 'ethernet'
          : client.channel && (client.channel as number) > 14
            ? '5GHz'
            : '2.4GHz',
        firstSeen: now,
        lastSeen: now,
        isKnown: false,
        vendor: (client.oui || '').toString(),
      });
    }

    return devices;
  }

  /**
   * Generic device fetch using common endpoints
   */
  private async fetchGenericDevices(
    router: RouterConfig
  ): Promise<ConnectedDevice[]> {
    const endpoints = [
      '/api/devices',
      '/api/v1/clients',
      '/cgi-bin/luci/admin/status/clients',
      '/status/clients',
    ];

    for (const endpoint of endpoints) {
      try {
        const url = `http://${router.ip}${router.apiEndpoint || endpoint}`;
        const response = await fetch(url, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${router.username}:${router.password}`).toString('base64')}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          return this.parseVerizonResponse(data); // Generic parser
        }
      } catch {
        continue;
      }
    }

    return this.scanArpTable();
  }

  /**
   * Fallback: Scan local ARP table for devices
   */
  private async scanArpTable(): Promise<ConnectedDevice[]> {
    const devices: ConnectedDevice[] = [];
    const now = Date.now();

    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Works on Linux/Mac
      const { stdout } = await execAsync(
        'arp -a 2>/dev/null || ip neigh show 2>/dev/null'
      );
      const lines = stdout.split('\n');

      for (const line of lines) {
        // Parse ARP output: hostname (ip) at mac [type] on interface
        const arpMatch = line.match(
          /\(?([\d.]+)\)?\s+(?:at|lladdr)\s+([0-9a-fA-F:]+)/
        );
        if (arpMatch) {
          devices.push({
            mac: arpMatch[2].toUpperCase(),
            ip: arpMatch[1],
            connection: 'unknown',
            firstSeen: now,
            lastSeen: now,
            isKnown: false,
          });
        }
      }
    } catch {
      MollyLogger.debug('ARP scan unavailable', 'wifi-csi');
    }

    return devices;
  }

  /**
   * Parse connection type from various router formats
   */
  private parseConnectionType(band: unknown): ConnectedDevice['connection'] {
    const str = String(band || '').toLowerCase();
    if (str.includes('5') || str.includes('5g')) return '5GHz';
    if (str.includes('2.4') || str.includes('2g')) return '2.4GHz';
    if (str.includes('eth') || str.includes('lan')) return 'ethernet';
    return 'unknown';
  }

  /**
   * Classify device type from name/type string
   */
  private classifyDeviceType(type: unknown): ConnectedDevice['deviceType'] {
    const str = String(type || '').toLowerCase();
    if (
      str.includes('phone') ||
      str.includes('iphone') ||
      str.includes('android') ||
      str.includes('galaxy')
    )
      return 'phone';
    if (
      str.includes('laptop') ||
      str.includes('macbook') ||
      str.includes('pc') ||
      str.includes('computer') ||
      str.includes('desktop')
    )
      return 'computer';
    if (str.includes('ipad') || str.includes('tablet')) return 'tablet';
    if (
      str.includes('ring') ||
      str.includes('nest') ||
      str.includes('alexa') ||
      str.includes('echo') ||
      str.includes('smart')
    )
      return 'iot';
    return 'unknown';
  }

  /**
   * Lookup vendor from MAC address prefix (OUI)
   */
  private lookupMacVendor(mac: string): string | undefined {
    // Common OUI prefixes
    const oui: Record<string, string> = {
      '00:1A:2B': 'Ayecom',
      'AC:DE:48': 'Apple',
      '00:17:F2': 'Apple',
      '00:1C:B3': 'Apple',
      '00:50:E4': 'Apple',
      '3C:22:FB': 'Apple',
      'F0:DB:F8': 'Apple',
      '00:50:F2': 'Microsoft',
      '00:15:5D': 'Microsoft',
      'B4:2E:99': 'Samsung',
      '00:21:19': 'Samsung',
      '94:35:0A': 'Samsung',
      '00:26:5A': 'Dell',
      '00:14:22': 'Dell',
      'B0:BE:76': 'TP-Link',
      'F8:1A:67': 'TP-Link',
      '00:0C:29': 'VMware',
      '00:50:56': 'VMware',
      '08:00:27': 'VirtualBox',
      'DC:A6:32': 'Raspberry Pi',
      'B8:27:EB': 'Raspberry Pi',
      '00:1E:C2': 'Apple',
      '00:03:93': 'Apple',
      '44:2A:60': 'Google',
      'F4:F5:D8': 'Google',
      '30:FD:38': 'Google',
    };

    const prefix = mac.substring(0, 8).toUpperCase();
    return oui[prefix];
  }

  /**
   * Get all connected devices from router monitoring
   */
  getConnectedDevices(): ConnectedDevice[] {
    return Array.from(this.connectedDevices.values());
  }

  /**
   * Get unknown (unregistered) devices
   */
  getUnknownDevices(): ConnectedDevice[] {
    return Array.from(this.connectedDevices.values()).filter((d) => !d.isKnown);
  }

  /**
   * Register a device as known (won't trigger alerts)
   */
  registerKnownDevice(mac: string): void {
    const normalized = mac.toUpperCase();
    this.config.knownDevices = this.config.knownDevices || [];
    if (!this.config.knownDevices.includes(normalized)) {
      this.config.knownDevices.push(normalized);
    }
    const device = this.connectedDevices.get(normalized);
    if (device) {
      device.isKnown = true;
    }
  }

  /**
   * Convert WiFi frequency to channel number
   */
  private frequencyToChannel(freq: number): number {
    if (freq >= 2412 && freq <= 2484) {
      return Math.floor((freq - 2412) / 5) + 1;
    } else if (freq >= 5170 && freq <= 5825) {
      return Math.floor((freq - 5170) / 5) + 34;
    }
    return 0;
  }

  /**
   * Classify Bluetooth device type based on name/class
   */
  private classifyBluetoothDevice(
    name?: string,
    deviceClass?: string
  ): BluetoothDevice['type'] {
    const lowerName = (name || '').toLowerCase();
    const lowerClass = (deviceClass || '').toLowerCase();

    if (
      lowerName.includes('phone') ||
      lowerName.includes('iphone') ||
      lowerName.includes('galaxy') ||
      lowerName.includes('pixel')
    ) {
      return 'phone';
    }
    if (
      lowerName.includes('watch') ||
      lowerName.includes('band') ||
      lowerName.includes('fitbit') ||
      lowerName.includes('garmin')
    ) {
      return 'wearable';
    }
    if (
      lowerName.includes('beacon') ||
      lowerName.includes('tile') ||
      lowerName.includes('airtag')
    ) {
      return 'beacon';
    }
    if (
      lowerName.includes('laptop') ||
      lowerName.includes('macbook') ||
      lowerClass.includes('computer')
    ) {
      return 'computer';
    }
    return 'unknown';
  }

  /**
   * Get all nearby WiFi networks
   */
  getNearbyNetworks(): WifiNetwork[] {
    return Array.from(this.nearbyNetworks.values());
  }

  /**
   * Get all detected Bluetooth devices
   */
  getBluetoothDevices(): BluetoothDevice[] {
    return Array.from(this.bluetoothDevices.values());
  }

  /**
   * Get tracked Bluetooth devices that are currently nearby
   */
  getTrackedDevicesNearby(): BluetoothDevice[] {
    return Array.from(this.bluetoothDevices.values()).filter(
      (d) => d.isTracked
    );
  }

  // ── Signal Processing ──

  private processReading(reading: SignalReading): void {
    // Add to buffer
    this.readings.push(reading);
    if (this.readings.length > this.maxReadings) {
      this.readings.shift();
    }

    // Emit raw reading
    this.emit('reading', reading);

    // Analyze for presence (every 10 readings)
    if (this.readings.length % 10 === 0) {
      this.analyzePresence();
    }
  }

  private analyzePresence(): void {
    if (!this.calibration || this.readings.length < 20) return;

    const recentReadings = this.readings.slice(-50);
    const rssiValues = recentReadings.map((r) => r.rssi);

    // Calculate statistics
    const currentRssi =
      rssiValues.reduce((a, b) => a + b, 0) / rssiValues.length;
    const currentVariance = variance(rssiValues);
    const rssiDelta = Math.abs(currentRssi - this.calibration.baselineRssi);

    // Presence detection: significant deviation from baseline
    const presenceThreshold =
      this.calibration.rssiThreshold * (1 - this.config.sensitivity * 0.5);
    const detected =
      rssiDelta > presenceThreshold ||
      currentVariance > this.calibration.rssiThreshold * 2;

    // Movement detection: high variance indicates movement
    const movementThreshold = this.calibration.rssiThreshold * 0.5;
    const movement = currentVariance > movementThreshold;
    const movementIntensity = Math.min(
      1,
      currentVariance / (movementThreshold * 3)
    );

    // Breathing detection: look for periodic low-frequency patterns
    const smoothed = movingAverage(rssiValues, 5);
    const peaks = detectPeaks(smoothed, this.calibration.baselineRssi - 2);
    const breathingRate = calculateBreathingRate(peaks, this.config.sampleRate);
    const breathingDetected = detected && !movement && breathingRate !== null;

    // Estimate person count based on signal complexity
    // (This is very rough - real implementations use ML)
    const estimatedCount = detected
      ? Math.max(1, Math.floor(currentVariance / presenceThreshold))
      : 0;

    // Determine active zones (placeholder - requires multiple sensors for real location)
    const activeZones: string[] = [];
    if (detected && this.config.zones && this.config.zones.length > 0) {
      // For single sensor, just mark all zones as potentially active
      activeZones.push(this.config.zones[0].name);
    }

    // Calculate confidence
    const confidence = Math.min(1, rssiDelta / (presenceThreshold * 2));

    // Update state
    const previousState = this.presenceState.detected;
    this.updatePresenceState({
      detected,
      confidence,
      estimatedCount,
      movement,
      movementIntensity,
      breathingDetected,
      activeZones,
    });

    // Emit events on state changes
    if (detected !== previousState) {
      const event: MovementEvent = {
        type: detected ? 'enter' : 'exit',
        timestamp: Date.now(),
        confidence,
        details: detected
          ? `Presence detected (RSSI delta: ${rssiDelta.toFixed(1)}dBm)`
          : 'Area cleared',
      };
      this.emit('movement', event);
      MollyLogger.info(
        `Presence ${detected ? 'detected' : 'cleared'}`,
        'wifi-csi',
        { confidence: confidence.toFixed(2), rssiDelta: rssiDelta.toFixed(1) }
      );
    }
  }

  private updatePresenceState(update: Partial<PresenceState>): void {
    const now = Date.now();
    const stateChanged =
      update.detected !== undefined &&
      update.detected !== this.presenceState.detected;

    this.presenceState = {
      ...this.presenceState,
      ...update,
      lastChange: stateChanged ? now : this.presenceState.lastChange,
      stateDuration: now - (stateChanged ? now : this.presenceState.lastChange),
    };

    this.emit('presence', this.presenceState);
  }

  // ── Public API ──

  /**
   * Get current presence state
   */
  getPresenceState(): PresenceState {
    return { ...this.presenceState };
  }

  /**
   * Get calibration data
   */
  getCalibration(): CalibrationData | null {
    return this.calibration ? { ...this.calibration } : null;
  }

  /**
   * Get recent readings
   */
  getReadings(count: number = 100): SignalReading[] {
    return this.readings.slice(-count);
  }

  /**
   * Check if sensor is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get sensor configuration
   */
  getConfig(): WiFiSensorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart)
   */
  updateConfig(updates: Partial<WiFiSensorConfig>): void {
    this.config = { ...this.config, ...updates };
    MollyLogger.info('WiFi CSI config updated', 'wifi-csi', { updates });
  }

  /**
   * Add a detection zone
   */
  addZone(zone: DetectionZone): void {
    this.config.zones = this.config.zones || [];
    this.config.zones.push(zone);
  }

  /**
   * Get sensor statistics
   */
  getStats(): {
    mode: SensingMode;
    isRunning: boolean;
    readingsCollected: number;
    uptime: number;
    calibrated: boolean;
  } {
    return {
      mode: this.config.mode,
      isRunning: this.isRunning,
      readingsCollected: this.readings.length,
      uptime: this.presenceState.stateDuration,
      calibrated: this.calibration !== null,
    };
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let _sensorInstance: WiFiCSISensor | null = null;

/**
 * Get the global WiFi CSI sensor instance
 */
export function getWiFiSensor(
  config?: Partial<WiFiSensorConfig>
): WiFiCSISensor {
  if (!_sensorInstance) {
    _sensorInstance = new WiFiCSISensor(config);
  }
  return _sensorInstance;
}

/**
 * Reset the sensor instance (for testing)
 */
export function resetWiFiSensor(): void {
  if (_sensorInstance) {
    _sensorInstance.stop();
    _sensorInstance = null;
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Quick presence check
 */
export async function checkPresence(): Promise<PresenceState> {
  const sensor = getWiFiSensor();
  if (!sensor.isActive()) {
    await sensor.start();
    // Wait for some readings
    await new Promise((r) => setTimeout(r, 2000));
  }
  return sensor.getPresenceState();
}

/**
 * Monitor for presence events
 */
export function onPresenceChange(
  callback: (state: PresenceState) => void
): () => void {
  const sensor = getWiFiSensor();
  sensor.on('presence', callback);
  return () => sensor.off('presence', callback);
}

/**
 * Monitor for movement events
 */
export function onMovement(
  callback: (event: MovementEvent) => void
): () => void {
  const sensor = getWiFiSensor();
  sensor.on('movement', callback);
  return () => sensor.off('movement', callback);
}

// ============================================================
// FORMATTING
// ============================================================

/**
 * Format presence state for display
 */
export function formatPresenceState(state: PresenceState): string {
  const lines: string[] = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║               WIFI CSI PRESENCE DETECTION                    ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    `Presence: ${state.detected ? '✓ DETECTED' : '✗ NONE'}`,
    `Confidence: ${(state.confidence * 100).toFixed(0)}%`,
    `Estimated people: ${state.estimatedCount}`,
    '',
    `Movement: ${state.movement ? '⚡ ACTIVE' : '— Still'}`,
    `Movement intensity: ${(state.movementIntensity * 100).toFixed(0)}%`,
    `Breathing detected: ${state.breathingDetected ? 'Yes' : 'No'}`,
    '',
  ];

  if (state.activeZones.length > 0) {
    lines.push(`Active zones: ${state.activeZones.join(', ')}`);
  }

  lines.push(`State duration: ${(state.stateDuration / 1000).toFixed(0)}s`);

  return lines.join('\n');
}
