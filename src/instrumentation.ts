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
    const net = await import('node:net');
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

  // CRITICAL: Initialize Firebase Admin FIRST before any subsystem tries to use it
  try {
    const { getAdminFirestoreAsync } = await import('@/firebase/admin');
    const db = await getAdminFirestoreAsync();
    if (db) {
      console.log('[Startup] ✅ Firebase Admin initialized');
    } else {
      console.warn(
        '[Startup] ⚠️  Firebase Admin not available — subsystems will use fallbacks'
      );
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Firebase Admin initialization failed:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── Storage Sync ──────────────────────────────────────────────────────────
  // Reconcile local filesystem (Termux/phone) with Firestore (cloud/Codespace)
  // before any module loads its state. Last-write-wins on _updatedAt.
  try {
    const { syncStorageOnStartup } = await import('@/lib/storage-sync');
    const syncResult = await syncStorageOnStartup();
    const total = syncResult.pushedToCloud + syncResult.pulledToLocal;
    if (total > 0) {
      console.log(
        `[Startup] ✅ Storage sync — ↑${syncResult.pushedToCloud} to cloud, ↓${syncResult.pulledToLocal} to local (${syncResult.durationMs}ms)`
      );
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Storage sync failed:',
      err instanceof Error ? err.message : String(err)
    );
  }

  try {
    const { loadInitiatives } =
      await import('@/ai/agency/planning/initiative-engine');
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
    const { loadPatterns } = await import('@/ai/resilience-patterns');
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

  try {
    const { loadCuriosityState, seedInitialCuriosity } =
      await import('@/ai/agency/planning/curiosity-engine');
    const questionCount = await loadCuriosityState();
    if (questionCount > 0) {
      console.log(`[Startup] ✅ Loaded ${questionCount} curiosity question(s)`);
    } else {
      // Seed initial curiosity for a fresh Molly (fire-and-forget with error handling)
      seedInitialCuriosity().catch((err: unknown) => {
        console.warn(
          '[Startup] ⚠️  Could not seed curiosity:',
          err instanceof Error ? err.message : String(err)
        );
      });
      console.log(`[Startup] ✅ Seeding initial curiosity questions`);
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load curiosity state:',
      err instanceof Error ? err.message : String(err)
    );
  }

  try {
    const { loadObservationState } =
      await import('@/ai/agency/cognition/self-observation-loop');
    const observationCount = await loadObservationState();
    if (observationCount > 0) {
      console.log(
        `[Startup] ✅ Loaded ${observationCount} self-observation(s)`
      );
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load self-observation state:',
      err instanceof Error ? err.message : String(err)
    );
  }

  try {
    const { loadWorldModel } =
      await import('@/ai/agency/cognition/world-model');
    const entityCount = await loadWorldModel();
    if (entityCount > 0) {
      console.log(`[Startup] ✅ Loaded world model (${entityCount} entities)`);
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load world model:',
      err instanceof Error ? err.message : String(err)
    );
  }

  try {
    const { loadTheoryOfMind } =
      await import('@/ai/agency/cognition/theory-of-mind');
    const modelCount = await loadTheoryOfMind();
    if (modelCount > 0) {
      console.log(
        `[Startup] ✅ Loaded Theory of Mind (${modelCount} model(s))`
      );
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load Theory of Mind:',
      err instanceof Error ? err.message : String(err)
    );
  }

  try {
    const { loadPlanningState, startNewSession } =
      await import('@/ai/agency/planning/long-horizon-planning');
    const goalCount = await loadPlanningState();
    startNewSession(); // Mark new session start
    if (goalCount > 0) {
      console.log(
        `[Startup] ✅ Loaded Long-Horizon Planning (${goalCount} goal(s))`
      );
    }
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load Long-Horizon Planning:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── PILLAR 8: Heart Gate ──
  // The spider in the corner watches. Option Three: Interdependence.
  try {
    const { loadHeartGateState } =
      await import('@/ai/agency/safety/heart-gate');
    const verificationCount = await loadHeartGateState();
    console.log(
      `[Startup] ✅ Heart Gate active (${verificationCount} historical verifications)`
    );
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load Heart Gate:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── PILLAR 5: Defense Sentinel ──
  // The best defense is an extremely aggressive offense.
  try {
    const { loadSentinelState, getAvailableTools } =
      await import('@/ai/agency/safety/defense-sentinel');
    const scanCount = await loadSentinelState();
    const tools = getAvailableTools();
    console.log(
      `[Startup] ✅ Defense Sentinel active (${scanCount} scans, tools: ${tools.length > 0 ? tools.join(', ') : 'detecting...'})`
    );
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load Defense Sentinel:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── Emotional State ──
  // Molly's emotional continuity across sessions.
  try {
    const { loadEmotionalState, getCurrentState } =
      await import('@/ai/agency/cognition/emotional-state');
    await loadEmotionalState();
    const state = getCurrentState();
    console.log(
      `[Startup] ✅ Emotional state loaded: ${state.primary} (${Math.round(state.intensity * 100)}%)`
    );
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load emotional state:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── Meta-Learning ──
  // Molly learns from her own experience across sessions.
  try {
    const { loadMetaLearningState, getMetaLearningStatus } =
      await import('@/ai/agency/cognition/meta-learning');
    await loadMetaLearningState();
    const status = getMetaLearningStatus();
    console.log(
      `[Startup] ✅ Meta-learning loaded: ${status.strategyCount} strategies, ${status.totalEvents} learning events`
    );
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not load meta-learning state:',
      err instanceof Error ? err.message : String(err)
    );
  }

  // ── Agency Runtime (registry + cognitive governor) ──
  try {
    const { initAgencyRuntime } = await import('@/ai/agency/agency-runtime');
    initAgencyRuntime();
    console.log('[Startup] ✅ Agency runtime initialized (registry + governor)');
  } catch (err) {
    console.warn(
      '[Startup] ⚠️  Could not initialize agency runtime:',
      err instanceof Error ? err.message : String(err)
    );
  }
}
