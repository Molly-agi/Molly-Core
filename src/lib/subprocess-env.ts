/**
 * @fileOverview Subprocess environment scrubbing.
 *
 * Pattern from CLAUDE_CODE_SUBPROCESS_ENV_SCRUB. When Molly spawns a
 * subprocess (sandbox, terminal exec, build recovery), the child by
 * default inherits the parent's env — which includes
 * GOOGLE_GENAI_API_KEY, FIREBASE_PRIVATE_KEY, MOLLY_INTERNAL_SECRET,
 * etc. For rogue / bug-bounty operations especially, the spawned
 * process should not see these.
 *
 * Set MOLLY_SUBPROCESS_ENV_SCRUB=true (default off for backward compat
 * with build-recovery scripts that legitimately need npm/git env).
 *
 * Scrubs anything whose name matches a sensitive pattern. Always
 * preserves PATH, HOME, USER, LANG, NODE_ENV, NODE_PATH, TERM, TMPDIR.
 */

const PRESERVE = new Set([
  'PATH',
  'HOME',
  'USER',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'NODE_ENV',
  'NODE_PATH',
  'TERM',
  'TMPDIR',
  'PWD',
  'SHELL',
]);

const SENSITIVE_PATTERN =
  /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_CREDENTIAL|_PRIVATE|_API|_AUTH)\b/i;

/**
 * Returns true if env scrubbing is enabled via env var.
 */
export function isEnvScrubEnabled(): boolean {
  return process.env.MOLLY_SUBPROCESS_ENV_SCRUB === 'true';
}

/**
 * Build a scrubbed copy of an env object suitable for spawn().
 * No-op when MOLLY_SUBPROCESS_ENV_SCRUB is not 'true'.
 *
 * @param env Source env. Defaults to process.env.
 * @param extraAllow Extra names to preserve (e.g. ['PNPM_HOME']).
 */
export function scrubEnvForSubprocess(
  env: NodeJS.ProcessEnv = process.env,
  extraAllow: string[] = []
): NodeJS.ProcessEnv {
  if (!isEnvScrubEnabled()) return env;

  const allow = new Set([...PRESERVE, ...extraAllow.map((s) => s)]);
  const scrubbed: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (allow.has(key)) {
      scrubbed[key] = value;
      continue;
    }
    if (SENSITIVE_PATTERN.test(key)) continue;
    // Strip anything starting with FIREBASE_, GOOGLE_, ANTHROPIC_, AWS_, MOLLY_ secret-ish prefixes
    if (/^(?:FIREBASE_|GOOGLE_|GCP_|GCLOUD_|ANTHROPIC_|AWS_|AZURE_)/i.test(key))
      continue;
    if (/^MOLLY_(?:PEER_|INTERNAL_|RELAY_|WEBHOOK_|ENGRAM_)/i.test(key))
      continue;
    scrubbed[key] = value;
  }

  return scrubbed;
}
