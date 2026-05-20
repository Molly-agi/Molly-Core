/**
 * Connection Resilience Module
 *
 * Handles WebSocket reconnection with state preservation for browser clients.
 * Saves state to IndexedDB before tab suspends, restores on reconnect.
 *
 * Used by: BridgePanel and other components that need persistent connections.
 */

// IndexedDB database name and store
const DB_NAME = 'molly-resilience';
const STORE_NAME = 'session-state';
const DB_VERSION = 1;

// Bridge daemon URL (same as BridgePanel)
const BRIDGE_PORT = 9099;

export interface LocalSessionState {
  lastCheckpointId: string | null;
  unsentMessages: Array<{ from: string; content: string; timestamp: string }>;
  pendingUserInput: string;
  scrollPosition: number;
  lastActiveTimestamp: number;
  connectionDroppedAt: string | null;
}

export interface Checkpoint {
  id: string;
  timestamp: string;
  conversationHistory: Array<{
    from: string;
    content: string;
    timestamp: string;
  }>;
  pendingOps: Array<{
    type: string;
    description: string;
    status: string;
  }>;
  workingContext: {
    lastTopic?: string;
    lastToolCall?: string;
    openFiles?: string[];
  };
}

export interface RecoveryInfo {
  wasDisconnected: boolean;
  disconnectedFor: number; // milliseconds
  checkpoint: Checkpoint | null;
  localState: LocalSessionState | null;
}

// Open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
}

// Save state to IndexedDB
async function saveState(state: LocalSessionState): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ key: 'session', ...state });
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.error('[ConnectionResilience] Failed to save state:', err);
  }
}

// Load state from IndexedDB
async function loadState(): Promise<LocalSessionState | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get('session');

    const result = await new Promise<LocalSessionState | null>(
      (resolve, reject) => {
        request.onsuccess = () => {
          const data = request.result;
          if (data) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { key, ...state } = data;
            resolve(state as LocalSessionState);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => reject(request.error);
      }
    );

    db.close();
    return result;
  } catch (err) {
    console.error('[ConnectionResilience] Failed to load state:', err);
    return null;
  }
}

// Clear saved state
async function clearState(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete('session');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.error('[ConnectionResilience] Failed to clear state:', err);
  }
}

// Get bridge URL based on current location
function getBridgeUrl(): string {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  const host = window.location.hostname;

  // For GitHub Codespaces, construct the correct URL
  if (host.includes('github.dev') || host.includes('app.github.dev')) {
    const bridgeHost = host.replace('-9002.', `-${BRIDGE_PORT}.`);
    return `${protocol}//${bridgeHost}`;
  }

  return `${protocol}//${host}:${BRIDGE_PORT}`;
}

// Fetch latest checkpoint from server
export async function fetchLatestCheckpoint(): Promise<Checkpoint | null> {
  try {
    const url = `${getBridgeUrl()}/checkpoint/latest`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (err) {
    console.error('[ConnectionResilience] Failed to fetch checkpoint:', err);
    return null;
  }
}

// Create a new checkpoint on the server
export async function createCheckpoint(data: {
  pendingOps?: Array<{ type: string; description: string; status: string }>;
  workingContext?: {
    lastTopic?: string;
    lastToolCall?: string;
    openFiles?: string[];
  };
}): Promise<Checkpoint | null> {
  try {
    const url = `${getBridgeUrl()}/checkpoint`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    return result.checkpoint;
  } catch (err) {
    console.error('[ConnectionResilience] Failed to create checkpoint:', err);
    return null;
  }
}

// Main class for managing connection resilience
export class ConnectionResilience {
  private currentState: LocalSessionState;
  private visibilityHandler: () => void;
  private beforeUnloadHandler: () => void;
  private checkpointInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.currentState = {
      lastCheckpointId: null,
      unsentMessages: [],
      pendingUserInput: '',
      scrollPosition: 0,
      lastActiveTimestamp: Date.now(),
      connectionDroppedAt: null,
    };

    // Bind handlers
    this.visibilityHandler = this.handleVisibilityChange.bind(this);
    this.beforeUnloadHandler = this.handleBeforeUnload.bind(this);
  }

  // Initialize - call this on component mount
  async init(): Promise<RecoveryInfo> {
    // Load any saved state
    const savedState = await loadState();

    // Check if we're recovering from a disconnect
    const wasDisconnected = savedState?.connectionDroppedAt != null;
    const disconnectedFor =
      wasDisconnected && savedState?.connectionDroppedAt
        ? Date.now() - new Date(savedState.connectionDroppedAt).getTime()
        : 0;

    // Fetch latest checkpoint if recovering
    let checkpoint: Checkpoint | null = null;
    if (wasDisconnected) {
      checkpoint = await fetchLatestCheckpoint();
    }

    // Restore state
    if (savedState) {
      this.currentState = {
        ...savedState,
        connectionDroppedAt: null, // Clear since we're back
        lastActiveTimestamp: Date.now(),
      };
    }

    // Set up event listeners
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }

    // Start periodic checkpointing (every 30 seconds)
    this.startAutoCheckpoint();

    // Clear saved state since we've recovered
    await clearState();

    console.log(
      `[ConnectionResilience] Initialized - wasDisconnected: ${wasDisconnected}, disconnectedFor: ${Math.round(disconnectedFor / 1000)}s`
    );

    return {
      wasDisconnected,
      disconnectedFor,
      checkpoint,
      localState: savedState,
    };
  }

  // Cleanup - call this on component unmount
  destroy(): void {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
    if (this.checkpointInterval) {
      clearInterval(this.checkpointInterval);
      this.checkpointInterval = null;
    }
  }

  // Update state (call this when state changes)
  updateState(partial: Partial<LocalSessionState>): void {
    this.currentState = {
      ...this.currentState,
      ...partial,
      lastActiveTimestamp: Date.now(),
    };
  }

  // Mark connection as dropped
  markConnectionDropped(): void {
    this.currentState.connectionDroppedAt = new Date().toISOString();
    this.saveImmediately();
  }

  // Mark connection as restored
  markConnectionRestored(): void {
    this.currentState.connectionDroppedAt = null;
  }

  // Handle visibility change (tab hidden/shown)
  private handleVisibilityChange(): void {
    if (document.hidden) {
      // Tab is being hidden - save state immediately
      console.log('[ConnectionResilience] Tab hidden - saving state');
      this.saveImmediately();
    } else {
      // Tab became visible - update timestamp
      this.currentState.lastActiveTimestamp = Date.now();
    }
  }

  // Handle before unload
  private handleBeforeUnload(): void {
    // Save state synchronously if possible
    this.saveImmediately();
  }

  // Save state immediately (synchronous-ish)
  private saveImmediately(): void {
    // Use sendBeacon for guaranteed delivery during unload
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      // Also save to IndexedDB
      saveState(this.currentState).catch(() => {});
    } else {
      saveState(this.currentState).catch(() => {});
    }
  }

  // Start automatic checkpointing
  private startAutoCheckpoint(): void {
    if (this.checkpointInterval) return;

    this.checkpointInterval = setInterval(async () => {
      // Only checkpoint if tab is visible
      if (typeof document !== 'undefined' && !document.hidden) {
        const checkpoint = await createCheckpoint({
          workingContext: {
            lastTopic: 'active session',
          },
        });
        if (checkpoint) {
          this.currentState.lastCheckpointId = checkpoint.id;
        }
      }
    }, 30000); // Every 30 seconds
  }

  // Generate recovery message for Claude Code
  generateRecoveryPrompt(recovery: RecoveryInfo): string {
    if (!recovery.wasDisconnected) return '';

    const parts: string[] = [];
    parts.push('[System: Session restored from checkpoint]');

    const disconnectedSeconds = Math.round(recovery.disconnectedFor / 1000);
    parts.push(`Connection was lost for ${disconnectedSeconds} seconds.`);

    if (recovery.checkpoint) {
      const cp = recovery.checkpoint;
      parts.push('\nBefore the connection dropped:');

      if (cp.workingContext?.lastTopic) {
        parts.push(`- Topic: ${cp.workingContext.lastTopic}`);
      }

      if (cp.workingContext?.lastToolCall) {
        parts.push(`- Last action: ${cp.workingContext.lastToolCall}`);
      }

      if (cp.pendingOps && cp.pendingOps.length > 0) {
        parts.push('- Pending tasks:');
        cp.pendingOps.forEach((op) => {
          parts.push(`  - ${op.description} (${op.status})`);
        });
      }

      if (cp.conversationHistory && cp.conversationHistory.length > 0) {
        const lastMsg =
          cp.conversationHistory[cp.conversationHistory.length - 1];
        parts.push(
          `- Last message from ${lastMsg.from}: "${lastMsg.content.slice(0, 100)}..."`
        );
      }
    }

    parts.push('\nPlease continue where you left off.');

    return parts.join('\n');
  }
}

// Singleton instance
let instance: ConnectionResilience | null = null;

export function getConnectionResilience(): ConnectionResilience {
  if (!instance) {
    instance = new ConnectionResilience();
  }
  return instance;
}

export default ConnectionResilience;
