import type { ThreatSignal } from '../threat-monitor/signal-bus';
import { extractIdentity } from './identity';
import {
  emptySeverityCounts,
  type AttackerProfile,
  type ProfileEventRef,
  type ProfileMutation,
} from './profile';
import { ProfileStore } from './profile-store';

export interface ProfileBuilderResult {
  key: string;
  created: boolean;
  skipped: boolean;
  reason?: 'no-identity';
}

export class ProfileBuilder {
  constructor(private readonly store: ProfileStore) {}

  ingest(signal: ThreatSignal): ProfileBuilderResult {
    const identity = extractIdentity(signal);
    if (!identity) {
      return { key: '', created: false, skipped: true, reason: 'no-identity' };
    }

    const event = toEventRef(signal);
    const existing = this.store.get(identity.key);

    if (!existing) {
      const profile = newProfile(identity.key, identity, signal, event);
      this.store.apply({ kind: 'create', profile } satisfies ProfileMutation);
      return { key: identity.key, created: true, skipped: false };
    }

    const patch: Partial<AttackerProfile> & { lastSeen: string } = {
      lastSeen: signal.timestamp,
      signalCount: existing.signalCount + 1,
      confidence: Math.max(existing.confidence, identity.confidence),
      severityCounts: {
        ...existing.severityCounts,
        [signal.severity]: (existing.severityCounts[signal.severity] ?? 0) + 1,
      },
      sources: {
        ...existing.sources,
        [signal.source]: (existing.sources[signal.source] ?? 0) + 1,
      },
      fields: {
        ...existing.fields,
        ...stripUndefined(identity.fields),
      },
    };

    const route = identity.fields.route;
    if (route) {
      patch.routes = {
        ...existing.routes,
        [route]: (existing.routes[route] ?? 0) + 1,
      };
    }

    this.store.apply({
      kind: 'update',
      key: identity.key,
      patch,
      event,
    } satisfies ProfileMutation);

    return { key: identity.key, created: false, skipped: false };
  }
}

function newProfile(
  key: string,
  identity: ReturnType<typeof extractIdentity> & object,
  signal: ThreatSignal,
  event: ProfileEventRef
): AttackerProfile {
  const severityCounts = emptySeverityCounts();
  severityCounts[signal.severity] = 1;
  const route = identity.fields.route;
  return {
    key,
    firstSeen: signal.timestamp,
    lastSeen: signal.timestamp,
    confidence: identity.confidence,
    signalCount: 1,
    severityCounts,
    sources: { [signal.source]: 1 },
    routes: route ? { [route]: 1 } : {},
    fields: stripUndefined(identity.fields),
    recent: [event],
  };
}

function toEventRef(signal: ThreatSignal): ProfileEventRef {
  return {
    timestamp: signal.timestamp,
    source: signal.source,
    severity: signal.severity,
    summary: signal.summary,
  };
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
