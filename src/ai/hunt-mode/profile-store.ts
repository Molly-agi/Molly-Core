import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { AttackerProfile, ProfileMutation } from './profile';

const DEFAULT_DIR = resolve(process.cwd(), '.hunt');
const DEFAULT_LOG = 'profiles.jsonl';
const DEFAULT_SNAPSHOT = 'profiles.snapshot.json';

export interface ProfileStoreOptions {
  dir?: string;
  logFile?: string;
  snapshotFile?: string;
}

export interface MutationEvent {
  key: string;
  prev: AttackerProfile | null;
  curr: AttackerProfile;
  mutation: ProfileMutation;
}

export type MutationListener = (event: MutationEvent) => void;

export class ProfileStore {
  private readonly dir: string;
  private readonly logPath: string;
  private readonly snapshotPath: string;
  private readonly profiles = new Map<string, AttackerProfile>();
  private readonly listeners = new Set<MutationListener>();
  private mutationsSinceSnapshot = 0;
  private nextSeqCounter = 0;
  private lastAppliedSeqCounter = 0;

  constructor(opts: ProfileStoreOptions = {}) {
    this.dir = opts.dir ?? DEFAULT_DIR;
    this.logPath = resolve(this.dir, opts.logFile ?? DEFAULT_LOG);
    this.snapshotPath = resolve(
      this.dir,
      opts.snapshotFile ?? DEFAULT_SNAPSHOT
    );
  }

  load(): void {
    this.ensureDir();
    this.profiles.clear();
    this.nextSeqCounter = 0;
    this.lastAppliedSeqCounter = 0;
    this.loadSnapshot();
    this.replayLog();
  }

  get(key: string): AttackerProfile | undefined {
    return this.profiles.get(key);
  }

  list(): AttackerProfile[] {
    return Array.from(this.profiles.values());
  }

  size(): number {
    return this.profiles.size;
  }

  apply(mutation: ProfileMutation): void {
    this.ensureDir();
    const stamped = { ...mutation, seq: ++this.nextSeqCounter };
    const key = stamped.kind === 'create' ? stamped.profile.key : stamped.key;
    const prev = this.profiles.get(key) ?? null;
    this.mutate(stamped);
    appendFileSync(this.logPath, JSON.stringify(stamped) + '\n');
    this.mutationsSinceSnapshot++;
    const curr = this.profiles.get(key);
    if (curr && this.listeners.size > 0) {
      const event: MutationEvent = {
        key,
        prev,
        curr,
        mutation: stamped,
      };
      for (const listener of this.listeners) listener(event);
    }
  }

  onMutation(listener: MutationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  nextSeq(): number {
    return this.nextSeqCounter;
  }

  lastAppliedSeq(): number {
    return this.lastAppliedSeqCounter;
  }

  setCounters(nextSeq: number, lastAppliedSeq: number): void {
    this.nextSeqCounter = nextSeq;
    this.lastAppliedSeqCounter = lastAppliedSeq;
  }

  snapshot(): void {
    this.ensureDir();
    const tmp = `${this.snapshotPath}.tmp`;
    const payload = {
      schema: 2,
      nextSeq: this.nextSeqCounter,
      lastAppliedSeq: this.lastAppliedSeqCounter,
      writtenAt: new Date().toISOString(),
      profiles: this.list(),
    };
    writeFileSync(tmp, JSON.stringify(payload));
    renameSync(tmp, this.snapshotPath);
    this.mutationsSinceSnapshot = 0;
    writeFileSync(this.logPath, '');
  }

  pendingMutations(): number {
    return this.mutationsSinceSnapshot;
  }

  paths(): { dir: string; log: string; snapshot: string } {
    return { dir: this.dir, log: this.logPath, snapshot: this.snapshotPath };
  }

  private ensureDir(): void {
    const d = dirname(this.logPath);
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }

  private loadSnapshot(): void {
    if (!existsSync(this.snapshotPath)) return;
    let raw: string;
    try {
      raw = readFileSync(this.snapshotPath, 'utf8');
    } catch {
      return;
    }
    if (!raw.trim()) return;
    let parsed: {
      schema?: number;
      nextSeq?: number;
      lastAppliedSeq?: number;
      profiles?: AttackerProfile[];
    };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    if (parsed.schema === 2) {
      this.setCounters(parsed.nextSeq ?? 0, parsed.lastAppliedSeq ?? 0);
    }

    for (const p of parsed.profiles ?? []) {
      this.profiles.set(p.key, p);
    }
  }

  private replayLog(): void {
    if (!existsSync(this.logPath)) return;
    const raw = readFileSync(this.logPath, 'utf8');
    if (!raw) return;
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const m = JSON.parse(line) as ProfileMutation;
        if (m.seq !== undefined && m.seq <= this.lastAppliedSeqCounter)
          continue;
        this.mutate(m);
      } catch {
        // skip malformed line
      }
    }
  }

  private mutate(m: ProfileMutation): void {
    if (m.seq !== undefined) {
      if (m.seq > this.lastAppliedSeqCounter)
        this.lastAppliedSeqCounter = m.seq;
      if (m.seq > this.nextSeqCounter) this.nextSeqCounter = m.seq;
    }
    if (m.kind === 'create') {
      if (!this.profiles.has(m.profile.key)) {
        this.profiles.set(m.profile.key, m.profile);
      }
      return;
    }
    const existing = this.profiles.get(m.key);
    if (!existing) return;
    const merged = mergePatch(existing, m.patch, m.event);
    this.profiles.set(m.key, merged);
  }
}

import { MAX_RECENT_EVENTS } from './profile';
import type { ProfileEventRef } from './profile';

function mergePatch(
  base: AttackerProfile,
  patch: Partial<AttackerProfile>,
  event: ProfileEventRef
): AttackerProfile {
  const next: AttackerProfile = { ...base, ...patch };
  next.severityCounts = {
    ...base.severityCounts,
    ...(patch.severityCounts ?? {}),
  };
  next.sources = { ...base.sources, ...(patch.sources ?? {}) };
  next.routes = { ...base.routes, ...(patch.routes ?? {}) };
  next.fields = { ...base.fields, ...(patch.fields ?? {}) };
  next.recent = [event, ...base.recent].slice(0, MAX_RECENT_EVENTS);
  return next;
}
