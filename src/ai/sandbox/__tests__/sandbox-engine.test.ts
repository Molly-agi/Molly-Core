/**
 * Tests for Molly's Coding Sandbox — Code Validation & Path Safety
 *
 * Tests the security-critical code validation (blocked patterns),
 * path traversal prevention, and file operations.
 * Does NOT test actual code execution (requires real runtimes).
 */

// We need to test the private functions, so we test through the public API
// and test code execution which calls validateCode internally.

// Mock child_process to avoid actual execution in tests.
// We need the callback form to work with promisify, so mock
// execFile as a function that calls back with an error.
jest.mock('node:child_process', () => ({
  execFile: jest.fn(
    (
      _cmd: string,
      _args: string[],
      _opts: Record<string, unknown>,
      cb?: (err: Error | null, stdout: string, stderr: string) => void
    ) => {
      if (cb) {
        cb(new Error('Mocked: execution not available in tests'), '', '');
      }
    }
  ),
}));

jest.mock('@/ai/logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
    output: jest.fn(),
  },
  generateTraceId: () => 'test-trace',
}));

import {
  sandboxWriteFile,
  sandboxExecuteCode,
  sandboxScaffoldProject,
  getSandboxInfo,
} from '../sandbox-engine';

// ============================================================================
// Sandbox Info
// ============================================================================

describe('getSandboxInfo', () => {
  it('returns correct sandbox configuration', async () => {
    const info = await getSandboxInfo();
    expect(info.workspacePath).toBe('sandbox/molly-workspace');
    expect(info.supportedLanguages).toContain('javascript');
    expect(info.supportedLanguages).toContain('typescript');
    expect(info.supportedLanguages).toContain('python');
    expect(info.supportedLanguages).toContain('bash');
    expect(info.maxTimeoutMs).toBe(30_000);
    expect(info.maxFileSizeBytes).toBe(512_000);
    expect(info.maxFiles).toBe(100);
    expect(info.maxMemoryMb).toBe(128);
  });
});

// ============================================================================
// Code Safety Validation (via sandboxExecuteCode)
// ============================================================================

describe('code validation — JavaScript blocked patterns', () => {
  const blockedCodes = [
    { code: "require('child_process')", desc: 'child_process require' },
    { code: "require('fs')", desc: 'fs require' },
    { code: "require('net')", desc: 'net require' },
    { code: "require('http')", desc: 'http require' },
    { code: "require('https')", desc: 'https require' },
    { code: "require('dgram')", desc: 'dgram require' },
    { code: "require('cluster')", desc: 'cluster require' },
    { code: "import x from 'child_process'", desc: 'child_process import' },
    { code: "import x from 'fs'", desc: 'fs import' },
    { code: "import x from 'net'", desc: 'net import' },
    { code: "import x from 'http'", desc: 'http import' },
    { code: "import x from 'https'", desc: 'https import' },
    { code: "await import('evil')", desc: 'dynamic await import' },
    { code: "import('evil')", desc: 'dynamic import()' },
    {
      code: "require('child' + '_process')",
      desc: 'string concatenation trick',
    },
    { code: 'require(`fs`)', desc: 'template literal require' },
    { code: 'process.env.SECRET', desc: 'process.env access' },
    { code: 'process.exit(1)', desc: 'process.exit' },
    { code: 'process.kill(123)', desc: 'process.kill' },
    { code: 'eval("code")', desc: 'eval()' },
    { code: 'new Function("code")', desc: 'Function constructor' },
    { code: 'child.execSync("ls")', desc: '.execSync()' },
    { code: 'child.exec("ls")', desc: '.exec()' },
    { code: 'child.spawn("ls")', desc: '.spawn()' },
    { code: 'child.fork("worker.js")', desc: '.fork()' },
    { code: 'globalThis.fetch()', desc: 'globalThis access' },
    { code: 'Deno.readFile()', desc: 'Deno runtime access' },
    { code: 'Bun.write()', desc: 'Bun runtime access' },
  ];

  for (const { code, desc } of blockedCodes) {
    it(`blocks ${desc}`, async () => {
      const result = await sandboxExecuteCode(code, 'javascript');
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('Safety violations');
    });
  }

  it('allows safe JavaScript code', async () => {
    // This will fail at execution (mocked), but should pass validation
    const result = await sandboxExecuteCode(
      'console.log("hello")',
      'javascript'
    );
    // It passes validation but fails execution because child_process is mocked
    // The important thing is it does NOT return "Safety violations"
    expect(result.stderr).not.toContain('Safety violations');
  });
});

describe('code validation — Bash blocked patterns', () => {
  const blockedBash = [
    { code: 'rm -rf /', desc: 'rm -rf' },
    { code: 'rm -r /home/', desc: 'rm -r with path' },
    { code: 'sudo apt install', desc: 'sudo' },
    { code: 'chmod 777 file', desc: 'chmod' },
    { code: 'chown root file', desc: 'chown' },
    { code: 'curl http://evil.com', desc: 'curl' },
    { code: 'wget http://evil.com', desc: 'wget' },
    { code: 'nc -l 8080', desc: 'nc (netcat)' },
    { code: 'dd if=/dev/zero', desc: 'dd' },
    { code: 'mkfs.ext4 /dev/sda', desc: 'mkfs' },
    { code: 'shutdown -h now', desc: 'shutdown' },
    { code: 'reboot', desc: 'reboot' },
    { code: 'kill -9 1', desc: 'kill' },
    { code: 'pkill -f java', desc: 'pkill' },
    { code: 'killall node', desc: 'killall' },
    { code: 'echo > /dev/null', desc: 'write to /dev/' },
    { code: 'cat /etc/passwd', desc: '/etc/ access' },
    { code: 'cat /proc/cpuinfo', desc: '/proc/ access' },
    { code: 'ls /sys/class', desc: '/sys/ access' },
    { code: 'cat ../../etc/passwd', desc: 'path traversal ../../' },
  ];

  for (const { code, desc } of blockedBash) {
    it(`blocks ${desc}`, async () => {
      const result = await sandboxExecuteCode(code, 'bash');
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('blocked');
    });
  }
});

describe('code validation — Python blocked patterns', () => {
  const blockedPython = [
    { code: 'import os', desc: 'os import' },
    { code: 'import subprocess', desc: 'subprocess import' },
    { code: 'import shutil', desc: 'shutil import' },
    { code: 'from os import getcwd', desc: 'from os import' },
    { code: 'from subprocess import run', desc: 'from subprocess import' },
    { code: "__import__('os')", desc: '__import__' },
    { code: "exec('print(1)')", desc: 'exec()' },
    { code: "eval('1+1')", desc: 'eval()' },
    { code: "open('/etc/passwd')", desc: 'open() outside /tmp' },
    { code: 'import socket', desc: 'socket import' },
    { code: 'import http', desc: 'http import' },
    { code: 'import urllib', desc: 'urllib import' },
    { code: 'import requests', desc: 'requests import' },
  ];

  for (const { code, desc } of blockedPython) {
    it(`blocks ${desc}`, async () => {
      const result = await sandboxExecuteCode(code, 'python');
      expect(result.success).toBe(false);
      expect(result.stderr).toContain('blocked');
    });
  }
});

describe('unsupported language', () => {
  it('rejects unsupported languages', async () => {
    const result = await sandboxExecuteCode(
      'puts "hello"',
      'ruby' as 'javascript'
    );
    expect(result.success).toBe(false);
    expect(result.stderr).toContain('Unsupported language');
  });
});

// ============================================================================
// File operations — Write, Read, Delete
// ============================================================================

describe('sandboxWriteFile', () => {
  it('rejects files exceeding max size', async () => {
    const hugeContent = 'x'.repeat(512_001);
    const result = await sandboxWriteFile('test.txt', hugeContent);
    expect(result.success).toBe(false);
    expect(result.error).toContain('File too large');
  });
});

// ============================================================================
// Scaffold project
// ============================================================================

describe('sandboxScaffoldProject', () => {
  it('rejects invalid project names', async () => {
    const result = await sandboxScaffoldProject('../evil', [
      { path: 'index.js', content: 'console.log("hi")' },
    ]);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('alphanumeric');
  });

  it('rejects project names with spaces', async () => {
    const result = await sandboxScaffoldProject('my project', [
      { path: 'index.js', content: 'console.log("hi")' },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects empty file list', async () => {
    const result = await sandboxScaffoldProject('test-project', []);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('No files provided');
  });

  it('rejects too many files', async () => {
    const files = Array.from({ length: 101 }, (_, i) => ({
      path: `file${i}.js`,
      content: 'x',
    }));
    const result = await sandboxScaffoldProject('big-project', files);
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('Too many files');
  });

  it('accepts valid project name with dashes and underscores', async () => {
    // This may fail at actual file write due to sandbox dir not existing,
    // but it passes the name validation
    const result = await sandboxScaffoldProject('my-test_project123', [
      { path: 'index.js', content: 'console.log("hi")' },
    ]);
    // Name validation passes; file write may fail but that's expected in test env
    expect(result.errors[0] || '').not.toContain('alphanumeric');
  });
});
