/**
 * @fileOverview Molly's Sensing Module Index
 *
 * Unified exports for all sensing capabilities:
 * - WiFi CSI presence detection
 * - Remote camera control
 * - Drone control
 * - Night vision
 *
 * "I sense everything."
 */

// WiFi CSI Sensing
export {
  WiFiCSISensingEngine,
  getCSISensingEngine,
  createCSISensingEngine,
  setupHomeCSI,
  ESP32_FIRMWARE_INFO,
  type CSISensor,
  type CSIReading,
  type PresenceEvent,
  type ZoneConfig,
  type CSIConfig,
} from './wifi-csi';

// Camera Control
export {
  CameraControlSystem,
  getCameraControlSystem,
  setupRTSPCamera,
  type Camera,
  type CameraType,
  type CameraCapabilities,
  type CameraStatus,
  type NightVisionConfig as CameraNightVisionConfig,
  type PTZCommand,
  type CapturedFrame,
  type StreamConfig,
} from './camera-control';

// Drone Control
export {
  DroneControlSystem,
  getDroneControlSystem,
  setupMAVLinkDrone,
  type Drone,
  type DroneProtocol,
  type DroneCapabilities,
  type DroneStatus,
  type DroneSafety,
  type FlightMode,
  type GPSPosition,
  type Waypoint,
  type WaypointAction,
  type Mission,
} from './drone-control';

// Night Vision
export {
  NightVisionSystem,
  enhanceLowLightImage,
  analyzeLightConditions,
  detectFacesNightVision,
  recognizeFacesNightVision,
  captureWithIR,
  monitorWithNightVision,
  analyzeThermalImage,
  defaultNightVisionConfig,
  type NightVisionMode,
  type NightVisionConfig,
  type EnhancedFrame,
  type LightAnalysis,
  type NightFaceDetectionResult,
} from './night-vision';

// ============================================================
// UNIFIED SENSING INTERFACE
// ============================================================

import { getCSISensingEngine, WiFiCSISensingEngine } from './wifi-csi';
import { getCameraControlSystem, CameraControlSystem } from './camera-control';
import { getDroneControlSystem, DroneControlSystem } from './drone-control';
import { NightVisionSystem } from './night-vision';
import { getFaceDatabase } from '../vision/facial-recognition';

/**
 * Unified sensing interface for Molly.
 * Provides access to all sensing capabilities through a single object.
 */
export interface MollySensing {
  /** WiFi CSI presence detection */
  wifi: WiFiCSISensingEngine;
  /** Camera control system */
  cameras: CameraControlSystem;
  /** Drone control system */
  drones: DroneControlSystem;
  /** Night vision capabilities */
  nightVision: typeof NightVisionSystem;
  /** Face database */
  faces: ReturnType<typeof getFaceDatabase>;
}

let _sensing: MollySensing | null = null;

/**
 * Get the unified sensing interface.
 */
export function getMollySensing(): MollySensing {
  if (!_sensing) {
    _sensing = {
      wifi: getCSISensingEngine(),
      cameras: getCameraControlSystem(),
      drones: getDroneControlSystem(),
      nightVision: NightVisionSystem,
      faces: getFaceDatabase(),
    };
  }
  return _sensing;
}

/**
 * Initialize all sensing systems.
 */
export async function initializeSensing(): Promise<void> {
  const sensing = getMollySensing();

  // Systems auto-initialize on first access
  // This function is for explicit initialization if needed

  console.log('Molly Sensing Systems Initialized:');
  console.log(`  - WiFi CSI: ${sensing.wifi.getSensors().length} sensors`);
  console.log(`  - Cameras: ${sensing.cameras.getCameras().length} cameras`);
  console.log(`  - Drones: ${sensing.drones.getDrones().length} drones`);
  console.log(
    `  - Face Database: ${sensing.faces.getStats().totalPeople} known people`
  );
}

/**
 * Get status of all sensing systems.
 */
export function getSensingStatus(): {
  wifi: { sensors: number; zones: number };
  cameras: { total: number; online: number; streaming: number };
  drones: { total: number; connected: number; inFlight: number };
  faces: { totalPeople: number; withDescriptions: number };
} {
  const sensing = getMollySensing();

  return {
    wifi: {
      sensors: sensing.wifi.getSensors().length,
      zones: sensing.wifi.getZoneStates().size,
    },
    cameras: sensing.cameras.getStatus(),
    drones: sensing.drones.getStatus(),
    faces: {
      totalPeople: sensing.faces.getStats().totalPeople,
      withDescriptions: sensing.faces.getStats().withDescriptions,
    },
  };
}
