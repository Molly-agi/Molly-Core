/**
 * /api/agency/registry
 * ------------------------------------------------------------------
 * Thin Next.js App Router wrapper. All logic lives in registry-api.ts
 * (unit-tested); this only parses the Request, pulls the admin token
 * header, and shapes the Response.
 *
 *   GET  /api/agency/registry           → snapshot + governor + full history
 *   GET  /api/agency/registry?key=...    → history filtered to one key
 *   POST /api/agency/registry            → { action:'propose'|'override', ... }
 *
 * The override action requires header  x-molly-admin-token  matching
 * process.env.MOLLY_ADMIN_TOKEN. Proposals do not.
 */

import { getAgencyRuntime } from '@/ai/agency/agency-runtime';
import { readRegistry, writeRegistry } from '@/ai/agency/registry-api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') ?? undefined;
  const { status, body } = readRegistry(getAgencyRuntime(), key);
  return Response.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const adminToken = req.headers.get('x-molly-admin-token') ?? undefined;
  const { status, body } = writeRegistry(
    getAgencyRuntime(),
    parsed,
    adminToken,
    process.env.MOLLY_ADMIN_TOKEN,
  );
  return Response.json(body, { status });
}
