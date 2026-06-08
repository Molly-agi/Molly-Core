/**
 * /api/agency/console
 * ------------------------------------------------------------------
 * Thin wrapper over the tested console engine. POST { input } and get
 * back { lines }. The admin token (header x-molly-admin-token) decides
 * whether `override` is permitted — same fail-closed rule as the panel.
 *
 * The governor's proposal resolver is wired in here so `resolve` can run
 * the owner's real policy rather than faking an owner decision.
 */

import { getAgencyRuntime } from '@/ai/agency/agency-runtime';
import { execConsole } from '@/ai/agency/console-engine';
import { GOVERNOR_ID } from '@/ai/agency/governor/cognitive-governor';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  let body: { input?: string; operator?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ lines: [{ stream: 'err', text: 'invalid JSON' }] }, { status: 400 });
  }
  if (typeof body.input !== 'string') {
    return Response.json({ lines: [{ stream: 'err', text: 'missing "input"' }] }, { status: 400 });
  }

  const rt = getAgencyRuntime();
  const presented = req.headers.get('x-molly-admin-token') ?? undefined;
  const expected = process.env.MOLLY_ADMIN_TOKEN;
  const authed = !!expected && presented === expected;

  const result = execConsole(rt, body.input, {
    authed,
    operator: body.operator || 'console',
    resolvers: {
      [GOVERNOR_ID]: () => rt.governor.drainProposals(),
    },
  });

  return Response.json(result, { status: 200 });
}
