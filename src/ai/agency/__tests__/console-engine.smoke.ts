import { initAgencyRuntime, __resetAgencyRuntimeForTests } from '../agency-runtime';
import { execConsole, type ConsoleContext } from '../console-engine';
import { GOVERNOR_ID, GOVERNOR_PARAM_KEYS as K } from '../governor/cognitive-governor';

describe('Console Engine', () => {
  it('should handle ls, get, propose, pending, resolve, override, history, gov, help, and unknown commands across 9 test groups', () => {
    function assert(cond: boolean, msg: string): void {
      if (!cond) throw new Error('ASSERT FAILED: ' + msg);
    }
    function run(input: string, ctx: Partial<ConsoleContext> = {}) {
      const full: ConsoleContext = { authed: false, operator: 'tester', ...ctx };
      return execConsole(rt, input, full);
    }
    function text(r: ReturnType<typeof execConsole>): string {
      return r.lines.map((l) => l.text).join('\n');
    }

    __resetAgencyRuntimeForTests();
    const rt = initAgencyRuntime();
    const govResolver = () => rt.governor.drainProposals();

    // 1. ls lists params with bounds.
    let r = run('ls');
    assert(text(r).includes('governor.maxConcurrentFlows'), 'ls shows a param');
    assert(text(r).includes('[1..64]'), 'ls shows bounds');

    // 2. get on a real key, error on a bad one.
    assert(text(run('get ' + K.maxConcurrentFlows)).includes('= 4'), 'get shows value 4');
    assert(run('get nope.key').lines[0].stream === 'err', 'get unknown key errors');

    // 3. propose queues, owned by governor.
    r = run(`propose ${K.maxConcurrentFlows} 6 trying it`);
    assert(text(r).includes('queued'), 'propose queued');
    assert(rt.registry.pendingProposals(K.maxConcurrentFlows).length === 1, 'one proposal pending');
    assert(rt.registry.get<number>(K.maxConcurrentFlows) === 4, 'value unchanged until resolved');

    // 4. pending lists it.
    assert(text(run(`pending ${K.maxConcurrentFlows}`)).includes('by console:tester'), 'pending shows proposer');

    // 5. resolve via governor resolver commits it.
    r = run(`resolve ${K.maxConcurrentFlows}`, { resolvers: { [GOVERNOR_ID]: govResolver } });
    assert(rt.registry.get<number>(K.maxConcurrentFlows) === 6, 'resolved to 6');

    // 6. resolve without a registered resolver refuses (won't fake an owner decision).
    r = run(`resolve ${K.maxConcurrentTools}`);
    assert(r.lines[0].stream === 'err' && text(r).includes('no resolver'), 'no-resolver refusal');

    // 7. override blocked without auth, allowed with auth.
    r = run(`override ${K.maxConcurrentFlows} 10`, { authed: false });
    assert(r.lines[0].stream === 'err' && text(r).includes('not authorized'), 'override needs auth');
    r = run(`override ${K.maxConcurrentFlows} 10 manual`, { authed: true });
    assert(rt.registry.get<number>(K.maxConcurrentFlows) === 10, 'authed override applied');
    assert(rt.registry.getHistory(K.maxConcurrentFlows).some((h) => h.kind === 'operator-override'), 'tagged in history');

    // 8. override out of bounds rejected.
    r = run(`override ${K.maxConcurrentFlows} 9999`, { authed: true });
    assert(text(r).includes('rejected'), 'oob override rejected');

    // 9. history + gov + help + unknown.
    assert(text(run('history')).length > 0, 'history prints');
    assert(text(run('gov')).includes('flows'), 'gov prints');
    assert(text(run('help')).includes('commands:'), 'help prints');
    assert(run('frobnicate').lines[0].stream === 'err', 'unknown command errors');

    expect(true).toBe(true);
  });
});
