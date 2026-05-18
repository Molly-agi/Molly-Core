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

  it('returns failed execute message when sandbox execution fails', async () => {
    mockSandboxExecuteCode.mockResolvedValueOnce({
      success: false,
      stdout: '',
      stderr: 'runtime error',
      executionTimeMs: 4,
    });

    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({
      action: 'execute',
      code: 'throw new Error("x")',
      language: 'javascript',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Execution failed: runtime error');
  });

  it('returns validation error when save lacks filename/code', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'save', code: 'x=1' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Need filename and code');
  });

  it('returns failed save message when sandbox write fails', async () => {
    mockSandboxWriteFile.mockResolvedValueOnce({
      success: false,
      error: 'disk full',
    });

    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({
      action: 'save',
      filename: 'b.txt',
      code: 'hello',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to save: disk full');
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

  it('returns validation error when read lacks filename', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'read' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Need a filename to read');
  });

  it('returns failed read message when sandbox read fails', async () => {
    mockSandboxReadFile.mockResolvedValueOnce({
      success: false,
      error: 'not found',
    });

    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({
      action: 'read',
      filename: 'missing.txt',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to read: not found');
  });

  it('returns list summary for non-empty sandbox', async () => {
    mockSandboxListFiles.mockResolvedValueOnce([
      { name: 'main.ts', size: 10, isDirectory: false },
    ]);

    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'list' });

    expect(result.success).toBe(true);
    expect(result.message).toContain('1 file(s) in sandbox');
    expect(result.files).toEqual([
      { name: 'main.ts', size: 10, isDirectory: false },
    ]);
  });

  it('returns validation error when delete lacks filename', async () => {
    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({ action: 'delete' });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Need a filename to delete');
  });

  it('returns failed delete message when sandbox delete fails', async () => {
    mockSandboxDeleteFile.mockResolvedValueOnce({
      success: false,
      error: 'permission denied',
    });

    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({
      action: 'delete',
      filename: 'locked.ts',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to delete: permission denied');
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

  it('accepts string LLM text and returns failed practice summary when execution fails', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1779089000123);
    mockMollyGenerate.mockResolvedValueOnce({
      text: 'console.log("plain")',
    });
    mockSandboxExecuteCode.mockResolvedValueOnce({
      success: false,
      stdout: '',
      stderr: 'syntax error',
      executionTimeMs: 2,
    });

    const { sandboxCoding } = await import('../sandbox-coding');

    const result = await sandboxCoding({
      action: 'practice',
      challenge: 'print plain',
      language: 'javascript',
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Practice attempt failed: syntax error');
    expect(mockSandboxWriteFile).toHaveBeenCalledWith(
      'practice_1779089000123.js',
      'console.log("plain")'
    );

    (Date.now as jest.Mock).mockRestore();
  });
});
