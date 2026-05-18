/**
 * @fileOverview Tests for Sandbox Coding flow.
 *
 * Focus: branch behavior for execute/save/read/list/delete/practice actions
 * without invoking real sandbox runtime or model calls.
 */

jest.mock('../../genkit', () => ({
  ai: {
    defineFlow: jest.fn((_config, handler) => handler),
  },
  molly: {
    generate: jest.fn(),
  },
  TaskType: {
    CODE: 'code',
  },
}));

jest.mock('@/ai/sandbox/sandbox-engine', () => ({
  sandboxExecuteCode: jest.fn(),
  sandboxWriteFile: jest.fn(),
  sandboxReadFile: jest.fn(),
  sandboxListFiles: jest.fn(),
  sandboxDeleteFile: jest.fn(),
  getSandboxInfo: jest.fn(),
}));

import { molly } from '../../genkit';
import {
  sandboxExecuteCode,
  sandboxWriteFile,
  sandboxReadFile,
  sandboxListFiles,
  sandboxDeleteFile,
  getSandboxInfo,
} from '@/ai/sandbox/sandbox-engine';

const mockMollyGenerate = molly.generate as jest.Mock;
const mockSandboxExecuteCode = sandboxExecuteCode as jest.Mock;
const mockSandboxWriteFile = sandboxWriteFile as jest.Mock;
const mockSandboxReadFile = sandboxReadFile as jest.Mock;
const mockSandboxListFiles = sandboxListFiles as jest.Mock;
const mockSandboxDeleteFile = sandboxDeleteFile as jest.Mock;
const mockGetSandboxInfo = getSandboxInfo as jest.Mock;

describe('sandboxCoding flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSandboxWriteFile.mockResolvedValue({ success: true });
    mockSandboxExecuteCode.mockResolvedValue({
      success: true,
      stdout: 'ok',
      stderr: '',
      executionTimeMs: 12,
    });
    mockSandboxReadFile.mockResolvedValue({ success: true, content: 'hello' });
    mockSandboxListFiles.mockResolvedValue([]);
    mockSandboxDeleteFile.mockResolvedValue({ success: true });
    mockGetSandboxInfo.mockResolvedValue({
      supportedLanguages: ['javascript', 'typescript', 'python', 'bash'],
    });
  });

  it('returns validation error when execute lacks code/language', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'execute' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Need both code and language');
    expect(mockSandboxExecuteCode).not.toHaveBeenCalled();
  });

  it('saves optional filename before execute', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({
      action: 'execute',
      code: 'console.log(42)',
      language: 'javascript',
      filename: 'demo.js',
    });

    expect(mockSandboxWriteFile).toHaveBeenCalledWith(
      'demo.js',
      'console.log(42)'
    );
    expect(mockSandboxExecuteCode).toHaveBeenCalledWith(
      'console.log(42)',
      'javascript'
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('Code executed successfully');
  });

  it('returns sandbox list with empty-state guidance', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'list' });

    expect(result.success).toBe(true);
    expect(result.message).toContain('Sandbox is empty');
    expect(result.message).toContain('javascript');
  });

  it('reads a file and returns content in stdout', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'read', filename: 'a.txt' });

    expect(mockSandboxReadFile).toHaveBeenCalledWith('a.txt');
    expect(result.success).toBe(true);
    expect(result.stdout).toBe('hello');
  });

  it('returns validation error when practice has no challenge', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'practice' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Need a challenge description');
    expect(mockMollyGenerate).not.toHaveBeenCalled();
  });

  it('generates, cleans fenced code, executes, and saves practice file', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1779089000000);
    mockMollyGenerate.mockResolvedValue({
      text: () => '```typescript\nconsole.log("practice")\n```',
    });

    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({
      action: 'practice',
      challenge: 'print one line',
      language: 'typescript',
    });

    expect(mockMollyGenerate).toHaveBeenCalledWith(
      'code',
      expect.objectContaining({
        prompt: expect.stringContaining('print one line'),
      })
    );

    expect(mockSandboxExecuteCode).toHaveBeenCalledWith(
      'console.log("practice")',
      'typescript'
    );

    expect(mockSandboxWriteFile).toHaveBeenCalledWith(
      'practice_1779089000000.ts',
      'console.log("practice")'
    );

    expect(result.success).toBe(true);
    expect(result.code).toBe('console.log("practice")');

    (Date.now as jest.Mock).mockRestore();
  });
});
