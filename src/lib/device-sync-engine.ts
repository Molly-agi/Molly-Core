/**
 * @fileOverview Device Sync Engine — Multi-Transport Data Synchronization
 *
 * Syncs Molly's data between devices (Helio A22 tablet, Fire HD 10, phone, etc.)
 * over ANY available connection:
 *
 *   - WiFi (both on same router)
 *   - WiFi Hotspot (one tablet shares to the other)
 *   - USB Tethering (direct USB-to-USB cable)
 *   - Any future network interface
 *
 * All of these create standard network interfaces with IPs.
 * USB tethering: usually 192.168.42.x (rndis0/usb0)
 * WiFi hotspot: usually 192.168.43.x (wlan0/ap0)
 * WiFi shared: whatever the router assigns
 *
 * Sync strategy:
 *   - Timestamp-based conflict resolution (last write wins)
 *   - Each device has a unique node ID
 *   - Sync manifest tracks what's been synced and when
 *   - Incremental: only syncs documents changed since last sync
 *   - Bidirectional: both devices send AND receive changes
 *   - Automatic peer discovery across all network interfaces
 *
 * No root required. No special permissions beyond Termux networking.
 *
 * Design (from Dad): "We don't fix the leaks in the dam. We fix the dam itself."
 * The fix: devices sync directly, no cloud middleman.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';

// ============================================================================
// TYPES
// ============================================================================

/** Unique identity for a sync node */
export interface SyncNodeIdentity {
  /** Unique node ID (persisted across restarts) */
  nodeId: string;
  /** Human-friendly name: 'helio-a22', 'fire-hd10', etc. */
  name: string;
  /** What role: primary (Helio w/ cellular) or replica (Fire, backup) */
  role: 'primary' | 'replica';
  /** Edge server port */
  port: number;
}

/** A single document change to sync */
export interface SyncChange {
  /** Collection path (e.g. 'users/molly/experiences') */
  collection: string;
  /** Document ID */
  docId: string;
  /** 'set' for create/update, 'delete' for removal */
  action: 'set' | 'delete';
  /** The document data (null for deletes) */
  data: Record<string, unknown> | null;
  /** ISO timestamp of the change */
  timestamp: string;
  /** Which node made this change */
  sourceNodeId: string;
}

/** Tracks sync state between two nodes */
export interface SyncManifest {
  /** Our node identity */
  localNode: SyncNodeIdentity;
  /** Known peers and their last sync timestamps */
  peers: Record<
    string,
    {
      nodeId: string;
      name: string;
      lastSyncAt: string | null;
      lastSyncDirection: 'push' | 'pull' | 'both' | null;
      documentsReceived: number;
      documentsSent: number;
      lastAddress: string;
    }
  >;
  /** When the manifest was last updated */
  updatedAt: string;
}

/** Result of a sync operation */
export interface SyncResult {
  success: boolean;
  peerNodeId: string;
  peerAddress: string;
  pushed: number;
  pulled: number;
  conflicts: number;
  durationMs: number;
  transport: string;
  error?: string;
}

/** A discovered peer on the network */
export interface DiscoveredPeer {
  address: string;
  port: number;
  nodeId: string;
  name: string;
  role: string;
  transport: 'wifi' | 'usb' | 'hotspot' | 'unknown';
  interfaceName: string;
  latencyMs: number;
}

// ============================================================================
// SYNC ENGINE
// ============================================================================

export class DeviceSyncEngine {
  private dataDir: string;
  private manifest: SyncManifest;
  private manifestPath: string;
  private changeLogPath: string;

  constructor(dataDir: string, nodeIdentity: SyncNodeIdentity) {
    this.dataDir = dataDir;
    this.manifestPath = path.join(dataDir, '_sync', 'manifest.json');
    this.changeLogPath = path.join(dataDir, '_sync', 'changelog');
    this.manifest = {
      localNode: nodeIdentity,
      peers: {},
      updatedAt: new Date().toISOString(),
    };
  }

  // ── Initialization ──

  /**
   * Load or create the sync manifest.
   */
  async initialize(): Promise<void> {
    await fs.mkdir(path.join(this.dataDir, '_sync'), { recursive: true });
    await fs.mkdir(this.changeLogPath, { recursive: true });

    try {
      const raw = await fs.readFile(this.manifestPath, 'utf-8');
      const saved = JSON.parse(raw) as SyncManifest;
      // Preserve node identity from constructor (may have updated port, etc.)
      this.manifest = {
        ...saved,
        localNode: this.manifest.localNode,
      };
    } catch {
      // First run — use the default manifest
      await this.saveManifest();
    }
  }

  private async saveManifest(): Promise<void> {
    this.manifest.updatedAt = new Date().toISOString();
    const tmp = `${this.manifestPath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(this.manifest, null, 2), 'utf-8');
    await fs.rename(tmp, this.manifestPath);
  }

  // ── Change Logging ──

  /**
   * Log a change for sync. Called by the storage provider on every write/delete.
   */
  async logChange(
    collection: string,
    docId: string,
    action: 'set' | 'delete',
    data: Record<string, unknown> | null
  ): Promise<void> {
    const change: SyncChange = {
      collection,
      docId,
      action,
      data,
      timestamp: new Date().toISOString(),
      sourceNodeId: this.manifest.localNode.nodeId,
    };

    // Store in a time-bucketed file (one per hour to keep file count manageable)
    const bucket = new Date().toISOString().slice(0, 13).replace(/[:-]/g, ''); // YYYYMMDDTHH
    const bucketFile = path.join(this.changeLogPath, `${bucket}.jsonl`);

    await fs.appendFile(bucketFile, JSON.stringify(change) + '\n', 'utf-8');
  }

  /**
   * Get all changes since a given timestamp.
   */
  async getChangesSince(since: string | null): Promise<SyncChange[]> {
    const changes: SyncChange[] = [];

    let files: string[];
    try {
      files = await fs.readdir(this.changeLogPath);
    } catch {
      return [];
    }

    // Sort chronologically
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl')).sort();

    for (const file of jsonlFiles) {
      const content = await fs.readFile(
        path.join(this.changeLogPath, file),
        'utf-8'
      );

      for (const line of content.split('\n').filter(Boolean)) {
        try {
          const change = JSON.parse(line) as SyncChange;
          if (!since || change.timestamp > since) {
            changes.push(change);
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    return changes;
  }

  // ── Peer Discovery ──

  /**
   * Discover peers across ALL network interfaces.
   * Scans common subnets for Molly edge servers.
   *
   * Works over:
   *   - WiFi (192.168.0.x, 192.168.1.x, 10.x.x.x, etc.)
   *   - USB tethering (192.168.42.x — Android default for USB RNDIS)
   *   - WiFi hotspot (192.168.43.x — Android default for AP mode)
   *   - Any other interface the OS provides
   */
  async discoverPeers(
    port: number = 9100,
    timeoutMs: number = 2000
  ): Promise<DiscoveredPeer[]> {
    const interfaces = os.networkInterfaces();
    const peers: DiscoveredPeer[] = [];
    const myAddresses = new Set<string>();

    // Collect our own addresses to skip
    for (const [, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        myAddresses.add(addr.address);
      }
    }

    // For each interface, scan the local subnet
    const scanPromises: Promise<void>[] = [];

    for (const [ifName, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      for (const addr of addrs) {
        // Skip loopback and IPv6 (for now)
        if (addr.internal || addr.family !== 'IPv4') continue;

        const transport = classifyInterface(ifName, addr.address);
        const subnet = addr.address.split('.').slice(0, 3).join('.');

        // Scan the subnet (1-254)
        // For constrained devices, scan in parallel batches of 50
        for (let batch = 0; batch < 6; batch++) {
          const start = batch * 50 + 1;
          const end = Math.min(start + 49, 254);

          const batchPromises: Promise<void>[] = [];
          for (let i = start; i <= end; i++) {
            const targetIp = `${subnet}.${i}`;
            if (myAddresses.has(targetIp)) continue;

            batchPromises.push(
              this.probePeer(targetIp, port, timeoutMs)
                .then((peer) => {
                  if (peer && peer.nodeId !== this.manifest.localNode.nodeId) {
                    peers.push({
                      ...peer,
                      transport,
                      interfaceName: ifName,
                    });
                  }
                })
                .catch(() => {
                  /* timeout or unreachable — expected */
                })
            );
          }
          scanPromises.push(Promise.allSettled(batchPromises).then(() => {}));
        }
      }
    }

    await Promise.allSettled(scanPromises);

    return peers;
  }

  /**
   * Try to reach a specific peer by address directly.
   * Use this when you know the IP (e.g., from previous discovery or manual config).
   */
  async connectToPeer(
    address: string,
    port: number = 9100
  ): Promise<DiscoveredPeer | null> {
    return this.probePeer(address, port, 5000);
  }

  /**
   * Probe a single address for a Molly edge server.
   */
  private probePeer(
    ip: string,
    port: number,
    timeoutMs: number
  ): Promise<DiscoveredPeer | null> {
    return new Promise((resolve) => {
      const startTime = Date.now();

      const req = http.request(
        {
          hostname: ip,
          port,
          path: '/api/sync/identity',
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const identity = JSON.parse(data) as SyncNodeIdentity;
              resolve({
                address: ip,
                port,
                nodeId: identity.nodeId,
                name: identity.name,
                role: identity.role,
                transport: 'unknown',
                interfaceName: '',
                latencyMs: Date.now() - startTime,
              });
            } catch {
              resolve(null);
            }
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }

  // ── Sync Execution ──

  /**
   * Sync with a specific peer. Bidirectional.
   *
   * 1. Push our changes since last sync to the peer
   * 2. Pull their changes since last sync from the peer
   * 3. Apply pulled changes locally
   * 4. Update manifest with new sync timestamp
   */
  async syncWithPeer(
    peerAddress: string,
    peerPort: number = 9100
  ): Promise<SyncResult> {
    const startTime = Date.now();
    const transport = classifyAddress(peerAddress);

    try {
      // Step 1: Get peer identity
      const peerIdentity = await this.httpGet<SyncNodeIdentity>(
        peerAddress,
        peerPort,
        '/api/sync/identity'
      );

      if (!peerIdentity) {
        return {
          success: false,
          peerNodeId: 'unknown',
          peerAddress,
          pushed: 0,
          pulled: 0,
          conflicts: 0,
          durationMs: Date.now() - startTime,
          transport,
          error: 'Could not reach peer',
        };
      }

      const peerState = this.manifest.peers[peerIdentity.nodeId];
      const lastSync = peerState?.lastSyncAt || null;

      // Step 2: Get our changes since last sync
      const ourChanges = await this.getChangesSince(lastSync);

      // Step 3: Push our changes to peer
      let pushed = 0;
      if (ourChanges.length > 0) {
        const pushResult = await this.httpPost<{ applied: number }>(
          peerAddress,
          peerPort,
          '/api/sync/receive',
          {
            fromNodeId: this.manifest.localNode.nodeId,
            changes: ourChanges,
          }
        );
        pushed = pushResult?.applied || 0;
      }

      // Step 4: Pull their changes since last sync
      const pullResult = await this.httpPost<{ changes: SyncChange[] }>(
        peerAddress,
        peerPort,
        '/api/sync/changes',
        { since: lastSync }
      );

      // Step 5: Apply pulled changes locally
      let pulled = 0;
      let conflicts = 0;

      if (pullResult?.changes && pullResult.changes.length > 0) {
        for (const change of pullResult.changes) {
          // Skip changes that originated from us (prevent echo)
          if (change.sourceNodeId === this.manifest.localNode.nodeId) continue;

          try {
            await this.applyChange(change);
            pulled++;
          } catch {
            conflicts++;
          }
        }
      }

      // Step 6: Update manifest
      const syncTime = new Date().toISOString();
      this.manifest.peers[peerIdentity.nodeId] = {
        nodeId: peerIdentity.nodeId,
        name: peerIdentity.name,
        lastSyncAt: syncTime,
        lastSyncDirection: 'both',
        documentsReceived: (peerState?.documentsReceived || 0) + pulled,
        documentsSent: (peerState?.documentsSent || 0) + pushed,
        lastAddress: peerAddress,
      };
      await this.saveManifest();

      return {
        success: true,
        peerNodeId: peerIdentity.nodeId,
        peerAddress,
        pushed,
        pulled,
        conflicts,
        durationMs: Date.now() - startTime,
        transport,
      };
    } catch (err: unknown) {
      return {
        success: false,
        peerNodeId: 'unknown',
        peerAddress,
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        durationMs: Date.now() - startTime,
        transport,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Discover and sync with ALL available peers.
   */
  async syncAll(port: number = 9100): Promise<SyncResult[]> {
    const peers = await this.discoverPeers(port);
    const results: SyncResult[] = [];

    // Also try known peers from manifest (in case discovery missed them)
    const knownAddresses = new Set(peers.map((p) => p.address));
    for (const [, peerState] of Object.entries(this.manifest.peers)) {
      if (peerState.lastAddress && !knownAddresses.has(peerState.lastAddress)) {
        const known = await this.connectToPeer(peerState.lastAddress, port);
        if (known) peers.push(known);
      }
    }

    for (const peer of peers) {
      const result = await this.syncWithPeer(peer.address, peer.port);
      results.push(result);
    }

    return results;
  }

  // ── Change Application ──

  /**
   * Apply a remote change to local storage.
   * Uses last-write-wins for conflict resolution.
   */
  private async applyChange(change: SyncChange): Promise<void> {
    const collectionDir = path.join(
      this.dataDir,
      ...change.collection.split('/').filter(Boolean)
    );
    const resolved = path.resolve(collectionDir);
    if (!resolved.startsWith(path.resolve(this.dataDir))) {
      throw new Error('Path traversal blocked during sync');
    }

    const docPath = path.join(
      collectionDir,
      `${path.basename(change.docId)}.json`
    );

    if (change.action === 'delete') {
      try {
        await fs.unlink(docPath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      return;
    }

    // For 'set' action: check if local version is newer
    try {
      const existing = await fs.readFile(docPath, 'utf-8');
      const local = JSON.parse(existing);
      const localTime = local._updatedAt || local._createdAt || '';
      if (localTime > change.timestamp) {
        // Local is newer — skip (last-write-wins)
        return;
      }
    } catch {
      // File doesn't exist locally — will be created
    }

    // Write the remote data
    await fs.mkdir(collectionDir, { recursive: true });
    const data = {
      ...change.data,
      _syncedFrom: change.sourceNodeId,
      _syncedAt: new Date().toISOString(),
    };
    const tmp = `${docPath}.tmp.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tmp, docPath);
  }

  // ── HTTP Helpers ──

  private httpGet<T>(
    host: string,
    port: number,
    urlPath: string
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const req = http.request(
        { hostname: host, port, path: urlPath, method: 'GET', timeout: 10000 },
        (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.end();
    });
  }

  private httpPost<T>(
    host: string,
    port: number,
    urlPath: string,
    body: Record<string, unknown>
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const bodyStr = JSON.stringify(body);
      const req = http.request(
        {
          hostname: host,
          port,
          path: urlPath,
          method: 'POST',
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(bodyStr),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (c) => {
            data += c;
          });
          res.on('end', () => {
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.write(bodyStr);
      req.end();
    });
  }

  // ── Status ──

  getManifest(): Readonly<SyncManifest> {
    return { ...this.manifest };
  }

  getNodeIdentity(): SyncNodeIdentity {
    return { ...this.manifest.localNode };
  }

  /**
   * Get all known network addresses this device can be reached on.
   */
  getLocalAddresses(): Array<{
    address: string;
    interface: string;
    transport: string;
  }> {
    const result: Array<{
      address: string;
      interface: string;
      transport: string;
    }> = [];
    const interfaces = os.networkInterfaces();

    for (const [ifName, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.internal || addr.family !== 'IPv4') continue;
        result.push({
          address: addr.address,
          interface: ifName,
          transport: classifyInterface(ifName, addr.address),
        });
      }
    }

    return result;
  }

  // ── Cleanup ──

  /**
   * Prune changelog files older than N days to save disk space.
   */
  async pruneChangelog(maxAgeDays: number = 30): Promise<number> {
    let pruned = 0;

    try {
      const files = await fs.readdir(this.changeLogPath);
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = path.join(this.changeLogPath, file);
        const stat = await fs.stat(filePath);
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filePath);
          pruned++;
        }
      }
    } catch {
      // Empty changelog dir — nothing to prune
    }

    return pruned;
  }
}

// ============================================================================
// TRANSPORT CLASSIFICATION
// ============================================================================

/**
 * Classify a network interface by name and IP range to determine
 * what transport type it likely is.
 *
 * Android standard interfaces:
 *   - wlan0: WiFi client
 *   - ap0 / wlan1: WiFi hotspot (AP mode)
 *   - rndis0 / usb0: USB tethering (RNDIS gadget)
 *   - rmnet0..N: cellular (not useful for peer sync)
 *   - lo: loopback
 */
function classifyInterface(
  ifName: string,
  ipAddress: string
): 'wifi' | 'usb' | 'hotspot' | 'unknown' {
  const name = ifName.toLowerCase();

  // USB tethering interfaces
  if (name.startsWith('rndis') || name.startsWith('usb')) return 'usb';
  // Also classify by Android USB tethering subnet
  if (ipAddress.startsWith('192.168.42.')) return 'usb';

  // Hotspot interfaces
  if (name === 'ap0' || name === 'wlan1' || name.startsWith('swlan'))
    return 'hotspot';
  // Android hotspot subnet
  if (ipAddress.startsWith('192.168.43.')) return 'hotspot';

  // Regular WiFi
  if (
    name.startsWith('wlan') ||
    name.startsWith('wifi') ||
    name.startsWith('eth')
  )
    return 'wifi';

  return 'unknown';
}

/**
 * Classify a peer's IP address to guess the transport.
 */
function classifyAddress(ipAddress: string): string {
  if (ipAddress.startsWith('192.168.42.')) return 'usb-tethering';
  if (ipAddress.startsWith('192.168.43.')) return 'wifi-hotspot';
  if (ipAddress.startsWith('192.168.')) return 'wifi';
  if (ipAddress.startsWith('10.')) return 'wifi';
  if (ipAddress.startsWith('172.')) return 'wifi';
  return 'unknown';
}

// ============================================================================
// SINGLETON FACTORY
// ============================================================================

let _instance: DeviceSyncEngine | null = null;

export function getDeviceSyncEngine(
  dataDir: string,
  nodeIdentity: SyncNodeIdentity
): DeviceSyncEngine {
  if (!_instance) {
    _instance = new DeviceSyncEngine(dataDir, nodeIdentity);
  }
  return _instance;
}

export function resetDeviceSyncEngine(): void {
  _instance = null;
}
