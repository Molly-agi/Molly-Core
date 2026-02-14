/**
 * @fileOverview Voice safety sleep switch (safeword control).
 */

import { MollyLogger } from '@/ai/logger';

const SAFEWORD_PHRASE = 'pineapple van';

export interface SleepState {
  isSleeping: boolean;
  activatedAt: number | null;
  lastTrigger: string | null;
}

const sleepState: SleepState = {
  isSleeping: false,
  activatedAt: null,
  lastTrigger: null,
};

export function isSleepSafeword(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
  return /\bpineapple\s+van\b/.test(normalized);
}

export function getSleepState(): SleepState {
  return { ...sleepState };
}

export function toggleSleepState(trigger: string): SleepState {
  sleepState.isSleeping = !sleepState.isSleeping;
  sleepState.activatedAt = sleepState.isSleeping ? Date.now() : null;
  sleepState.lastTrigger = trigger;

  MollyLogger.info(
    sleepState.isSleeping ? 'Sleep mode enabled' : 'Sleep mode disabled',
    'safety-sleep',
    { trigger }
  );

  return getSleepState();
}

export function setSleepState(
  isSleeping: boolean,
  trigger: string
): SleepState {
  sleepState.isSleeping = isSleeping;
  sleepState.activatedAt = isSleeping ? Date.now() : null;
  sleepState.lastTrigger = trigger;

  MollyLogger.info(
    isSleeping ? 'Sleep mode enabled' : 'Sleep mode disabled',
    'safety-sleep',
    { trigger }
  );

  return getSleepState();
}

export function getSafewordPhrase(): string {
  return SAFEWORD_PHRASE;
}
