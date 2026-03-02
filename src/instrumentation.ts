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
}
