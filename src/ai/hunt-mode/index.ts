import { ProfileBuilder } from './profile-builder';
import { ProfileStore } from './profile-store';
import { LedgerTail, DEFAULT_LEDGER } from './ledger-tail';

export interface HuntModeOptions {
  ledgerPath?: string;
  storeDir?: string;
  snapshotEveryN?: number;
}

export interface HuntModeHandle {
  stop(): void;
  store(): ProfileStore;
  tail(): LedgerTail;
  builder(): ProfileBuilder;
  snapshotIfDue(): boolean;
}

const DEFAULT_SNAPSHOT_EVERY = 50;

export function startHuntMode(opts: HuntModeOptions = {}): HuntModeHandle {
  const store = new ProfileStore({ dir: opts.storeDir });
  store.load();
  const builder = new ProfileBuilder(store);
  const tail = new LedgerTail({
    path: opts.ledgerPath ?? DEFAULT_LEDGER,
    onSignal: (signal) => {
      builder.ingest(signal);
      if (
        store.pendingMutations() >=
        (opts.snapshotEveryN ?? DEFAULT_SNAPSHOT_EVERY)
      ) {
        store.snapshot();
      }
    },
  });
  tail.start();

  return {
    stop(): void {
      tail.stop();
      if (store.pendingMutations() > 0) store.snapshot();
    },
    store: () => store,
    tail: () => tail,
    builder: () => builder,
    snapshotIfDue(): boolean {
      if (
        store.pendingMutations() >=
        (opts.snapshotEveryN ?? DEFAULT_SNAPSHOT_EVERY)
      ) {
        store.snapshot();
        return true;
      }
      return false;
    },
  };
}

export { ProfileBuilder } from './profile-builder';
export { ProfileStore } from './profile-store';
export { LedgerTail, replayLedger } from './ledger-tail';
export { extractIdentity, extractFields } from './identity';
export type {
  AttackerProfile,
  ProfileMutation,
  ProfileEventRef,
} from './profile';
