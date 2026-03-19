/**
 * @fileOverview Startup environment validation
 *
 * Next.js calls `register()` once when the server starts.
 * We validate required env vars here so missing config produces
 * clear log messages instead of cryptic runtime errors.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only validate on the server (not edge runtime)
  if (process.env.NEXT_RUNTIME === 'edge') return;

  // Set aggressive socket timeouts to prevent CLOSE-WAIT buildup.
  // Eric's Android browser kills connections on every tab switch,
  // leaving orphaned sockets that pile up (93+ CLOSE-WAIT observed).
  // Node's defaults (no timeout) cause the server to hold dead sockets forever.
  // We find the active HTTP server by polling for it after startup.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const net = await import('net');
    const applyTimeouts = () => {
      // Find all TCP servers in this process
      // @ts-expect-error -- accessing internal Node.js API to find active servers
      const handles = process._getActiveHandles?.() as unknown[];
      if (!handles) return false;
      let found = false;
      for (const handle of handles) {
        if (handle instanceof net.Server) {
          const server = handle as net.Server & {
            keepAliveTimeout?: number;
            headersTimeout?: number;
            requestTimeout?: number;
            timeout?: number;
          };
          server.keepAliveTimeout = 30_000; // 30s — close idle keep-alive sockets
          server.headersTimeout = 35_000; // 35s — must be > keepAliveTimeout
          server.requestTimeout = 120_000; // 2min — max time for a single request
          server.timeout = 120_000; // 2min — overall socket inactivity
          found = true;
        }
      }
      return found;
    };

    // The HTTP server may not exist yet at register() time.
    // Poll briefly until it appears, then set timeouts.
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (applyTimeouts() || attempts > 20) {
        clearInterval(interval);
        if (attempts <= 20) {
          console.log(
            '[Startup] HTTP server timeouts configured (keepAlive=30s, request=120s)'
          );
        }
      }
    }, 500);
  }

  const required: Array<{ key: string; hint: string }> = [
    {
      key: 'GOOGLE_GENAI_API_KEY',
      hint: 'Gemini API key — Molly cannot think without it.',
    },
    {
      key: 'FIREBASE_SERVICE_ACCOUNT_JSON',
      hint: 'Firebase admin credentials — Molly cannot remember without it.',
    },
  ];

  const optional: Array<{ key: string; hint: string }> = [
    {
      key: 'HIDDEN_ADMIN_USERNAME',
      hint: 'Admin panel will be inaccessible without credentials.',
    },
    {
      key: 'HIDDEN_ADMIN_PASSWORD',
      hint: 'Admin panel will be inaccessible without credentials.',
    },
  ];

  let hasCriticalMissing = false;

  for (const { key, hint } of required) {
    if (!process.env[key]) {
      console.error(`[Startup] ❌ MISSING REQUIRED: ${key} — ${hint}`);
      hasCriticalMissing = true;
    }
  }

  for (const { key, hint } of optional) {
    if (!process.env[key]) {
      console.warn(`[Startup] ⚠️  Missing optional: ${key} — ${hint}`);
    }
  }

  if (hasCriticalMissing) {
    console.error(
      '[Startup] One or more required environment variables are missing. ' +
        'Molly will encounter errors at runtime. Check .env.local.'
    );
  } else {
    console.log('[Startup] ✅ All required environment variables present.');
  }

  // ── Load Persistent State ──────────────────────────────────────────────────
  // Load initiatives and learned patterns from storage so Molly remembers
  // her goals and failure patterns across restarts.

  try {
    const { loadInitiatives } = await import('@/ai/agency/initiative-engine');
    const initiativeCount = await loadInitiatives();
    if (initiativeCount > 0) {
      console.log(`[Startup] ✅ Loaded ${initiativeCount} initiative(s)`);
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load initiatives:',
      err instanceof Error ? err.message : String(err)
    );
  }

  try {
    const { loadPatterns } = await import('@/ai/resilience-core');
    const patternCount = await loadPatterns();
    if (patternCount > 0) {
      console.log(`[Startup] ✅ Loaded ${patternCount} learned pattern(s)`);
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load patterns:',
      err instanceof Error ? err.message : String(err)
    );
  }
}
