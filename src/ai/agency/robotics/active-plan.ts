import type { ActionPlan } from './index';

export interface ActiveRoboticsPlan {
  plan: ActionPlan;
  source: string;
  updatedAt: number;
}

let activeRoboticsPlan: ActiveRoboticsPlan | null = null;

export function setActiveRoboticsPlan(plan: ActionPlan, source: string): void {
  activeRoboticsPlan = {
    plan,
    source,
    updatedAt: Date.now(),
  };
}

export function getActiveRoboticsPlan(): ActiveRoboticsPlan | null {
  return activeRoboticsPlan;
}

export function clearActiveRoboticsPlan(): void {
  activeRoboticsPlan = null;
}
