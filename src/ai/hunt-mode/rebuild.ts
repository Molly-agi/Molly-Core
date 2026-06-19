import { ProfileStore } from './profile-store';
import { ProfileBuilder } from './profile-builder';
import { replayLedger, DEFAULT_LEDGER } from './ledger-tail';

export interface RebuildOptions {
  ledgerPath?: string;
  storeDir?: string;
}

export interface RebuildResult {
  processed: number;
  skipped: number;
  created: number;
  updated: number;
  noIdentity: number;
  profiles: number;
}

/**
 * Wipe the profile store in-memory, replay the entire forensic ledger,
 * write a fresh snapshot. Truncates the event log. Used when the on-disk
 * state is suspected of drift, or to backfill after a code change.
 */
export function rebuildProfiles(opts: RebuildOptions = {}): RebuildResult {
  const store = new ProfileStore({ dir: opts.storeDir });
  // Do not load existing snapshot — we're rebuilding from scratch.
  const builder = new ProfileBuilder(store);

  let created = 0;
  let updated = 0;
  let noIdentity = 0;

  const { processed, skipped } = replayLedger(
    opts.ledgerPath ?? DEFAULT_LEDGER,
    (signal) => {
      const r = builder.ingest(signal);
      if (r.skipped) noIdentity++;
      else if (r.created) created++;
      else updated++;
    }
  );

  store.snapshot();

  return {
    processed,
    skipped,
    created,
    updated,
    noIdentity,
    profiles: store.size(),
  };
}
