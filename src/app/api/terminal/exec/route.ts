/**
 * @fileOverview Polyglot Execution API — Molly's Hands via HTTP
 *
 * POST /api/terminal/exec — Execute code in any language
 * GET  /api/terminal/exec — Get polyglot runtime state
 *
 * This is the server-side API for Molly's polyglot runtime.
 * Supports bash (default), Python, Node.js, Ruby, TypeScript,
 * Go, PHP, Perl, C, C++, and Rust.
 *
 * The language parameter routes through the PolyglotRuntime
 * which manages persistent REPLs and compiled execution.
 */

import { NextResponse } from 'next/server';
import {
  getPolyglotRuntime,
  getMollyShell,
  type SupportedLanguage,
} from '@/ai/terminal';
import type { ShellCommand } from '@/ai/terminal';

export const dynamic = 'force-dynamic';

/**
 * POST /api/terminal/exec
 *
 * Execute code in any supported language.
 *
 * Body: {
 *   command: string,
 *   language?: SupportedLanguage (default: 'bash'),
 *   initiator?: string,
 *   taskId?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { command, language, initiator, taskId } = body;

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid command' },
        { status: 400 }
      );
    }

    const lang = (language || 'bash') as SupportedLanguage;

    // For bash, use the original MollyShell path
    // (backward compatible — existing callers work unchanged)
    if (lang === 'bash' || lang === ('shell' as string)) {
      const shell = getMollyShell();

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
        language: 'bash',
        mode: 'repl',
      });
    }

    // For all other languages, route through polyglot runtime
    const runtime = getPolyglotRuntime();
    const result = await runtime.execute(command, lang);

    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      blocked: result.blocked,
      language: result.language,
      mode: result.mode,
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
 * Returns polyglot runtime state: available languages,
 * active REPLs, shell state, and recent history.
 */
export async function GET() {
  const shell = getMollyShell();
  const shellState = shell.getState();
  const history = shell.getHistory(10);
  const runtime = getPolyglotRuntime();
  const polyglotState = runtime.getState();

  return NextResponse.json({
    state: shellState,
    polyglot: polyglotState,
    history: history.map((h) => ({
      command: h.command.command,
      initiator: h.command.initiator,
      exitCode: h.result.exitCode,
      timestamp: h.command.timestamp,
      blocked: h.result.blocked,
    })),
  });
}
