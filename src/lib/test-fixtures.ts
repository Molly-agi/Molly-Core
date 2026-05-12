/**
 * @fileOverview Test fixture path resolver.
 *
 * Pattern from CLAUDE_CODE_TEST_FIXTURES_ROOT. Lets tests override the
 * fixture root without each test reimplementing the env-var read.
 */

import path from 'node:path';

const DEFAULT_ROOT = path.join(process.cwd(), 'tests', 'fixtures');

/**
 * Returns the root directory for test fixtures. Defaults to
 * `<cwd>/tests/fixtures`. Override via MOLLY_TEST_FIXTURES_ROOT.
 */
export function getTestFixturesRoot(): string {
  return process.env.MOLLY_TEST_FIXTURES_ROOT?.trim() || DEFAULT_ROOT;
}

/**
 * Resolves a fixture path relative to the fixtures root.
 *
 *   fixturePath('engrams/sample.json')
 *   // -> /workspaces/Molly-Core/tests/fixtures/engrams/sample.json
 */
export function fixturePath(...segments: string[]): string {
  return path.join(getTestFixturesRoot(), ...segments);
}
