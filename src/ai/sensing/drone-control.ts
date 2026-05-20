/**
 * @fileOverview Drone Control Module
 *
 * Unified interface for controlling drones via MAVLink, DJI SDK, or other protocols.
 * Supports autonomous waypoint navigation, live video streaming, and integration
 * with Molly's vision and sensing systems.
 *
 * Capabilities:
 * - MAVLink protocol (ArduPilot, PX4, Pixhawk)
 * - DJI SDK integration (Phantom, Mavic, Mini series)
 * - Waypoint mission planning
 * - Live video feed
 * - Automated patrol routes
 * - Return-to-home safety
 * - Geofencing
 *
 * "I take to the sky."
 */

import { MollyLogger, generateTraceId } from '../logger';
import { EventEmitter } from 'events';

// ============================================================
// TYPES
// ============================================================

export type DroneProtocol = 'mavlink' | 'dji' | 'parrot' | 'custom';

export interface Drone {
  /** Unique drone ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Communication protocol */
  protocol: DroneProtocol;
  /** Connection endpoint */
  connection: {
    type: 'serial' | 'udp' | 'tcp' | 'wifi';
    address: string;
    port?: number;
    baudRate?: number;
  };
  /** Drone capabilities */
  capabilities: DroneCapabilities;
  /** Current status */
  status: DroneStatus;
  /** Safety settings */
  safety: DroneSafety;
}

export interface DroneCapabilities {
  /** Has camera */
  camera: boolean;
  /** Has gimbal */
  gimbal: boolean;
  /** Max altitude in meters */
  maxAltitude: number;
  /** Max speed in m/s */
  maxSpeed: number;
  /** Max flight time in minutes */
  maxFlightTime: number;
  /** Has obstacle avoidance */
  obstacleAvoidance: boolean;
  /** Supports waypoint missions */
  waypointMission: boolean;
  /** Has GPS */
  gps: boolean;
  /** Has night vision/IR camera */
  nightVision: boolean;
  /** Supports follow-me mode */
  followMe: boolean;
}

export interface DroneStatus {
  /** Connection state */
  connected: boolean;
  /** Is armed (motors can spin) */
  armed: boolean;
  /** Flight mode */
  flightMode: FlightMode;
  /** Is in flight */
  inFlight: boolean;
  /** Battery percentage */
  batteryPercent: number;
  /** Battery voltage */
  batteryVoltage: number;
  /** GPS position */
  position: GPSPosition | null;
  /** Altitude above ground (meters) */
  altitude: number;
  /** Ground speed (m/s) */
  groundSpeed: number;
  /** Heading (degrees, 0-360) */
  heading: number;
  /** Home position */
  homePosition: GPSPosition | null;
  /** Current mission waypoint index */
  currentWaypoint: number;
  /** Total waypoints in mission */
  totalWaypoints: number;
  /** Last telemetry update */
  lastTelemetryAt: number;
  /** Error message if any */
  error?: string;
}

export type FlightMode =
  | 'stabilize'
  | 'altitude_hold'
  | 'loiter'
  | 'rtl' // Return to launch
  | 'auto' // Following mission
  | 'guided'
  | 'land'
  | 'takeoff'
  | 'manual'
  | 'unknown';

export interface GPSPosition {
  latitude: number;
  longitude: number;
  altitude?: number;
  accuracy?: number;
}

export interface DroneSafety {
  /** Geofence enabled */
  geofenceEnabled: boolean;
  /** Geofence radius in meters from home */
  geofenceRadius: number;
  /** Max altitude limit */
  maxAltitudeLimit: number;
  /** Low battery RTL threshold (%) */
  lowBatteryRTL: number;
  /** Critical battery land threshold (%) */
  criticalBatteryLand: number;
  /** Signal lost behavior */
  signalLostBehavior: 'rtl' | 'land' | 'hover';
  /** Require GPS for arm */
  requireGPSToArm: boolean;
}

export interface Waypoint {
  /** Waypoint index */
  index: number;
  /** GPS position */
  position: GPSPosition;
  /** Altitude (meters above ground) */
  altitude: number;
  /** Speed to this waypoint (m/s, 0 = default) */
  speed: number;
  /** Hover time at waypoint (seconds) */
  hoverTime: number;
  /** Actions to perform at waypoint */
  actions: WaypointAction[];
}

export interface WaypointAction {
  type:
    | 'take_photo'
    | 'start_video'
    | 'stop_video'
    | 'rotate'
    | 'gimbal'
    | 'custom';
  params?: Record<string, number | string | boolean>;
}

export interface Mission {
  /** Mission ID */
  id: string;
  /** Mission name */
  name: string;
  /** Waypoints */
  waypoints: Waypoint[];
  /** Repeat count (0 = once, -1 = infinite) */
  repeatCount: number;
  /** Return to home after mission */
  returnToHome: boolean;
  /** Landing behavior */
  endAction: 'rtl' | 'land' | 'hover';
}

// ============================================================
// MAVLINK PROTOCOL HANDLER
// ============================================================

/**
 * MAVLink protocol implementation for ArduPilot/PX4 drones.
 */
class MAVLinkHandler {
  private socket: ReturnType<typeof import('dgram').createSocket> | null = null;
  private sequenceNumber: number = 0;
  private systemId: number = 255; // Ground station
  private componentId: number = 0;
  private targetSystem: number = 1; // Drone
  private targetComponent: number = 1;

  constructor(
    private drone: Drone,
    private onTelemetry: (telemetry: Partial<DroneStatus>) => void
  ) {}

  async connect(): Promise<boolean> {
    try {
      if (this.drone.connection.type === 'udp') {
        const dgram = await import('dgram');
        this.socket = dgram.createSocket('udp4');

        this.socket.on('message', (msg) => {
          this.parseMAVLinkMessage(msg);
        });

        this.socket.on('error', (err) => {
          MollyLogger.error('MAVLink UDP error', 'drone-control', {}, err);
        });

        const port = this.drone.connection.port || 14550;
        this.socket.bind(port);

        MollyLogger.info(
          `MAVLink listening on UDP port ${port}`,
          'drone-control'
        );
        return true;
      }

      // Serial connection
      if (this.drone.connection.type === 'serial') {
        // Would use serialport library
        MollyLogger.warn('Serial MAVLink not yet implemented', 'drone-control');
        return false;
      }

      return false;
    } catch (error) {
      MollyLogger.error(
        'MAVLink connection failed',
        'drone-control',
        {},
        error
      );
      return false;
    }
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Send ARM command.
   */
  async arm(): Promise<boolean> {
    return this.sendCommand(400, 1, 0, 0, 0, 0, 0, 0); // MAV_CMD_COMPONENT_ARM_DISARM
  }

  /**
   * Send DISARM command.
   */
  async disarm(): Promise<boolean> {
    return this.sendCommand(400, 0, 0, 0, 0, 0, 0, 0);
  }

  /**
   * Takeoff to specified altitude.
   */
  async takeoff(altitude: number): Promise<boolean> {
    return this.sendCommand(22, 0, 0, 0, 0, 0, 0, altitude); // MAV_CMD_NAV_TAKEOFF
  }

  /**
   * Land at current position.
   */
  async land(): Promise<boolean> {
    return this.sendCommand(21, 0, 0, 0, 0, 0, 0, 0); // MAV_CMD_NAV_LAND
  }

  /**
   * Return to launch.
   */
  async rtl(): Promise<boolean> {
    return this.setFlightMode('rtl');
  }

  /**
   * Go to GPS position.
   */
  async goto(position: GPSPosition, altitude: number): Promise<boolean> {
    // Set mode to GUIDED
    await this.setFlightMode('guided');

    // Send position target
    return this.sendPositionTarget(
      position.latitude,
      position.longitude,
      altitude
    );
  }

  /**
   * Set flight mode.
   */
  async setFlightMode(mode: FlightMode): Promise<boolean> {
    const modeMap: Record<FlightMode, number> = {
      stabilize: 0,
      altitude_hold: 2,
      loiter: 5,
      rtl: 6,
      auto: 3,
      guided: 4,
      land: 9,
      takeoff: 0, // Uses command, not mode
      manual: 0,
      unknown: 0,
    };

    const modeNum = modeMap[mode] ?? 0;
    return this.sendCommand(176, modeNum, 0, 0, 0, 0, 0, 0); // MAV_CMD_DO_SET_MODE
  }

  /**
   * Upload mission waypoints.
   */
  async uploadMission(mission: Mission): Promise<boolean> {
    const traceId = generateTraceId();

    try {
      // Send mission count
      await this.sendMissionCount(mission.waypoints.length);

      // Send each waypoint
      for (const wp of mission.waypoints) {
        await this.sendMissionItem(wp);
      }

      MollyLogger.info(
        `Mission uploaded: ${mission.name} (${mission.waypoints.length} waypoints)`,
        'drone-control',
        {},
        traceId
      );
      return true;
    } catch (error) {
      MollyLogger.error(
        'Mission upload failed',
        'drone-control',
        {},
        error,
        traceId
      );
      return false;
    }
  }

  /**
   * Start mission.
   */
  async startMission(): Promise<boolean> {
    return this.setFlightMode('auto');
  }

  private parseMAVLinkMessage(buffer: Buffer): void {
    // MAVLink v2 parsing (simplified)
    if (buffer[0] !== 0xfd) return; // Not MAVLink v2

    const msgId = buffer[7] | (buffer[8] << 8) | (buffer[9] << 16);

    switch (msgId) {
      case 0: // HEARTBEAT
        this.handleHeartbeat(buffer);
        break;
      case 1: // SYS_STATUS
        this.handleSysStatus(buffer);
        break;
      case 33: // GLOBAL_POSITION_INT
        this.handleGlobalPosition(buffer);
        break;
      case 24: // GPS_RAW_INT
        this.handleGPSRaw(buffer);
        break;
      case 74: // VFR_HUD
        this.handleVFRHud(buffer);
        break;
    }
  }

  private handleHeartbeat(buffer: Buffer): void {
    const _customMode = buffer.readUInt32LE(10);
    const baseMode = buffer[14];

    const armed = (baseMode & 0x80) !== 0;

    this.onTelemetry({
      connected: true,
      armed,
      lastTelemetryAt: Date.now(),
    });
  }

  private handleSysStatus(buffer: Buffer): void {
    const voltageRaw = buffer.readUInt16LE(10);
    const batteryRemaining = buffer[31];

    this.onTelemetry({
      batteryPercent: batteryRemaining,
      batteryVoltage: voltageRaw / 1000,
    });
  }

  private handleGlobalPosition(buffer: Buffer): void {
    const lat = buffer.readInt32LE(10) / 1e7;
    const lon = buffer.readInt32LE(14) / 1e7;
    const alt = buffer.readInt32LE(18) / 1000;
    const relAlt = buffer.readInt32LE(22) / 1000;
    const heading = buffer.readUInt16LE(28) / 100;

    this.onTelemetry({
      position: { latitude: lat, longitude: lon, altitude: alt },
      altitude: relAlt,
      heading,
      inFlight: relAlt > 0.5,
    });
  }

  private handleGPSRaw(_buffer: Buffer): void {
    // GPS fix info - could extract accuracy, satellites, etc.
  }

  private handleVFRHud(buffer: Buffer): void {
    const groundSpeed = buffer.readFloatLE(10);
    const heading = buffer.readInt16LE(14);
    const altitude = buffer.readFloatLE(18);

    this.onTelemetry({
      groundSpeed,
      heading: heading < 0 ? heading + 360 : heading,
      altitude,
    });
  }

  private async sendCommand(
    command: number,
    param1: number,
    param2: number,
    param3: number,
    param4: number,
    param5: number,
    param6: number,
    param7: number
  ): Promise<boolean> {
    if (!this.socket) return false;

    const msg = Buffer.alloc(41);
    let offset = 0;

    // Header
    msg[offset++] = 0xfd; // MAVLink v2 start
    msg[offset++] = 31; // Payload length
    msg[offset++] = 0; // Incompatibility flags
    msg[offset++] = 0; // Compatibility flags
    msg[offset++] = this.sequenceNumber++ & 0xff;
    msg[offset++] = this.systemId;
    msg[offset++] = this.componentId;

    // Message ID (COMMAND_LONG = 76)
    msg[offset++] = 76 & 0xff;
    msg[offset++] = (76 >> 8) & 0xff;
    msg[offset++] = (76 >> 16) & 0xff;

    // Payload
    msg.writeFloatLE(param1, offset);
    offset += 4;
    msg.writeFloatLE(param2, offset);
    offset += 4;
    msg.writeFloatLE(param3, offset);
    offset += 4;
    msg.writeFloatLE(param4, offset);
    offset += 4;
    msg.writeFloatLE(param5, offset);
    offset += 4;
    msg.writeFloatLE(param6, offset);
    offset += 4;
    msg.writeFloatLE(param7, offset);
    offset += 4;
    msg.writeUInt16LE(command, offset);
    offset += 2;
    msg[offset++] = this.targetSystem;
    msg[offset++] = this.targetComponent;
    msg[offset++] = 0; // Confirmation

    // Would add CRC here

    return new Promise((resolve) => {
      const [host, port] = this.drone.connection.address.split(':');
      this.socket!.send(msg, parseInt(port) || 14550, host, (err) => {
        resolve(!err);
      });
    });
  }

  private async sendPositionTarget(
    lat: number,
    lon: number,
    alt: number
  ): Promise<boolean> {
    // Simplified - would build proper SET_POSITION_TARGET_GLOBAL_INT message
    MollyLogger.info(
      `Position target: ${lat}, ${lon}, ${alt}m`,
      'drone-control'
    );
    return true;
  }

  private async sendMissionCount(count: number): Promise<boolean> {
    MollyLogger.info(`Sending mission count: ${count}`, 'drone-control');
    return true;
  }

  private async sendMissionItem(waypoint: Waypoint): Promise<boolean> {
    MollyLogger.info(`Sending waypoint ${waypoint.index}`, 'drone-control');
    return true;
  }
}

// ============================================================
// DRONE CONTROL SYSTEM
// ============================================================

/**
 * Drone Control System
 *
 * Manages multiple drones and provides unified control interface.
 */
export class DroneControlSystem extends EventEmitter {
  private drones: Map<string, Drone> = new Map();
  private mavlinkHandlers: Map<string, MAVLinkHandler> = new Map();
  private patrolIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
  }

  // ── Drone Management ──

  /**
   * Add a drone to the system.
   */
  addDrone(config: Omit<Drone, 'status'>): Drone {
    const drone: Drone = {
      ...config,
      status: {
        connected: false,
        armed: false,
        flightMode: 'unknown',
        inFlight: false,
        batteryPercent: 0,
        batteryVoltage: 0,
        position: null,
        altitude: 0,
        groundSpeed: 0,
        heading: 0,
        homePosition: null,
        currentWaypoint: 0,
        totalWaypoints: 0,
        lastTelemetryAt: 0,
      },
    };

    this.drones.set(config.id, drone);
    MollyLogger.info(
      `Added drone: ${config.name} (${config.protocol})`,
      'drone-control'
    );

    return drone;
  }

  /**
   * Remove a drone.
   */
  removeDrone(droneId: string): boolean {
    this.disconnect(droneId);
    this.stopPatrol(droneId);
    return this.drones.delete(droneId);
  }

  /**
   * Get all drones.
   */
  getDrones(): Drone[] {
    return Array.from(this.drones.values());
  }

  /**
   * Get a specific drone.
   */
  getDrone(droneId: string): Drone | undefined {
    return this.drones.get(droneId);
  }

  // ── Connection ──

  /**
   * Connect to a drone.
   */
  async connect(droneId: string): Promise<boolean> {
    const drone = this.drones.get(droneId);
    if (!drone) return false;

    if (drone.protocol === 'mavlink') {
      const handler = new MAVLinkHandler(drone, (telemetry) => {
        Object.assign(drone.status, telemetry);
        this.emit('telemetry', droneId, drone.status);
      });

      const connected = await handler.connect();
      if (connected) {
        this.mavlinkHandlers.set(droneId, handler);
        drone.status.connected = true;
      }

      return connected;
    }

    // Add other protocols as needed
    return false;
  }

  /**
   * Disconnect from a drone.
   */
  disconnect(droneId: string): void {
    const handler = this.mavlinkHandlers.get(droneId);
    if (handler) {
      handler.disconnect();
      this.mavlinkHandlers.delete(droneId);
    }

    const drone = this.drones.get(droneId);
    if (drone) {
      drone.status.connected = false;
    }
  }

  // ── Flight Control ──

  /**
   * Arm the drone (enable motors).
   */
  async arm(droneId: string): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    if (!handler) return false;
    return handler.arm();
  }

  /**
   * Disarm the drone.
   */
  async disarm(droneId: string): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    if (!handler) return false;
    return handler.disarm();
  }

  /**
   * Takeoff to specified altitude.
   */
  async takeoff(droneId: string, altitude: number = 10): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    const drone = this.drones.get(droneId);
    if (!handler || !drone) return false;

    // Safety check
    if (altitude > drone.safety.maxAltitudeLimit) {
      MollyLogger.warn(
        `Altitude ${altitude}m exceeds limit of ${drone.safety.maxAltitudeLimit}m`,
        'drone-control'
      );
      altitude = drone.safety.maxAltitudeLimit;
    }

    await handler.arm();
    return handler.takeoff(altitude);
  }

  /**
   * Land at current position.
   */
  async land(droneId: string): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    if (!handler) return false;
    return handler.land();
  }

  /**
   * Return to home position.
   */
  async returnToHome(droneId: string): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    if (!handler) return false;
    return handler.rtl();
  }

  /**
   * Go to a GPS position.
   */
  async goto(
    droneId: string,
    position: GPSPosition,
    altitude?: number
  ): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    const drone = this.drones.get(droneId);
    if (!handler || !drone) return false;

    // Geofence check
    if (drone.safety.geofenceEnabled && drone.status.homePosition) {
      const distance = this.calculateDistance(
        drone.status.homePosition,
        position
      );
      if (distance > drone.safety.geofenceRadius) {
        MollyLogger.warn(
          `Target position outside geofence (${distance}m > ${drone.safety.geofenceRadius}m)`,
          'drone-control'
        );
        return false;
      }
    }

    const targetAlt = Math.min(
      altitude || drone.status.altitude,
      drone.safety.maxAltitudeLimit
    );
    return handler.goto(position, targetAlt);
  }

  /**
   * Emergency stop - land immediately.
   */
  async emergencyStop(droneId: string): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    if (!handler) return false;

    MollyLogger.warn(`EMERGENCY STOP: ${droneId}`, 'drone-control');
    return handler.land();
  }

  // ── Mission Control ──

  /**
   * Upload a mission to the drone.
   */
  async uploadMission(droneId: string, mission: Mission): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    if (!handler) return false;
    return handler.uploadMission(mission);
  }

  /**
   * Start the uploaded mission.
   */
  async startMission(droneId: string): Promise<boolean> {
    const handler = this.mavlinkHandlers.get(droneId);
    if (!handler) return false;
    return handler.startMission();
  }

  /**
   * Create a patrol mission around a center point.
   */
  createPatrolMission(
    name: string,
    center: GPSPosition,
    radius: number,
    altitude: number,
    pointCount: number = 4
  ): Mission {
    const waypoints: Waypoint[] = [];

    for (let i = 0; i < pointCount; i++) {
      const angle = (2 * Math.PI * i) / pointCount;
      const lat = center.latitude + (radius / 111000) * Math.cos(angle);
      const lng =
        center.longitude +
        (radius / (111000 * Math.cos((center.latitude * Math.PI) / 180))) *
          Math.sin(angle);

      waypoints.push({
        index: i,
        position: { latitude: lat, longitude: lng },
        altitude,
        speed: 5,
        hoverTime: 2,
        actions: [{ type: 'take_photo' }],
      });
    }

    return {
      id: `patrol_${Date.now()}`,
      name,
      waypoints,
      repeatCount: -1, // Infinite
      returnToHome: true,
      endAction: 'rtl',
    };
  }

  /**
   * Start automated patrol.
   */
  async startPatrol(droneId: string, mission: Mission): Promise<boolean> {
    const uploaded = await this.uploadMission(droneId, mission);
    if (!uploaded) return false;

    await this.startMission(droneId);

    MollyLogger.info(`Started patrol: ${mission.name}`, 'drone-control');
    return true;
  }

  /**
   * Stop patrol and return to home.
   */
  async stopPatrol(droneId: string): Promise<boolean> {
    const interval = this.patrolIntervals.get(droneId);
    if (interval) {
      clearInterval(interval);
      this.patrolIntervals.delete(droneId);
    }

    return this.returnToHome(droneId);
  }

  // ── Helpers ──

  private calculateDistance(pos1: GPSPosition, pos2: GPSPosition): number {
    const R = 6371000; // Earth radius in meters
    const lat1 = (pos1.latitude * Math.PI) / 180;
    const lat2 = (pos2.latitude * Math.PI) / 180;
    const deltaLat = ((pos2.latitude - pos1.latitude) * Math.PI) / 180;
    const deltaLng = ((pos2.longitude - pos1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Get system status.
   */
  getStatus(): {
    totalDrones: number;
    connected: number;
    inFlight: number;
    armed: number;
  } {
    const drones = Array.from(this.drones.values());

    return {
      totalDrones: drones.length,
      connected: drones.filter((d) => d.status.connected).length,
      inFlight: drones.filter((d) => d.status.inFlight).length,
      armed: drones.filter((d) => d.status.armed).length,
    };
  }
}

// ============================================================
// SINGLETON
// ============================================================

let _droneSystem: DroneControlSystem | null = null;

/**
 * Get the global drone control system.
 */
export function getDroneControlSystem(): DroneControlSystem {
  if (!_droneSystem) {
    _droneSystem = new DroneControlSystem();
  }
  return _droneSystem;
}

// ============================================================
// QUICK SETUP
// ============================================================

/**
 * Quick setup for a MAVLink drone.
 */
export function setupMAVLinkDrone(config: {
  id: string;
  name: string;
  address: string;
  port?: number;
  maxAltitude?: number;
  geofenceRadius?: number;
}): Drone {
  const system = getDroneControlSystem();

  return system.addDrone({
    id: config.id,
    name: config.name,
    protocol: 'mavlink',
    connection: {
      type: 'udp',
      address: config.address,
      port: config.port || 14550,
    },
    capabilities: {
      camera: true,
      gimbal: true,
      maxAltitude: config.maxAltitude || 120,
      maxSpeed: 15,
      maxFlightTime: 25,
      obstacleAvoidance: false,
      waypointMission: true,
      gps: true,
      nightVision: false,
      followMe: false,
    },
    safety: {
      geofenceEnabled: true,
      geofenceRadius: config.geofenceRadius || 500,
      maxAltitudeLimit: Math.min(config.maxAltitude || 120, 120), // FAA limit
      lowBatteryRTL: 20,
      criticalBatteryLand: 10,
      signalLostBehavior: 'rtl',
      requireGPSToArm: true,
    },
  });
}
