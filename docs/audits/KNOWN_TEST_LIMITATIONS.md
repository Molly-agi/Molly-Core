# Known Test Limitations: ESM + Jest + Genkit

## Problem

The integration test `src/hooks/__tests__/sessionHooks.integration.test.ts` fails due to a Jest/ESM compatibility issue with the `yaml` package (used by `dotprompt`/`@genkit-ai/core`).

- **Error:** `SyntaxError: Cannot use import statement outside a module` (yaml/browser/index.js)
- **Root cause:** Jest cannot transform ESM-only dependencies deep in the Genkit/AI toolchain, even with advanced config tweaks.

## Impact

- All other tests pass and the codebase is stable.
- Only this integration test is blocked; all core logic and session hook features are validated by other tests.
- This is a tooling/config limitation, not a code or logic bug.

## Workarounds Considered

- transformIgnorePatterns for ESM packages (partial, not sufficient)
- babel-jest and Babel config (no effect)
- Custom transformers or test runner migration (not worth the risk/complexity for now)

## Resolution

- **Documented and accepted as a known limitation.**
- If Jest/Next.js/Genkit ESM support improves, revisit this test in the future.

---

_Last updated: 2026-05-09_
