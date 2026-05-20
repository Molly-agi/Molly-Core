/**
 * @fileOverview Robotics Module — Molly's Physical Intelligence
 *
 * Gemini Robotics capabilities for physical space reasoning and embodiment.
 * Enables understanding of physical environments, spatial relationships,
 * and reasoning about real-world actions.
 *
 * Based on Gemini Robotics ER 1.5 (April 2026)
 */

import { MollyLogger, generateTraceId } from '../../logger';

// ============================================================
// SPATIAL TYPES
// ============================================================

/**
 * 3D position in space.
 */
export interface Position3D {
  x: number;
  y: number;
  z: number;
}

/**
 * 3D rotation (Euler angles in degrees).
 */
export interface Rotation3D {
  roll: number; // X rotation
  pitch: number; // Y rotation
  yaw: number; // Z rotation
}

/**
 * Object pose (position + rotation).
 */
export interface Pose {
  position: Position3D;
  rotation: Rotation3D;
}

/**
 * Bounding box for object detection.
 */
export interface BoundingBox3D {
  center: Position3D;
  size: { width: number; height: number; depth: number };
  rotation?: Rotation3D;
}

// ============================================================
// OBJECT UNDERSTANDING
// ============================================================

/**
 * Detected object in physical space.
 */
export interface DetectedObject {
  /** Object ID */
  id: string;
  /** Object class/label */
  label: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** 3D bounding box */
  boundingBox: BoundingBox3D;
  /** Object pose if determinable */
  pose?: Pose;
  /** Physical properties */
  properties?: ObjectProperties;
  /** Object state (e.g., open, closed) */
  state?: string;
}

/**
 * Physical properties of an object.
 */
export interface ObjectProperties {
  /** Estimated mass in kg */
  mass?: number;
  /** Is object graspable */
  graspable?: boolean;
  /** Is object movable */
  movable?: boolean;
  /** Material type */
  material?: string;
  /** Is object fragile */
  fragile?: boolean;
}

// ============================================================
// SCENE UNDERSTANDING
// ============================================================

/**
 * A physical scene with objects and spatial relationships.
 */
export interface Scene {
  /** Scene ID */
  id: string;
  /** Detected objects */
  objects: DetectedObject[];
  /** Spatial relationships */
  relationships: SpatialRelationship[];
  /** Scene bounds */
  bounds?: BoundingBox3D;
  /** Scene type (e.g., "kitchen", "office") */
  sceneType?: string;
  /** Analysis timestamp */
  analyzedAt: number;
}

/**
 * Spatial relationship between objects.
 */
export interface SpatialRelationship {
  /** Subject object ID */
  subjectId: string;
  /** Relationship type */
  relation: SpatialRelationType;
  /** Object object ID */
  objectId: string;
  /** Confidence */
  confidence: number;
}

/**
 * Types of spatial relationships.
 */
export type SpatialRelationType =
  | 'on'
  | 'under'
  | 'next_to'
  | 'in_front_of'
  | 'behind'
  | 'inside'
  | 'above'
  | 'below'
  | 'left_of'
  | 'right_of'
  | 'touching'
  | 'near'
  | 'far_from';

// ============================================================
// ACTION PLANNING
// ============================================================

/**
 * A physical action to be performed.
 */
export interface PhysicalAction {
  /** Action ID */
  id: string;
  /** Action type */
  type: PhysicalActionType;
  /** Target object ID */
  targetObjectId?: string;
  /** Destination (for move/place actions) */
  destination?: Position3D;
  /** Action parameters */
  parameters?: Record<string, unknown>;
  /** Preconditions that must be true */
  preconditions?: string[];
  /** Expected effects */
  effects?: string[];
  /** Estimated duration in seconds */
  estimatedDurationSeconds?: number;
}

/**
 * Types of physical actions.
 */
export type PhysicalActionType =
  | 'grasp'
  | 'release'
  | 'move_to'
  | 'place_on'
  | 'push'
  | 'pull'
  | 'rotate'
  | 'open'
  | 'close'
  | 'pour'
  | 'insert'
  | 'remove'
  | 'stack'
  | 'unstack'
  | 'navigate_to'
  | 'look_at'
  | 'wait';

/**
 * An action plan (sequence of actions).
 */
export interface ActionPlan {
  /** Plan ID */
  id: string;
  /** Goal description */
  goal: string;
  /** Ordered sequence of actions */
  actions: PhysicalAction[];
  /** Whether plan is valid/feasible */
  feasible: boolean;
  /** Reason if not feasible */
  infeasibilityReason?: string;
  /** Estimated total duration */
  estimatedDurationSeconds: number;
  /** Generated at */
  generatedAt: number;
}

// ============================================================
// INPUT TYPES
// ============================================================

/**
 * Visual input for scene analysis.
 */
export interface VisualInput {
  /** Image data (base64) */
  imageData?: string;
  /** Image URL */
  imageUrl?: string;
  /** Depth map if available */
  depthData?: string;
  /** Point cloud if available */
  pointCloud?: Float32Array;
  /** Camera parameters */
  cameraParams?: CameraParameters;
}

/**
 * Camera intrinsic and extrinsic parameters.
 */
export interface CameraParameters {
  /** Focal length */
  focalLength: { x: number; y: number };
  /** Principal point */
  principalPoint: { x: number; y: number };
  /** Camera pose in world coordinates */
  pose?: Pose;
}

// ============================================================
// ROBOTICS CLIENT
// ============================================================

/**
 * Robotics configuration.
 */
export interface RoboticsConfig {
  model: string;
  timeoutMs: number;
  enableDepthEstimation: boolean;
}

export const DEFAULT_CONFIG: RoboticsConfig = {
  model: 'gemini-robotics-er-1.5-preview',
  timeoutMs: 30_000,
  enableDepthEstimation: true,
};

/**
 * Audit log entry.
 */
export interface RoboticsAuditEntry {
  entryId: string;
  operation: 'analyze_scene' | 'plan_actions' | 'reason_spatial';
  objectCount?: number;
  actionCount?: number;
  processingTimeMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

const auditLog: RoboticsAuditEntry[] = [];

function logAudit(
  entry: Omit<RoboticsAuditEntry, 'entryId' | 'timestamp'>
): void {
  auditLog.push({
    ...entry,
    entryId: generateTraceId(),
    timestamp: Date.now(),
  });
}

/**
 * Get robotics audit log.
 */
export function getRoboticsAuditLog(): RoboticsAuditEntry[] {
  return [...auditLog];
}

/**
 * Robotics Client — Molly's physical intelligence.
 */
export class RoboticsClient {
  private config: RoboticsConfig;
  private apiKey: string;

  constructor(config?: Partial<RoboticsConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiKey = process.env.GOOGLE_GENAI_API_KEY || '';
  }

  /**
   * Analyze a scene from visual input.
   */
  async analyzeScene(input: VisualInput, context?: string): Promise<Scene> {
    const startTime = performance.now();
    const sceneId = generateTraceId();

    MollyLogger.info('Robotics: Analyzing scene', 'robotics', {
      sceneId,
      hasDepth: !!input.depthData,
    });

    try {
      const response = await this.callRoboticsAPI('analyzeScene', {
        image: input.imageData || input.imageUrl,
        depth: input.depthData,
        point_cloud: input.pointCloud,
        camera_params: input.cameraParams,
        context,
        enable_depth_estimation: this.config.enableDepthEstimation,
      });

      const processingTimeMs = performance.now() - startTime;

      const scene: Scene = {
        id: sceneId,
        objects: (response as { objects?: DetectedObject[] }).objects || [],
        relationships:
          (response as { relationships?: SpatialRelationship[] })
            .relationships || [],
        sceneType: (response as { scene_type?: string }).scene_type,
        analyzedAt: Date.now(),
      };

      logAudit({
        operation: 'analyze_scene',
        objectCount: scene.objects.length,
        processingTimeMs,
        success: true,
      });

      return scene;
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;

      logAudit({
        operation: 'analyze_scene',
        processingTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Plan actions to achieve a goal.
   */
  async planActions(
    scene: Scene,
    goal: string,
    constraints?: string[]
  ): Promise<ActionPlan> {
    const startTime = performance.now();
    const planId = generateTraceId();

    MollyLogger.info('Robotics: Planning actions', 'robotics', {
      planId,
      goal,
      objectCount: scene.objects.length,
    });

    try {
      const response = await this.callRoboticsAPI('planActions', {
        scene,
        goal,
        constraints,
      });

      const processingTimeMs = performance.now() - startTime;

      const plan: ActionPlan = {
        id: planId,
        goal,
        actions: (response as { actions?: PhysicalAction[] }).actions || [],
        feasible: (response as { feasible?: boolean }).feasible ?? true,
        infeasibilityReason: (response as { infeasibility_reason?: string })
          .infeasibility_reason,
        estimatedDurationSeconds:
          (response as { estimated_duration?: number }).estimated_duration || 0,
        generatedAt: Date.now(),
      };

      logAudit({
        operation: 'plan_actions',
        actionCount: plan.actions.length,
        processingTimeMs,
        success: true,
      });

      return plan;
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;

      logAudit({
        operation: 'plan_actions',
        processingTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Answer a spatial reasoning question about a scene.
   */
  async reasonSpatial(scene: Scene, question: string): Promise<string> {
    const startTime = performance.now();

    MollyLogger.info('Robotics: Spatial reasoning', 'robotics', {
      question,
      objectCount: scene.objects.length,
    });

    try {
      const response = await this.callRoboticsAPI('reasonSpatial', {
        scene,
        question,
      });

      const processingTimeMs = performance.now() - startTime;

      const answer = (response as { answer?: string }).answer || '';

      logAudit({
        operation: 'reason_spatial',
        processingTimeMs,
        success: true,
      });

      return answer;
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;

      logAudit({
        operation: 'reason_spatial',
        processingTimeMs,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  // ── Private Helpers ──

  private async callRoboticsAPI(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:${method}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error ${response.status}: ${error}`);
    }

    return response.json();
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let _clientInstance: RoboticsClient | null = null;

/**
 * Get the global robotics client.
 */
export function getRoboticsClient(): RoboticsClient {
  if (!_clientInstance) {
    _clientInstance = new RoboticsClient();
  }
  return _clientInstance;
}

/**
 * Reset the client (for testing).
 */
export function resetRoboticsClient(): void {
  _clientInstance = null;
  auditLog.length = 0;
}
