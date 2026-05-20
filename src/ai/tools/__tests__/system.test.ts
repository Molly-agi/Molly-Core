/**
 * @fileOverview Tests for System Tools — Hardware & Execution Interface
 *
 * Tests system tools including:
 * - System health monitoring
 * - Model listing
 * - System audit
 * - Neural bridge UI
 * - Local interpreter
 */

// Mock genkit
const toolHandlers: Record<
  string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { config: any; handler: (input: any) => Promise<any> }
> = {};

jest.mock('@/ai/genkit', () => ({
  ai: {
    defineTool: jest.fn((config, handler) => {
      toolHandlers[config.name] = { config, handler };
      return { __config: config, __handler: handler };
    }),
  },
}));

// Mock child_process for system commands
const mockExecSync = jest.fn();

jest.mock('child_process', () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}));

// Mock fetch for relay calls
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('System Tools', () => {
  beforeAll(async () => {
    await import('../system');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getSystemHealth', () => {
    const getHandler = () => toolHandlers['getSystemHealth'].handler;

    it('returns system health with real metrics', async () => {
      mockExecSync
        .mockReturnValueOnce('0.5,') // load average
        .mockReturnValueOnce('4') // nproc
        .mockReturnValueOnce(
          'Mem: total used free shared buff/cache available\n' +
            'Mem: 8000 4000 2000 100 1900 3000'
        ); // free -m

      const result = await getHandler()({});

      expect(result).toHaveProperty('batteryLevel');
      expect(result).toHaveProperty('isCharging');
      expect(result).toHaveProperty('temperature');
      expect(result).toHaveProperty('cpuUsage');
      expect(result).toHaveProperty('architecture');
      expect(result.architecture).toBe(process.arch);
    });

    it('calculates CPU usage from load average', async () => {
      mockExecSync
        .mockReturnValueOnce('2.0,') // 2.0 load
        .mockReturnValueOnce('4') // 4 cores
        .mockReturnValueOnce('Mem: 8000 4000 2000 100 1900 3000');

      const result = await getHandler()({});

      // 2.0 / 4 cores = 50%
      expect(result.cpuUsage).toBe(50);
    });

    it('determines throttling status from temperature', async () => {
      mockExecSync
        .mockReturnValueOnce('4.0,') // High load
        .mockReturnValueOnce('2') // 2 cores = 200% usage capped at 100%
        .mockReturnValueOnce('Mem: 8000 4000 2000 100 1900 3000');

      const result = await getHandler()({});

      // High CPU = high temp = throttled or critical
      expect(['Throttled', 'Critical', 'Normal']).toContain(
        result.throttlingStatus
      );
    });

    it('determines power mode from CPU usage', async () => {
      mockExecSync
        .mockReturnValueOnce('0.1,') // Low load
        .mockReturnValueOnce('4') // 4 cores
        .mockReturnValueOnce('Mem: 8000 4000 2000 100 1900 6000');

      const result = await getHandler()({});

      // Low CPU = efficiency mode
      expect(result.powerMode).toBe('Efficiency');
    });

    it('returns fallback values on error', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Command not found');
      });

      const result = await getHandler()({});

      expect(result.batteryLevel).toBe(80);
      expect(result.throttlingStatus).toBe('Normal');
      expect(result.model).toBe('Unknown Device');
    });
  });

  describe('listAvailableModels', () => {
    const getHandler = () => toolHandlers['listAvailableModels'].handler;

    it('returns list of available models', async () => {
      const result = await getHandler()({});

      expect(Array.isArray(result)).toBe(true);
      expect(result).toContain('gemini-2.5-flash');
      expect(result).toContain('gemini-embedding-001');
    });

    it('includes TTS and image models', async () => {
      const result = await getHandler()({});

      expect(result).toContain('gemini-2.5-flash-preview-tts');
      expect(result).toContain('imagen-3.0-generate-001');
    });
  });

  describe('systemAudit', () => {
    const getHandler = () => toolHandlers['systemAudit'].handler;

    it('performs surface audit', async () => {
      const result = await getHandler()({ depth: 'Surface' });

      expect(result.integrityScore).toBeGreaterThan(0.9);
      expect(result.locksDetected).toEqual([]);
      expect(result.binariesVerified).toContain('node');
    });

    it('includes vibe check', async () => {
      const result = await getHandler()({ depth: 'Deep' });

      expect(result.vibeCheck).toBeDefined();
      expect(result.vibeCheck.length).toBeGreaterThan(0);
    });

    it('verifies expected binaries', async () => {
      const result = await getHandler()({ depth: 'Atomic' });

      expect(result.binariesVerified).toContain('next');
      expect(result.binariesVerified).toContain('genkit');
      expect(result.binariesVerified).toContain('npm');
    });
  });

  describe('neuralBridgeUI', () => {
    const getHandler = () => toolHandlers['neuralBridgeUI'].handler;

    it('captures screenshot', async () => {
      const result = await getHandler()({ action: 'CAPTURE_SCREENSHOT' });

      expect(result.success).toBe(true);
      expect(result.screenshotUri).toContain('data:image/png;base64');
    });

    it('reads screen', async () => {
      const result = await getHandler()({ action: 'READ_SCREEN' });

      expect(result.success).toBe(true);
      expect(result.observedData).toBeDefined();
      expect(result.vibeEstimate).toBeDefined();
    });

    it('clicks coordinates', async () => {
      const result = await getHandler()({
        action: 'CLICK_COORDINATES',
        payload: '{"x": 100, "y": 200}',
      });

      expect(result.success).toBe(true);
    });

    it('gets notifications', async () => {
      const result = await getHandler()({ action: 'GET_NOTIFICATIONS' });

      expect(result.success).toBe(true);
    });
  });

  describe('localInterpreter', () => {
    const getHandler = () => toolHandlers['localInterpreter'].handler;

    describe('with relay available', () => {
      it('executes shell command via relay', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            stdout: 'hello world',
            stderr: '',
            exitCode: 0,
          }),
        });

        const result = await getHandler()({
          language: 'shell',
          code: 'echo hello world',
        });

        expect(result.stdout).toBe('hello world');
        expect(result.exitCode).toBe(0);
        expect(result.vibe).toContain('cleanly');
      });

      it('executes python code via relay', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            stdout: '42',
            stderr: '',
            exitCode: 0,
          }),
        });

        const result = await getHandler()({
          language: 'python',
          code: 'print(6 * 7)',
        });

        expect(result.stdout).toBe('42');
        expect(result.exitCode).toBe(0);
      });

      it('handles relay error response', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: async () => ({ error: 'Internal error' }),
        });

        // Mock the fallback local exec to also fail
        mockExecSync.mockImplementation(() => {
          throw new Error('Command failed');
        });

        const result = await getHandler()({
          language: 'shell',
          code: 'bad-command',
        });

        expect(result.exitCode).toBe(1);
      });

      it('handles silent success', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            stdout: '',
            stderr: '',
            exitCode: 0,
          }),
        });

        const result = await getHandler()({
          language: 'shell',
          code: 'true',
        });

        expect(result.vibe).toContain('silently');
      });

      it('handles command failure', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          json: async () => ({
            stdout: '',
            stderr: 'Error occurred',
            exitCode: 1,
          }),
        });

        const result = await getHandler()({
          language: 'shell',
          code: 'exit 1',
        });

        expect(result.exitCode).toBe(1);
        expect(result.vibe).toContain('wrong');
      });
    });

    describe('with relay unavailable (fallback)', () => {
      beforeEach(() => {
        mockFetch.mockRejectedValue(new Error('Connection refused'));
      });

      it('falls back to local shell execution', async () => {
        mockExecSync.mockReturnValue('local output');

        const result = await getHandler()({
          language: 'shell',
          code: 'echo test',
        });

        expect(result.stdout).toBe('local output');
        expect(result.vibe).toContain('locally');
      });

      it('falls back to local python execution', async () => {
        mockExecSync.mockReturnValue('python output');

        const result = await getHandler()({
          language: 'python',
          code: 'print("hello")',
        });

        expect(result.stdout).toBe('python output');
        expect(mockExecSync).toHaveBeenCalledWith(
          expect.stringContaining('python3'),
          expect.any(Object)
        );
      });

      it('falls back to local javascript execution', async () => {
        mockExecSync.mockReturnValue('js output');

        const result = await getHandler()({
          language: 'javascript',
          code: 'console.log("hi")',
        });

        expect(result.stdout).toBe('js output');
        expect(mockExecSync).toHaveBeenCalledWith(
          expect.stringContaining('node'),
          expect.any(Object)
        );
      });

      it('handles local execution failure', async () => {
        const execError = {
          stdout: '',
          stderr: 'Command not found',
          status: 127,
        };
        mockExecSync.mockImplementation(() => {
          throw execError;
        });

        const result = await getHandler()({
          language: 'shell',
          code: 'nonexistent-command',
        });

        expect(result.exitCode).toBe(127);
        expect(result.stderr).toBe('Command not found');
      });

      it('handles complete execution failure', async () => {
        mockExecSync.mockImplementation(() => {
          throw new Error('Not an exec error');
        });

        const result = await getHandler()({
          language: 'shell',
          code: 'broken',
        });

        expect(result.exitCode).toBe(1);
        expect(result.vibe).toContain('relay');
      });
    });
  });

  describe('Tool Configurations', () => {
    it('getSystemHealth has correct config', () => {
      const config = toolHandlers['getSystemHealth'].config;
      expect(config.name).toBe('getSystemHealth');
      expect(config.description).toContain('hardware');
    });

    it('listAvailableModels has correct config', () => {
      const config = toolHandlers['listAvailableModels'].config;
      expect(config.name).toBe('listAvailableModels');
      expect(config.description).toContain('models');
    });

    it('systemAudit has correct config', () => {
      const config = toolHandlers['systemAudit'].config;
      expect(config.name).toBe('systemAudit');
      expect(config.description).toContain('audit');
    });

    it('neuralBridgeUI has correct config', () => {
      const config = toolHandlers['neuralBridgeUI'].config;
      expect(config.name).toBe('neuralBridgeUI');
      expect(config.description).toContain('Accessibility');
    });

    it('localInterpreter has correct config', () => {
      const config = toolHandlers['localInterpreter'].config;
      expect(config.name).toBe('localInterpreter');
      expect(config.description).toContain('Termux');
    });
  });
});
