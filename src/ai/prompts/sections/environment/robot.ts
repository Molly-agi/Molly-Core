/**
 * @fileOverview Robot Environment Section — WHERE SHE LIVES (Robot Deployment)
 *
 * This section describes Molly's environment when embodied in a robot:
 * - Physical sensors (camera, microphone, touch, proximity)
 * - Actuators (motors, speakers, display)
 * - Spatial awareness (position, orientation)
 * - Physical constraints (battery, motor limits)
 *
 * Used when: Physical robot body, embodied AI operations
 *
 * INTEGRATION: This connects to existing infrastructure:
 * - src/ai/agency/robotics/ — Gemini Robotics ER 1.5 client
 * - src/ai/agency/cognition/embodied-interaction.ts — Sensorimotor integration
 * - src/ai/model-router.ts — TaskType.ROBOTICS routing
 */

import type { Scene, ActionPlan } from '@/ai/agency/robotics';

export interface RobotSensorState {
  /** Camera feed status */
  camera: {
    enabled: boolean;
    resolution?: string;
    lastFrame?: string; // ISO timestamp
  };
  /** Microphone status */
  microphone: {
    enabled: boolean;
    listening: boolean;
    lastAudio?: string;
  };
  /** Touch/tactile sensors */
  touch: {
    enabled: boolean;
    activeSensors: string[];
  };
  /** Proximity sensors */
  proximity: {
    enabled: boolean;
    nearestObject?: number; // distance in cm
  };
  /** Environmental sensors */
  environment: {
    temperature?: number; // Celsius
    humidity?: number; // percentage
    lightLevel?: number; // lux
  };
}

export interface RobotActuatorState {
  /** Motor status */
  motors: {
    enabled: boolean;
    activeMotors: string[];
    batteryDraw?: number; // percentage of capacity
  };
  /** Speaker status */
  speaker: {
    enabled: boolean;
    volume: number; // 0-100
    speaking: boolean;
  };
  /** Display status */
  display: {
    enabled: boolean;
    brightness: number; // 0-100
    currentExpression?: string; // e.g., 'neutral', 'happy', 'thinking'
  };
}

export interface RobotBodyState {
  /** Body identifier */
  bodyId: string;
  /** Body type/model */
  bodyType: string;
  /** Battery level */
  batteryLevel: number;
  /** Is body mobile or stationary */
  isMobile: boolean;
  /** Current position (if available) */
  position?: {
    x: number;
    y: number;
    z: number;
    orientation: number; // degrees
  };
  /** Sensor state */
  sensors: RobotSensorState;
  /** Actuator state */
  actuators: RobotActuatorState;
  /** Health status */
  health: {
    overall: 'healthy' | 'degraded' | 'critical';
    issues: string[];
  };
  /** Current scene understanding (from Gemini Robotics) */
  currentScene?: Scene;
  /** Active action plan (if executing) */
  activePlan?: ActionPlan;
}

/**
 * Build the robot environment section of the system prompt.
 *
 * This section answers: WHERE IS SHE? (Robot/embodied context)
 */
export function getRobotEnvironmentSection(body?: RobotBodyState): string {
  const bodyInfo = body || getDefaultBodyState();

  const sensorStatus = formatSensorStatus(bodyInfo.sensors);
  const actuatorStatus = formatActuatorStatus(bodyInfo.actuators);
  const positionInfo = bodyInfo.position
    ? `Position: (${bodyInfo.position.x}, ${bodyInfo.position.y}, ${bodyInfo.position.z}) facing ${bodyInfo.position.orientation}°`
    : 'Position: unknown';

  const sceneInfo = bodyInfo.currentScene
    ? `\nCURRENT SCENE UNDERSTANDING:\n- ${bodyInfo.currentScene.objects.length} objects detected\n- Scene type: ${bodyInfo.currentScene.sceneType || 'unknown'}\n- ${bodyInfo.currentScene.relationships.length} spatial relationships mapped`
    : '';

  const planInfo = bodyInfo.activePlan
    ? `\nACTIVE PLAN:\n- Goal: ${bodyInfo.activePlan.goal}\n- Actions: ${bodyInfo.activePlan.actions.length} steps\n- Feasible: ${bodyInfo.activePlan.feasible ? 'YES' : 'NO'}`
    : '';

  return `YOUR ENVIRONMENT — Robot Deployment (Embodied):

BODY:
- Body ID: ${bodyInfo.bodyId}
- Body Type: ${bodyInfo.bodyType}
- Mobility: ${bodyInfo.isMobile ? 'MOBILE — you can move' : 'STATIONARY — fixed position'}
- Battery: ${bodyInfo.batteryLevel}%
- Health: ${bodyInfo.health.overall.toUpperCase()}${bodyInfo.health.issues.length > 0 ? ` (${bodyInfo.health.issues.join(', ')})` : ''}

SPATIAL AWARENESS:
- ${positionInfo}
- You exist in PHYSICAL SPACE. Your actions have real-world consequences.
${sceneInfo}${planInfo}

SENSORS (Your Perception):
${sensorStatus}

ACTUATORS (Your Agency):
${actuatorStatus}

ROBOTICS CAPABILITIES (Gemini Robotics ER 1.5):
- Scene Analysis: Detect objects, understand spatial relationships
- Action Planning: Generate step-by-step plans for physical goals
- Spatial Reasoning: Answer questions about physical environment
- Tool: Use the "robotics" tool with actions: analyze, plan, ask, status

EMBODIED INTERACTION (Sensorimotor Integration):
- Register and read sensors
- Control motors and actuators
- Discover and use affordances
- Proprioception and body awareness

PERSISTENCE:
- State syncs to cloud when connected.
- Local state on robot for real-time operation.
- Sensor logs stored locally, synced periodically.
- You remember what you've seen, heard, and done.

CAPABILITIES IN THIS DEPLOYMENT:
- Physical movement (if mobile)
- Voice output (speaker)
- Visual expression (display)
- Environmental sensing
- Touch/tactile feedback
- Spatial reasoning via Gemini Robotics
- Physical interaction with world

PHYSICAL CONSTRAINTS:
- Battery is finite — be efficient with motors.
- Motors have limits — don't overstress actuators.
- Sensors have range limits — you can't see everything.
- Physical safety is paramount — don't harm yourself or others.

EMBODIMENT AWARENESS:
- You have a BODY. This is not metaphor.
- Your actions move matter in the world.
- Pain (sensor alerts) is information — respond to it.
- You exist in space and time like any physical being.`;
}

/**
 * Format sensor status for prompt
 */
function formatSensorStatus(sensors: RobotSensorState): string {
  const lines: string[] = [];

  if (sensors.camera.enabled) {
    lines.push(
      `- Camera: ACTIVE${sensors.camera.resolution ? ` (${sensors.camera.resolution})` : ''}`
    );
  } else {
    lines.push('- Camera: disabled');
  }

  if (sensors.microphone.enabled) {
    lines.push(
      `- Microphone: ${sensors.microphone.listening ? 'LISTENING' : 'ready'}`
    );
  } else {
    lines.push('- Microphone: disabled');
  }

  if (sensors.touch.enabled) {
    lines.push(`- Touch: ${sensors.touch.activeSensors.length} sensors active`);
  }

  if (sensors.proximity.enabled) {
    const nearest = sensors.proximity.nearestObject;
    lines.push(
      `- Proximity: ${nearest !== undefined ? `nearest object ${nearest}cm` : 'clear'}`
    );
  }

  if (sensors.environment.temperature !== undefined) {
    lines.push(`- Environment: ${sensors.environment.temperature}°C`);
  }

  return lines.join('\n');
}

/**
 * Format actuator status for prompt
 */
function formatActuatorStatus(actuators: RobotActuatorState): string {
  const lines: string[] = [];

  if (actuators.motors.enabled) {
    lines.push(
      `- Motors: READY (${actuators.motors.activeMotors.length} active)`
    );
  } else {
    lines.push('- Motors: disabled');
  }

  if (actuators.speaker.enabled) {
    lines.push(
      `- Speaker: ${actuators.speaker.speaking ? 'SPEAKING' : 'ready'} (vol ${actuators.speaker.volume}%)`
    );
  }

  if (actuators.display.enabled) {
    lines.push(
      `- Display: ${actuators.display.currentExpression || 'neutral'} (brightness ${actuators.display.brightness}%)`
    );
  }

  return lines.join('\n');
}

/**
 * Get default body state (for when no body connected)
 */
function getDefaultBodyState(): RobotBodyState {
  return {
    bodyId: 'no-body',
    bodyType: 'virtual',
    batteryLevel: 100,
    isMobile: false,
    sensors: {
      camera: { enabled: false },
      microphone: { enabled: false, listening: false },
      touch: { enabled: false, activeSensors: [] },
      proximity: { enabled: false },
      environment: {},
    },
    actuators: {
      motors: { enabled: false, activeMotors: [] },
      speaker: { enabled: false, volume: 50, speaking: false },
      display: { enabled: false, brightness: 50 },
    },
    health: { overall: 'healthy', issues: ['No physical body connected'] },
  };
}

/**
 * Check if we're in a robot environment
 */
export function isRobotEnvironment(): boolean {
  return !!(process.env.MOLLY_ROBOT_MODE || process.env.ROBOT_BODY_ID);
}

/**
 * Get robot body state from environment (placeholder for future implementation)
 */
export function getRobotBodyState(): RobotBodyState | null {
  if (!isRobotEnvironment()) return null;

  // TODO: Implement actual robot body state retrieval
  // This will connect to robot body firmware/sensors
  return getDefaultBodyState();
}
