#!/usr/bin/env node
/**
 * Molly Dynamic Feature Visibility Test
 *
 * This script checks that all dynamic tools, modes, hooks, plugins, and self-modifying components
 * are visible to Molly at runtime. It prints a summary and exits nonzero if any are missing.
 */
let modularToolHandlers;
let registerHook;

function check(name, condition) {
  if (!condition) {
    console.error(`❌ Missing: ${name}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ Found: ${name}`);
  }
}

async function main() {
  // Dynamically import modularToolHandlers and registerHook for robust ESM compatibility
  const mod =
    await import('../src/ai/agency/tool-handlers/modular-tool-handlers.js').catch(
      async () =>
        await import('../src/ai/agency/tool-handlers/modular-tool-handlers.ts')
    );
  modularToolHandlers = mod.modularToolHandlers;
  const hookMod = await import('../src/ai/hooks/index.js').catch(
    async () => await import('../src/ai/hooks/index.ts')
  );
  registerHook = hookMod.registerHook;

  // 1. Check for key dynamic handlers in modularToolHandlers
  const expectedHandlers = [
    'introspectModesAndHooks', // diagnostic
    'selfModification', // cognition
    'digitalGarden', // memory
    'bugBounty', // bug bounty
    // Add more as needed for future dynamic systems
  ];
  for (const handler of expectedHandlers) {
    check(handler, typeof modularToolHandlers[handler] === 'function');
  }

  // 2. Check for at least one MCP tool (dynamic)
  const mcpToolPresent = Object.keys(modularToolHandlers).some((k) =>
    k.startsWith('mcp:')
  );
  check('At least one MCP tool (dynamic)', mcpToolPresent);

  // 7. Hooks: ensure at least one event is present
  try {
    registerHook('HeartbeatCycle', () => {});
    check('Hook event: HeartbeatCycle', true);
  } catch {
    check('Hook event: HeartbeatCycle', false);
  }

  // 8. Print summary
  if (process.exitCode === 1) {
    console.error('\nSome dynamic features are missing or not visible.');
    process.exit(1);
  } else {
    console.log('\nAll dynamic features are visible to Molly.');
    process.exit(0);
  }
}

main();
