import {
  initAgencyRuntime,
  __resetAgencyRuntimeForTests,
} from '../agency-runtime';
import { readRegistry, writeRegistry } from '../registry-api';
import { GOVERNOR_PARAM_KEYS as K } from '../governor/cognitive-governor';

describe('Registry API', () => {
  it('should handle read, propose, override, and token validation across 7 test groups', () => {
    function assert(cond: boolean, msg: string): void {
      if (!cond) throw new Error('ASSERT FAILED: ' + msg);
    }

    __resetAgencyRuntimeForTests();
    const rt = initAgencyRuntime();

    // 1. Read returns snapshot + governor + history.
    const read = readRegistry(rt);
    assert(read.status === 200, 'read ok');
    const rb = read.body as Record<string, unknown>;
    assert(
      K.maxConcurrentFlows in rb.snapshot,
      'snapshot includes governor params'
    );
    assert(
      typeof rb.governor.limits.flow === 'number',
      'governor snapshot present'
    );

    // 2. Propose needs no token, returns 202 + queued.
    let w = writeRegistry(
      rt,
      {
        action: 'propose',
        key: K.maxConcurrentFlows,
        value: 6,
        actor: 'self-calibration',
        reason: 'creep',
      },
      undefined,
      'secret'
    );
    assert(w.status === 202, 'propose queued without token');

    // 3. Override with NO server token configured → 503 fail-closed.
    w = writeRegistry(
      rt,
      {
        action: 'override',
        key: K.maxConcurrentFlows,
        value: 8,
        actor: 'eric',
        reason: 'manual',
      },
      'whatever',
      undefined
    );
    assert(w.status === 503, 'override disabled when token unconfigured');

    // 4. Override with wrong token → 401.
    w = writeRegistry(
      rt,
      {
        action: 'override',
        key: K.maxConcurrentFlows,
        value: 8,
        actor: 'eric',
        reason: 'manual',
      },
      'wrong',
      'secret'
    );
    assert(w.status === 401, 'override rejected with bad token');

    // 5. Override with correct token → 200 and value changes, tagged in history.
    w = writeRegistry(
      rt,
      {
        action: 'override',
        key: K.maxConcurrentFlows,
        value: 8,
        actor: 'eric',
        reason: 'manual bump',
      },
      'secret',
      'secret'
    );
    assert(w.status === 200, 'override ok with good token');
    assert(
      rt.registry.get<number>(K.maxConcurrentFlows) === 8,
      'override applied'
    );
    assert(
      rt.registry
        .getHistory(K.maxConcurrentFlows)
        .some((h) => h.kind === 'operator-override'),
      'tagged operator-override'
    );

    // 6. Override out of bounds → 422 (bounds bind humans too).
    w = writeRegistry(
      rt,
      {
        action: 'override',
        key: K.maxConcurrentFlows,
        value: 9999,
        actor: 'eric',
        reason: 'oops',
      },
      'secret',
      'secret'
    );
    assert(w.status === 422, 'out-of-bounds override rejected');

    // 7. Malformed body → 400.
    w = writeRegistry(rt, { action: 'nope' }, 'secret', 'secret');
    assert(w.status === 400, 'malformed body rejected');

    expect(true).toBe(true);
  });
});
