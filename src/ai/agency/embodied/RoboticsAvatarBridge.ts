/**
 * @fileOverview Translates a Gemini Robotics ActionPlan into per-frame avatar
 * motion signals. Tracks elapsed time against each action's estimated duration
 * to determine which PhysicalAction is currently executing, then maps it to
 * an arm gesture intent, neck orientation, and cognitive mood hint.
 *
 * Browser-safe — pure data transforms, no Node.js modules.
 */

import type {
  ActionPlan,
  PhysicalAction,
  PhysicalActionType,
} from '@/ai/agency/robotics';
import type { ArmGestureIntent } from './KinematicsCore';
import type { CognitiveMood } from './AvatarStateBridge';

export interface RoboticsMotionFrame {
  intent: ArmGestureIntent;
  /** Neck pitch target (radians). Positive = forward lean. */
  neckPitch: number;
  /** Neck yaw target (radians). Positive = right. */
  neckYaw: number;
  moodHint: CognitiveMood;
  activeActionType: PhysicalActionType | null;
}

// Maps each physical action to the arm gesture that best represents it visually.
const ACTION_INTENT: Partial<Record<PhysicalActionType, ArmGestureIntent>> = {
  grasp: 'REACH_FORWARD',
  push: 'REACH_FORWARD',
  pull: 'REACH_FORWARD',
  open: 'REACH_FORWARD',
  close: 'REACH_FORWARD',
  insert: 'REACH_FORWARD',
  remove: 'REACH_FORWARD',
  rotate: 'REACH_FORWARD',
  pour: 'REACH_UP',
  place_on: 'REACH_UP',
  stack: 'REACH_UP',
  unstack: 'REACH_UP',
  navigate_to: 'NAVIGATE',
  move_to: 'NAVIGATE',
  look_at: 'LOOK_AT_TARGET',
  wait: 'IDLE_SWA_BREATHE',
  release: 'IDLE_SWA_BREATHE',
};

// Default duration (seconds) if the action doesn't specify one.
const DEFAULT_ACTION_DURATION = 2;

export class RoboticsAvatarBridge {
  private plan: ActionPlan | null = null;
  private planStartTime: number | null = null;
  /** Pre-computed cumulative end-times for each action. */
  private cumulativeEnds: number[] = [];

  /** Load a new plan. The clock starts on the first getMotionFrame call. */
  loadPlan(plan: ActionPlan): void {
    this.plan = plan;
    this.planStartTime = null;
    let acc = 0;
    this.cumulativeEnds = plan.actions.map((a) => {
      acc += a.estimatedDurationSeconds ?? DEFAULT_ACTION_DURATION;
      return acc;
    });
  }

  clearPlan(): void {
    this.plan = null;
    this.planStartTime = null;
    this.cumulativeEnds = [];
  }

  /** Call once per render frame. Returns the motion frame for the current tick. */
  getMotionFrame(elapsedTime: number): RoboticsMotionFrame {
    if (!this.plan || this.plan.actions.length === 0) {
      return this.idle();
    }

    if (this.planStartTime === null) {
      this.planStartTime = elapsedTime;
    }

    const action = this.activeAction(elapsedTime - this.planStartTime);

    if (!action) {
      // All actions complete — celebrate
      return {
        intent: 'IDLE_SWA_BREATHE',
        neckPitch: 0,
        neckYaw: 0,
        moodHint: 'SUCCESS_FOUND',
        activeActionType: null,
      };
    }

    const intent = ACTION_INTENT[action.type] ?? 'IDLE_SWA_BREATHE';

    // Subtle neck forward-lean while working; look_at keeps head up.
    const neckPitch =
      action.type === 'look_at'
        ? 0.1
        : action.type === 'navigate_to' || action.type === 'move_to'
          ? 0
          : 0.06;

    return {
      intent,
      neckPitch,
      neckYaw: 0,
      moodHint: 'ANALYTICAL',
      activeActionType: action.type,
    };
  }

  private activeAction(elapsed: number): PhysicalAction | null {
    if (!this.plan) return null;
    for (let i = 0; i < this.cumulativeEnds.length; i++) {
      if (elapsed < this.cumulativeEnds[i]) return this.plan.actions[i];
    }
    return null;
  }

  private idle(): RoboticsMotionFrame {
    return {
      intent: 'IDLE_SWA_BREATHE',
      neckPitch: 0,
      neckYaw: 0,
      moodHint: 'DEFAULT',
      activeActionType: null,
    };
  }
}
