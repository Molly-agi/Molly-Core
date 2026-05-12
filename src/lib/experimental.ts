/**
 * @fileOverview Experimental feature gates.
 *
 * Single comma-list env var (MOLLY_EXPERIMENTAL) opts into risky or
 * incomplete features. Modeled after CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
 * etc., but consolidated so we don't sprawl one env var per feature.
 *
 * Usage:
 *   if (isExperimentalEnabled('multi-agent-fork')) { ... }
 *
 *   MOLLY_EXPERIMENTAL=multi-agent-fork,recursive-self-mod npm run dev
 */

const ALL = 'all';

function parseEnabled(): Set<string> {
  const raw = process.env.MOLLY_EXPERIMENTAL;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

let cached: Set<string> | null = null;

function getEnabled(): Set<string> {
  if (cached === null) cached = parseEnabled();
  return cached;
}

/**
 * Returns true if the named experimental feature is opted into via
 * MOLLY_EXPERIMENTAL. The literal value `all` enables every feature.
 */
export function isExperimentalEnabled(feature: string): boolean {
  const enabled = getEnabled();
  if (enabled.has(ALL)) return true;
  return enabled.has(feature.toLowerCase());
}

/** List every feature currently opted into. Used by diagnostics. */
export function listEnabledExperiments(): string[] {
  return Array.from(getEnabled()).sort();
}

/** Test-only — force a re-read of the env var. */
export function _resetExperimentalCache(): void {
  cached = null;
}
