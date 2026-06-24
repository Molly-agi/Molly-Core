/**
 * @fileOverview Item 19 — MarkItDown watcher contract
 *
 * Locks the watched-folder pipeline contract:
 *   1. A file dropped in the inbox is detected, converted via the adapter,
 *      and ingested via `writeFact` under userId `corpus:markitdown-<slug>-<8hex>`.
 *   2. The chunk id matches the deterministic shape `kf-markitdown-<slug>-<8hex>-NNNNNN`.
 *   3. The file is moved to `inbox/processed/<basename>` after a successful run.
 *   4. Idempotency — dropping the same file twice produces the same chunk id
 *      both times (writeFact upserts; no duplication).
 *   5. Failure quarantine — when the adapter throws, the file is moved to
 *      `inbox/failed/<basename>` and a sibling `<basename>.error.json` is
 *      written containing the error message.
 *   6. The boot-recovery scan picks up files that were already in the inbox
 *      at `ensureMarkitdownWatcherStarted()` time.
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── Adapter mock — controllable per-test ────────────────────────────────────
const convertSpy = jest.fn();
jest.mock('@/ai/ingest/markitdown-mcp-adapter', () => ({
  convertFileToMarkdown: (...args: unknown[]) => convertSpy(...args),
}));

// ── KnowledgeStore mock — spy on writeFact ──────────────────────────────────
const writeFactSpy = jest.fn();
const getKnowledgeStoreMock = jest.fn();
jest.mock('@/ai/memory/knowledge-store', () => ({
  getKnowledgeStore: (...args: unknown[]) => getKnowledgeStoreMock(...args),
}));

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  ensureMarkitdownWatcherStarted,
  __resetMarkitdownWatcherForTests,
  __processFileOnceForTests,
} from '../markitdown-watcher';

async function makeTmpInbox(): Promise<string> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'markitdown-watcher-test-')
  );
  return dir;
}

async function cleanup(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 3000,
  intervalMs = 25
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: timed out');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

describe('markitdown-watcher — pipeline contract', () => {
  let inbox: string;

  beforeEach(async () => {
    inbox = await makeTmpInbox();
    writeFactSpy.mockClear();
    writeFactSpy.mockResolvedValue({
      id: 'mocked',
      content: '',
      source: 'import',
      timestamp: 0,
      tags: [],
      importance: 0.5,
    });
    getKnowledgeStoreMock.mockReset();
    getKnowledgeStoreMock.mockResolvedValue({ writeFact: writeFactSpy });
    convertSpy.mockReset();
    convertSpy.mockResolvedValue('# Converted markdown body');
    __resetMarkitdownWatcherForTests();
  });

  afterEach(async () => {
    __resetMarkitdownWatcherForTests();
    await cleanup(inbox);
  });

  it('converts and ingests a dropped file, then moves it to processed/', async () => {
    const filePath = path.join(inbox, 'hello.txt');
    await fs.writeFile(filePath, 'original-source-text');

    await __processFileOnceForTests(filePath, inbox);

    expect(convertSpy).toHaveBeenCalledWith(filePath);
    expect(writeFactSpy).toHaveBeenCalled();
    const call = writeFactSpy.mock.calls[0];
    const content = call[0] as string;
    expect(content).toContain('# Converted markdown body');

    const processedPath = path.join(inbox, 'processed', 'hello.txt');
    await expect(fs.stat(processedPath)).resolves.toBeDefined();
    await expect(fs.stat(filePath)).rejects.toThrow();
  });

  it('uses corpus:markitdown-<slug>-<8hex> namespace + matching chunk id', async () => {
    const filePath = path.join(inbox, 'hello.txt');
    await fs.writeFile(filePath, 'src');

    await __processFileOnceForTests(filePath, inbox);

    const userId = getKnowledgeStoreMock.mock.calls[
      getKnowledgeStoreMock.mock.calls.length - 1
    ][0] as string;
    expect(userId).toMatch(/^corpus:markitdown-hello-[0-9a-f]{8}$/);

    const writeOpts = writeFactSpy.mock.calls[0][1] as { id?: string };
    expect(writeOpts.id).toMatch(/^kf-markitdown-hello-[0-9a-f]{8}-000000$/);
  });

  it('is idempotent — re-processing the same path yields the same chunk id', async () => {
    const filePath = path.join(inbox, 'hello.txt');
    await fs.writeFile(filePath, 'src');

    await __processFileOnceForTests(filePath, inbox);
    const firstId = (writeFactSpy.mock.calls[0][1] as { id?: string }).id;

    // Simulate re-drop: copy back to inbox from processed/
    await fs.copyFile(path.join(inbox, 'processed', 'hello.txt'), filePath);
    writeFactSpy.mockClear();

    await __processFileOnceForTests(filePath, inbox);
    const secondId = (writeFactSpy.mock.calls[0][1] as { id?: string }).id;

    expect(secondId).toBe(firstId);
  });

  it('quarantines a file in failed/ with .error.json when the adapter throws', async () => {
    convertSpy.mockRejectedValueOnce(new Error('synthetic adapter failure'));

    const filePath = path.join(inbox, 'broken.pdf');
    await fs.writeFile(filePath, 'pdf-bytes');

    await __processFileOnceForTests(filePath, inbox);

    const failedPath = path.join(inbox, 'failed', 'broken.pdf');
    await expect(fs.stat(failedPath)).resolves.toBeDefined();
    await expect(fs.stat(filePath)).rejects.toThrow();

    const errPath = path.join(inbox, 'failed', 'broken.pdf.error.json');
    const errRaw = await fs.readFile(errPath, 'utf8');
    const errJson = JSON.parse(errRaw) as { error: string };
    expect(errJson.error).toContain('synthetic adapter failure');
  });

  it('boot-recovery scan ingests a file that was already in the inbox at start time', async () => {
    const filePath = path.join(inbox, 'preexisting.md');
    await fs.writeFile(filePath, '# already here');

    await ensureMarkitdownWatcherStarted({
      watchDir: inbox,
      debounceMs: 10,
      enableFsWatch: false, // boot-scan only path; no live watch needed for this assertion
    });

    // boot-scan is async; poll until pipeline reaches the adapter call.
    await waitFor(
      () => convertSpy.mock.calls.some((c) => c[0] === filePath),
      3000
    );

    expect(convertSpy).toHaveBeenCalledWith(filePath);
    expect(writeFactSpy).toHaveBeenCalled();
  });

  it('skips files that already live under processed/ or failed/', async () => {
    await fs.mkdir(path.join(inbox, 'processed'), { recursive: true });
    await fs.writeFile(path.join(inbox, 'processed', 'already.md'), '# done');

    await ensureMarkitdownWatcherStarted({
      watchDir: inbox,
      debounceMs: 10,
      enableFsWatch: false,
    });

    // Short settle window — boot scan + debounce + stat-stability could
    // fire here if the skip logic regressed; wait long enough to catch it.
    await new Promise((r) => setTimeout(r, 700));

    expect(convertSpy).not.toHaveBeenCalled();
    expect(writeFactSpy).not.toHaveBeenCalled();
  });
});
