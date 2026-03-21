/**
 * @fileOverview Device Sync Engine Tests
 *
 * Tests the multi-transport sync system using real temp directories.
 * No mocks for filesystem — integration tests against actual disk.
 */

import { DeviceSyncEngine, resetDeviceSyncEngine } from '../device-sync-engine';
import type { SyncNodeIdentity } from '../device-sync-engine';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Mock logger
jest.mock('../../ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('DeviceSyncEngine', () => {
  let engine: DeviceSyncEngine;
  let testDir: string;
  let nodeIdentity: SyncNodeIdentity;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-sync-'));
    nodeIdentity = {
      nodeId: 'test-node-helio',
      name: 'helio-a22',
      role: 'primary',
      port: 9100,
    };
    engine = new DeviceSyncEngine(testDir, nodeIdentity);
    await engine.initialize();
  });

  afterEach(async () => {
    resetDeviceSyncEngine();
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ── Initialization ──

  describe('Initialization', () => {
    it('creates sync directories', async () => {
      const syncDir = path.join(testDir, '_sync');
      const stat = await fs.stat(syncDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates changelog directory', async () => {
      const clDir = path.join(testDir, '_sync', 'changelog');
      const stat = await fs.stat(clDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('saves manifest on first run', async () => {
      const manifestPath = path.join(testDir, '_sync', 'manifest.json');
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(content);
      expect(manifest.localNode.nodeId).toBe('test-node-helio');
      expect(manifest.localNode.name).toBe('helio-a22');
      expect(manifest.localNode.role).toBe('primary');
    });

    it('preserves manifest across restarts', async () => {
      // Modify peers (simulating a sync)
      const manifest = engine.getManifest();
      expect(manifest.peers).toEqual({});

      // Create a new engine with the same data dir
      const engine2 = new DeviceSyncEngine(testDir, {
        nodeId: 'test-node-helio',
        name: 'helio-a22-updated',
        role: 'primary',
        port: 9100,
      });
      await engine2.initialize();
      const manifest2 = engine2.getManifest();
      // Node identity should use the constructor's values
      expect(manifest2.localNode.name).toBe('helio-a22-updated');
    });
  });

  // ── Change Logging ──

  describe('Change Logging', () => {
    it('logs a set change', async () => {
      await engine.logChange('users/molly/experiences', 'doc1', 'set', {
        content: 'test memory',
        vibe: 'happy',
      });

      const changes = await engine.getChangesSince(null);
      expect(changes).toHaveLength(1);
      expect(changes[0].collection).toBe('users/molly/experiences');
      expect(changes[0].docId).toBe('doc1');
      expect(changes[0].action).toBe('set');
      expect(changes[0].data).toEqual({
        content: 'test memory',
        vibe: 'happy',
      });
      expect(changes[0].sourceNodeId).toBe('test-node-helio');
    });

    it('logs a delete change', async () => {
      await engine.logChange('users/molly/experiences', 'doc1', 'delete', null);

      const changes = await engine.getChangesSince(null);
      expect(changes).toHaveLength(1);
      expect(changes[0].action).toBe('delete');
      expect(changes[0].data).toBeNull();
    });

    it('accumulates multiple changes', async () => {
      await engine.logChange('col', 'a', 'set', { v: 1 });
      await engine.logChange('col', 'b', 'set', { v: 2 });
      await engine.logChange('col', 'c', 'delete', null);

      const changes = await engine.getChangesSince(null);
      expect(changes).toHaveLength(3);
    });

    it('filters by timestamp', async () => {
      await engine.logChange('col', 'old', 'set', { v: 1 });

      // Get everything to find the timestamp
      const allChanges = await engine.getChangesSince(null);
      const after = allChanges[0].timestamp;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      await engine.logChange('col', 'new', 'set', { v: 2 });

      const newChanges = await engine.getChangesSince(after);
      expect(newChanges).toHaveLength(1);
      expect(newChanges[0].docId).toBe('new');
    });

    it('returns empty array when no changelog exists', async () => {
      // Delete the changelog dir
      await fs.rm(path.join(testDir, '_sync', 'changelog'), {
        recursive: true,
        force: true,
      });

      const changes = await engine.getChangesSince(null);
      expect(changes).toEqual([]);
    });
  });

  // ── Node Identity ──

  describe('Node Identity', () => {
    it('returns the correct identity', () => {
      const id = engine.getNodeIdentity();
      expect(id.nodeId).toBe('test-node-helio');
      expect(id.name).toBe('helio-a22');
      expect(id.role).toBe('primary');
      expect(id.port).toBe(9100);
    });

    it('returns a copy not a reference', () => {
      const a = engine.getNodeIdentity();
      const b = engine.getNodeIdentity();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });
  });

  // ── Manifest ──

  describe('Manifest', () => {
    it('returns current manifest', () => {
      const manifest = engine.getManifest();
      expect(manifest.localNode.nodeId).toBe('test-node-helio');
      expect(manifest.peers).toEqual({});
      expect(manifest.updatedAt).toBeTruthy();
    });

    it('returns a copy', () => {
      const a = engine.getManifest();
      const b = engine.getManifest();
      expect(a).not.toBe(b);
    });
  });

  // ── Local Addresses ──

  describe('Local Addresses', () => {
    it('returns network interfaces', () => {
      const addrs = engine.getLocalAddresses();
      // Should have at least one IPv4 address on any system
      expect(Array.isArray(addrs)).toBe(true);
      // Each entry has required fields
      for (const addr of addrs) {
        expect(addr.address).toBeTruthy();
        expect(addr.interface).toBeTruthy();
        expect(addr.transport).toBeTruthy();
      }
    });
  });

  // ── Peer Discovery ──

  describe('Peer Discovery', () => {
    it('returns empty when no peers on network', async () => {
      // Use a very short timeout and unlikely port
      const peers = await engine.discoverPeers(59999, 100);
      expect(peers).toEqual([]);
    }, 30000);
  });

  // ── Connect to Specific Peer ──

  describe('connectToPeer()', () => {
    it('returns null for unreachable address', async () => {
      const peer = await engine.connectToPeer('192.168.255.254', 59999);
      expect(peer).toBeNull();
    }, 10000);
  });

  // ── Sync With Peer ──

  describe('syncWithPeer()', () => {
    it('returns failure for unreachable peer', async () => {
      const result = await engine.syncWithPeer('192.168.255.254', 59999);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    }, 15000);
  });

  // ── Changelog Pruning ──

  describe('Changelog Pruning', () => {
    it('prunes old changelog files', async () => {
      // Create an old file
      const changelogDir = path.join(testDir, '_sync', 'changelog');
      const oldFile = path.join(changelogDir, '20250101T00.jsonl');
      await fs.writeFile(oldFile, '{"test":"old"}\n', 'utf-8');

      // Backdate the file's mtime to 60 days ago
      const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await fs.utimes(oldFile, oldTime, oldTime);

      // Also create a recent file
      const recentFile = path.join(changelogDir, '20260313T12.jsonl');
      await fs.writeFile(recentFile, '{"test":"recent"}\n', 'utf-8');

      const pruned = await engine.pruneChangelog(30);
      expect(pruned).toBe(1);

      // Recent file should still exist
      const remaining = await fs.readdir(changelogDir);
      expect(remaining).toContain('20260313T12.jsonl');
      expect(remaining).not.toContain('20250101T00.jsonl');
    });

    it('returns 0 when nothing to prune', async () => {
      const pruned = await engine.pruneChangelog(30);
      expect(pruned).toBe(0);
    });
  });

  // ── Two-Node Simulation ──

  describe('Two-Node Sync (simulated)', () => {
    let engine2: DeviceSyncEngine;
    let testDir2: string;

    beforeEach(async () => {
      testDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-sync2-'));
      engine2 = new DeviceSyncEngine(testDir2, {
        nodeId: 'test-node-fire',
        name: 'fire-hd10',
        role: 'replica',
        port: 9101,
      });
      await engine2.initialize();
    });

    afterEach(async () => {
      await fs.rm(testDir2, { recursive: true, force: true });
    });

    it('engine1 and engine2 have different node IDs', () => {
      expect(engine.getNodeIdentity().nodeId).not.toBe(
        engine2.getNodeIdentity().nodeId
      );
    });

    it('changes logged on one engine are not visible on the other', async () => {
      await engine.logChange('test', 'doc1', 'set', { source: 'helio' });

      const e1Changes = await engine.getChangesSince(null);
      const e2Changes = await engine2.getChangesSince(null);

      expect(e1Changes).toHaveLength(1);
      expect(e2Changes).toHaveLength(0);
    });

    it('simulated sync transfers changes between engines', async () => {
      // Log changes on engine 1 (helio)
      await engine.logChange('users/molly/experiences', 'mem1', 'set', {
        content: 'Memory from Helio tablet',
        _updatedAt: new Date().toISOString(),
      });

      // Get changes from engine 1
      const changes = await engine.getChangesSince(null);

      // Manually apply them to engine 2 (simulating what sync/receive does)
      for (const change of changes) {
        const segments = change.collection.split('/').filter(Boolean);
        const colDir = path.join(testDir2, ...segments);
        await fs.mkdir(colDir, { recursive: true });

        if (change.action === 'set' && change.data) {
          const docPath = path.join(colDir, `${change.docId}.json`);
          await fs.writeFile(docPath, JSON.stringify(change.data, null, 2));
        }
      }

      // Verify the data landed on engine 2's filesystem
      const docPath = path.join(
        testDir2,
        'users',
        'molly',
        'experiences',
        'mem1.json'
      );
      const content = await fs.readFile(docPath, 'utf-8');
      const doc = JSON.parse(content);
      expect(doc.content).toBe('Memory from Helio tablet');
    });
  });
});
