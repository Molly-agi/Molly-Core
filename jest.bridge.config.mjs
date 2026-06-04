/**
 * Jest configuration for W0.2 bridge hardening tests.
 *
 * These tests are pure-Node ESM (.mjs) files that spawn real bridge daemon
 * processes and make HTTP requests. They must NOT go through the Next.js
 * babel/jsdom pipeline — that pipeline injects CJS `exports` references
 * which crash ESM-only modules.
 *
 * Run with:
 *   NODE_OPTIONS=--experimental-vm-modules jest --config jest.bridge.config.mjs
 * Or:
 *   npm run test:bridge
 */

/** @type {import('jest').Config} */
export default {
  displayName: 'bridge',
  testEnvironment: 'node',
  // No transform — .mjs files run as native ESM via vm-modules
  transform: {},
  testMatch: ['<rootDir>/scripts/__tests__/bridge-*.test.mjs'],
  testPathIgnorePatterns: ['/node_modules/', 'bridge-test-helpers\\.mjs'],
  // Each bridge test spawns a daemon on a random port — give them room
  testTimeout: 30000,
  // Run sequentially so daemon port races can't happen across files
  maxWorkers: 1,
};
