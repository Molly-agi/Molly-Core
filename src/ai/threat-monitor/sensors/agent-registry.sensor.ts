import { watch, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { threatSignalBus, type ThreatSignal } from '../signal-bus';

const REGISTRY_PATH = resolve(
  process.cwd(),
  'data/.bridge-registered-agents.json'
);

interface AgentRecord {
  id: number;
  registeredAt: string;
}

type Registry = Record<string, AgentRecord>;

type ChangeKind = 'added' | 'removed' | 'changed';

export class AgentRegistrySensor {
  private watcher: ReturnType<typeof watch> | null = null;
  private snapshot: Registry = {};

  start(): void {
    if (this.watcher) return;
    this.snapshot = this.load();
    this.watcher = watch(REGISTRY_PATH, (event) => {
      if (event === 'change') this.reconcile();
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    this.snapshot = {};
  }

  private load(): Registry {
    try {
      return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
    } catch {
      return {};
    }
  }

  private reconcile(): void {
    const next = this.load();
    const prev = this.snapshot;
    const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

    for (const name of allKeys) {
      const before = prev[name];
      const after = next[name];

      if (!before && after) {
        this.emit('added', name, after);
      } else if (before && !after) {
        this.emit('removed', name, before);
      } else if (
        before &&
        after &&
        (before.id !== after.id || before.registeredAt !== after.registeredAt)
      ) {
        this.emit('changed', name, { before, after });
      }
    }

    this.snapshot = next;
  }

  private emit(kind: ChangeKind, name: string, evidence: unknown): void {
    const signal: ThreatSignal = {
      source: 'agent-registry',
      severity: 'warn',
      timestamp: new Date().toISOString(),
      summary: `agent registry ${kind}: ${name}`,
      evidence: { kind, name, ...((evidence ?? {}) as object) },
    };
    threatSignalBus.emitSignal(signal);
  }
}

export const agentRegistrySensor = new AgentRegistrySensor();
