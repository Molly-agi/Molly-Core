/**
 * Registry Admin API — pure logic
 * ------------------------------------------------------------------
 * Framework-agnostic request handling for the admin window + terminals.
 * The Next.js route.ts files are thin wrappers that parse the Request,
 * pull the auth token, and call these. Keeping the logic here means it
 * is unit-testable without spinning up the server.
 *
 * Write paths:
 *   - "propose": anyone (any subsystem id) files a proposal. No auth
 *     needed beyond being on the panel; proposals can't change state by
 *     themselves, an owner still has to accept them.
 *   - "override": operator override. REQUIRES a valid admin token,
 *     because it bypasses ownership. Tagged 'operator-override' in audit.
 *
 * The admin token is read from env (MOLLY_ADMIN_TOKEN). If it's unset,
 * writes are refused outright — fail closed. An admin endpoint on a
 * forwarded Codespace port must not be open by default.
 */

import type { AgencyRuntime } from './agency-runtime';

export interface ApiResponse {
  status: number;
  body: unknown;
}

export interface WriteBody {
  action: 'propose' | 'override';
  key: string;
  value: unknown;
  /** subsystem id for propose; human/session id for override */
  actor: string;
  reason: string;
}

export function readRegistry(rt: AgencyRuntime, key?: string): ApiResponse {
  try {
    return {
      status: 200,
      body: {
        parameters: rt.registry.describeAll(),
        snapshot: rt.registry.snapshot(),
        governor: rt.governor.snapshot(),
        history: rt.registry.getHistory(key),
      },
    };
  } catch (e) {
    return { status: 500, body: { error: String(e) } };
  }
}

function isWriteBody(b: unknown): b is WriteBody {
  if (typeof b !== 'object' || b === null) return false;
  const x = b as Record<string, unknown>;
  return (
    (x.action === 'propose' || x.action === 'override') &&
    typeof x.key === 'string' &&
    typeof x.actor === 'string' &&
    typeof x.reason === 'string' &&
    'value' in x
  );
}

/**
 * @param adminToken  the token presented by the caller (e.g. from a header)
 * @param expectedToken  the configured server token (process.env.MOLLY_ADMIN_TOKEN)
 */
export function writeRegistry(
  rt: AgencyRuntime,
  body: unknown,
  adminToken: string | undefined,
  expectedToken: string | undefined,
): ApiResponse {
  if (!isWriteBody(body)) {
    return { status: 400, body: { error: 'malformed write body' } };
  }

  if (body.action === 'propose') {
    const p = rt.registry.propose(body.key, body.value, body.actor, body.reason);
    return { status: 202, body: { accepted: 'queued', proposalId: p.id } };
  }

  // action === 'override' — privileged. Fail closed.
  if (!expectedToken) {
    return { status: 503, body: { error: 'override disabled: MOLLY_ADMIN_TOKEN not configured' } };
  }
  if (!adminToken || adminToken !== expectedToken) {
    return { status: 401, body: { error: 'invalid or missing admin token' } };
  }
  const result = rt.registry.operatorOverride(body.key, body.value, body.actor, body.reason);
  if (!result.ok) {
    return { status: 422, body: { error: result.error } };
  }
  return { status: 200, body: { ok: true, key: body.key, value: body.value } };
}
