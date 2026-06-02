/**
 * @fileOverview Persistent Session Token
 *
 * Stores a lightweight session token in localStorage so ANY new tab opening
 * to the same URL automatically reconnects to the last known daemon checkpoint
 * without requiring a page reload sequence.
 *
 * Token shape:
 *   { checkpointId, bridgeUrl, lastSeenAt, userId }
 *
 * Lifecycle:
 *   - Written: whenever a continuity_restore checkpoint arrives from the daemon
 *   - Read: on page load, before UI renders, to seed the bridge reconnect
 *   - Cleared: on explicit session purge only (never on tab close)
 */

const SESSION_TOKEN_KEY = 'molly_session_token';

export interface SessionToken {
  checkpointId: string | null;
  bridgeUrl: string;
  lastSeenAt: string;
  userId: string | null;
}

export function writeSessionToken(token: Partial<SessionToken>): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = readSessionToken();
    const next: SessionToken = {
      checkpointId: token.checkpointId ?? existing?.checkpointId ?? null,
      bridgeUrl:
        token.bridgeUrl ??
        existing?.bridgeUrl ??
        window.location.origin,
      lastSeenAt: new Date().toISOString(),
      userId: token.userId ?? existing?.userId ?? null,
    };
    localStorage.setItem(SESSION_TOKEN_KEY, JSON.stringify(next));
  } catch {
    // localStorage may be unavailable in some browser security modes
  }
}

export function readSessionToken(): SessionToken | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionToken;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns true if a session token exists that is recent enough to attempt
 * auto-reconnect (less than 4 hours old — inside Codespace idle window).
 */
export function hasRecentSessionToken(): boolean {
  const token = readSessionToken();
  if (!token) return false;
  try {
    const age = Date.now() - Date.parse(token.lastSeenAt);
    return age < 4 * 60 * 60 * 1000; // 4 hours
  } catch {
    return false;
  }
}
