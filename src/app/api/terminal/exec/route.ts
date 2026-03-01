/**
 * @fileOverview Shell Execution API — Molly's Hands via HTTP
 *
 * POST /api/terminal/exec — Execute a command in Molly's shell
 * GET  /api/terminal/exec — Get shell state and recent history
 *
 * This is the server-side API for Molly's embedded terminal.
 * Unlike the old termux-bridge (browser → phone relay), this
 * executes on Molly's own machine — her codespace, her Linux.
 */

import { NextResponse } from 'next/server';
import { getMollyShell } from '@/ai/terminal';
import type { ShellCommand } from '@/ai/terminal';

export const dynamic = 'force-dynamic';

/**
 * POST /api/terminal/exec
 *
 * Execute a command in Molly's persistent shell.
 *
 * Body: { command: string, initiator?: string, taskId?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { command, initiator, taskId } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid command' },
        { status: 400 }
      );
    }

    const shell = getMollyShell();

    // Start shell if not running
    if (!shell.isAlive()) {
      shell.start();
      await new Promise((r) => setTimeout(r, 300));
    }

    const result = await shell.execute(
      command,
      (initiator as ShellCommand['initiator']) || 'user',
      taskId
    );

    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      blocked: result.blocked,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Execution failed',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/terminal/exec
 *
 * Returns shell state and recent command history.
 */
export async function GET() {
  const shell = getMollyShell();
  const state = shell.getState();
  const history = shell.getHistory(10);

  return NextResponse.json({
    state,
    history: history.map((h) => ({
      command: h.command.command,
      initiator: h.command.initiator,
      exitCode: h.result.exitCode,
      timestamp: h.command.timestamp,
      blocked: h.result.blocked,
    })),
  });
}
