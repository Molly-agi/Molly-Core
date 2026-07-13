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

  // ── Environment Validation (pure JS, no imports) ──────────────────────────

  const required: Array<{ key: string; hint: string }> = [
    {
      key: 'GOOGLE_GENAI_API_KEY',
      hint: 'Gemini API key — Molly cannot think without it.',
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
    {
      key: 'FIREBASE_PROJECT_ID',
      hint: 'Firebase project ID — Molly will fall back to local storage without it.',
    },
  ];

  let hasCriticalMissing = false;
  const missingOptional: string[] = [];

  for (const { key, hint } of required) {
    if (!process.env[key]) {
      console.error(`[Startup] ❌ MISSING REQUIRED: ${key} — ${hint}`);
      hasCriticalMissing = true;
    }
  }

  for (const { key, hint } of optional) {
    if (!process.env[key]) {
      missingOptional.push(`${key} (${hint})`);
    }
  }

  if (missingOptional.length > 0) {
    console.log(
      `[Startup] Optional config missing (${missingOptional.length}): ${missingOptional.join(', ')}`
    );
  }

  if (hasCriticalMissing) {
    console.error(
      '[Startup] One or more required environment variables are missing. ' +
        'Molly will encounter errors at runtime. Check .env.local.'
    );
  } else {
    console.log('[Startup] ✅ All required environment variables present.');
  }

  // ── Server-only subsystem loading ─────────────────────────────────────────
  // ALL dynamic imports that touch Node.js modules (firebase, genkit, MCP, etc.)
  // MUST be inside this guard. Webpack's DefinePlugin uses NEXT_RUNTIME as a
  // compile-time constant to dead-code-eliminate this entire branch for client
  // and edge builds. Without this guard, webpack follows the import tree into
  // node_modules that require fs/http/child_process and fails.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-server');
  }
}
