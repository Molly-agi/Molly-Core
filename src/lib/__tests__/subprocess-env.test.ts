import { scrubEnvForSubprocess, isEnvScrubEnabled } from '../subprocess-env';

describe('subprocess-env', () => {
  const originalScrub = process.env.MOLLY_SUBPROCESS_ENV_SCRUB;

  afterEach(() => {
    if (originalScrub === undefined)
      delete process.env.MOLLY_SUBPROCESS_ENV_SCRUB;
    else process.env.MOLLY_SUBPROCESS_ENV_SCRUB = originalScrub;
  });

  test('returns input unchanged when scrubbing disabled', () => {
    delete process.env.MOLLY_SUBPROCESS_ENV_SCRUB;
    const env = { GOOGLE_GENAI_API_KEY: 'xyz', PATH: '/bin' };
    expect(scrubEnvForSubprocess(env)).toBe(env);
    expect(isEnvScrubEnabled()).toBe(false);
  });

  test('only "true" enables scrubbing (not "1" or "yes")', () => {
    process.env.MOLLY_SUBPROCESS_ENV_SCRUB = '1';
    expect(isEnvScrubEnabled()).toBe(false);
    process.env.MOLLY_SUBPROCESS_ENV_SCRUB = 'true';
    expect(isEnvScrubEnabled()).toBe(true);
  });

  test('strips _KEY / _TOKEN / _SECRET / _PASSWORD vars', () => {
    process.env.MOLLY_SUBPROCESS_ENV_SCRUB = 'true';
    const out = scrubEnvForSubprocess({
      MY_KEY: 'x',
      MY_TOKEN: 'x',
      MY_SECRET: 'x',
      MY_PASSWORD: 'x',
      OK_VAR: 'kept',
    });
    expect(out.OK_VAR).toBe('kept');
    expect(out.MY_KEY).toBeUndefined();
    expect(out.MY_TOKEN).toBeUndefined();
    expect(out.MY_SECRET).toBeUndefined();
    expect(out.MY_PASSWORD).toBeUndefined();
  });

  test('strips FIREBASE_/GOOGLE_/ANTHROPIC_/AWS_/AZURE_ prefixes', () => {
    process.env.MOLLY_SUBPROCESS_ENV_SCRUB = 'true';
    const out = scrubEnvForSubprocess({
      FIREBASE_PROJECT_ID: 'x',
      GOOGLE_APPLICATION_CREDENTIALS: 'x',
      ANTHROPIC_API_KEY: 'x',
      AWS_SECRET_ACCESS_KEY: 'x',
      AZURE_TENANT_ID: 'x',
      INNOCENT: 'kept',
    });
    expect(out.INNOCENT).toBe('kept');
    expect(out.FIREBASE_PROJECT_ID).toBeUndefined();
    expect(out.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();
    expect(out.ANTHROPIC_API_KEY).toBeUndefined();
  });

  test('preserves PATH/HOME/USER/NODE_ENV', () => {
    process.env.MOLLY_SUBPROCESS_ENV_SCRUB = 'true';
    const out = scrubEnvForSubprocess({
      PATH: '/bin',
      HOME: '/home/molly',
      USER: 'molly',
      NODE_ENV: 'production',
      SOME_KEY: 'stripped',
    });
    expect(out.PATH).toBe('/bin');
    expect(out.HOME).toBe('/home/molly');
    expect(out.USER).toBe('molly');
    expect(out.NODE_ENV).toBe('production');
    expect(out.SOME_KEY).toBeUndefined();
  });

  test('extraAllow keeps named vars', () => {
    process.env.MOLLY_SUBPROCESS_ENV_SCRUB = 'true';
    const out = scrubEnvForSubprocess(
      { CUSTOM_API_KEY: 'kept-by-allow', PATH: '/bin' },
      ['CUSTOM_API_KEY']
    );
    expect(out.CUSTOM_API_KEY).toBe('kept-by-allow');
  });
});
