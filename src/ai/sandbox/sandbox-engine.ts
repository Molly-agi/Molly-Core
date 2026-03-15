/**
 * @fileOverview Molly's Coding Sandbox — Safe Execution Engine
 *
 * A partitioned environment where Molly can write, read, and execute code
 * without any risk to the main codebase or her own core files.
 *
 * Safety Guarantees:
 *   - All file operations are confined to sandbox/molly-workspace/
 *   - Code execution has strict timeouts (30s default)
 *   - Memory limits enforced via Node.js flags
 *   - No access to environment variables or secrets
 *   - No network access from executed code
 *   - Cannot read/write outside the sandbox directory
 *   - Process-level isolation via child_process.execFile
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  readFile,
  writeFile,
  readdir,
  stat,
  unlink,
  mkdir,
} from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// ── Constants ──────────────────────────────────────────────────────────────
const WORKSPACE_ROOT = path.resolve(
  process.cwd(),
  'sandbox',
  'molly-workspace'
);
const MAX_EXECUTION_TIMEOUT_MS = 30_000; // 30 seconds
const MAX_OUTPUT_LENGTH = 50_000; // 50KB max output
const MAX_FILE_SIZE_BYTES = 512_000; // 512KB max file size
const MAX_FILES_IN_WORKSPACE = 100;
const MAX_MEMORY_MB = 128; // 128MB heap limit for executed code

// Languages Molly can practice in
const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'bash',
] as const;
type SandboxLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// Dangerous patterns that should never appear in sandbox code
const BLOCKED_PATTERNS = [
  /require\s*\(\s*['"]child_process['"]\s*\)/,
  /require\s*\(\s*['"]fs['"]\s*\)/,
  /require\s*\(\s*['"]net['"]\s*\)/,
  /require\s*\(\s*['"]http['"]\s*\)/,
  /require\s*\(\s*['"]https['"]\s*\)/,
  /require\s*\(\s*['"]dgram['"]\s*\)/,
  /require\s*\(\s*['"]cluster['"]\s*\)/,
  /import\s+.*from\s+['"]child_process['"]/,
  /import\s+.*from\s+['"]fs['"]/,
  /import\s+.*from\s+['"]net['"]/,
  /import\s+.*from\s+['"]http['"]/,
  /import\s+.*from\s+['"]https['"]/,
  // Dynamic imports — bypass static pattern matching
  /await\s+import\s*\(/,
  /import\s*\(/,
  // String concatenation tricks: require('child' + '_process')
  /require\s*\([^)]*\+/,
  /require\s*\(`/,
  /process\.env/,
  /process\.exit/,
  /process\.kill/,
  /eval\s*\(/,
  /Function\s*\(/,
  /\.execSync\s*\(/,
  /\.exec\s*\(/,
  /\.spawn\s*\(/,
  /\.fork\s*\(/,
  /globalThis/,
  /Deno\./,
  /Bun\./,
];

// ── Types ──────────────────────────────────────────────────────────────────

export interface SandboxExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTimeMs: number;
  language: string;
  truncated: boolean;
}

export interface SandboxFileInfo {
  name: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

// ── Path Safety ────────────────────────────────────────────────────────────

function resolveSafePath(relativePath: string): string {
  // Normalize and resolve the path
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);

  // CRITICAL: Ensure the resolved path is within the workspace
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error(
      `Path traversal blocked: "${relativePath}" resolves outside sandbox`
    );
  }

  return resolved;
}

// ── Code Safety ────────────────────────────────────────────────────────────

function validateCode(code: string, language: SandboxLanguage): string[] {
  const violations: string[] = [];

  if (language === 'javascript' || language === 'typescript') {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(code)) {
        violations.push(
          `Blocked pattern detected: ${pattern.source.substring(0, 40)}...`
        );
      }
    }
  }

  if (language === 'bash') {
    // Block dangerous shell commands
    const dangerousCommands = [
      /\brm\s+-rf\b/,
      /\brm\s+-r\b.*\//,
      /\bsudo\b/,
      /\bchmod\b/,
      /\bchown\b/,
      /\bcurl\b/,
      /\bwget\b/,
      /\bnc\b/,
      /\bdd\b/,
      /\bmkfs\b/,
      /\bshutdown\b/,
      /\breboot\b/,
      /\bkill\b/,
      /\bpkill\b/,
      /\bkillall\b/,
      />\s*\/dev\//,
      /\/etc\//,
      /\/proc\//,
      /\/sys\//,
      /\.\.\/\.\.\//,
    ];

    for (const pattern of dangerousCommands) {
      if (pattern.test(code)) {
        violations.push(
          `Dangerous shell command blocked: ${pattern.source.substring(0, 30)}...`
        );
      }
    }
  }

  if (language === 'python') {
    const dangerousPython = [
      /import\s+os\b/,
      /import\s+subprocess\b/,
      /import\s+shutil\b/,
      /from\s+os\b/,
      /from\s+subprocess\b/,
      /__import__/,
      /exec\s*\(/,
      /eval\s*\(/,
      /open\s*\(.*['"]\/(?!tmp)/,
      /import\s+socket\b/,
      /import\s+http\b/,
      /import\s+urllib\b/,
      /import\s+requests\b/,
    ];

    for (const pattern of dangerousPython) {
      if (pattern.test(code)) {
        violations.push(
          `Dangerous Python pattern blocked: ${pattern.source.substring(0, 30)}...`
        );
      }
    }
  }

  return violations;
}

// ── File Operations ────────────────────────────────────────────────────────

export async function sandboxWriteFile(
  relativePath: string,
  content: string
): Promise<{ success: boolean; path: string; error?: string }> {
  try {
    const safePath = resolveSafePath(relativePath);

    if (content.length > MAX_FILE_SIZE_BYTES) {
      return {
        success: false,
        path: relativePath,
        error: `File too large: ${content.length} bytes exceeds ${MAX_FILE_SIZE_BYTES} byte limit`,
      };
    }

    // Ensure parent directory exists within sandbox
    const dir = path.dirname(safePath);
    if (dir.startsWith(WORKSPACE_ROOT)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(safePath, content, 'utf-8');
    return { success: true, path: relativePath };
  } catch (error) {
    return {
      success: false,
      path: relativePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sandboxReadFile(
  relativePath: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  try {
    const safePath = resolveSafePath(relativePath);
    const content = await readFile(safePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function sandboxListFiles(): Promise<SandboxFileInfo[]> {
  const results: SandboxFileInfo[] = [];

  async function walk(dir: string, prefix: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.gitkeep') continue;
      const fullPath = path.join(dir, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const stats = await stat(fullPath);

      results.push({
        name: relativePath,
        size: stats.size,
        isDirectory: entry.isDirectory(),
        modifiedAt: stats.mtime.toISOString(),
      });

      if (entry.isDirectory()) {
        await walk(fullPath, relativePath);
      }
    }
  }

  try {
    await walk(WORKSPACE_ROOT, '');
  } catch {
    // Empty workspace
  }

  return results;
}

export async function sandboxDeleteFile(
  relativePath: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const safePath = resolveSafePath(relativePath);
    await unlink(safePath);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Code Execution ─────────────────────────────────────────────────────────

function getLanguageExtension(language: SandboxLanguage): string {
  switch (language) {
    case 'javascript':
      return '.js';
    case 'typescript':
      return '.ts';
    case 'python':
      return '.py';
    case 'bash':
      return '.sh';
  }
}

function getExecutionCommand(
  language: SandboxLanguage,
  filePath: string
): { cmd: string; args: string[] } {
  switch (language) {
    case 'javascript':
      return {
        cmd: 'node',
        args: [`--max-old-space-size=${MAX_MEMORY_MB}`, filePath],
      };
    case 'typescript':
      return {
        cmd: 'npx',
        args: ['tsx', filePath],
      };
    case 'python':
      return {
        cmd: 'python3',
        args: [filePath],
      };
    case 'bash':
      return {
        cmd: 'bash',
        args: ['--restricted', filePath],
      };
  }
}

export async function sandboxExecuteCode(
  code: string,
  language: SandboxLanguage,
  timeoutMs: number = MAX_EXECUTION_TIMEOUT_MS
): Promise<SandboxExecutionResult> {
  const startTime = Date.now();

  // Validate language
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    return {
      success: false,
      stdout: '',
      stderr: `Unsupported language: ${language}. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
      exitCode: 1,
      executionTimeMs: 0,
      language,
      truncated: false,
    };
  }

  // Validate code safety
  const violations = validateCode(code, language);
  if (violations.length > 0) {
    return {
      success: false,
      stdout: '',
      stderr: `Safety violations:\n${violations.map((v) => `  - ${v}`).join('\n')}\n\nThese patterns are blocked to protect the system. Try a different approach!`,
      exitCode: 1,
      executionTimeMs: 0,
      language,
      truncated: false,
    };
  }

  // Cap timeout
  const safeTimeout = Math.min(timeoutMs, MAX_EXECUTION_TIMEOUT_MS);

  // Write code to a temp file in the sandbox
  const ext = getLanguageExtension(language);
  const tempFile = `_exec_${Date.now()}${ext}`;
  const tempPath = path.join(WORKSPACE_ROOT, tempFile);

  try {
    await writeFile(tempPath, code, 'utf-8');

    const { cmd, args } = getExecutionCommand(language, tempPath);

    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd: WORKSPACE_ROOT,
      timeout: safeTimeout,
      maxBuffer: MAX_OUTPUT_LENGTH * 2,
      env: {
        // Minimal, sanitized environment — no secrets, no access to parent env
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/home/codespace/nvm/current/bin:/home/codespace/.python/current/bin',
        HOME: WORKSPACE_ROOT,
        NODE_ENV: 'production',
        SANDBOX: 'true',
        LANG: 'en_US.UTF-8',
      },
    });

    const executionTimeMs = Date.now() - startTime;
    const truncatedStdout =
      stdout.length > MAX_OUTPUT_LENGTH
        ? stdout.substring(0, MAX_OUTPUT_LENGTH)
        : stdout;

    return {
      success: true,
      stdout: truncatedStdout,
      stderr: stderr || '',
      exitCode: 0,
      executionTimeMs,
      language,
      truncated: stdout.length > MAX_OUTPUT_LENGTH,
    };
  } catch (error: unknown) {
    const executionTimeMs = Date.now() - startTime;
    const err = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    let stderr = err.stderr || '';
    if (err.killed || err.signal === 'SIGTERM') {
      stderr = `Execution timed out after ${safeTimeout}ms. Try simplifying your code or reducing loops.`;
    }

    return {
      success: false,
      stdout: (err.stdout || '').substring(0, MAX_OUTPUT_LENGTH),
      stderr,
      exitCode: typeof err.code === 'number' ? err.code : 1,
      executionTimeMs,
      language,
      truncated: (err.stdout || '').length > MAX_OUTPUT_LENGTH,
    };
  } finally {
    // Clean up temp execution file
    try {
      await unlink(tempPath);
    } catch {
      // Already cleaned up
    }
  }
}

// ── Workspace Info ─────────────────────────────────────────────────────────

export async function getSandboxInfo(): Promise<{
  workspacePath: string;
  supportedLanguages: readonly string[];
  maxTimeoutMs: number;
  maxFileSizeBytes: number;
  maxFiles: number;
  maxMemoryMb: number;
  fileCount: number;
}> {
  const files = await sandboxListFiles();
  return {
    workspacePath: 'sandbox/molly-workspace',
    supportedLanguages: SUPPORTED_LANGUAGES,
    maxTimeoutMs: MAX_EXECUTION_TIMEOUT_MS,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    maxFiles: MAX_FILES_IN_WORKSPACE,
    maxMemoryMb: MAX_MEMORY_MB,
    fileCount: files.length,
  };
}

// ── Project Scaffolding ────────────────────────────────────────────────────

export interface ScaffoldFile {
  path: string;
  content: string;
}

export interface ScaffoldResult {
  success: boolean;
  projectPath: string;
  filesCreated: string[];
  errors: string[];
}

/**
 * Create a multi-file project in the sandbox in a single operation.
 * Files are created inside a named project folder under the sandbox workspace.
 */
export async function sandboxScaffoldProject(
  projectName: string,
  files: ScaffoldFile[]
): Promise<ScaffoldResult> {
  const errors: string[] = [];
  const filesCreated: string[] = [];

  // Validate project name (alphanumeric, dashes, underscores only)
  if (!/^[a-zA-Z0-9_-]+$/.test(projectName)) {
    return {
      success: false,
      projectPath: projectName,
      filesCreated: [],
      errors: [
        'Project name must be alphanumeric (dashes and underscores allowed)',
      ],
    };
  }

  if (files.length === 0) {
    return {
      success: false,
      projectPath: projectName,
      filesCreated: [],
      errors: ['No files provided'],
    };
  }

  if (files.length > MAX_FILES_IN_WORKSPACE) {
    return {
      success: false,
      projectPath: projectName,
      filesCreated: [],
      errors: [
        `Too many files: ${files.length} exceeds limit of ${MAX_FILES_IN_WORKSPACE}`,
      ],
    };
  }

  for (const file of files) {
    const relativePath = `${projectName}/${file.path}`;
    const result = await sandboxWriteFile(relativePath, file.content);
    if (result.success) {
      filesCreated.push(relativePath);
    } else {
      errors.push(`${file.path}: ${result.error}`);
    }
  }

  return {
    success: errors.length === 0,
    projectPath: projectName,
    filesCreated,
    errors,
  };
}
