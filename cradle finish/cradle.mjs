/**
 * AI Cradle — core engine
 *
 * A cradle is a markdown file that IS an agent's firmware. It has a protected
 * identity core (who the agent is) and a dynamic state block (what's happening
 * right now). The agent doesn't "remember" — every session it is RECONSTITUTED
 * from this file, which is injected as its system prompt.
 *
 *   thaw()  → read the cradle, return an assembled system prompt (model-agnostic)
 *   freeze()→ rewrite ONLY the dynamic state block, preserving everything else
 *             byte-for-byte (the protected-core invariant)
 *
 * Model-agnostic by design: thaw() returns a plain string that works with any
 * LLM. Provider-specific shaping lives in adapters.mjs and is optional.
 *
 * Pure Node. No dependencies.
 */

import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Section markers. Everything OUTSIDE the STATE markers is preserved on freeze.
// IDENTITY and REFERENCE markers are optional — used for structured parsing and
// clean thaw ordering. Only the STATE block is ever rewritten.
const M = {
  identityStart:  '<!-- CRADLE:IDENTITY:START -->',
  identityEnd:    '<!-- CRADLE:IDENTITY:END -->',
  stateStart:     '<!-- CRADLE:STATE:START -->',
  stateEnd:       '<!-- CRADLE:STATE:END -->',
  referenceStart: '<!-- CRADLE:REFERENCE:START -->',
  referenceEnd:   '<!-- CRADLE:REFERENCE:END -->',
};

const ALL_MARKERS = Object.values(M);

function stripMarkers(text) {
  // Remove all HTML comments — both the structural CRADLE markers and any
  // author-facing notes. Comments are non-content; the model shouldn't see them.
  const out = text.replace(/<!--[\s\S]*?-->/g, '');
  // collapse the blank lines left behind
  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function sliceBetween(text, start, end) {
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s === -1 || e === -1 || e < s) return null;
  return text.slice(s + start.length, e).trim();
}

/**
 * Default renderer: turn a working-state object into the markdown that goes
 * inside the STATE block. Override via freeze(state, { render }).
 * Known fields are rendered in a stable order; any extra fields are appended.
 */
export function renderState(state = {}) {
  const known = ['session', 'status', 'updated', 'topic', 'lastAction', 'pending', 'notes'];
  const updated = state.updated || new Date().toISOString();
  const lines = [];

  lines.push('## Current State');
  lines.push('');
  const meta = [
    state.session != null ? `**Session:** ${state.session}` : null,
    state.status != null ? `**Status:** ${state.status}` : null,
    `**Updated:** ${updated}`,
  ].filter(Boolean);
  lines.push(meta.join('  |  '));
  lines.push('');

  if (state.topic != null)      lines.push(`**What's happening:** ${state.topic}`, '');
  if (state.lastAction != null) lines.push(`**Last action:** ${state.lastAction}`, '');

  if (Array.isArray(state.pending)) {
    lines.push('**Pending:**');
    lines.push(state.pending.length
      ? state.pending.map((p) => `- ${p}`).join('\n')
      : '- (nothing pending)');
    lines.push('');
  }

  if (Array.isArray(state.notes) && state.notes.length) {
    lines.push('**Notes:**');
    lines.push(state.notes.map((n) => `- ${n}`).join('\n'));
    lines.push('');
  }

  // Any extra/custom fields, rendered generically so nothing is silently lost.
  const extra = Object.keys(state).filter((k) => !known.includes(k));
  for (const k of extra) {
    const v = state[k];
    lines.push(`**${k}:** ${typeof v === 'object' ? JSON.stringify(v) : v}`, '');
  }

  return lines.join('\n').trim();
}

export class Cradle {
  /** @param {{ path?: string, text?: string }} opts */
  constructor({ path, text } = {}) {
    if (!path && text == null) throw new Error('Cradle: provide { path } or { text }');
    this.path = path || null;
    this._text = text != null ? text : null;
  }

  /** Raw cradle file contents. */
  read() {
    if (this._text != null) return this._text;
    if (!existsSync(this.path)) throw new Error(`Cradle file not found: ${this.path}`);
    return readFileSync(this.path, 'utf8');
  }

  /** Structured view of the cradle: identity / state / reference / raw. */
  parse() {
    const raw = this.read();
    const identity = sliceBetween(raw, M.identityStart, M.identityEnd);
    const state = sliceBetween(raw, M.stateStart, M.stateEnd);
    const reference = sliceBetween(raw, M.referenceStart, M.referenceEnd);
    return {
      identity: identity ?? null,
      state: state ?? null,
      reference: reference ?? null,
      hasStateBlock: state !== null,
      raw,
    };
  }

  /**
   * THAW — reconstitute the agent. Returns the assembled system prompt.
   * The whole cradle file IS the prompt; marker comments are stripped by
   * default for a clean result. Model-agnostic: this is a plain string.
   * @param {{ keepMarkers?: boolean }} [opts]
   */
  thaw({ keepMarkers = false } = {}) {
    const raw = this.read();
    return keepMarkers ? raw : stripMarkers(raw);
  }

  /**
   * THAW for a specific provider — thin formatting around thaw().
   * See adapters.mjs. Kept here as a convenience.
   */
  thawFor(provider, opts) {
    // lazy import to keep core dependency-free if adapters unused
    // (synchronous require-style via dynamic import is avoided; adapters is pure)
    throw new Error('thawFor lives in adapters.mjs — import { formatFor } from "./adapters.mjs"');
  }

  /**
   * FREEZE — rewrite ONLY the dynamic state block. Everything outside the
   * STATE markers (the protected identity core, the reference) is preserved
   * byte-for-byte. If no STATE block exists yet, one is appended (self-heals).
   * Writes atomically (temp + rename) when backed by a file.
   *
   * @param {object} state  working-state object (see renderState)
   * @param {{ render?: (s:object)=>string, write?: boolean }} [opts]
   * @returns {string} the new cradle text
   */
  freeze(state = {}, { render = renderState, write = true } = {}) {
    const raw = this.read();
    const body = render(state).trim();
    const block = `${M.stateStart}\n${body}\n${M.stateEnd}`;

    let next;
    const s = raw.indexOf(M.stateStart);
    const e = raw.indexOf(M.stateEnd);

    if (s !== -1 && e !== -1 && e > s) {
      // Replace between markers, preserving everything before start and from end.
      const before = raw.slice(0, s);
      const after = raw.slice(e + M.stateEnd.length);
      next = before + block + after;
    } else {
      // No state block — append one, preserving all existing content.
      next = raw.replace(/\s*$/, '') + `\n\n${block}\n`;
    }

    this._text = next;
    if (write && this.path) {
      const dir = dirname(this.path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const tmp = this.path + '.tmp';
      writeFileSync(tmp, next);
      renameSync(tmp, this.path);
    }
    return next;
  }
}

export { M as MARKERS, stripMarkers };
export default Cradle;
