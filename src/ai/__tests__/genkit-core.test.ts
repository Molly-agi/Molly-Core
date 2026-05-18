/**
 * @fileOverview Tests for genkit-core bootstrap behavior.
 *
 * We isolate module loading so each test can set env vars and verify
 * plugin init config without making any real SDK/network calls.
 */

describe('genkit-core bootstrap', () => {
  const originalEnv = { ...process.env };
  const mockGoogleAI = jest.fn((opts?: unknown) => ({
    plugin: 'googleAI',
    opts,
  }));
  const mockGenkit = jest.fn((config?: unknown) => ({ app: 'genkit', config }));

  async function loadModule() {
    jest.resetModules();

    jest.doMock('@genkit-ai/google-genai', () => ({
      googleAI: mockGoogleAI,
    }));

    jest.doMock('genkit', () => ({
      genkit: mockGenkit,
    }));

    return await import('../genkit-core');
  }

  beforeEach(() => {
    mockGoogleAI.mockClear();
    mockGenkit.mockClear();
    process.env = { ...originalEnv };

    delete process.env.MOLLY_CUSTOM_HEADERS;
    delete process.env.MOLLY_GENAI_BASE_URL;
    delete process.env.GOOGLE_GENAI_BASE_URL;
    delete process.env.MOLLY_MODEL_FLASH;
  });

  afterAll(() => {
    process.env = originalEnv;
    jest.resetModules();
  });

  it('initializes googleAI with empty options when no env overrides are set', async () => {
    await loadModule();

    expect(mockGoogleAI).toHaveBeenCalledWith({});
    expect(mockGenkit).toHaveBeenCalledWith(
      expect.objectContaining({ plugins: [expect.any(Object)] })
    );
  });

  it('parses JSON custom headers and stringifies non-string values', async () => {
    process.env.MOLLY_CUSTOM_HEADERS = '{"x-trace":"abc","x-count":5}';

    await loadModule();

    expect(mockGoogleAI).toHaveBeenCalledWith(
      expect.objectContaining({
        customHeaders: {
          'x-trace': 'abc',
          'x-count': '5',
        },
      })
    );
  });

  it('parses K=V custom header format', async () => {
    process.env.MOLLY_CUSTOM_HEADERS = 'A=1; B = two ; invalid ; C=';

    await loadModule();

    expect(mockGoogleAI).toHaveBeenCalledWith(
      expect.objectContaining({
        customHeaders: {
          A: '1',
          B: 'two',
          C: '',
        },
      })
    );
  });

  it('prefers MOLLY_GENAI_BASE_URL over GOOGLE_GENAI_BASE_URL', async () => {
    process.env.MOLLY_GENAI_BASE_URL = 'https://molly.example/v1';
    process.env.GOOGLE_GENAI_BASE_URL = 'https://google.example/v1';

    await loadModule();

    expect(mockGoogleAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://molly.example/v1',
      })
    );
  });

  it('logs a warning and skips custom headers on malformed JSON', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.MOLLY_CUSTOM_HEADERS = '{invalid json';

    await loadModule();

    expect(warnSpy).toHaveBeenCalledWith(
      '[genkit-core] MOLLY_CUSTOM_HEADERS JSON parse failed'
    );
    expect(mockGoogleAI).toHaveBeenCalledWith({});

    warnSpy.mockRestore();
  });

  it('uses env override for MODEL_FLASH constant', async () => {
    process.env.MOLLY_MODEL_FLASH = 'googleai/custom-flash';

    const mod = await loadModule();

    expect(mod.MODEL_FLASH).toBe('googleai/custom-flash');
  });
});
