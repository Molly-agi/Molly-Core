/**
 * @fileOverview Admin Shell HTTP Endpoint — D.8
 *
 * Auth is handled by the global middleware (x-admin-password).
 * This endpoint executes authenticated admin commands.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { AdminShell } from '@/ai/agency/core/admin-shell';

interface ErrorResponse {
  ok: false;
  error: string;
}

interface SuccessResponse {
  ok: true;
  data: {
    success: boolean;
    result: string;
    executedAt: string;
  };
}

type ApiResponse = SuccessResponse | ErrorResponse;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
): Promise<void> {
  // Only allow POST
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    // Extract command from body
    const { command } = req.body;
    if (typeof command !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing or invalid command' });
      return;
    }

    // Middleware has already authenticated via x-admin-password.
    // Pass empty token (already verified at middleware layer).
    const result = await AdminShell.process('', command);

    res.status(result.success ? 200 : 403).json({
      ok: true,
      data: result,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ ok: false, error: message });
  }
}
