/**
 * @fileOverview Item 19 — MarkItDown MCP adapter contract
 *
 * Locks the shape of `convertFileToMarkdown(absPath, opts)`:
 *   1. Strips the deterministic preamble emitted by markitdown_mcp_server
 *      (server.py:78 — `Here is the converted document in markdown format:\n<title>\n<content>`)
 *      for the non-empty-title case.
 *   2. Same strip works for the empty-title case (server emits `''` then `\n`).
 *   3. Rejects with a timeout error if the MCP `getPrompt` call exceeds `timeoutMs`.
 *
 * The adapter must never let an MCP failure crash the watcher; errors throw,
 * caller catches. We also assert `disconnect()` is invoked in the `finally`
 * leg so per-call connections do not leak processes.
 */

const clientConnect = jest.fn().mockResolvedValue(undefined);
const clientClose = jest.fn().mockResolvedValue(undefined);
const clientGetPrompt = jest.fn();

jest.mock('@modelcontextprotocol/sdk/client', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: clientConnect,
    close: clientClose,
    getPrompt: clientGetPrompt,
  })),
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    /* no-op stub; only constructor invocation is observed */
  })),
}));

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { convertFileToMarkdown } from '../markitdown-mcp-adapter';

describe('markitdown-mcp-adapter — convertFileToMarkdown contract', () => {
  beforeEach(() => {
    clientConnect.mockClear();
    clientClose.mockClear();
    clientGetPrompt.mockReset();
  });

  it('strips the preamble for the non-empty-title case', async () => {
    clientGetPrompt.mockResolvedValueOnce({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Here is the converted document in markdown format:\nMyTitle\n# Body content here',
          },
        },
      ],
    });

    const out = await convertFileToMarkdown('/tmp/fake.pdf');
    expect(out).toBe('# Body content here');
    expect(clientClose).toHaveBeenCalled();
  });

  it('strips the preamble for the empty-title case', async () => {
    clientGetPrompt.mockResolvedValueOnce({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Here is the converted document in markdown format:\n\n# Body content here',
          },
        },
      ],
    });

    const out = await convertFileToMarkdown('/tmp/fake.pdf');
    expect(out).toBe('# Body content here');
  });

  it('rejects with a timeout error when getPrompt exceeds timeoutMs', async () => {
    clientGetPrompt.mockImplementationOnce(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    );

    await expect(
      convertFileToMarkdown('/tmp/fake.pdf', { timeoutMs: 50 })
    ).rejects.toThrow(/timeout|timed out/i);

    // close() must still fire even on timeout (finally branch)
    expect(clientClose).toHaveBeenCalled();
  });
});
