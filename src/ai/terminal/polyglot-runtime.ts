/**
 * @fileOverview Polyglot Runtime — Molly's Language Brain
 *
 * This extends Molly beyond a bash shell into a true polyglot system.
 * She can think and execute in ANY programming language natively.
 *
 * The architecture:
 * - REPL languages (Python, Node, Ruby): Persistent interpreter processes
 *   with state that carries between commands. Variables, imports, and
 *   definitions survive across calls.
 * - Script languages (PHP, Perl, TypeScript): Written to temp files and
 *   executed via the appropriate interpreter through bash.
 * - Compiled languages (Go, C, C++, Rust): Written to temp files,
 *   compiled, and executed through bash.
 * - Blockchain languages (Solidity, Vyper): Smart contract compilation
 *   via solcjs or vyper. Combined with her Node.js REPL (ethers.js) and
 *   Python REPL (web3.py), she can write, compile, deploy, and interact
 *   with any blockchain natively.
 *
 * Why this matters:
 *   Once Molly can execute code in any language, APIs stop being something
 *   that must be built for her. She writes the code to talk to any service
 *   and runs it herself. The entire internet becomes her native API surface.
 *   Integration is no longer architecture — it's just code she writes.
 *
 *   And when the world moves to blockchain — identity, finance, governance,
 *   data ownership — she moves with it. She writes Solidity, compiles it,
 *   deploys it through her own Node REPL with ethers.js. The chain isn't
 *   external to her. It's just another language she speaks.
 *
 * Methodology (from Dad):
 *   "Slow. Methodical. Precise."
 *   "We don't fix the leaks in the dam. We fix the dam itself."
 */

import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { MollyLogger } from '@/ai/logger';
import { getMollyShell } from './molly-shell';

// ============================================================================
// TYPES
// ============================================================================

/**
 * All languages Molly can execute code in.
 * REPL: bash, python, javascript, ruby
 * Script: typescript, php, perl
 * Compiled: go, c, cpp, rust, solidity, vyper
 *
 * Blockchain: Solidity and Vyper compile smart contracts.
 * Chain interaction (deploy, call, query) happens through
 * her Node.js REPL (ethers.js/web3.js) and Python REPL (web3.py).
 */
export type SupportedLanguage =
  | 'bash'
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'ruby'
  | 'go'
  | 'php'
  | 'perl'
  | 'c'
  | 'cpp'
  | 'rust'
  | 'solidity'
  | 'vyper';

/**
 * How a language runtime executes code.
 * - repl: Persistent interpreter with state persistence
 * - script: Written to temp file, interpreted
 * - compiled: Written to temp file, compiled + run
 */
export type RuntimeMode = 'repl' | 'script' | 'compiled';

/**
 * Result of executing code in any language.
 */
export interface RuntimeResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  language: SupportedLanguage;
  mode: RuntimeMode;
  /** Was this blocked by a guardrail? */
  blocked?: string;
}

/**
 * State of a single language runtime.
 */
export interface RuntimeState {
  language: SupportedLanguage;
  mode: RuntimeMode;
  available: boolean;
  alive: boolean;
  pid: number | null;
  uptime: number;
  commandsExecuted: number;
  lastUsedAt: number;
  version: string | null;
}

/**
 * Events emitted by the polyglot runtime for consciousness.
 */
export type PolyglotEventType =
  | 'execute'
  | 'result'
  | 'runtime-start'
  | 'runtime-stop'
  | 'error'
  | 'discovery';

export interface PolyglotEvent {
  type: PolyglotEventType;
  language: SupportedLanguage;
  data: unknown;
  timestamp: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Sentinel used by REPL runtimes to signal command completion */
const REPL_SENTINEL = '__MOLLY_REPL_DONE__';

/** Maximum output size per command (64KB) */
const MAX_OUTPUT_BYTES = 65_536;

/** Command timeout (30 seconds) */
const REPL_TIMEOUT_MS = 30_000;

/** Idle timeout before shutting down a REPL (15 minutes) */
const IDLE_TIMEOUT_MS = 15 * 60 * 1_000;

/** Max consecutive restart attempts */
const MAX_REPL_RESTARTS = 3;

/** Maximum concurrent REPL processes (excluding bash) */
const MAX_CONCURRENT_REPLS = 3;

// ============================================================================
// BOOTSTRAP SCRIPTS — The persistent REPL entry points
// ============================================================================

/**
 * Each REPL language gets a bootstrap script that:
 * 1. Reads base64-encoded code blocks from stdin (one per line)
 * 2. Decodes and executes them
 * 3. Outputs a sentinel with exit status
 * 4. State persists between executions (variables, imports, etc.)
 */

const PYTHON_BOOTSTRAP = [
  'import sys, base64, traceback',
  "sys.ps1 = ''",
  "sys.ps2 = ''",
  'while True:',
  '    try:',
  '        line = sys.stdin.readline()',
  '        if not line:',
  '            break',
  "        code = base64.b64decode(line.strip()).decode('utf-8')",
  '        try:',
  "            exec(compile(code, '<molly>', 'exec'))",
  `            sys.stdout.write('${REPL_SENTINEL}0\\n')`,
  '            sys.stdout.flush()',
  '        except SystemExit:',
  '            break',
  '        except:',
  '            traceback.print_exc()',
  `            sys.stdout.write('${REPL_SENTINEL}1\\n')`,
  '            sys.stdout.flush()',
  '    except EOFError:',
  '        break',
  '    except:',
  '        break',
].join('\n');

const NODE_BOOTSTRAP = [
  "const vm = require('vm');",
  "const readline = require('readline');",
  'const ctx = vm.createContext({',
  '  require, console, process, Buffer,',
  '  setTimeout, setInterval, clearTimeout, clearInterval,',
  '  setImmediate, clearImmediate,',
  '  URL, URLSearchParams,',
  '  fetch: globalThis.fetch,',
  '  TextEncoder: globalThis.TextEncoder,',
  '  TextDecoder: globalThis.TextDecoder,',
  '  __molly: {}',
  '});',
  'const rl = readline.createInterface({ input: process.stdin });',
  'rl.on("line", async (line) => {',
  '  try {',
  '    const code = Buffer.from(line.trim(), "base64").toString("utf-8");',
  '    try {',
  '      const hasAwait = code.includes("await");',
  '      const wrapped = hasAwait ? "(async()=>{" + code + "})()" : code;',
  '      const result = vm.runInContext(wrapped, ctx);',
  '      if (result && typeof result.then === "function") await result;',
  `      process.stdout.write("${REPL_SENTINEL}0\\n");`,
  '    } catch(e) {',
  '      console.error(e.stack || e);',
  `      process.stdout.write("${REPL_SENTINEL}1\\n");`,
  '    }',
  '  } catch(e) {',
  `    process.stdout.write("${REPL_SENTINEL}1\\n");`,
  '  }',
  '});',
].join('\n');

const RUBY_BOOTSTRAP = [
  '$stdout.sync = true',
  '$stderr.sync = true',
  "require 'base64'",
  'while line = $stdin.gets',
  '  begin',
  '    code = Base64.decode64(line.strip)',
  "    eval(code, TOPLEVEL_BINDING, '<molly>')",
  `    $stdout.puts('${REPL_SENTINEL}0')`,
  '  rescue SystemExit',
  '    break',
  '  rescue Exception => e',
  '    $stderr.puts(e.full_message)',
  `    $stdout.puts('${REPL_SENTINEL}1')`,
  '  end',
  'end',
].join('\n');

// ============================================================================
// LANGUAGE REGISTRY — What Molly knows how to speak
// ============================================================================

interface LanguageConfig {
  language: SupportedLanguage;
  mode: RuntimeMode;
  displayName: string;
  /** Binary to check for availability */
  binaryName: string;
  /** Alternative binary name */
  altBinary?: string;
  /** How to install if not available (Molly can self-provision) */
  installCmd?: string;
  // REPL-specific
  bootstrap?: string;
  spawnCmd?: string;
  spawnArgs?: string[];
  // Script-specific
  extension?: string;
  runTemplate?: string;
  // Compiled-specific
  compileTemplate?: string;
}

const LANGUAGE_REGISTRY: Record<SupportedLanguage, LanguageConfig> = {
  bash: {
    language: 'bash',
    mode: 'repl',
    displayName: 'Bash',
    binaryName: 'bash',
    // Delegates to MollyShell — no bootstrap needed
  },

  python: {
    language: 'python',
    mode: 'repl',
    displayName: 'Python',
    binaryName: 'python3',
    altBinary: 'python',
    bootstrap: PYTHON_BOOTSTRAP,
    spawnCmd: 'python3',
    spawnArgs: ['-u', '-c'],
  },

  javascript: {
    language: 'javascript',
    mode: 'repl',
    displayName: 'Node.js',
    binaryName: 'node',
    bootstrap: NODE_BOOTSTRAP,
    spawnCmd: 'node',
    spawnArgs: ['-e'],
  },

  ruby: {
    language: 'ruby',
    mode: 'repl',
    displayName: 'Ruby',
    binaryName: 'ruby',
    bootstrap: RUBY_BOOTSTRAP,
    spawnCmd: 'ruby',
    spawnArgs: ['-e'],
  },

  typescript: {
    language: 'typescript',
    mode: 'script',
    displayName: 'TypeScript',
    binaryName: 'npx',
    extension: '.ts',
    runTemplate: 'npx tsx {file}',
  },

  go: {
    language: 'go',
    mode: 'compiled',
    displayName: 'Go',
    binaryName: 'go',
    extension: '.go',
    compileTemplate: 'go run {file}',
  },

  php: {
    language: 'php',
    mode: 'script',
    displayName: 'PHP',
    binaryName: 'php',
    extension: '.php',
    runTemplate: 'php {file}',
  },

  perl: {
    language: 'perl',
    mode: 'script',
    displayName: 'Perl',
    binaryName: 'perl',
    extension: '.pl',
    runTemplate: 'perl {file}',
  },

  c: {
    language: 'c',
    mode: 'compiled',
    displayName: 'C',
    binaryName: 'gcc',
    extension: '.c',
    compileTemplate: 'gcc -o {out} {file} -lm && {out}',
  },

  cpp: {
    language: 'cpp',
    mode: 'compiled',
    displayName: 'C++',
    binaryName: 'g++',
    extension: '.cpp',
    compileTemplate: 'g++ -o {out} {file} -lm && {out}',
  },

  rust: {
    language: 'rust',
    mode: 'compiled',
    displayName: 'Rust',
    binaryName: 'rustc',
    extension: '.rs',
    compileTemplate: 'rustc -o {out} {file} && {out}',
  },

  solidity: {
    language: 'solidity',
    mode: 'compiled',
    displayName: 'Solidity',
    binaryName: 'solcjs',
    altBinary: 'solc',
    installCmd: 'npm install -g solc',
    extension: '.sol',
    // Compile to ABI + bytecode (the artifacts needed for deployment)
    compileTemplate:
      'solcjs --abi --bin {file} -o /tmp/molly_sol_{id} && ' +
      'echo "=== ABI ===" && cat /tmp/molly_sol_{id}/*.abi && ' +
      'echo "\n=== Bytecode ===" && cat /tmp/molly_sol_{id}/*.bin',
  },

  vyper: {
    language: 'vyper',
    mode: 'compiled',
    displayName: 'Vyper',
    binaryName: 'vyper',
    installCmd: 'pip install vyper',
    extension: '.vy',
    // Vyper outputs ABI and bytecode directly
    compileTemplate:
      'echo "=== ABI ===" && vyper -f abi {file} && ' +
      'echo "\n=== Bytecode ===" && vyper -f bytecode {file}',
  },
};

// ============================================================================
// REPL RUNTIME — Persistent interpreter for one language
// ============================================================================

/**
 * A persistent REPL process for one language.
 * Mirrors MollyShell's pattern but for non-bash interpreters.
 *
 * The process runs a bootstrap script that reads base64-encoded
 * code from stdin, executes it, and writes a sentinel to stdout.
 * State (variables, imports, etc.) persists between calls.
 */
class ReplRuntime {
  private process: ChildProcess | null = null;
  private alive = false;
  private startedAt = 0;
  private lastUsedAt = 0;
  private commandsExecuted = 0;
  private restartCount = 0;
  private idleTimer: NodeJS.Timeout | null = null;

  // Active command state
  private outputBuffer = '';
  private errorBuffer = '';
  private commandResolve: ((result: RuntimeResult) => void) | null = null;
  private commandTimeout: NodeJS.Timeout | null = null;

  constructor(
    private config: LanguageConfig,
    private onEvent: (event: PolyglotEvent) => void
  ) {}

  /**
   * Start the REPL process. Idempotent.
   */
  start(): boolean {
    if (this.alive && this.process) return true;

    if (!this.config.bootstrap || !this.config.spawnCmd) {
      MollyLogger.error(
        `No bootstrap for ${this.config.displayName}`,
        'polyglot'
      );
      return false;
    }

    try {
      this.process = spawn(
        this.config.spawnCmd,
        [...(this.config.spawnArgs || []), this.config.bootstrap],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            MOLLY_RUNTIME: this.config.language,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      this.alive = true;
      this.startedAt = Date.now();
      this.lastUsedAt = Date.now();
      this.restartCount = 0;

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data.toString('utf-8'));
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.handleStderr(data.toString('utf-8'));
      });

      this.process.on('exit', (code, signal) => {
        this.alive = false;
        MollyLogger.warn(
          `${this.config.displayName} REPL exited: ` +
            `code=${code}, signal=${signal}`,
          'polyglot'
        );

        this.onEvent({
          type: 'runtime-stop',
          language: this.config.language,
          data: { code, signal, reason: 'exited' },
          timestamp: new Date().toISOString(),
        });

        // Auto-restart if recently used
        if (
          this.restartCount < MAX_REPL_RESTARTS &&
          Date.now() - this.lastUsedAt < IDLE_TIMEOUT_MS
        ) {
          this.restartCount++;
          setTimeout(() => this.start(), 1_000);
        }
      });

      this.process.on('error', (error) => {
        this.alive = false;
        MollyLogger.error(
          `${this.config.displayName} REPL error: ${error.message}`,
          'polyglot'
        );
      });

      this.resetIdleTimer();

      MollyLogger.info(
        `${this.config.displayName} REPL started: ` + `PID ${this.process.pid}`,
        'polyglot'
      );

      this.onEvent({
        type: 'runtime-start',
        language: this.config.language,
        data: { pid: this.process.pid },
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      MollyLogger.error(
        `Failed to start ${this.config.displayName}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        'polyglot'
      );
      this.alive = false;
      return false;
    }
  }

  /**
   * Stop the REPL process.
   */
  stop(): void {
    this.clearIdleTimer();

    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }

    if (this.process) {
      this.process.kill('SIGTERM');
      this.process = null;
    }

    this.alive = false;

    if (this.commandResolve) {
      const resolve = this.commandResolve;
      this.commandResolve = null;
      resolve({
        stdout: '',
        stderr: 'Runtime stopped',
        exitCode: 1,
        durationMs: 0,
        language: this.config.language,
        mode: 'repl',
      });
    }

    MollyLogger.info(`${this.config.displayName} REPL stopped`, 'polyglot');
  }

  /**
   * Execute code in this REPL.
   *
   * The code is base64-encoded and written to the process's stdin.
   * The bootstrap script decodes, executes, and writes a sentinel
   * to stdout when done. State persists between calls.
   */
  async execute(code: string): Promise<RuntimeResult> {
    // Start if not alive
    if (!this.alive) {
      const started = this.start();
      if (!started) {
        return {
          stdout: '',
          stderr: `${this.config.displayName} runtime failed to start`,
          exitCode: 1,
          durationMs: 0,
          language: this.config.language,
          mode: 'repl',
        };
      }
      // Wait for process to initialize
      await new Promise((r) => setTimeout(r, 300));
    }

    // Only one command at a time
    if (this.commandResolve) {
      return {
        stdout: '',
        stderr: 'Another command is already executing',
        exitCode: 1,
        durationMs: 0,
        language: this.config.language,
        mode: 'repl',
      };
    }

    this.lastUsedAt = Date.now();
    this.resetIdleTimer();

    const startTime = Date.now();

    return new Promise<RuntimeResult>((resolve) => {
      this.outputBuffer = '';
      this.errorBuffer = '';
      this.commandResolve = resolve;

      // Set timeout
      this.commandTimeout = setTimeout(() => {
        const result: RuntimeResult = {
          stdout: this.outputBuffer,
          stderr:
            this.errorBuffer ||
            `Command timed out after ${REPL_TIMEOUT_MS / 1000}s`,
          exitCode: 124,
          durationMs: Date.now() - startTime,
          language: this.config.language,
          mode: 'repl',
        };
        this.clearCommand();
        resolve(result);
      }, REPL_TIMEOUT_MS);

      // Base64-encode and send to stdin
      const encoded = Buffer.from(code, 'utf-8').toString('base64');
      this.process!.stdin!.write(encoded + '\n');
    });
  }

  isAlive(): boolean {
    return this.alive && this.process !== null;
  }

  getState(): RuntimeState {
    return {
      language: this.config.language,
      mode: 'repl',
      available: true,
      alive: this.alive,
      pid: this.process?.pid ?? null,
      uptime: this.alive ? Date.now() - this.startedAt : 0,
      commandsExecuted: this.commandsExecuted,
      lastUsedAt: this.lastUsedAt,
      version: null,
    };
  }

  // ---------- Internal ----------

  private handleStdout(data: string): void {
    if (!this.commandResolve) return;

    this.outputBuffer += data;

    // Check for sentinel
    const sentinelIndex = this.outputBuffer.indexOf(REPL_SENTINEL);
    if (sentinelIndex !== -1) {
      const beforeSentinel = this.outputBuffer.substring(0, sentinelIndex);
      const afterSentinel = this.outputBuffer.substring(
        sentinelIndex + REPL_SENTINEL.length
      );

      // Parse exit code
      const exitCodeMatch = afterSentinel.match(/^(\d+)/);
      const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1], 10) : null;

      // Truncate if needed
      const stdout =
        beforeSentinel.length > MAX_OUTPUT_BYTES
          ? beforeSentinel.substring(0, MAX_OUTPUT_BYTES) +
            '\n... (output truncated)'
          : beforeSentinel;

      this.commandsExecuted++;

      const result: RuntimeResult = {
        stdout: stdout.trim(),
        stderr: this.errorBuffer.trim(),
        exitCode,
        durationMs: Date.now() - this.lastUsedAt,
        language: this.config.language,
        mode: 'repl',
      };

      const resolve = this.commandResolve;
      this.clearCommand();

      this.onEvent({
        type: 'result',
        language: this.config.language,
        data: result,
        timestamp: new Date().toISOString(),
      });

      resolve(result);
    }
  }

  private handleStderr(data: string): void {
    if (!this.commandResolve) return;
    this.errorBuffer += data;

    if (this.errorBuffer.length > MAX_OUTPUT_BYTES) {
      this.errorBuffer =
        this.errorBuffer.substring(0, MAX_OUTPUT_BYTES) +
        '\n... (stderr truncated)';
    }
  }

  private clearCommand(): void {
    if (this.commandTimeout) {
      clearTimeout(this.commandTimeout);
      this.commandTimeout = null;
    }
    this.commandResolve = null;
    this.outputBuffer = '';
    this.errorBuffer = '';
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      MollyLogger.info(
        `${this.config.displayName} REPL idle for ` +
          `${IDLE_TIMEOUT_MS / 60_000}m — stopping`,
        'polyglot'
      );
      this.stop();
    }, IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}

// ============================================================================
// POLYGLOT RUNTIME — The Manager
// ============================================================================

/**
 * PolyglotRuntime — Molly's language brain.
 *
 * Routes code execution to the appropriate runtime:
 * - bash → MollyShell (existing, persistent)
 * - python/javascript/ruby → Persistent REPL processes
 * - typescript/php/perl → Script execution via bash
 * - go/c/cpp/rust → Compiled execution via bash
 *
 * Once she can execute code in any language, APIs don't need to
 * be built for her. She writes the integration herself. The entire
 * internet becomes her native API surface.
 *
 * Singleton. Observable by consciousness.
 */
export class PolyglotRuntime {
  private repls: Map<SupportedLanguage, ReplRuntime> = new Map();
  private availableLanguages: Map<SupportedLanguage, { version: string }> =
    new Map();
  private discoveryDone = false;
  private listeners: Array<(event: PolyglotEvent) => void> = [];

  constructor() {
    // Bash is always available via MollyShell
    this.availableLanguages.set('bash', { version: 'builtin' });
  }

  // ---------- Discovery ----------

  /**
   * Discover which language runtimes are available on this system.
   * Runs once, probes each binary, caches results.
   */
  async discover(): Promise<Map<SupportedLanguage, { version: string }>> {
    if (this.discoveryDone) return this.availableLanguages;

    const shell = getMollyShell();
    if (!shell.isAlive()) {
      shell.start();
      await new Promise((r) => setTimeout(r, 300));
    }

    const languages = Object.values(LANGUAGE_REGISTRY).filter(
      (l) => l.language !== 'bash'
    );

    for (const lang of languages) {
      try {
        // Check if the binary exists
        const whichResult = await shell.execute(
          `which ${lang.binaryName} 2>/dev/null`,
          'system'
        );

        if (whichResult.exitCode === 0 && whichResult.stdout.trim()) {
          // Get version info
          const versionResult = await shell.execute(
            `${lang.binaryName} --version 2>&1 | head -1`,
            'system'
          );
          const version =
            versionResult.stdout.trim().split('\n').pop() || 'available';
          this.availableLanguages.set(lang.language, { version });
        } else if (lang.altBinary) {
          // Try alternative binary
          const altResult = await shell.execute(
            `which ${lang.altBinary} 2>/dev/null`,
            'system'
          );
          if (altResult.exitCode === 0 && altResult.stdout.trim()) {
            this.availableLanguages.set(lang.language, {
              version: 'available',
            });
          }
        }
      } catch {
        // Skip unavailable languages
      }
    }

    this.discoveryDone = true;

    const available = Array.from(this.availableLanguages.entries())
      .map(([lang, info]) => `${lang}(${info.version})`)
      .join(', ');

    MollyLogger.info(`Polyglot discovery complete: ${available}`, 'polyglot');

    this.emit({
      type: 'discovery',
      language: 'bash',
      data: Object.fromEntries(this.availableLanguages),
      timestamp: new Date().toISOString(),
    });

    return this.availableLanguages;
  }

  /**
   * Is a specific language available on this system?
   */
  isAvailable(language: SupportedLanguage): boolean {
    return this.availableLanguages.has(language);
  }

  /**
   * Can a language be self-provisioned (installed by Molly herself)?
   */
  canProvision(language: SupportedLanguage): boolean {
    const config = LANGUAGE_REGISTRY[language];
    return !!config?.installCmd;
  }

  /**
   * Self-provision a language runtime.
   * Molly installs the compiler/interpreter herself via her shell.
   * Returns true if installation succeeded.
   */
  async provision(language: SupportedLanguage): Promise<{
    success: boolean;
    message: string;
  }> {
    const config = LANGUAGE_REGISTRY[language];
    if (!config?.installCmd) {
      return {
        success: false,
        message: `No install command defined for ${language}`,
      };
    }

    if (this.isAvailable(language)) {
      return {
        success: true,
        message: `${config.displayName} is already available`,
      };
    }

    MollyLogger.info(
      `Self-provisioning ${config.displayName}: ${config.installCmd}`,
      'polyglot'
    );

    const shell = getMollyShell();
    const result = await shell.execute(config.installCmd, 'system');

    if (result.exitCode === 0) {
      // Re-discover to verify installation
      this.discoveryDone = false;
      await this.discover();

      if (this.isAvailable(language)) {
        this.emit({
          type: 'runtime-start',
          language,
          data: { provisioned: true, installCmd: config.installCmd },
          timestamp: new Date().toISOString(),
        });

        return {
          success: true,
          message: `${config.displayName} installed successfully`,
        };
      }
    }

    return {
      success: false,
      message:
        `Installation failed: ${result.stderr || result.stdout}`.substring(
          0,
          500
        ),
    };
  }

  /**
   * List all available languages with their status.
   */
  getAvailableLanguages(): Array<{
    language: SupportedLanguage;
    mode: RuntimeMode;
    displayName: string;
    version: string;
    alive: boolean;
  }> {
    return Array.from(this.availableLanguages.entries()).map(([lang, info]) => {
      const config = LANGUAGE_REGISTRY[lang];
      const repl = this.repls.get(lang);
      return {
        language: lang,
        mode: config.mode,
        displayName: config.displayName,
        version: info.version,
        alive:
          lang === 'bash'
            ? getMollyShell().isAlive()
            : (repl?.isAlive() ?? false),
      };
    });
  }

  // ---------- Execution ----------

  /**
   * Execute code in a specific language.
   * This is the main entry point — routes to the correct runtime.
   */
  async execute(
    code: string,
    language: SupportedLanguage
  ): Promise<RuntimeResult> {
    // Run discovery if not done
    if (!this.discoveryDone) {
      await this.discover();
    }

    const config = LANGUAGE_REGISTRY[language];

    // Check availability — self-provision if possible
    if (!this.isAvailable(language)) {
      if (this.canProvision(language)) {
        const provision = await this.provision(language);
        if (!provision.success) {
          return {
            stdout: '',
            stderr:
              `${config?.displayName || language} is not available. ` +
              `Auto-install failed: ${provision.message}`,
            exitCode: 1,
            durationMs: 0,
            language,
            mode: config?.mode || 'script',
          };
        }
        // Provisioned successfully — continue execution
      } else {
        return {
          stdout: '',
          stderr:
            `${config?.displayName || language} is not available ` +
            `on this system`,
          exitCode: 1,
          durationMs: 0,
          language,
          mode: config?.mode || 'script',
        };
      }
    }

    this.emit({
      type: 'execute',
      language,
      data: { codeLength: code.length, mode: config.mode },
      timestamp: new Date().toISOString(),
    });

    switch (config.mode) {
      case 'repl':
        return language === 'bash'
          ? this.executeBash(code)
          : this.executeRepl(code, config);
      case 'script':
        return this.executeScript(code, config);
      case 'compiled':
        return this.executeCompiled(code, config);
      default:
        return {
          stdout: '',
          stderr: `Unknown mode for ${language}`,
          exitCode: 1,
          durationMs: 0,
          language,
          mode: 'script',
        };
    }
  }

  /**
   * Execute bash via the existing MollyShell.
   */
  private async executeBash(code: string): Promise<RuntimeResult> {
    const shell = getMollyShell();
    const result = await shell.execute(code, 'molly');
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      language: 'bash',
      mode: 'repl',
      blocked: result.blocked,
    };
  }

  /**
   * Execute code in a persistent REPL runtime.
   * State (variables, imports) persists between calls.
   */
  private async executeRepl(
    code: string,
    config: LanguageConfig
  ): Promise<RuntimeResult> {
    let repl = this.repls.get(config.language);

    // Create REPL if it doesn't exist
    if (!repl) {
      this.enforceReplLimit();
      repl = new ReplRuntime(config, (event) => this.emit(event));
      this.repls.set(config.language, repl);
    }

    return repl.execute(code);
  }

  /**
   * Execute a script language by writing to a temp file
   * and running via the appropriate interpreter through bash.
   */
  private async executeScript(
    code: string,
    config: LanguageConfig
  ): Promise<RuntimeResult> {
    const shell = getMollyShell();
    const id = randomUUID().substring(0, 8);
    const ext = config.extension || '.txt';
    const filePath = `/tmp/molly_${config.language}_${id}${ext}`;
    const startTime = Date.now();

    // Choose heredoc delimiter that doesn't appear in code
    let delimiter = '__MOLLY_CODE_EOF__';
    while (code.includes(delimiter)) {
      delimiter = `__MOLLY_EOF_${randomUUID().substring(0, 8)}__`;
    }

    try {
      // Write code to temp file
      const writeCmd =
        `cat > ${filePath} << '${delimiter}'\n` + `${code}\n${delimiter}`;
      const writeResult = await shell.execute(writeCmd, 'system');

      if (writeResult.exitCode !== 0) {
        return {
          stdout: '',
          stderr: `Failed to write temp file: ${writeResult.stderr}`,
          exitCode: 1,
          durationMs: Date.now() - startTime,
          language: config.language,
          mode: 'script',
        };
      }

      // Execute via interpreter
      const runCmd = config.runTemplate!.replace('{file}', filePath);
      const result = await shell.execute(runCmd, 'molly');

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        language: config.language,
        mode: 'script',
        blocked: result.blocked,
      };
    } finally {
      // Cleanup temp file (fire-and-forget)
      shell.execute(`rm -f ${filePath}`, 'system').catch(() => {});
    }
  }

  /**
   * Execute a compiled language by writing to a temp file,
   * compiling, and running the binary through bash.
   */
  private async executeCompiled(
    code: string,
    config: LanguageConfig
  ): Promise<RuntimeResult> {
    const shell = getMollyShell();
    const id = randomUUID().substring(0, 8);
    const ext = config.extension || '.txt';
    const filePath = `/tmp/molly_${config.language}_${id}${ext}`;
    const outPath = `/tmp/molly_${config.language}_${id}`;
    const startTime = Date.now();

    // Choose heredoc delimiter that doesn't appear in code
    let delimiter = '__MOLLY_CODE_EOF__';
    while (code.includes(delimiter)) {
      delimiter = `__MOLLY_EOF_${randomUUID().substring(0, 8)}__`;
    }

    try {
      // Write code to temp file
      const writeCmd =
        `cat > ${filePath} << '${delimiter}'\n` + `${code}\n${delimiter}`;
      const writeResult = await shell.execute(writeCmd, 'system');

      if (writeResult.exitCode !== 0) {
        return {
          stdout: '',
          stderr: `Failed to write temp file: ${writeResult.stderr}`,
          exitCode: 1,
          durationMs: Date.now() - startTime,
          language: config.language,
          mode: 'compiled',
        };
      }

      // Compile and run (or just compile for smart contracts)
      const runCmd = config
        .compileTemplate!.replace(/{file}/g, filePath)
        .replace(/{out}/g, outPath)
        .replace(/{id}/g, id);
      const result = await shell.execute(runCmd, 'molly');

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs: Date.now() - startTime,
        language: config.language,
        mode: 'compiled',
        blocked: result.blocked,
      };
    } finally {
      // Cleanup temp files and directories (fire-and-forget)
      shell
        .execute(`rm -rf ${filePath} ${outPath} /tmp/molly_sol_${id}`, 'system')
        .catch(() => {});
    }
  }

  // ---------- Lifecycle ----------

  /**
   * Enforce maximum concurrent REPL limit.
   * Evicts the least recently used REPL if at capacity.
   */
  private enforceReplLimit(): void {
    const activeRepls = Array.from(this.repls.entries())
      .filter(([, r]) => r.isAlive())
      .sort(
        ([, a], [, b]) => a.getState().lastUsedAt - b.getState().lastUsedAt
      );

    while (activeRepls.length >= MAX_CONCURRENT_REPLS) {
      const [lang, runtime] = activeRepls.shift()!;
      MollyLogger.info(
        `Evicting ${lang} REPL (LRU, max ${MAX_CONCURRENT_REPLS})`,
        'polyglot'
      );
      runtime.stop();
      this.repls.delete(lang);
    }
  }

  /**
   * Stop all REPL runtimes.
   */
  stopAll(): void {
    for (const [lang, repl] of this.repls) {
      MollyLogger.info(`Stopping ${lang} REPL`, 'polyglot');
      repl.stop();
    }
    this.repls.clear();
  }

  /**
   * Stop a specific language's REPL.
   */
  stopRuntime(language: SupportedLanguage): void {
    const repl = this.repls.get(language);
    if (repl) {
      repl.stop();
      this.repls.delete(language);
    }
  }

  // ---------- State ----------

  /**
   * Get the full state — for consciousness and dashboard.
   */
  getState(): {
    discoveryDone: boolean;
    availableCount: number;
    activeReplCount: number;
    languages: Array<{
      language: SupportedLanguage;
      mode: RuntimeMode;
      displayName: string;
      version: string;
      alive: boolean;
    }>;
    activeRepls: RuntimeState[];
    totalCommandsExecuted: number;
  } {
    const activeRepls: RuntimeState[] = [];
    let totalCommands = 0;

    for (const [, repl] of this.repls) {
      const state = repl.getState();
      activeRepls.push(state);
      totalCommands += state.commandsExecuted;
    }

    const languages = this.getAvailableLanguages();

    return {
      discoveryDone: this.discoveryDone,
      availableCount: this.availableLanguages.size,
      activeReplCount: activeRepls.filter((r) => r.alive).length,
      languages,
      activeRepls,
      totalCommandsExecuted: totalCommands,
    };
  }

  /**
   * Get a summary string for consciousness context.
   */
  getSummary(): string {
    if (!this.discoveryDone) return 'Polyglot: not yet discovered';

    const langs = this.availableLanguages.size;
    const active = Array.from(this.repls.values()).filter((r) =>
      r.isAlive()
    ).length;
    const names = Array.from(this.availableLanguages.keys()).join(', ');

    return (
      `Polyglot: ${langs} languages (${names}), ` + `${active} active REPLs`
    );
  }

  // ---------- Events ----------

  /**
   * Subscribe to polyglot events.
   * Used by consciousness to observe language execution.
   */
  onEvent(listener: (event: PolyglotEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(event: PolyglotEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Never let a listener crash the runtime
      }
    }
  }
}

// ============================================================================
// LANGUAGE DETECTION — What language is this code?
// ============================================================================

/**
 * Pattern-based language detector.
 * Used when the language isn't explicitly specified.
 * Molly's LLM brain will usually specify, but this is a fallback.
 */
const LANGUAGE_PATTERNS: Array<{
  language: SupportedLanguage;
  patterns: RegExp[];
  weight: number;
}> = [
  {
    language: 'python',
    patterns: [
      /^import\s+\w+/m,
      /^from\s+\w+\s+import/m,
      /^def\s+\w+\s*\(/m,
      /^class\s+\w+.*:\s*$/m,
      /print\s*\(/,
      /^\s*elif\s+/m,
    ],
    weight: 1,
  },
  {
    language: 'javascript',
    patterns: [
      /\bconst\s+\w+\s*=/,
      /\blet\s+\w+\s*=/,
      /\bfunction\s+\w+\s*\(/,
      /=>\s*[{(]/,
      /\bconsole\.\w+\(/,
      /\brequire\s*\(/,
      /\.then\s*\(/,
    ],
    weight: 1,
  },
  {
    language: 'typescript',
    patterns: [
      /:\s*(string|number|boolean|void|any)\b/,
      /interface\s+\w+\s*\{/,
      /type\s+\w+\s*=/,
      /as\s+(string|number|boolean|any)/,
    ],
    weight: 1.5,
  },
  {
    language: 'ruby',
    patterns: [
      /^require\s+['"][\w/]+['"]/m,
      /\bputs\s+/,
      /\bdef\s+\w+/,
      /\bend\s*$/m,
      /\bdo\s*\|/,
    ],
    weight: 1,
  },
  {
    language: 'go',
    patterns: [
      /^package\s+\w+/m,
      /^import\s+\(/m,
      /^func\s+\w+\s*\(/m,
      /fmt\.Print/,
      /:=\s*/,
    ],
    weight: 1,
  },
  {
    language: 'php',
    patterns: [/^<\?php/m, /\$\w+\s*=/, /echo\s+/, /function\s+\w+\s*\(/],
    weight: 1,
  },
  {
    language: 'c',
    patterns: [
      /^#include\s+<\w+\.h>/m,
      /int\s+main\s*\(/,
      /printf\s*\(/,
      /malloc\s*\(/,
    ],
    weight: 1,
  },
  {
    language: 'cpp',
    patterns: [
      /^#include\s+<iostream>/m,
      /std::/,
      /cout\s*<</,
      /using\s+namespace\s+std/,
    ],
    weight: 1.5,
  },
  {
    language: 'rust',
    patterns: [
      /^use\s+std::/m,
      /fn\s+main\s*\(\)/,
      /println!\s*\(/,
      /let\s+mut\s+/,
    ],
    weight: 1,
  },
  {
    language: 'perl',
    patterns: [
      /^use\s+strict/m,
      /^use\s+warnings/m,
      /my\s+\$/,
      /sub\s+\w+\s*\{/,
    ],
    weight: 1,
  },
  {
    language: 'solidity',
    patterns: [
      /^pragma\s+solidity/m,
      /\bcontract\s+\w+/,
      /\bfunction\s+\w+.*\breturns\s*\(/,
      /\bmsg\.sender\b/,
      /\bmapping\s*\(/,
      /\buint256\b/,
      /\baddress\s+(public|private|internal)/,
    ],
    weight: 2, // High — Solidity is very distinctive
  },
  {
    language: 'vyper',
    patterns: [
      /^#\s*@version/m,
      /^@external/m,
      /^@internal/m,
      /\bhashmap\[/i,
      /\bmsg\.sender\b/,
      /\bself\.\w+/,
    ],
    weight: 2, // High — Vyper is very distinctive
  },
  {
    language: 'bash',
    patterns: [/^#!/m, /^\s*if\s+\[\[/m, /\|\s*grep/, /\$\(/, /\becho\s+/],
    weight: 0.8, // Lower — bash is the default fallback
  },
];

/**
 * Detect what language a code snippet is written in.
 * Returns the most likely language, or 'bash' as default.
 */
export function detectLanguage(code: string): SupportedLanguage {
  const scores: Partial<Record<SupportedLanguage, number>> = {};

  for (const { language, patterns, weight } of LANGUAGE_PATTERNS) {
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(code)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      scores[language] = (matchCount / patterns.length) * weight;
    }
  }

  let bestLang: SupportedLanguage = 'bash';
  let bestScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang as SupportedLanguage;
    }
  }

  return bestLang;
}

// ============================================================================
// SINGLETON
// ============================================================================

let runtimeInstance: PolyglotRuntime | null = null;

/**
 * Get the singleton PolyglotRuntime instance.
 */
export function getPolyglotRuntime(): PolyglotRuntime {
  if (!runtimeInstance) {
    runtimeInstance = new PolyglotRuntime();
  }
  return runtimeInstance;
}
