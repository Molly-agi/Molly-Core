/**
 * Item 14 follow-up — provenance.source threading through 3 production callers.
 *
 * The schema landed in #248. This suite is the contract that *writers* identify
 * themselves. Each call site below must stamp a meaningful `provenance.source`
 * so recall can answer "who said this?" — that is the whole point of item 14.
 *
 * Static-shape assertion (read + regex) instead of running each full pipeline.
 * Rationale: tool-executor and autonomous-cycle have enormous dependency
 * footprints (gates, hooks, circuit breakers, rate limiters, ToM, world model).
 * Mocking the entire upstream just to verify a single object property in a
 * remember() context arg would balloon scope past the 30–50 LoC cap Eli set.
 * The static check directly enforces the regression we care about: "someone
 * deleted the provenance line".
 *
 * Threading is verified at runtime by engram-provenance.test.ts in #248 —
 * once the call site passes `provenance.source = X`, remember() will stamp it.
 */
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

describe('Item 14 — provenance.source threading (3 production callers)', () => {
  it('bridge POST passes the bridge `from` field as provenance.source', () => {
    const src = read('src/app/api/bridge/route.ts');
    // Within the remember() call near the bridge-ingest block.
    expect(src).toMatch(/provenance:\s*\{\s*source:\s*from\s*\}/);
  });

  it('tool-executor stamps the tool name as provenance.source', () => {
    const src = read('src/ai/agency/core/tool-executor.ts');
    // tool:${tool} is a richer convention than bare 'system' — keeps the
    // audit trail tied to which tool produced the memory.
    expect(src).toMatch(/provenance:\s*\{\s*source:\s*`tool:\$\{tool\}`\s*\}/);
  });

  it('autonomous-cycle stamps `molly` as provenance.source', () => {
    const src = read('src/ai/agency/planning/autonomous-cycle.ts');
    expect(src).toMatch(/provenance:\s*\{\s*source:\s*['"]molly['"]\s*\}/);
  });
});
