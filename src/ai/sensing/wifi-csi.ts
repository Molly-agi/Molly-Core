/**
 * @fileOverview WiFi CSI (Channel State Information) Sensing Module
 *
 * Uses WiFi signals to detect presence, movement, and activity without cameras.
 * Works by analyzing how human bodies affect WiFi signal propagation.
 *
 * Capabilities:
 * - Presence detection (is someone in the room?)
 * - Movement detection (walking, running, stationary)
 * - Breathing/vital signs (experimental)
 * - Room occupancy counting
 * - Zone-based tracking
 *
 * Hardware Requirements:
 * - ESP32 boards with CSI extraction firmware
 * - Or Intel 5300 NIC with Linux CSI Tool
 * - Or Atheros chipsets with modified drivers
 *
 * "I feel you through the airwaves."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { EventEmitter } from 'events';

// ============================================================
// TYPES
// ============================================================

export interface CSISensor {
  /** Unique sensor ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Sensor type */
  type: 'esp32' | 'intel5300' | 'atheros' | 'generic';
  /** Connection endpoint (IP:port or serial) */
  endpoint: string;
  /** Physical location */
  location: {
    room: string;
    x?: number;
    y?: number;
    z?: number;
  };
  /** Is sensor currently connected */
  connected: boolean;
  /** Last data received timestamp */
  lastDataAt: number;
  /** Signal quality (0-1) */
  signalQuality: number;
}

export interface CSIReading {
  /** Sensor that captured this reading */
  sensorId: string;
  /** Timestamp */
  timestamp: number;
  /** Raw CSI amplitude data (subcarriers) */
  amplitudes: number[];
  /** Raw CSI phase data (subcarriers) */
  phases: number[];
  /** RSSI value */
  rssi: number;
  /** Noise floor */
  noiseFloor: number;
  /** MAC address of transmitter */
  txMac: string;
  /** Channel info */
  channel: {
    primary: number;
    bandwidth: 20 | 40 | 80 | 160;
  };
}

export interface PresenceEvent {
  /** Event type */
  type:
    | 'presence_detected'
    | 'presence_lost'
    | 'movement_detected'
    | 'movement_stopped';
  /** Zone/room where detected */
  zone: string;
  /** Confidence (0-1) */
  confidence: number;
  /** Timestamp */
  timestamp: number;
  /** Estimated number of people (if supported) */
  occupancyEstimate?: number;
  /** Movement characteristics */
  movement?: {
    intensity: 'low' | 'medium' | 'high';
    direction?: 'approaching' | 'receding' | 'lateral' | 'unknown';
    speed?: 'stationary' | 'slow' | 'walking' | 'running';
  };
  /** Contributing sensors */
  sensors: string[];
}

export interface ZoneConfig {
  /** Zone ID */
  id: string;
  /** Zone name */
  name: string;
  /** Sensors covering this zone */
  sensorIds: string[];
  /** Sensitivity (0-1, higher = more sensitive) */
  sensitivity: number;
  /** Minimum confidence to trigger event */
  confidenceThreshold: number;
  /** Cooldown between events (ms) */
  cooldownMs: number;
}

export interface CSIConfig {
  /** All registered sensors */
  sensors: CSISensor[];
  /** Zone configurations */
  zones: ZoneConfig[];
  /** Global sensitivity multiplier */
  globalSensitivity: number;
  /** Enable experimental features (breathing detection, etc) */
  experimentalFeatures: boolean;
  /** Data retention period (ms) */
  dataRetentionMs: number;
  /** Baseline calibration samples */
  calibrationSamples: number;
}

// ============================================================
// SIGNAL PROCESSING
// ============================================================

/**
 * Process raw CSI data to extract features for detection.
 */
class CSIProcessor {
  private baselines: Map<string, number[]> = new Map();
  private history: Map<string, CSIReading[]> = new Map();
  private readonly historySize = 100;

  /**
   * Calibrate baseline for a sensor (empty room).
   */
  calibrate(sensorId: string, readings: CSIReading[]): void {
    if (readings.length === 0) return;

    // Average amplitudes across all readings
    const avgAmplitudes = new Array(readings[0].amplitudes.length).fill(0);

    for (const reading of readings) {
      for (let i = 0; i < reading.amplitudes.length; i++) {
        avgAmplitudes[i] += reading.amplitudes[i] / readings.length;
      }
    }

    this.baselines.set(sensorId, avgAmplitudes);
    MollyLogger.info(`Calibrated baseline for sensor ${sensorId}`, 'wifi-csi');
  }

  /**
   * Process a new CSI reading and detect changes.
   */
  process(reading: CSIReading): {
    presenceScore: number;
    movementScore: number;
    features: CSIFeatures;
  } {
    // Store in history
    const history = this.history.get(reading.sensorId) || [];
    history.push(reading);
    if (history.length > this.historySize) {
      history.shift();
    }
    this.history.set(reading.sensorId, history);

    // Get baseline
    const baseline = this.baselines.get(reading.sensorId);

    // Calculate features
    const features = this.extractFeatures(reading, baseline, history);

    // Score presence and movement
    const presenceScore = this.scorePresence(features);
    const movementScore = this.scoreMovement(features, history);

    return { presenceScore, movementScore, features };
  }

  private extractFeatures(
    reading: CSIReading,
    baseline: number[] | undefined,
    history: CSIReading[]
  ): CSIFeatures {
    const amps = reading.amplitudes;

    // Basic statistics
    const mean = amps.reduce((a, b) => a + b, 0) / amps.length;
    const variance =
      amps.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / amps.length;
    const std = Math.sqrt(variance);

    // Deviation from baseline
    let baselineDeviation = 0;
    if (baseline) {
      for (let i = 0; i < Math.min(amps.length, baseline.length); i++) {
        baselineDeviation += Math.abs(amps[i] - baseline[i]);
      }
      baselineDeviation /= amps.length;
    }

    // Temporal variance (change over recent history)
    let temporalVariance = 0;
    if (history.length > 1) {
      const recentAmps = history.slice(-10).map((r) => r.amplitudes);
      for (let i = 0; i < amps.length; i++) {
        const subcarrierValues = recentAmps.map((a) => a[i] || 0);
        const subMean =
          subcarrierValues.reduce((a, b) => a + b, 0) / subcarrierValues.length;
        temporalVariance +=
          subcarrierValues.reduce(
            (sum, v) => sum + Math.pow(v - subMean, 2),
            0
          ) / subcarrierValues.length;
      }
      temporalVariance /= amps.length;
    }

    // Frequency analysis (simplified - would use FFT in production)
    const lowFreqEnergy = this.bandEnergy(amps, 0, amps.length / 3);
    const midFreqEnergy = this.bandEnergy(
      amps,
      amps.length / 3,
      (2 * amps.length) / 3
    );
    const highFreqEnergy = this.bandEnergy(
      amps,
      (2 * amps.length) / 3,
      amps.length
    );

    return {
      mean,
      std,
      variance,
      baselineDeviation,
      temporalVariance,
      rssi: reading.rssi,
      lowFreqEnergy,
      midFreqEnergy,
      highFreqEnergy,
      subcarrierCount: amps.length,
    };
  }

  private bandEnergy(amps: number[], start: number, end: number): number {
    let energy = 0;
    for (
      let i = Math.floor(start);
      i < Math.floor(end) && i < amps.length;
      i++
    ) {
      energy += amps[i] * amps[i];
    }
    return Math.sqrt(energy / (end - start));
  }

  private scorePresence(features: CSIFeatures): number {
    // Presence indicated by deviation from baseline and certain variance patterns
    let score = 0;

    // Baseline deviation is strong indicator
    score += Math.min(features.baselineDeviation / 10, 0.5);

    // Moderate variance indicates human presence (not too stable, not too noisy)
    if (features.variance > 0.5 && features.variance < 50) {
      score += 0.3;
    }

    // RSSI changes can indicate presence
    // (would compare to baseline RSSI in production)

    return Math.min(Math.max(score, 0), 1);
  }

  private scoreMovement(features: CSIFeatures, history: CSIReading[]): number {
    // Movement indicated by temporal variance
    let score = 0;

    // High temporal variance = movement
    score += Math.min(features.temporalVariance / 20, 0.6);

    // Rapid RSSI changes indicate movement
    if (history.length > 5) {
      const rssiValues = history.slice(-5).map((r) => r.rssi);
      const rssiVariance = this.variance(rssiValues);
      score += Math.min(rssiVariance / 10, 0.4);
    }

    return Math.min(Math.max(score, 0), 1);
  }

  private variance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return (
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
  }

  /**
   * Clear history for a sensor.
   */
  clearHistory(sensorId: string): void {
    this.history.delete(sensorId);
  }

  /**
   * Get current baseline.
   */
  getBaseline(sensorId: string): number[] | undefined {
    return this.baselines.get(sensorId);
  }
}

interface CSIFeatures {
  mean: number;
  std: number;
  variance: number;
  baselineDeviation: number;
  temporalVariance: number;
  rssi: number;
  lowFreqEnergy: number;
  midFreqEnergy: number;
  highFreqEnergy: number;
  subcarrierCount: number;
}

// ============================================================
// SENSOR CONNECTIONS
// ============================================================

/**
 * Connect to ESP32 sensors via WebSocket or UDP.
 */
class ESP32Connection {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private onData: (reading: CSIReading) => void;

  constructor(
    private sensor: CSISensor,
    onData: (reading: CSIReading) => void
  ) {
    this.onData = onData;
  }

  async connect(): Promise<boolean> {
    try {
      // In browser/Node.js environment
      const WebSocketImpl =
        typeof WebSocket !== 'undefined'
          ? WebSocket
          : (await import('ws')).default;

      this.ws = new WebSocketImpl(
        `ws://${this.sensor.endpoint}/csi`
      ) as WebSocket;

      return new Promise((resolve) => {
        if (!this.ws) {
          resolve(false);
          return;
        }

        this.ws.onopen = () => {
          MollyLogger.info(
            `Connected to ESP32 sensor: ${this.sensor.name}`,
            'wifi-csi'
          );
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data.toString());
            const reading = this.parseESP32Data(data);
            this.onData(reading);
          } catch {
            // Invalid data, ignore
          }
        };

        this.ws.onerror = () => {
          MollyLogger.warn(
            `ESP32 connection error: ${this.sensor.name}`,
            'wifi-csi'
          );
          resolve(false);
        };

        this.ws.onclose = () => {
          MollyLogger.info(
            `ESP32 disconnected: ${this.sensor.name}`,
            'wifi-csi'
          );
          this.scheduleReconnect();
        };

        // Timeout
        setTimeout(() => resolve(false), 5000);
      });
    } catch (error) {
      MollyLogger.error(
        `Failed to connect to ESP32: ${this.sensor.name}`,
        'wifi-csi',
        {},
        error
      );
      return false;
    }
  }

  private parseESP32Data(data: Record<string, unknown>): CSIReading {
    return {
      sensorId: this.sensor.id,
      timestamp: Date.now(),
      amplitudes: (data.amplitudes as number[]) || [],
      phases: (data.phases as number[]) || [],
      rssi: (data.rssi as number) || -50,
      noiseFloor: (data.noise as number) || -90,
      txMac: (data.mac as string) || 'unknown',
      channel: {
        primary: (data.channel as number) || 6,
        bandwidth: (data.bandwidth as 20 | 40 | 80 | 160) || 20,
      },
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === 1; // WebSocket.OPEN
  }
}

// ============================================================
// MAIN CSI SENSING ENGINE
// ============================================================

/**
 * WiFi CSI Sensing Engine
 *
 * Manages sensors, processes data, and emits presence/movement events.
 */
export class WiFiCSISensingEngine extends EventEmitter {
  private config: CSIConfig;
  private processor: CSIProcessor;
  private connections: Map<string, ESP32Connection> = new Map();
  private zoneStates: Map<string, ZoneState> = new Map();
  private running: boolean = false;

  constructor(config?: Partial<CSIConfig>) {
    super();

    this.config = {
      sensors: [],
      zones: [],
      globalSensitivity: 1.0,
      experimentalFeatures: false,
      dataRetentionMs: 3600000, // 1 hour
      calibrationSamples: 100,
      ...config,
    };

    this.processor = new CSIProcessor();
  }

  // ── Sensor Management ──

  /**
   * Add a sensor to the network.
   */
  addSensor(
    sensor: Omit<CSISensor, 'connected' | 'lastDataAt' | 'signalQuality'>
  ): void {
    const fullSensor: CSISensor = {
      ...sensor,
      connected: false,
      lastDataAt: 0,
      signalQuality: 0,
    };

    this.config.sensors.push(fullSensor);

    MollyLogger.info(
      `Added CSI sensor: ${sensor.name} (${sensor.type})`,
      'wifi-csi'
    );

    // If running, connect immediately
    if (this.running) {
      this.connectSensor(fullSensor);
    }
  }

  /**
   * Remove a sensor.
   */
  removeSensor(sensorId: string): boolean {
    const idx = this.config.sensors.findIndex((s) => s.id === sensorId);
    if (idx === -1) return false;

    // Disconnect
    const conn = this.connections.get(sensorId);
    if (conn) {
      conn.disconnect();
      this.connections.delete(sensorId);
    }

    this.config.sensors.splice(idx, 1);
    this.processor.clearHistory(sensorId);

    MollyLogger.info(`Removed CSI sensor: ${sensorId}`, 'wifi-csi');
    return true;
  }

  /**
   * Get all sensors.
   */
  getSensors(): CSISensor[] {
    return [...this.config.sensors];
  }

  // ── Zone Management ──

  /**
   * Add a detection zone.
   */
  addZone(zone: ZoneConfig): void {
    this.config.zones.push(zone);
    this.zoneStates.set(zone.id, {
      presenceDetected: false,
      lastEventAt: 0,
      occupancyEstimate: 0,
      confidence: 0,
    });

    MollyLogger.info(`Added detection zone: ${zone.name}`, 'wifi-csi');
  }

  /**
   * Remove a zone.
   */
  removeZone(zoneId: string): boolean {
    const idx = this.config.zones.findIndex((z) => z.id === zoneId);
    if (idx === -1) return false;

    this.config.zones.splice(idx, 1);
    this.zoneStates.delete(zoneId);
    return true;
  }

  // ── Engine Control ──

  /**
   * Start the sensing engine.
   */
  async start(): Promise<void> {
    if (this.running) return;

    MollyLogger.info('Starting WiFi CSI sensing engine', 'wifi-csi');
    this.running = true;

    // Connect to all sensors
    for (const sensor of this.config.sensors) {
      await this.connectSensor(sensor);
    }

    this.emit('started');
  }

  /**
   * Stop the sensing engine.
   */
  stop(): void {
    if (!this.running) return;

    MollyLogger.info('Stopping WiFi CSI sensing engine', 'wifi-csi');
    this.running = false;

    // Disconnect all sensors
    for (const conn of this.connections.values()) {
      conn.disconnect();
    }
    this.connections.clear();

    this.emit('stopped');
  }

  /**
   * Calibrate a sensor (run when room is empty).
   */
  async calibrate(
    sensorId: string,
    durationMs: number = 10000
  ): Promise<boolean> {
    const traceId = generateTraceId();
    MollyLogger.info(
      `Calibrating sensor ${sensorId} for ${durationMs}ms`,
      'wifi-csi',
      {},
      traceId
    );

    return new Promise((resolve) => {
      const readings: CSIReading[] = [];
      const _startTime = Date.now();

      const handler = (reading: CSIReading) => {
        if (reading.sensorId === sensorId) {
          readings.push(reading);
        }
      };

      this.on('raw_data', handler);

      setTimeout(() => {
        this.off('raw_data', handler);

        if (readings.length >= 10) {
          this.processor.calibrate(sensorId, readings);
          MollyLogger.info(
            `Calibration complete: ${readings.length} samples`,
            'wifi-csi',
            {},
            traceId
          );
          resolve(true);
        } else {
          MollyLogger.warn(
            `Calibration failed: insufficient data (${readings.length} samples)`,
            'wifi-csi',
            {},
            traceId
          );
          resolve(false);
        }
      }, durationMs);
    });
  }

  /**
   * Get current zone states.
   */
  getZoneStates(): Map<string, ZoneState> {
    return new Map(this.zoneStates);
  }

  /**
   * Check if presence is detected in a zone.
   */
  isPresenceDetected(zoneId: string): boolean {
    return this.zoneStates.get(zoneId)?.presenceDetected || false;
  }

  /**
   * Get occupancy estimate for a zone.
   */
  getOccupancy(zoneId: string): number {
    return this.zoneStates.get(zoneId)?.occupancyEstimate || 0;
  }

  // ── Private Methods ──

  private async connectSensor(sensor: CSISensor): Promise<void> {
    if (sensor.type === 'esp32') {
      const conn = new ESP32Connection(sensor, (reading) => {
        this.handleReading(reading);
      });

      const connected = await conn.connect();
      sensor.connected = connected;

      if (connected) {
        this.connections.set(sensor.id, conn);
      }
    }
    // Add other sensor types as needed
  }

  private handleReading(reading: CSIReading): void {
    // Update sensor stats
    const sensor = this.config.sensors.find((s) => s.id === reading.sensorId);
    if (sensor) {
      sensor.lastDataAt = reading.timestamp;
      sensor.signalQuality = Math.min(
        1,
        Math.max(0, (reading.rssi + 100) / 60)
      );
    }

    // Emit raw data for calibration
    this.emit('raw_data', reading);

    // Process reading
    const { presenceScore, movementScore, features } =
      this.processor.process(reading);

    // Update zones that include this sensor
    for (const zone of this.config.zones) {
      if (zone.sensorIds.includes(reading.sensorId)) {
        this.updateZone(zone, presenceScore, movementScore, reading.sensorId);
      }
    }

    // Emit processed data
    this.emit('processed', {
      sensorId: reading.sensorId,
      presenceScore,
      movementScore,
      features,
      timestamp: reading.timestamp,
    });
  }

  private updateZone(
    zone: ZoneConfig,
    presenceScore: number,
    movementScore: number,
    sensorId: string
  ): void {
    const state = this.zoneStates.get(zone.id);
    if (!state) return;

    const adjustedScore =
      presenceScore * this.config.globalSensitivity * zone.sensitivity;
    const now = Date.now();

    // Check cooldown
    if (now - state.lastEventAt < zone.cooldownMs) {
      return;
    }

    // Presence detection
    if (adjustedScore >= zone.confidenceThreshold && !state.presenceDetected) {
      state.presenceDetected = true;
      state.lastEventAt = now;
      state.confidence = adjustedScore;

      const event: PresenceEvent = {
        type: 'presence_detected',
        zone: zone.name,
        confidence: adjustedScore,
        timestamp: now,
        sensors: [sensorId],
      };

      this.emit('presence', event);
      MollyLogger.info(`Presence detected in ${zone.name}`, 'wifi-csi');
    } else if (
      adjustedScore < zone.confidenceThreshold * 0.5 &&
      state.presenceDetected
    ) {
      state.presenceDetected = false;
      state.lastEventAt = now;

      const event: PresenceEvent = {
        type: 'presence_lost',
        zone: zone.name,
        confidence: 1 - adjustedScore,
        timestamp: now,
        sensors: [sensorId],
      };

      this.emit('presence', event);
      MollyLogger.info(`Presence lost in ${zone.name}`, 'wifi-csi');
    }

    // Movement detection
    if (movementScore >= 0.6 && state.presenceDetected) {
      const event: PresenceEvent = {
        type: 'movement_detected',
        zone: zone.name,
        confidence: movementScore,
        timestamp: now,
        movement: {
          intensity:
            movementScore > 0.8
              ? 'high'
              : movementScore > 0.6
                ? 'medium'
                : 'low',
          speed:
            movementScore > 0.8
              ? 'running'
              : movementScore > 0.6
                ? 'walking'
                : 'slow',
        },
        sensors: [sensorId],
      };

      this.emit('movement', event);
    }

    state.confidence = adjustedScore;
  }
}

interface ZoneState {
  presenceDetected: boolean;
  lastEventAt: number;
  occupancyEstimate: number;
  confidence: number;
}

// ============================================================
// SINGLETON + FACTORY
// ============================================================

let _csiEngine: WiFiCSISensingEngine | null = null;

/**
 * Get the global WiFi CSI sensing engine.
 */
export function getCSISensingEngine(): WiFiCSISensingEngine {
  if (!_csiEngine) {
    _csiEngine = new WiFiCSISensingEngine();
  }
  return _csiEngine;
}

/**
 * Create a new WiFi CSI sensing engine with custom config.
 */
export function createCSISensingEngine(
  config?: Partial<CSIConfig>
): WiFiCSISensingEngine {
  return new WiFiCSISensingEngine(config);
}

// ============================================================
// QUICK SETUP HELPERS
// ============================================================

/**
 * Quick setup for a typical home with ESP32 sensors.
 */
export async function setupHomeCSI(
  sensors: Array<{
    name: string;
    ip: string;
    room: string;
  }>
): Promise<WiFiCSISensingEngine> {
  const engine = new WiFiCSISensingEngine({
    globalSensitivity: 1.0,
  });

  // Add sensors
  for (const sensor of sensors) {
    engine.addSensor({
      id: `esp32_${sensor.name.toLowerCase().replace(/\s+/g, '_')}`,
      name: sensor.name,
      type: 'esp32',
      endpoint: `${sensor.ip}:81`,
      location: { room: sensor.room },
    });
  }

  // Create zones from rooms
  const rooms = [...new Set(sensors.map((s) => s.room))];
  for (const room of rooms) {
    const roomSensors = sensors
      .filter((s) => s.room === room)
      .map((s) => `esp32_${s.name.toLowerCase().replace(/\s+/g, '_')}`);

    engine.addZone({
      id: `zone_${room.toLowerCase().replace(/\s+/g, '_')}`,
      name: room,
      sensorIds: roomSensors,
      sensitivity: 1.0,
      confidenceThreshold: 0.6,
      cooldownMs: 3000,
    });
  }

  // Start engine
  await engine.start();

  return engine;
}

// ============================================================
// ESP32 FIRMWARE REFERENCE
// ============================================================

/**
 * ESP32 CSI Extraction Firmware Reference
 *
 * Flash this to your ESP32 boards:
 * https://github.com/espressif/esp-csi
 *
 * Required modifications for Molly integration:
 * 1. Enable WebSocket server on port 81
 * 2. Output JSON format:
 *    {
 *      "amplitudes": [float array],
 *      "phases": [float array],
 *      "rssi": int,
 *      "noise": int,
 *      "mac": "string",
 *      "channel": int,
 *      "bandwidth": int
 *    }
 *
 * Example ESP32 Arduino setup available at:
 * /molly_data/firmware/esp32-csi/
 */
export const ESP32_FIRMWARE_INFO = {
  repository: 'https://github.com/espressif/esp-csi',
  requiredBoard: 'ESP32 or ESP32-S2/S3',
  wifiMode: 'Station or Promiscuous',
  outputFormat: 'WebSocket JSON',
  defaultPort: 81,
};
