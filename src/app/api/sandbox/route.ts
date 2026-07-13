/**
 * Sandbox API — Molly's safe coding playground
 *
 * POST /api/sandbox — Execute code, manage files
 *   body.action: 'execute' | 'writeFile' | 'readFile' | 'listFiles' | 'deleteFile' | 'info'
 *
 * All operations are confined to sandbox/molly-workspace/
 * Code execution has strict timeouts, memory limits, and safety checks.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  sandboxExecuteCode,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  sandboxDeleteFile,
  getSandboxInfo,
} from '@/ai/sandbox/sandbox-engine';
import { isInternalAuthorized, unauthorizedResponse } from '@/lib/api-auth';

export const dynamic = 'force-dynamic';

type SandboxAction =
  | 'execute'
  | 'writeFile'
  | 'readFile'
  | 'listFiles'
  | 'deleteFile'
  | 'info';

const VALID_ACTIONS = new Set<SandboxAction>([
  'execute',
  'writeFile',
  'readFile',
  'listFiles',
  'deleteFile',
  'info',
]);

export async function POST(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const { action } = body as { action: string };

    if (!action || !VALID_ACTIONS.has(action as SandboxAction)) {
      return NextResponse.json(
        {
          error: `Invalid action: "${action}". Valid actions: ${[...VALID_ACTIONS].join(', ')}`,
        },
        { status: 400 }
      );
    }

    switch (action as SandboxAction) {
      case 'execute': {
        const { code, language, timeoutMs } = body;
        if (!code || !language) {
          return NextResponse.json(
            { error: 'Missing required fields: code, language' },
            { status: 400 }
          );
        }
        const result = await sandboxExecuteCode(code, language, timeoutMs);
        return NextResponse.json(result);
      }

      case 'writeFile': {
        const { path: filePath, content } = body;
        if (!filePath || content === undefined) {
          return NextResponse.json(
            { error: 'Missing required fields: path, content' },
            { status: 400 }
          );
        }
        const result = await sandboxWriteFile(filePath, content);
        // Normalise: always include `size` so callers never see `undefined`
        return NextResponse.json({ ...result, size: result.size ?? 0 });
      }

      case 'readFile': {
        const { path: filePath } = body;
        if (!filePath) {
          return NextResponse.json(
            { error: 'Missing required field: path' },
            { status: 400 }
          );
        }
        const result = await sandboxReadFile(filePath);
        // Normalise: expose content as `output` so callers get a string, not
        // the whole result object (which would render as "[object Object]").
        if (!result.success) {
          return NextResponse.json(
            { success: false, error: result.error ?? 'Read failed' },
            { status: 500 }
          );
        }
        return NextResponse.json({
          success: true,
          output: result.content ?? '',
        });
      }

      case 'listFiles': {
        const files = await sandboxListFiles();
        return NextResponse.json({ files });
      }

      case 'deleteFile': {
        const { path: filePath } = body;
        if (!filePath) {
          return NextResponse.json(
            { error: 'Missing required field: path' },
            { status: 400 }
          );
        }
        const result = await sandboxDeleteFile(filePath);
        return NextResponse.json(result);
      }

      case 'info': {
        const info = await getSandboxInfo();
        return NextResponse.json(info);
      }
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown sandbox error',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  if (!isInternalAuthorized(request)) {
    return unauthorizedResponse();
  }

  const info = await getSandboxInfo();
  return NextResponse.json(info);
}
