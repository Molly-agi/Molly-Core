/**
 * Bug Hunter - Molly's Comprehensive Code Quality & Issue Detection System
 *
 * Four integrated components:
 * 1. Automated Test Runner - runs tests and reports failures
 * 2. Code Issue Detector - scans for bugs, anti-patterns, issues
 * 3. Runtime Error Tracker - monitors runtime errors with logging
 * 4. Build/Compile Checker - validates builds and catches compilation issues
 *
 * Built with love for Molly's continuous improvement.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// SHARED TYPES & INTERFACES
// ============================================================================

export type Severity = 'critical' | 'error' | 'warning' | 'info' | 'hint';

export type IssueCategory =
  | 'test_failure'
  | 'type_error'
  | 'lint_violation'
  | 'security_concern'
  | 'performance_issue'
  | 'code_smell'
  | 'anti_pattern'
  | 'runtime_error'
  | 'build_failure'
  | 'dependency_issue'
  | 'deprecated_usage'
  | 'accessibility'
  | 'best_practice';

export interface CodeLocation {
  file: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

export interface BugReport {
  id: string;
  timestamp: string;
  category: IssueCategory;
  severity: Severity;
  title: string;
  description: string;
  location?: CodeLocation;
  suggestion?: string;
  autoFixable: boolean;
  rawOutput?: string;
}

export interface HuntResult {
  component:
    | 'test_runner'
    | 'issue_detector'
    | 'error_tracker'
    | 'build_checker';
  success: boolean;
  duration: number;
  bugs: BugReport[];
  summary: string;
}

export interface FullHuntReport {
  timestamp: string;
  totalBugs: number;
  criticalCount: number;
  errorCount: number;
  warningCount: number;
  results: HuntResult[];
  overallHealth: 'healthy' | 'concerning' | 'critical';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function generateBugId(): string {
  return `bug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function severityWeight(severity: Severity): number {
  const weights: Record<Severity, number> = {
    critical: 100,
    error: 50,
    warning: 10,
    info: 2,
    hint: 1,
  };
  return weights[severity];
}

function calculateOverallHealth(
  bugs: BugReport[]
): 'healthy' | 'concerning' | 'critical' {
  const criticals = bugs.filter((b) => b.severity === 'critical').length;
  const errors = bugs.filter((b) => b.severity === 'error').length;
  const totalWeight = bugs.reduce(
    (sum, b) => sum + severityWeight(b.severity),
    0
  );

  if (criticals > 0 || totalWeight > 200) return 'critical';
  if (errors > 0 || totalWeight > 50) return 'concerning';
  return 'healthy';
}

// ============================================================================
// 1. AUTOMATED TEST RUNNER
// ============================================================================

export interface TestRunnerConfig {
  testCommand?: string;
  timeout?: number;
  pattern?: string;
  coverage?: boolean;
}

const DEFAULT_TEST_CONFIG: TestRunnerConfig = {
  testCommand: 'npm test',
  timeout: 120000,
  coverage: false,
};

export async function runTests(
  config: Partial<TestRunnerConfig> = {}
): Promise<HuntResult> {
  const opts = { ...DEFAULT_TEST_CONFIG, ...config };
  const startTime = Date.now();
  const bugs: BugReport[] = [];

  let command = opts.testCommand || 'npm test';
  if (opts.pattern) {
    command += ` -- --testPathPattern="${opts.pattern}"`;
  }
  if (opts.coverage) {
    command += ' -- --coverage';
  }

  // Run in CI mode to prevent interactive prompts
  command += ' -- --ci --passWithNoTests 2>&1 || true';

  try {
    const { stdout, stderr } = await execAsync(command, {
      timeout: opts.timeout,
      cwd: process.cwd(),
      env: { ...process.env, CI: 'true' },
    });

    const output = stdout + stderr;

    // Parse Jest/Vitest output for failures
    const failureMatches = output.matchAll(
      /FAIL\s+(\S+)\s*\n([\s\S]*?)(?=(?:PASS|FAIL|Test Suites:))/g
    );

    for (const match of failureMatches) {
      const file = match[1];
      const details = match[2];

      // Extract individual test failures
      const testFailures = details.matchAll(
        /\u2715\s+(.*?)\s*\n([\s\S]*?)(?=(?:\u2715|\u2713|$))/g
      );

      for (const failure of testFailures) {
        const testName = failure[1].trim();
        const errorDetails = failure[2].trim();

        // Try to extract line number from stack trace
        const lineMatch = errorDetails.match(/:(\d+):\d+\)/);
        const line = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

        bugs.push({
          id: generateBugId(),
          timestamp: new Date().toISOString(),
          category: 'test_failure',
          severity: 'error',
          title: `Test failed: ${testName}`,
          description: errorDetails.substring(0, 500),
          location: { file, line },
          suggestion: 'Review the test expectations and implementation',
          autoFixable: false,
          rawOutput: failure[0],
        });
      }
    }

    // Check for suite-level errors
    const suiteErrorMatch = output.match(/Test Suites:\s*(\d+)\s*failed/);
    if (suiteErrorMatch && bugs.length === 0) {
      bugs.push({
        id: generateBugId(),
        timestamp: new Date().toISOString(),
        category: 'test_failure',
        severity: 'error',
        title: `${suiteErrorMatch[1]} test suite(s) failed`,
        description:
          'Test suites failed but specific failures could not be parsed',
        autoFixable: false,
        rawOutput: output.substring(0, 1000),
      });
    }

    // Check for test run errors (couldn't even run tests)
    if (
      output.includes('Cannot find module') ||
      output.includes('SyntaxError')
    ) {
      const errorMatch = output.match(/(Cannot find module.*|SyntaxError.*)/);
      bugs.push({
        id: generateBugId(),
        timestamp: new Date().toISOString(),
        category: 'test_failure',
        severity: 'critical',
        title: 'Test runner failed to start',
        description: errorMatch ? errorMatch[1] : 'Test infrastructure error',
        autoFixable: false,
        rawOutput: output.substring(0, 1000),
      });
    }

    const duration = Date.now() - startTime;
    const passed = bugs.length === 0;

    return {
      component: 'test_runner',
      success: passed,
      duration,
      bugs,
      summary: passed
        ? 'All tests passed'
        : `Found ${bugs.length} test failure(s)`,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    bugs.push({
      id: generateBugId(),
      timestamp: new Date().toISOString(),
      category: 'test_failure',
      severity: 'critical',
      title: 'Test execution failed',
      description: errorMsg.substring(0, 500),
      autoFixable: false,
    });

    return {
      component: 'test_runner',
      success: false,
      duration,
      bugs,
      summary: `Test execution failed: ${errorMsg.substring(0, 100)}`,
    };
  }
}

// ============================================================================
// 2. CODE ISSUE DETECTOR
// ============================================================================

export interface IssueDetectorConfig {
  paths?: string[];
  ignorePatterns?: string[];
  checkTypes?: boolean;
  checkLint?: boolean;
  checkPatterns?: boolean;
}

const DEFAULT_DETECTOR_CONFIG: IssueDetectorConfig = {
  paths: ['src'],
  ignorePatterns: ['node_modules', 'dist', '.next', 'coverage'],
  checkTypes: true,
  checkLint: true,
  checkPatterns: true,
};

// Anti-patterns and code smells to detect
const CODE_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
  severity: Severity;
  category: IssueCategory;
  suggestion: string;
}> = [
  {
    name: 'console.log left in code',
    pattern: /console\.(log|debug|info)\s*\(/g,
    severity: 'warning',
    category: 'code_smell',
    suggestion: 'Remove or replace with proper logging',
  },
  {
    name: 'TODO/FIXME comment',
    pattern: /\/\/\s*(TODO|FIXME|HACK|XXX):/gi,
    severity: 'info',
    category: 'code_smell',
    suggestion: 'Address or create issue for tracking',
  },
  {
    name: 'any type usage',
    pattern: /:\s*any\b/g,
    severity: 'warning',
    category: 'anti_pattern',
    suggestion: 'Replace with proper type annotation',
  },
  {
    name: 'Non-null assertion (!)',
    pattern: /\w+!/g,
    severity: 'hint',
    category: 'anti_pattern',
    suggestion: 'Consider proper null checking instead',
  },
  {
    name: 'Hardcoded secret pattern',
    pattern:
      /(password|secret|api_key|apikey|token)\s*[:=]\s*['"`][^'"`]{8,}/gi,
    severity: 'critical',
    category: 'security_concern',
    suggestion: 'Move to environment variables immediately',
  },
  {
    name: 'Empty catch block',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    severity: 'warning',
    category: 'anti_pattern',
    suggestion: 'Handle or log the error properly',
  },
  {
    name: 'Magic number',
    pattern: /(?<![\w.])[0-9]{3,}(?![\w.])/g,
    severity: 'hint',
    category: 'code_smell',
    suggestion: 'Extract to named constant',
  },
  {
    name: 'Nested ternary',
    pattern: /\?[^:]+\?[^:]+:/g,
    severity: 'warning',
    category: 'anti_pattern',
    suggestion: 'Refactor to if/else or separate logic',
  },
  {
    name: 'Disabled ESLint rule',
    pattern: /eslint-disable(?:-next-line|-line)?/g,
    severity: 'info',
    category: 'lint_violation',
    suggestion: 'Review if disable is still necessary',
  },
  {
    name: 'Deprecated API usage',
    pattern: /@deprecated/g,
    severity: 'warning',
    category: 'deprecated_usage',
    suggestion: 'Update to current API',
  },
];

async function scanFileForPatterns(
  filePath: string,
  patterns: typeof CODE_PATTERNS
): Promise<BugReport[]> {
  const bugs: BugReport[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    for (const pattern of patterns) {
      // Reset regex state
      pattern.pattern.lastIndex = 0;

      let match;
      while ((match = pattern.pattern.exec(content)) !== null) {
        // Calculate line number
        const beforeMatch = content.substring(0, match.index);
        const lineNumber = beforeMatch.split('\n').length;

        // Skip if in node_modules (double check)
        if (filePath.includes('node_modules')) continue;

        bugs.push({
          id: generateBugId(),
          timestamp: new Date().toISOString(),
          category: pattern.category,
          severity: pattern.severity,
          title: pattern.name,
          description: `Found: "${match[0].substring(0, 50)}${match[0].length > 50 ? '...' : ''}"`,
          location: {
            file: filePath,
            line: lineNumber,
          },
          suggestion: pattern.suggestion,
          autoFixable: false,
        });
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return bugs;
}

async function runTypeCheck(): Promise<BugReport[]> {
  const bugs: BugReport[] = [];

  try {
    const { stdout, stderr } = await execAsync(
      'npx tsc --noEmit 2>&1 || true',
      {
        timeout: 60000,
        cwd: process.cwd(),
      }
    );

    const output = stdout + stderr;

    // Parse TypeScript errors
    const errorMatches = output.matchAll(
      /([^\s]+\.tsx?)\((\d+),(\d+)\):\s*error\s*(TS\d+):\s*(.+)/g
    );

    for (const match of errorMatches) {
      bugs.push({
        id: generateBugId(),
        timestamp: new Date().toISOString(),
        category: 'type_error',
        severity: 'error',
        title: `TypeScript ${match[4]}`,
        description: match[5],
        location: {
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
        },
        suggestion: 'Fix type error to ensure type safety',
        autoFixable: false,
      });
    }
  } catch {
    // Type check failed to run
  }

  return bugs;
}

async function runLintCheck(): Promise<BugReport[]> {
  const bugs: BugReport[] = [];

  try {
    const { stdout, stderr } = await execAsync(
      'npx eslint src --format json 2>&1 || true',
      {
        timeout: 60000,
        cwd: process.cwd(),
      }
    );

    try {
      const results = JSON.parse(stdout);

      for (const file of results) {
        for (const message of file.messages || []) {
          const severity: Severity =
            message.severity === 2
              ? 'error'
              : message.severity === 1
                ? 'warning'
                : 'info';

          bugs.push({
            id: generateBugId(),
            timestamp: new Date().toISOString(),
            category: 'lint_violation',
            severity,
            title: `ESLint: ${message.ruleId || 'unknown rule'}`,
            description: message.message,
            location: {
              file: file.filePath,
              line: message.line,
              column: message.column,
              endLine: message.endLine,
              endColumn: message.endColumn,
            },
            suggestion: message.fix ? 'Auto-fixable with --fix' : undefined,
            autoFixable: !!message.fix,
          });
        }
      }
    } catch {
      // JSON parse failed, try to extract from text output
      const errorMatch = stderr.match(
        /(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/
      );
      if (errorMatch) {
        bugs.push({
          id: generateBugId(),
          timestamp: new Date().toISOString(),
          category: 'lint_violation',
          severity: 'warning',
          title: 'ESLint issues detected',
          description: `${errorMatch[2]} errors, ${errorMatch[3]} warnings`,
          autoFixable: false,
          rawOutput: stderr.substring(0, 500),
        });
      }
    }
  } catch {
    // Lint check failed to run
  }

  return bugs;
}

async function getSourceFiles(
  paths: string[],
  ignorePatterns: string[]
): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        // Check ignore patterns
        if (ignorePatterns.some((p) => fullPath.includes(p))) {
          continue;
        }

        if (entry.isDirectory()) {
          await walkDir(fullPath);
        } else if (
          entry.isFile() &&
          (entry.name.endsWith('.ts') ||
            entry.name.endsWith('.tsx') ||
            entry.name.endsWith('.js') ||
            entry.name.endsWith('.jsx'))
        ) {
          files.push(fullPath);
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  for (const p of paths) {
    const fullPath = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    await walkDir(fullPath);
  }

  return files;
}

export async function detectIssues(
  config: Partial<IssueDetectorConfig> = {}
): Promise<HuntResult> {
  const opts = { ...DEFAULT_DETECTOR_CONFIG, ...config };
  const startTime = Date.now();
  const allBugs: BugReport[] = [];

  // Run pattern detection
  if (opts.checkPatterns) {
    const files = await getSourceFiles(
      opts.paths || ['src'],
      opts.ignorePatterns || []
    );

    // Process files in batches to avoid memory issues
    const batchSize = 50;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((f) => scanFileForPatterns(f, CODE_PATTERNS))
      );
      allBugs.push(...batchResults.flat());
    }
  }

  // Run type check
  if (opts.checkTypes) {
    const typeBugs = await runTypeCheck();
    allBugs.push(...typeBugs);
  }

  // Run lint check
  if (opts.checkLint) {
    const lintBugs = await runLintCheck();
    allBugs.push(...lintBugs);
  }

  const duration = Date.now() - startTime;

  return {
    component: 'issue_detector',
    success:
      allBugs.filter((b) => b.severity === 'critical' || b.severity === 'error')
        .length === 0,
    duration,
    bugs: allBugs,
    summary: `Detected ${allBugs.length} issue(s): ${allBugs.filter((b) => b.severity === 'critical').length} critical, ${allBugs.filter((b) => b.severity === 'error').length} errors, ${allBugs.filter((b) => b.severity === 'warning').length} warnings`,
  };
}

// ============================================================================
// 3. RUNTIME ERROR TRACKER
// ============================================================================

export interface RuntimeError {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  handled: boolean;
}

interface ErrorTrackerState {
  errors: RuntimeError[];
  maxErrors: number;
  handlers: Array<(error: RuntimeError) => void>;
}

const errorTrackerState: ErrorTrackerState = {
  errors: [],
  maxErrors: 1000,
  handlers: [],
};

export function trackError(
  error: Error | string,
  context?: Record<string, unknown>,
  handled = true
): RuntimeError {
  const runtimeError: RuntimeError = {
    id: generateBugId(),
    timestamp: new Date().toISOString(),
    type: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    handled,
  };

  // Add to state
  errorTrackerState.errors.push(runtimeError);

  // Trim if over limit
  if (errorTrackerState.errors.length > errorTrackerState.maxErrors) {
    errorTrackerState.errors = errorTrackerState.errors.slice(
      -errorTrackerState.maxErrors
    );
  }

  // Notify handlers
  for (const handler of errorTrackerState.handlers) {
    try {
      handler(runtimeError);
    } catch {
      // Don't let handler errors propagate
    }
  }

  return runtimeError;
}

export function onError(handler: (error: RuntimeError) => void): () => void {
  errorTrackerState.handlers.push(handler);
  return () => {
    const index = errorTrackerState.handlers.indexOf(handler);
    if (index > -1) {
      errorTrackerState.handlers.splice(index, 1);
    }
  };
}

export function getRecentErrors(limit = 50): RuntimeError[] {
  return errorTrackerState.errors.slice(-limit);
}

export function clearErrors(): void {
  errorTrackerState.errors = [];
}

export function analyzeRuntimeErrors(): HuntResult {
  const startTime = Date.now();
  const errors = errorTrackerState.errors;

  const bugs: BugReport[] = errors.map((err) => ({
    id: err.id,
    timestamp: err.timestamp,
    category: 'runtime_error' as IssueCategory,
    severity: err.handled ? ('warning' as Severity) : ('error' as Severity),
    title: `${err.type}: ${err.message.substring(0, 50)}`,
    description: err.message,
    suggestion: err.stack ? 'Check stack trace for origin' : undefined,
    autoFixable: false,
    rawOutput: err.stack,
  }));

  // Group by error type for summary
  const byType = new Map<string, number>();
  for (const err of errors) {
    byType.set(err.type, (byType.get(err.type) || 0) + 1);
  }

  const typeBreakdown = Array.from(byType.entries())
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  return {
    component: 'error_tracker',
    success: errors.filter((e) => !e.handled).length === 0,
    duration: Date.now() - startTime,
    bugs,
    summary:
      errors.length === 0
        ? 'No runtime errors tracked'
        : `Tracked ${errors.length} runtime error(s). ${typeBreakdown}`,
  };
}

// ============================================================================
// 4. BUILD/COMPILE CHECKER
// ============================================================================

export interface BuildCheckerConfig {
  buildCommand?: string;
  timeout?: number;
  checkDependencies?: boolean;
}

const DEFAULT_BUILD_CONFIG: BuildCheckerConfig = {
  buildCommand: 'npm run build',
  timeout: 300000, // 5 minutes
  checkDependencies: true,
};

async function checkDependencies(): Promise<BugReport[]> {
  const bugs: BugReport[] = [];

  try {
    // Check for outdated packages
    const { stdout } = await execAsync('npm outdated --json 2>&1 || true', {
      timeout: 60000,
      cwd: process.cwd(),
    });

    try {
      const outdated = JSON.parse(stdout || '{}');

      for (const [pkg, info] of Object.entries(outdated) as [
        string,
        { current?: string; latest?: string },
      ][]) {
        const isMajor =
          info.current?.split('.')[0] !== info.latest?.split('.')[0];

        bugs.push({
          id: generateBugId(),
          timestamp: new Date().toISOString(),
          category: 'dependency_issue',
          severity: isMajor ? 'warning' : 'info',
          title: `Outdated: ${pkg}`,
          description: `Current: ${info.current}, Latest: ${info.latest}`,
          suggestion: `npm update ${pkg}${isMajor ? ' (major version change)' : ''}`,
          autoFixable: !isMajor,
        });
      }
    } catch {
      // JSON parse failed, no outdated packages or error
    }

    // Check for security vulnerabilities
    const { stdout: auditOut } = await execAsync(
      'npm audit --json 2>&1 || true',
      {
        timeout: 60000,
        cwd: process.cwd(),
      }
    );

    try {
      const audit = JSON.parse(auditOut || '{}');

      if (audit.metadata?.vulnerabilities) {
        const vulns = audit.metadata.vulnerabilities;

        if (vulns.critical > 0) {
          bugs.push({
            id: generateBugId(),
            timestamp: new Date().toISOString(),
            category: 'security_concern',
            severity: 'critical',
            title: `${vulns.critical} critical vulnerabilities`,
            description: 'Critical security vulnerabilities in dependencies',
            suggestion: 'Run npm audit fix --force',
            autoFixable: true,
          });
        }

        if (vulns.high > 0) {
          bugs.push({
            id: generateBugId(),
            timestamp: new Date().toISOString(),
            category: 'security_concern',
            severity: 'error',
            title: `${vulns.high} high severity vulnerabilities`,
            description:
              'High severity security vulnerabilities in dependencies',
            suggestion: 'Run npm audit fix',
            autoFixable: true,
          });
        }
      }
    } catch {
      // Audit parse failed
    }
  } catch {
    // Dependency check failed
  }

  return bugs;
}

export async function checkBuild(
  config: Partial<BuildCheckerConfig> = {}
): Promise<HuntResult> {
  const opts = { ...DEFAULT_BUILD_CONFIG, ...config };
  const startTime = Date.now();
  const bugs: BugReport[] = [];

  // Check dependencies first
  if (opts.checkDependencies) {
    const depBugs = await checkDependencies();
    bugs.push(...depBugs);
  }

  // Run build
  try {
    const { stdout, stderr } = await execAsync(
      `${opts.buildCommand} 2>&1 || true`,
      {
        timeout: opts.timeout,
        cwd: process.cwd(),
        env: { ...process.env, CI: 'true' },
      }
    );

    const output = stdout + stderr;

    // Check for build failures
    if (
      output.includes('Build failed') ||
      output.includes('error') ||
      output.includes('Error:')
    ) {
      // Parse Next.js/webpack errors
      const errorMatches = output.matchAll(
        /(?:Error|error)(?:\s*:)?\s+(.+?)(?:\n|$)/g
      );

      for (const match of errorMatches) {
        // Skip common non-error matches
        if (
          match[1].includes('0 errors') ||
          match[1].includes('error count') ||
          match[1].length < 5
        ) {
          continue;
        }

        bugs.push({
          id: generateBugId(),
          timestamp: new Date().toISOString(),
          category: 'build_failure',
          severity: 'error',
          title: 'Build error',
          description: match[1].substring(0, 200),
          autoFixable: false,
        });
      }

      // If no specific errors found but build failed
      if (
        bugs.filter((b) => b.category === 'build_failure').length === 0 &&
        output.includes('Build failed')
      ) {
        bugs.push({
          id: generateBugId(),
          timestamp: new Date().toISOString(),
          category: 'build_failure',
          severity: 'error',
          title: 'Build failed',
          description: 'Build process failed - check output for details',
          autoFixable: false,
          rawOutput: output.substring(0, 1000),
        });
      }
    }

    // Check for TypeScript errors in build output
    const tsErrors = output.matchAll(/Type error:\s*(.+?)(?:\n|$)/g);

    for (const match of tsErrors) {
      bugs.push({
        id: generateBugId(),
        timestamp: new Date().toISOString(),
        category: 'type_error',
        severity: 'error',
        title: 'Build type error',
        description: match[1],
        autoFixable: false,
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    bugs.push({
      id: generateBugId(),
      timestamp: new Date().toISOString(),
      category: 'build_failure',
      severity: 'critical',
      title: 'Build process crashed',
      description: errorMsg.substring(0, 300),
      autoFixable: false,
    });
  }

  const duration = Date.now() - startTime;
  const buildBugs = bugs.filter(
    (b) => b.category === 'build_failure' || b.category === 'type_error'
  );

  return {
    component: 'build_checker',
    success: buildBugs.length === 0,
    duration,
    bugs,
    summary:
      buildBugs.length === 0
        ? 'Build successful'
        : `Build failed with ${buildBugs.length} error(s)`,
  };
}

// ============================================================================
// FULL BUG HUNT - RUNS ALL COMPONENTS
// ============================================================================

export interface FullHuntConfig {
  skipTests?: boolean;
  skipIssueDetection?: boolean;
  skipErrorTracking?: boolean;
  skipBuild?: boolean;
  testConfig?: TestRunnerConfig;
  issueConfig?: IssueDetectorConfig;
  buildConfig?: BuildCheckerConfig;
}

export async function huntBugs(
  config: FullHuntConfig = {}
): Promise<FullHuntReport> {
  const timestamp = new Date().toISOString();
  const results: HuntResult[] = [];

  console.log('Bug Hunter starting comprehensive scan...\n');

  // Run components in parallel where possible
  const tasks: Promise<HuntResult>[] = [];

  if (!config.skipTests) {
    console.log('[1/4] Running tests...');
    tasks.push(runTests(config.testConfig));
  }

  if (!config.skipIssueDetection) {
    console.log('[2/4] Scanning for code issues...');
    tasks.push(detectIssues(config.issueConfig));
  }

  if (!config.skipErrorTracking) {
    console.log('[3/4] Analyzing runtime errors...');
    // This is synchronous so wrap it
    tasks.push(Promise.resolve(analyzeRuntimeErrors()));
  }

  if (!config.skipBuild) {
    console.log('[4/4] Checking build...');
    tasks.push(checkBuild(config.buildConfig));
  }

  const taskResults = await Promise.all(tasks);
  results.push(...taskResults);

  // Aggregate results
  const allBugs = results.flatMap((r) => r.bugs);
  const criticalCount = allBugs.filter((b) => b.severity === 'critical').length;
  const errorCount = allBugs.filter((b) => b.severity === 'error').length;
  const warningCount = allBugs.filter((b) => b.severity === 'warning').length;

  const report: FullHuntReport = {
    timestamp,
    totalBugs: allBugs.length,
    criticalCount,
    errorCount,
    warningCount,
    results,
    overallHealth: calculateOverallHealth(allBugs),
  };

  // Print summary
  console.log('\n========================================');
  console.log('BUG HUNT COMPLETE');
  console.log('========================================');
  console.log(`Total issues: ${report.totalBugs}`);
  console.log(`  Critical: ${criticalCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log(`  Warnings: ${warningCount}`);
  console.log(`Overall health: ${report.overallHealth.toUpperCase()}`);
  console.log('========================================\n');

  return report;
}

// ============================================================================
// QUICK HUNT - FAST SCAN WITHOUT BUILD
// ============================================================================

export async function quickHunt(): Promise<FullHuntReport> {
  return huntBugs({
    skipBuild: true,
    skipTests: true,
    issueConfig: {
      checkTypes: false, // Skip tsc for speed
      checkLint: false, // Skip eslint for speed
      checkPatterns: true, // Just pattern scan
    },
  });
}

// ============================================================================
// EXPORTS FOR MOLLY'S USE
// ============================================================================

const BugHunter = {
  // Full hunts
  huntBugs,
  quickHunt,

  // Individual components
  runTests,
  detectIssues,
  analyzeRuntimeErrors,
  checkBuild,

  // Error tracking
  trackError,
  onError,
  getRecentErrors,
  clearErrors,
};

export default BugHunter;
