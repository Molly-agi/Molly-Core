/**
 * Registry Command Console — engine
 * ------------------------------------------------------------------
 * A text command interface over the parameter registry, for operators
 * who'd rather type than drag a slider. It routes through the exact
 * same propose / override / resolve paths the panel uses, so the two
 * surfaces stay perfectly consistent and share one audit trail.
 *
 * Commands:
 *   help                                 list commands
 *   ls | snapshot                        list all params with values
 *   get <key>                            current value + owner + bounds
 *   desc <key>                           full description + metadata
 *   propose <key> <value> [reason...]    file a proposal (owner decides)
 *   override <key> <value> [reason...]   operator override (needs token)
 *   resolve <key>                        run the owner's proposal policy*
 *   pending <key>                        list queued proposals for a key
 *   history [key]                        recent change log
 *   gov                                  governor live snapshot
 *
 *   *resolve is owner-scoped: only meaningful for keys whose owner has a
 *    registered resolver (e.g. the governor). Provided via a resolver map
 *    so the console never fakes an owner decision it isn't entitled to make.
 *
 * This engine is pure and synchronous and fully unit-tested. The route
 * and the React terminal are thin shells over execConsole().
 */

import type { AgencyRuntime } from './agency-runtime';

export interface ConsoleContext {
  /** True if the caller presented a valid admin token (gates `override`). */
  authed: boolean;
  /** Operator/session id recorded on overrides. */
  operator: string;
  /** Optional owner-resolvers: ownerId -> fn that drains its proposals. */
  resolvers?: Record<string, () => void>;
}

export interface ConsoleLine {
  stream: 'out' | 'err';
  text: string;
}

export interface ConsoleResult {
  lines: ConsoleLine[];
}

function out(text: string): ConsoleLine {
  return { stream: 'out', text };
}
function err(text: string): ConsoleLine {
  return { stream: 'err', text };
}

const HELP = [
  'commands:',
  '  ls | snapshot              list all parameters',
  '  get <key>                  value, owner, bounds',
  '  desc <key>                 full metadata + description',
  '  propose <key> <val> [why]  file a proposal (owner decides)',
  '  override <key> <val> [why] operator override (requires auth)',
  '  pending <key>              queued proposals for a key',
  '  resolve <key>              run owner policy on queued proposals',
  '  history [key]              recent change log',
  '  gov                        governor live snapshot',
  '  help                       this list',
].join('\n');

/** Coerce a raw token to number if the parameter is numeric, else keep string. */
function coerceValue(rt: AgencyRuntime, key: string, raw: string): number | string {
  try {
    const d = rt.registry.describe(key);
    const c = d.ui?.control;
    if (c === 'int') return parseInt(raw, 10);
    if (c === 'slider' || c === 'number') return Number(raw);
  } catch {
    /* unknown key handled by caller */
  }
  // default: numeric if it parses cleanly, else string
  const n = Number(raw);
  return raw.trim() !== '' && !Number.isNaN(n) ? n : raw;
}

export function execConsole(rt: AgencyRuntime, input: string, ctx: ConsoleContext): ConsoleResult {
  const trimmed = input.trim();
  if (!trimmed) return { lines: [] };
  const [cmd, ...rest] = trimmed.split(/\s+/);
  const lines: ConsoleLine[] = [];

  const requireKey = (k?: string): string | null => {
    if (!k) {
      lines.push(err(`${cmd}: missing <key>`));
      return null;
    }
    try {
      rt.registry.describe(k);
      return k;
    } catch {
      lines.push(err(`unknown parameter "${k}"`));
      return null;
    }
  };

  switch (cmd) {
    case 'help':
      lines.push(out(HELP));
      break;

    case 'ls':
    case 'snapshot': {
      for (const p of rt.registry.describeAll()) {
        const b = p.ui?.min !== undefined ? ` [${p.ui.min}..${p.ui.max}]` : '';
        lines.push(out(`${p.key.padEnd(34)} = ${String(p.value).padEnd(6)} (${p.owner})${b}`));
      }
      break;
    }

    case 'get': {
      const k = requireKey(rest[0]);
      if (!k) break;
      const d = rt.registry.describe(k);
      const b = d.ui?.min !== undefined ? `  bounds [${d.ui.min}..${d.ui.max}]${d.ui.unit ? ' ' + d.ui.unit : ''}` : '';
      lines.push(out(`${d.key} = ${String(d.value)}  owner:${d.owner}  v${d.version}${b}`));
      break;
    }

    case 'desc': {
      const k = requireKey(rest[0]);
      if (!k) break;
      const d = rt.registry.describe(k);
      lines.push(out(`${d.key}`));
      if (d.description) lines.push(out(`  ${d.description}`));
      lines.push(out(`  value=${String(d.value)} owner=${d.owner} lastWriter=${d.lastWriter} v${d.version}`));
      if (d.ui) lines.push(out(`  ui=${JSON.stringify(d.ui)}`));
      break;
    }

    case 'propose': {
      const k = requireKey(rest[0]);
      if (!k) break;
      if (rest[1] === undefined) {
        lines.push(err('propose: missing <value>'));
        break;
      }
      const value = coerceValue(rt, k, rest[1]);
      const reason = rest.slice(2).join(' ') || 'via console';
      const p = rt.registry.propose(k, value, `console:${ctx.operator}`, reason);
      lines.push(out(`proposed ${k}=${String(value)} → queued as ${p.id} (owner ${rt.registry.ownerOf(k)} decides)`));
      break;
    }

    case 'override': {
      const k = requireKey(rest[0]);
      if (!k) break;
      if (!ctx.authed) {
        lines.push(err('override: not authorized (no valid admin token)'));
        break;
      }
      if (rest[1] === undefined) {
        lines.push(err('override: missing <value>'));
        break;
      }
      const value = coerceValue(rt, k, rest[1]);
      const reason = rest.slice(2).join(' ') || 'console override';
      const r = rt.registry.operatorOverride(k, value, ctx.operator, reason);
      if (r.ok) lines.push(out(`OVERRIDE ${k}=${String(value)} applied (tagged operator-override)`));
      else lines.push(err(`override rejected: ${r.error}`));
      break;
    }

    case 'pending': {
      const k = requireKey(rest[0]);
      if (!k) break;
      const q = rt.registry.pendingProposals(k);
      if (!q.length) lines.push(out(`no pending proposals for ${k}`));
      for (const p of q) lines.push(out(`  ${p.id}  ${String(p.value)}  by ${p.by}: ${p.reason}`));
      break;
    }

    case 'resolve': {
      const k = requireKey(rest[0]);
      if (!k) break;
      const owner = rt.registry.ownerOf(k);
      const resolver = ctx.resolvers?.[owner];
      if (!resolver) {
        lines.push(err(`resolve: no resolver registered for owner "${owner}" — cannot decide on its behalf`));
        break;
      }
      const before = rt.registry.pendingProposals(k).length;
      resolver();
      lines.push(out(`ran ${owner} resolver — ${before} proposal(s) processed; value now ${String(rt.registry.get(k))}`));
      break;
    }

    case 'history': {
      const k = rest[0];
      if (k) {
        const valid = requireKey(k);
        if (!valid) break;
      }
      const h = rt.registry.getHistory(k).slice(-15);
      for (const c of h) {
        lines.push(out(`  ${new Date(c.at).toISOString().slice(11, 19)} ${c.kind.padEnd(18)} ${c.key.replace('governor.', '')} ${fmt(c.from)}→${fmt(c.to)} (${c.by})`));
      }
      if (!h.length) lines.push(out('  (no history)'));
      break;
    }

    case 'gov': {
      const g = rt.governor.snapshot();
      lines.push(out(`flows ${g.active.flow}/${g.limits.flow}  tools ${g.active.tool}/${g.limits.tool}  agents ${g.active.agent}/${g.limits.agent}`));
      for (const w of g.inFlight) lines.push(out(`  ${w.id}  ${w.type} (p${w.priority})`));
      break;
    }

    default:
      lines.push(err(`unknown command "${cmd}" — type 'help'`));
  }

  return { lines };
}

function fmt(v: unknown): string {
  if (v === undefined) return '∅';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}
