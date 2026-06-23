/**
 * @fileOverview Item 4 follow-up — lock the production crystal wire.
 *
 * #257 wired buildCrystalsInjection into the composer (locked by
 * crystals-prompt-injection.contract.test.ts), but the composer only fires
 * crystal injection when the caller passes `crystalUserId` in the InjectionContext.
 * The production caller — `conversational-chat.ts` — threads `recallQuery`
 * but does NOT thread `crystalUserId`. Result: crystals load in the contract
 * test, never in a real conversation.
 *
 * This test is the regression guard for that wire. It reads the
 * `conversational-chat.ts` source and asserts the InjectionContext literal
 * passed to `composeSystemPrompt` includes `crystalUserId`. If a future
 * refactor drops the wire, this goes red before anyone notices in prod.
 *
 * Sibling locks:
 *   - crystals-prompt-injection.contract.test.ts (composer-side wire)
 *   - recall-prompt-injection.contract.test.ts   (engram-side wire)
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CHAT_PATH = resolve(__dirname, '..', 'conversational-chat.ts');

describe('Item 4 follow-up — conversational-chat threads crystalUserId to composeSystemPrompt', () => {
  const source = readFileSync(CHAT_PATH, 'utf8');

  it('contains a crystalUserId field in the InjectionContext literal', () => {
    // The InjectionContext is the second arg to composeSystemPrompt and is
    // the only object literal in this file that carries `recallQuery`.
    // crystalUserId must live alongside recallQuery — same context, same call.
    expect(source).toMatch(/crystalUserId\s*:/);
  });

  it('threads userId into crystalUserId (not a hardcoded value)', () => {
    // The wire must pass the live userId, not a placeholder. Hardcoded
    // values (e.g. crystalUserId: 'eric') would cause every conversation
    // to load the same identity crystals regardless of speaker.
    const match = source.match(/crystalUserId\s*:\s*([^,\n}]+)/);
    expect(match).not.toBeNull();
    const value = match![1].trim();
    // Accept `userId`, `userId ?? 'something'`, or `userId || 'something'`.
    expect(value).toMatch(/^userId(\s*(\?\?|\|\|).*)?$/);
  });

  it('places crystalUserId adjacent to recallQuery (same InjectionContext literal)', () => {
    // Defensive: if a future refactor moves crystalUserId to a different
    // call site or scope, this catches it. Both lines must appear within
    // a small window of each other to count as same-context.
    const recallIdx = source.search(/recallQuery\s*:/);
    const crystalIdx = source.search(/crystalUserId\s*:/);
    expect(recallIdx).toBeGreaterThan(-1);
    expect(crystalIdx).toBeGreaterThan(-1);
    expect(Math.abs(recallIdx - crystalIdx)).toBeLessThan(400);
  });
});
