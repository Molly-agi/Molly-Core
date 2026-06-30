/**
 * @fileOverview Gap 2 — llama.cpp slot snapshot client
 *
 * Wraps the llama-server slots API so we can capture KV cache state for
 * write-back into the crystal substrate. Removes the need to fork llama.cpp:
 * Eric pointed out the endpoint already exists.
 *
 * llama-server must be launched with `--slot-save-path <dir>` for save/restore
 * to work. Without that flag the endpoints return 501.
 *
 * Endpoints used (stable since the slots API landed, well before b9843):
 *   POST /slots/{id}?action=save     body: { filename }
 *   POST /slots/{id}?action=restore  body: { filename }
 *   POST /slots/{id}?action=erase
 *   GET  /slots
 *
 * Snapshots are binary KV blobs written under --slot-save-path. We do NOT
 * parse them here — a downstream worker diffs snapshot N-1 vs N to extract
 * the crystallizable delta. This module only manages capture/restore.
 */

export interface SlotSnapshotConfig {
  /** Base URL of the running llama-server, e.g. http://127.0.0.1:8080 */
  baseUrl: string;
  /** Optional fetch override, primarily for tests */
  fetchImpl?: typeof fetch;
  /** Request timeout in ms (default 30s — saves on a 70B can take >100ms) */
  timeoutMs?: number;
}

export interface SlotInfo {
  id: number;
  state: number;
  prompt?: string;
  next_token?: unknown;
}

export interface SlotActionResult {
  filename?: string;
  n_saved?: number;
  n_restored?: number;
  timings?: Record<string, number>;
}

export class SlotSnapshotError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string
  ) {
    super(message);
    this.name = 'SlotSnapshotError';
  }
}

export class SlotSnapshotClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: SlotSnapshotConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  /**
   * Save the current KV state of `slotId` to a file under --slot-save-path.
   * The filename is the basename only — the server prepends the configured
   * directory. Pauses the slot for the duration of the I/O.
   */
  async saveSlot(slotId: number, filename: string): Promise<SlotActionResult> {
    if (!filename || filename.includes('/') || filename.includes('..')) {
      throw new SlotSnapshotError(
        `Invalid snapshot filename: ${filename}. Must be a basename.`
      );
    }
    return this.postSlotAction(slotId, 'save', { filename });
  }

  /**
   * Restore a slot from a previously saved snapshot. Slot is paused for
   * the duration of the read.
   */
  async restoreSlot(
    slotId: number,
    filename: string
  ): Promise<SlotActionResult> {
    if (!filename || filename.includes('/') || filename.includes('..')) {
      throw new SlotSnapshotError(
        `Invalid snapshot filename: ${filename}. Must be a basename.`
      );
    }
    return this.postSlotAction(slotId, 'restore', { filename });
  }

  /**
   * Clear the slot's KV state. Use sparingly — destructive.
   */
  async eraseSlot(slotId: number): Promise<SlotActionResult> {
    return this.postSlotAction(slotId, 'erase');
  }

  /**
   * List all slots and their current metadata.
   */
  async listSlots(): Promise<SlotInfo[]> {
    const res = await this.requestWithTimeout(`${this.baseUrl}/slots`, {
      method: 'GET',
    });
    if (!res.ok) {
      const body = await res.text();
      throw new SlotSnapshotError(
        `GET /slots failed: ${res.status}`,
        res.status,
        body
      );
    }
    const data = (await res.json()) as SlotInfo[];
    return data;
  }

  /**
   * Compose a snapshot filename of the form `kv_<slotId>_<isoTs>.bin`.
   * Centralized so the diff worker can parse the naming.
   */
  static buildSnapshotFilename(slotId: number, ts: Date = new Date()): string {
    const stamp = ts.toISOString().replace(/[:.]/g, '-');
    return `kv_${slotId}_${stamp}.bin`;
  }

  private async postSlotAction(
    slotId: number,
    action: 'save' | 'restore' | 'erase',
    body?: Record<string, unknown>
  ): Promise<SlotActionResult> {
    const url = `${this.baseUrl}/slots/${slotId}?action=${action}`;
    const res = await this.requestWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new SlotSnapshotError(
        `POST /slots/${slotId}?action=${action} failed: ${res.status}`,
        res.status,
        text
      );
    }
    try {
      return (await res.json()) as SlotActionResult;
    } catch {
      return {};
    }
  }

  private async requestWithTimeout(
    url: string,
    init: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
