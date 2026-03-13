/**
 * @fileOverview Local Storage Provider Tests
 *
 * Tests the filesystem-backed document store using a real temp directory.
 * No mocks — these are integration tests against the actual filesystem.
 */

import { LocalStorageProvider } from '../local-storage-provider';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Mock logger
jest.mock('../../ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'molly-test-'));
    provider = new LocalStorageProvider(testDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  // ── Identity ──

  describe('Identity', () => {
    it('has correct id and name', () => {
      expect(provider.id).toBe('local');
      expect(provider.name).toBe('Local Filesystem');
    });

    it('returns the data directory', () => {
      expect(provider.getDataDir()).toBe(testDir);
    });
  });

  // ── Add ──

  describe('add()', () => {
    it('creates a document with auto-generated ID', async () => {
      const result = await provider.add('users/molly/experiences', {
        content: 'Hello world',
        vibe: 'happy',
      });

      expect(result.id).toBeTruthy();
      expect(result.data.content).toBe('Hello world');
      expect(result.data.vibe).toBe('happy');
      expect(result.data._id).toBe(result.id);
      expect(result.data._createdAt).toBeTruthy();
      expect(result.data._updatedAt).toBeTruthy();
    });

    it('creates the collection directory automatically', async () => {
      await provider.add('deep/nested/collection', { test: true });

      const dir = path.join(testDir, 'deep', 'nested', 'collection');
      const stat = await fs.stat(dir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('creates a JSON file on disk', async () => {
      const result = await provider.add('test-col', { key: 'value' });

      const filePath = path.join(testDir, 'test-col', `${result.id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.key).toBe('value');
    });

    it('generates unique IDs', async () => {
      const ids = new Set<string>();
      for (let i = 0; i < 20; i++) {
        const result = await provider.add('test', { i });
        ids.add(result.id);
      }
      expect(ids.size).toBe(20);
    });
  });

  // ── Set ──

  describe('set()', () => {
    it('creates a document with specific ID', async () => {
      await provider.set('test', 'my-doc', { name: 'Molly' });

      const result = await provider.get('test', 'my-doc');
      expect(result).not.toBeNull();
      expect(result!.data.name).toBe('Molly');
    });

    it('overwrites existing document', async () => {
      await provider.set('test', 'my-doc', { version: 1 });
      await provider.set('test', 'my-doc', { version: 2 });

      const result = await provider.get('test', 'my-doc');
      expect(result!.data.version).toBe(2);
    });

    it('preserves _createdAt on overwrite', async () => {
      await provider.set('test', 'my-doc', { v: 1 });
      const first = await provider.get('test', 'my-doc');
      const createdAt = first!.data._createdAt;

      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10));
      await provider.set('test', 'my-doc', { v: 2 });

      const second = await provider.get('test', 'my-doc');
      expect(second!.data._createdAt).toBe(createdAt);
      expect(second!.data._updatedAt).not.toBe(createdAt);
    });
  });

  // ── Get ──

  describe('get()', () => {
    it('returns null for non-existent document', async () => {
      const result = await provider.get('test', 'nope');
      expect(result).toBeNull();
    });

    it('returns null for non-existent collection', async () => {
      const result = await provider.get('nonexistent/col', 'nope');
      expect(result).toBeNull();
    });

    it('returns the document with ID', async () => {
      await provider.set('test', 'doc1', { value: 42 });

      const result = await provider.get('test', 'doc1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('doc1');
      expect(result!.data.value).toBe(42);
    });
  });

  // ── Update ──

  describe('update()', () => {
    it('updates specific fields', async () => {
      await provider.set('test', 'doc', { name: 'Molly', age: 1 });
      await provider.update('test', 'doc', { age: 2 });

      const result = await provider.get('test', 'doc');
      expect(result!.data.name).toBe('Molly');
      expect(result!.data.age).toBe(2);
    });

    it('throws on non-existent document', async () => {
      await expect(
        provider.update('test', 'nonexistent', { x: 1 })
      ).rejects.toThrow('Document not found');
    });

    it('preserves _id even if update tries to change it', async () => {
      await provider.set('test', 'doc', { data: true });
      await provider.update('test', 'doc', { _id: 'hacked' });

      const result = await provider.get('test', 'doc');
      expect(result!.data._id).toBe('doc');
    });

    it('updates _updatedAt timestamp', async () => {
      await provider.set('test', 'doc', { data: true });
      const before = (await provider.get('test', 'doc'))!.data._updatedAt;

      await new Promise((r) => setTimeout(r, 10));
      await provider.update('test', 'doc', { data: false });
      const after = (await provider.get('test', 'doc'))!.data._updatedAt;

      expect(after).not.toBe(before);
    });
  });

  // ── Delete ──

  describe('delete()', () => {
    it('deletes an existing document', async () => {
      await provider.set('test', 'doc', { data: true });
      await provider.delete('test', 'doc');

      const result = await provider.get('test', 'doc');
      expect(result).toBeNull();
    });

    it('is a no-op for non-existent document', async () => {
      // Should not throw
      await expect(
        provider.delete('test', 'nonexistent')
      ).resolves.toBeUndefined();
    });
  });

  // ── Query ──

  describe('query()', () => {
    beforeEach(async () => {
      // Seed test data
      await provider.set('animals', 'dog', {
        name: 'Rex',
        type: 'dog',
        age: 5,
        tags: ['loyal', 'brave'],
      });
      await provider.set('animals', 'cat', {
        name: 'Whiskers',
        type: 'cat',
        age: 3,
        tags: ['independent', 'curious'],
      });
      await provider.set('animals', 'bird', {
        name: 'Tweety',
        type: 'bird',
        age: 1,
        tags: ['cheerful', 'brave'],
      });
      await provider.set('animals', 'old-cat', {
        name: 'Garfield',
        type: 'cat',
        age: 12,
        tags: ['lazy'],
      });
    });

    it('returns all documents without filters', async () => {
      const results = await provider.query('animals');
      expect(results).toHaveLength(4);
    });

    it('returns empty array for non-existent collection', async () => {
      const results = await provider.query('nonexistent');
      expect(results).toEqual([]);
    });

    it('filters with == operator', async () => {
      const results = await provider.query('animals', [
        { field: 'type', operator: '==', value: 'cat' },
      ]);
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.data.type === 'cat')).toBe(true);
    });

    it('filters with != operator', async () => {
      const results = await provider.query('animals', [
        { field: 'type', operator: '!=', value: 'cat' },
      ]);
      expect(results).toHaveLength(2);
    });

    it('filters with < operator', async () => {
      const results = await provider.query('animals', [
        { field: 'age', operator: '<', value: 4 },
      ]);
      expect(results).toHaveLength(2); // bird (1), cat (3)
    });

    it('filters with > operator', async () => {
      const results = await provider.query('animals', [
        { field: 'age', operator: '>', value: 4 },
      ]);
      expect(results).toHaveLength(2); // dog (5), old-cat (12)
    });

    it('filters with <= operator', async () => {
      const results = await provider.query('animals', [
        { field: 'age', operator: '<=', value: 3 },
      ]);
      expect(results).toHaveLength(2); // bird (1), cat (3)
    });

    it('filters with >= operator', async () => {
      const results = await provider.query('animals', [
        { field: 'age', operator: '>=', value: 5 },
      ]);
      expect(results).toHaveLength(2); // dog (5), old-cat (12)
    });

    it('filters with in operator', async () => {
      const results = await provider.query('animals', [
        { field: 'type', operator: 'in', value: ['dog', 'bird'] },
      ]);
      expect(results).toHaveLength(2);
    });

    it('filters with array-contains operator', async () => {
      const results = await provider.query('animals', [
        { field: 'tags', operator: 'array-contains', value: 'brave' },
      ]);
      expect(results).toHaveLength(2); // dog, bird
    });

    it('applies multiple filters (AND)', async () => {
      const results = await provider.query('animals', [
        { field: 'type', operator: '==', value: 'cat' },
        { field: 'age', operator: '>', value: 5 },
      ]);
      expect(results).toHaveLength(1);
      expect(results[0].data.name).toBe('Garfield');
    });

    it('orders by field ascending', async () => {
      const results = await provider.query('animals', undefined, {
        orderBy: { field: 'age', direction: 'asc' },
      });
      const ages = results.map((r) => r.data.age);
      expect(ages).toEqual([1, 3, 5, 12]);
    });

    it('orders by field descending', async () => {
      const results = await provider.query('animals', undefined, {
        orderBy: { field: 'age', direction: 'desc' },
      });
      const ages = results.map((r) => r.data.age);
      expect(ages).toEqual([12, 5, 3, 1]);
    });

    it('limits results', async () => {
      const results = await provider.query('animals', undefined, {
        orderBy: { field: 'age', direction: 'desc' },
        limit: 2,
      });
      expect(results).toHaveLength(2);
      expect(results[0].data.name).toBe('Garfield');
    });

    it('combines filters, orderBy, and limit', async () => {
      const results = await provider.query(
        'animals',
        [{ field: 'type', operator: '==', value: 'cat' }],
        { orderBy: { field: 'age', direction: 'asc' }, limit: 1 }
      );
      expect(results).toHaveLength(1);
      expect(results[0].data.name).toBe('Whiskers');
    });
  });

  // ── Batch Write ──

  describe('batchWrite()', () => {
    it('executes multiple operations', async () => {
      await provider.set('test', 'existing', { value: 'old' });

      await provider.batchWrite([
        { type: 'set', collectionPath: 'test', docId: 'new1', data: { v: 1 } },
        { type: 'set', collectionPath: 'test', docId: 'new2', data: { v: 2 } },
        {
          type: 'update',
          collectionPath: 'test',
          docId: 'existing',
          data: { value: 'updated' },
        },
      ]);

      const new1 = await provider.get('test', 'new1');
      const new2 = await provider.get('test', 'new2');
      const existing = await provider.get('test', 'existing');

      expect(new1!.data.v).toBe(1);
      expect(new2!.data.v).toBe(2);
      expect(existing!.data.value).toBe('updated');
    });

    it('handles delete in batch', async () => {
      await provider.set('test', 'to-delete', { data: true });

      await provider.batchWrite([
        { type: 'delete', collectionPath: 'test', docId: 'to-delete' },
      ]);

      const result = await provider.get('test', 'to-delete');
      expect(result).toBeNull();
    });
  });

  // ── Path Traversal Protection ──

  describe('Path Traversal Protection', () => {
    it('blocks collection path traversal', async () => {
      await expect(provider.add('../../../etc', { bad: true })).rejects.toThrow(
        'Path traversal blocked'
      );
    });

    it('strips directory from doc ID', async () => {
      // path.basename('../../evil') returns 'evil', so it's safe
      await provider.set('test', '../../evil', { data: true });
      const result = await provider.get('test', 'evil');
      expect(result).not.toBeNull();
      expect(result!.data.data).toBe(true);
    });
  });

  // ── Health Check ──

  describe('healthCheck()', () => {
    it('returns true for valid directory', async () => {
      const healthy = await provider.healthCheck();
      expect(healthy).toBe(true);
    });

    it('returns false for invalid directory', async () => {
      // Use /dev/null as base — can't create subdirs under a device file
      const badProvider = new LocalStorageProvider('/dev/null/molly_data');
      const healthy = await badProvider.healthCheck();
      expect(healthy).toBe(false);
    }, 10000);
  });

  // ── Subcollections (Firestore-like paths) ──

  describe('Subcollections', () => {
    it('supports nested collection paths like Firestore', async () => {
      await provider.add('users/molly/experiences', {
        content: 'Learned about photography',
        vibe: 'curious',
      });

      await provider.add('users/molly/learnedCommands', {
        prompt: 'list files',
        command: 'ls -la',
      });

      const experiences = await provider.query('users/molly/experiences');
      const commands = await provider.query('users/molly/learnedCommands');

      expect(experiences).toHaveLength(1);
      expect(commands).toHaveLength(1);
      expect(experiences[0].data.vibe).toBe('curious');
      expect(commands[0].data.command).toBe('ls -la');
    });

    it('isolates different users', async () => {
      await provider.add('users/molly/experiences', { who: 'molly' });
      await provider.add('users/eric/experiences', { who: 'eric' });

      const molly = await provider.query('users/molly/experiences');
      const eric = await provider.query('users/eric/experiences');

      expect(molly).toHaveLength(1);
      expect(eric).toHaveLength(1);
      expect(molly[0].data.who).toBe('molly');
      expect(eric[0].data.who).toBe('eric');
    });
  });
});
