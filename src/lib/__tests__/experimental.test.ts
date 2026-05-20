import {
  isExperimentalEnabled,
  listEnabledExperiments,
  _resetExperimentalCache,
} from '../experimental';

describe('experimental', () => {
  const originalEnv = process.env.MOLLY_EXPERIMENTAL;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.MOLLY_EXPERIMENTAL;
    else process.env.MOLLY_EXPERIMENTAL = originalEnv;
    _resetExperimentalCache();
  });

  test('returns false when env unset', () => {
    delete process.env.MOLLY_EXPERIMENTAL;
    _resetExperimentalCache();
    expect(isExperimentalEnabled('multi-agent-fork')).toBe(false);
  });

  test('matches single feature', () => {
    process.env.MOLLY_EXPERIMENTAL = 'multi-agent-fork';
    _resetExperimentalCache();
    expect(isExperimentalEnabled('multi-agent-fork')).toBe(true);
    expect(isExperimentalEnabled('something-else')).toBe(false);
  });

  test('matches features in comma list, ignores whitespace/case', () => {
    process.env.MOLLY_EXPERIMENTAL = ' Multi-Agent-Fork, recursive-self-mod ';
    _resetExperimentalCache();
    expect(isExperimentalEnabled('multi-agent-fork')).toBe(true);
    expect(isExperimentalEnabled('RECURSIVE-SELF-MOD')).toBe(true);
  });

  test('all enables every feature', () => {
    process.env.MOLLY_EXPERIMENTAL = 'all';
    _resetExperimentalCache();
    expect(isExperimentalEnabled('anything')).toBe(true);
    expect(isExperimentalEnabled('whatever')).toBe(true);
  });

  test('listEnabledExperiments returns sorted unique features', () => {
    process.env.MOLLY_EXPERIMENTAL = 'b,a,a';
    _resetExperimentalCache();
    expect(listEnabledExperiments()).toEqual(['a', 'b']);
  });
});
