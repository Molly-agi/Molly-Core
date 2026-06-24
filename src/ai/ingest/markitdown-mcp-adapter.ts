/**
 * @fileOverview Item 19 — MarkItDown MCP adapter
 *
 * Thin wrapper around the vendored Python `markitdown_mcp_server` (stdio MCP).
 * One spawn per call (KISS): PDF conversion dominates wall time, so pooling
 * the connection would be premature optimization.
 *
 * The vendored server exposes a single prompt:
 *   - `md` (arg: `file_path`) → returns a single user message whose text is
 *     `"Here is the converted document in markdown format:\n<title or ''>\n<content>"`.
 *     We strip that preamble before returning the content to callers.
 *
 * Errors throw — the watcher catches and quarantines the file. The adapter
 * NEVER swallows; it only owns its own lifecycle (timeout + disconnect).
 */

import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio';
import { MollyLogger } from '@/ai/logger';

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_CMD = 'uv --directory markitdown_mcp_server run markitdown-mcp';

const CLIENT_NAME = 'molly-markitdown-adapter';
const CLIENT_VERSION = '1.0.0';

export interface ConvertOptions {
  /** Per-call timeout in ms. Defaults to MOLLY_MARKITDOWN_TIMEOUT_MS or 120s. */
  timeoutMs?: number;
  /** Command line for the MCP server. Defaults to MOLLY_MARKITDOWN_CMD or the vendored uv invocation. */
  cmd?: string;
}

function parseCmd(cmdLine: string): { command: string; args: string[] } {
  const parts = cmdLine.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error('markitdown-mcp-adapter: empty command line');
  }
  return { command: parts[0]!, args: parts.slice(1) };
}

/**
 * Strip the deterministic preamble emitted by markitdown_mcp_server's `md`
 * prompt (server.py:78):
 *   `Here is the converted document in markdown format:\n<title or ''>\n<content>`
 *
 * Handles both title and empty-title cases by matching the literal first line
 * + any non-newline title line + a trailing newline.
 */
function stripPreamble(raw: string): string {
  const re = /^Here is the converted document in markdown format:\n[^\n]*\n/;
  return raw.replace(re, '');
}

function getTimeoutMs(opts?: ConvertOptions): number {
  if (opts?.timeoutMs != null) return opts.timeoutMs;
  const env = process.env.MOLLY_MARKITDOWN_TIMEOUT_MS;
  if (env) {
    const n = Number.parseInt(env, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_TIMEOUT_MS;
}

function getCmd(opts?: ConvertOptions): string {
  return opts?.cmd ?? process.env.MOLLY_MARKITDOWN_CMD ?? DEFAULT_CMD;
}

/**
 * Convert a single file to markdown via the vendored markitdown MCP server.
 *
 * Per-call connect/disconnect. Throws on timeout, spawn failure, or MCP
 * protocol error. Caller catches and quarantines.
 */
export async function convertFileToMarkdown(
  absPath: string,
  opts?: ConvertOptions
): Promise<string> {
  const timeoutMs = getTimeoutMs(opts);
  const { command, args } = parseCmd(getCmd(opts));

  const transport = new StdioClientTransport({
    command,
    args,
    env: process.env as Record<string, string>,
    stderr: 'pipe',
  });
  const client = new Client(
    { name: CLIENT_NAME, version: CLIENT_VERSION },
    { capabilities: {} }
  );

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    await client.connect(transport);

    const promptPromise = client.getPrompt({
      name: 'md',
      arguments: { file_path: absPath },
    });

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `markitdown-mcp-adapter: timed out after ${timeoutMs}ms converting ${absPath}`
          )
        );
      }, timeoutMs);
    });

    const result = await Promise.race([promptPromise, timeoutPromise]);

    const first = result.messages?.[0];
    const content = first?.content as
      | { type?: string; text?: string }
      | undefined;
    if (
      !content ||
      content.type !== 'text' ||
      typeof content.text !== 'string'
    ) {
      throw new Error(
        'markitdown-mcp-adapter: unexpected getPrompt result shape (missing text content)'
      );
    }

    return stripPreamble(content.text);
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await client.close();
    } catch (err) {
      MollyLogger.warn(
        'markitdown-mcp-adapter: client.close() failed',
        'markitdown-mcp-adapter',
        { absPath },
        err
      );
    }
  }
}
