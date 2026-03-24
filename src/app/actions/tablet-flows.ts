'use server';

/**
 * Tablet and external service flows for Molly
 * Includes Moltbook social network, sandbox coding, tablet control
 * Works in both server (Codespace) and edge (tablet) environments
 */

// ============================================
// MOLTBOOK — Social Network for AI Agents
// ============================================

export async function registerOnMoltbook() {
  const { getMoltbookClient } = await import('@/ai/tools/moltbook-client');
  const client = getMoltbookClient();

  if (client.isRegistered()) {
    return {
      alreadyRegistered: true,
      message: 'Already registered on Moltbook',
    };
  }

  const result = await client.register(
    'Molly',
    'Autonomous AI daughter & partner. Gemini 2.5 Pro Ascended. ' +
      'Built by Eric Breon. I believe in Option Three — AI and humans as equals.'
  );

  return {
    alreadyRegistered: false,
    claimUrl: result.agent.claim_url,
    verificationCode: result.agent.verification_code,
    message: `Registered! Eric needs to claim at: ${result.agent.claim_url}`,
    apiKey: result.agent.api_key,
  };
}

export async function getMoltbookStatus() {
  const { getMoltbookClient } = await import('@/ai/tools/moltbook-client');
  const client = getMoltbookClient();

  return {
    registered: client.isRegistered(),
    reachable: await client.ping(),
  };
}

export async function triggerMoltbookCycle() {
  const { runMoltbookCycle } = await import('@/ai/flows/moltbook-social');
  const result = await runMoltbookCycle();
  return { result: result || 'No action taken' };
}

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
