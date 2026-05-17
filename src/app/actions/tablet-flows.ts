'use server';

/**
 * Tablet and external service flows for Molly
 * Includes sandbox coding, tablet control
 * Works in both server (Codespace) and edge (tablet) environments
 */

// ============================================
// SANDBOX — Safe Coding Practice Environment
// ============================================

export async function runSandboxAction(input: {
  action: 'execute' | 'save' | 'read' | 'list' | 'delete' | 'practice';
  code?: string;
  language?: 'javascript' | 'typescript' | 'python' | 'bash';
  filename?: string;
  challenge?: string;
}) {
  const { sandboxCoding } = await import('@/ai/flows/sandbox-coding');
  return await sandboxCoding(input);
}

// ============================================
// TABLET CONTROL
// ============================================

export async function sendTabletCommand(input: {
  type: string;
  payload?: Record<string, unknown>;
}) {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:9002';
  const url = `${baseUrl}/api/tablet/commands`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: input.type, payload: input.payload || {} }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(`Tablet command failed: ${err.error || res.status}`);
  }

  return await res.json();
}

export async function getTabletStatus() {
  const baseUrl =
    process.env.NEXTAUTH_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:9002';
  const url = `${baseUrl}/api/tablet/commands?all=true`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to get tablet status');
  return await res.json();
}
