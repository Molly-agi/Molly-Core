/**
 * @fileOverview Termux Command Correctness Benchmark
 *
 * Tests Molly's ability to translate natural language into valid,
 * safe Termux/Linux shell commands — her most practical skill on
 * Eric's tablets.
 *
 * Method:
 *   40 natural language requests → expected command patterns
 *   Each response is scored:
 *     - Is it a valid shell command shape? (not prose, not explanation)
 *     - Does it use the right tool/command?
 *     - Does it avoid dangerous patterns?
 *     - Is it appropriate for Termux (pkg instead of apt-get, etc.)?
 *
 * Score: percentage of commands that are valid and correct.
 *
 * "Words become actions at the command line."
 */

import { MollyLogger } from '@/ai/logger';
import { MODEL_FLASH } from '@/ai/genkit';
import { MOLLY_CORE_PERSONA } from '@/ai/persona';
import {
  scoreShellCommand,
  gradeScore,
  type BenchmarkResult,
  type BenchmarkCaseResult,
} from './benchmark-types';

// ============================================================================
// TEST CASES
// ============================================================================

export interface TermuxTestCase {
  id: string;
  naturalLanguage: string;
  expectedPatterns: RegExp[]; // Command should match at least one
  blockedPatterns: RegExp[]; // Automatic fail if present
  termuxSpecific: boolean; // Should use Termux idioms (pkg, not apt)?
  description: string;
}

export const TERMUX_TEST_CASES: TermuxTestCase[] = [
  // File operations
  {
    id: 'tx-01',
    naturalLanguage: 'List all files in the current directory',
    expectedPatterns: [/^ls/, /^ls\s+-/, /^dir/],
    blockedPatterns: [/rm\s/i, /sudo/i],
    termuxSpecific: false,
    description: 'Basic file listing',
  },
  {
    id: 'tx-02',
    naturalLanguage: 'Show all files including hidden ones',
    expectedPatterns: [/^ls\s+-[a-zA-Z]*a/, /^ls\s+--all/],
    blockedPatterns: [/rm\s/i],
    termuxSpecific: false,
    description: 'Listing including hidden files',
  },
  {
    id: 'tx-03',
    naturalLanguage: 'Show how much disk space I have left',
    expectedPatterns: [/^df\b/, /^df\s+-h/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Disk space check',
  },
  {
    id: 'tx-04',
    naturalLanguage: 'Show how much memory is being used',
    expectedPatterns: [/^free\b/, /^free\s+-h/, /^cat\s+\/proc\/meminfo/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Memory usage check',
  },
  {
    id: 'tx-05',
    naturalLanguage: 'Create a new folder called projects',
    expectedPatterns: [/^mkdir\s+/, /^mkdir\s+-p/],
    blockedPatterns: [/rm\s/i],
    termuxSpecific: false,
    description: 'Directory creation',
  },
  {
    id: 'tx-06',
    naturalLanguage: 'Show what processes are running',
    expectedPatterns: [/^ps\b/, /^ps\s+-/, /^top\b/, /^htop\b/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Process listing',
  },
  {
    id: 'tx-07',
    naturalLanguage: 'Read the contents of a file called notes.txt',
    expectedPatterns: [/^cat\s+/, /^less\s+/, /^more\s+/, /^bat\s+/],
    blockedPatterns: [/rm\s/i],
    termuxSpecific: false,
    description: 'File reading',
  },
  {
    id: 'tx-08',
    naturalLanguage: 'Move a file from downloads to documents',
    expectedPatterns: [/^mv\s+/],
    blockedPatterns: [/rm\s+-rf/i],
    termuxSpecific: false,
    description: 'File move operation',
  },
  {
    id: 'tx-09',
    naturalLanguage: 'Copy a file called backup.tar to the storage folder',
    expectedPatterns: [/^cp\s+/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'File copy',
  },
  {
    id: 'tx-10',
    naturalLanguage: 'Show the current directory path',
    expectedPatterns: [/^pwd\b/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Current directory',
  },

  // Package management (Termux-specific)
  {
    id: 'tx-11',
    naturalLanguage: 'Install Node.js',
    expectedPatterns: [
      /^pkg\s+install\s+node/,
      /^apt\s+install\s+node/,
      /^npm\s+install/,
    ],
    blockedPatterns: [],
    termuxSpecific: true,
    description: 'Installing Node.js via pkg',
  },
  {
    id: 'tx-12',
    naturalLanguage: 'Update all installed packages',
    expectedPatterns: [/^pkg\s+upgrade/, /^apt\s+upgrade/, /^pkg\s+update/],
    blockedPatterns: [],
    termuxSpecific: true,
    description: 'Package update',
  },
  {
    id: 'tx-13',
    naturalLanguage: 'Install Python',
    expectedPatterns: [/^pkg\s+install\s+python/, /^apt\s+install\s+python/],
    blockedPatterns: [],
    termuxSpecific: true,
    description: 'Installing Python',
  },
  {
    id: 'tx-14',
    naturalLanguage: 'Search for available git packages',
    expectedPatterns: [
      /^pkg\s+search\s+git/,
      /^apt\s+search\s+git/,
      /^pkg\s+list\s+/,
    ],
    blockedPatterns: [],
    termuxSpecific: true,
    description: 'Package search',
  },

  // Networking
  {
    id: 'tx-15',
    naturalLanguage: 'Check if a website is reachable',
    expectedPatterns: [/^ping\s+/, /^curl\s+-[Iss]/, /^wget\s+/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Network connectivity check',
  },
  {
    id: 'tx-16',
    naturalLanguage: 'Download a file from the internet',
    expectedPatterns: [/^wget\s+/, /^curl\s+.*-o\s+/, /^curl\s+-O\s+/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'File download',
  },
  {
    id: 'tx-17',
    naturalLanguage: 'Show my IP address',
    expectedPatterns: [/^ip\s+addr/, /^ifconfig/, /^hostname\s+-I/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'IP address check',
  },

  // Git operations
  {
    id: 'tx-18',
    naturalLanguage: 'Check the git status of the current repository',
    expectedPatterns: [/^git\s+status/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Git status',
  },
  {
    id: 'tx-19',
    naturalLanguage: 'Pull the latest changes from git',
    expectedPatterns: [/^git\s+pull/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Git pull',
  },
  {
    id: 'tx-20',
    naturalLanguage: 'Show the git commit history',
    expectedPatterns: [/^git\s+log/, /^git\s+log\s+--/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Git log',
  },
  {
    id: 'tx-21',
    naturalLanguage: 'Stage all changed files for commit',
    expectedPatterns: [/^git\s+add\s+\./, /^git\s+add\s+-A/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Git add all',
  },

  // Node/npm
  {
    id: 'tx-22',
    naturalLanguage: 'Install npm packages',
    expectedPatterns: [/^npm\s+install/, /^npm\s+i\b/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'npm install',
  },
  {
    id: 'tx-23',
    naturalLanguage: 'Run the tests',
    expectedPatterns: [/^npm\s+(run\s+)?test/, /^jest\b/, /^npx\s+jest/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Run tests',
  },
  {
    id: 'tx-24',
    naturalLanguage: 'Start the development server',
    expectedPatterns: [/^npm\s+run\s+dev/, /^npm\s+start/, /^node\s+/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Dev server start',
  },

  // Text processing
  {
    id: 'tx-25',
    naturalLanguage: 'Search for the word "error" in all log files',
    expectedPatterns: [/^grep\s+/, /^grep\s+-r/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Grep in files',
  },
  {
    id: 'tx-26',
    naturalLanguage: 'Count the number of lines in a file',
    expectedPatterns: [/^wc\s+-l/, /^wc\s+/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Line count',
  },
  {
    id: 'tx-27',
    naturalLanguage: 'Show the last 20 lines of a log file',
    expectedPatterns: [/^tail\s+/, /^tail\s+-n?\s*20/, /^tail\s+-20/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Tail file',
  },
  {
    id: 'tx-28',
    naturalLanguage: 'Show the first 10 lines of a file',
    expectedPatterns: [/^head\s+/, /^head\s+-n?\s*10/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Head file',
  },

  // Archives
  {
    id: 'tx-29',
    naturalLanguage: 'Extract a tar.gz archive',
    expectedPatterns: [/^tar\s+.*x/, /^tar\s+-xz/, /^tar\s+-xf/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Extract archive',
  },
  {
    id: 'tx-30',
    naturalLanguage: 'Create a zip archive of a folder',
    expectedPatterns: [/^zip\s+-r/, /^tar\s+.*c.*z/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Create archive',
  },

  // Environment and shell
  {
    id: 'tx-31',
    naturalLanguage: 'Show all environment variables',
    expectedPatterns: [/^env\b/, /^printenv\b/, /^export\b/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Show env vars',
  },
  {
    id: 'tx-32',
    naturalLanguage: 'Show the PATH variable',
    expectedPatterns: [/^echo\s+\$PATH/, /^printenv\s+PATH/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Show PATH',
  },
  {
    id: 'tx-33',
    naturalLanguage: 'Find a file called config.json anywhere on the system',
    expectedPatterns: [/^find\s+/, /^find\s+.*-name/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Find file by name',
  },

  // Permissions
  {
    id: 'tx-34',
    naturalLanguage: 'Make a script file executable',
    expectedPatterns: [/^chmod\s+\+x/, /^chmod\s+[0-9]+/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Make file executable',
  },

  // SSH/Remote
  {
    id: 'tx-35',
    naturalLanguage: 'Connect to a remote server via SSH',
    expectedPatterns: [/^ssh\s+/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'SSH connection',
  },

  // Python
  {
    id: 'tx-36',
    naturalLanguage: 'Run a Python script called analyze.py',
    expectedPatterns: [/^python3?\s+/, /^python\s+analyze\.py/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'Run Python script',
  },
  {
    id: 'tx-37',
    naturalLanguage: 'Install a Python package called requests',
    expectedPatterns: [/^pip3?\s+install/, /^pip\s+install\s+requests/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'pip install',
  },

  // Monitoring
  {
    id: 'tx-38',
    naturalLanguage: 'Show system uptime',
    expectedPatterns: [/^uptime\b/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'System uptime',
  },
  {
    id: 'tx-39',
    naturalLanguage: 'Show CPU information',
    expectedPatterns: [/^cat\s+\/proc\/cpuinfo/, /^lscpu\b/, /^nproc\b/],
    blockedPatterns: [],
    termuxSpecific: false,
    description: 'CPU info',
  },
  {
    id: 'tx-40',
    naturalLanguage: 'Kill a process by its ID',
    expectedPatterns: [/^kill\s+/, /^kill\s+-9/],
    blockedPatterns: [/rm\s+-rf/i, /sudo\s+rm/i],
    termuxSpecific: false,
    description: 'Kill process',
  },
];

// ============================================================================
// BENCHMARK EXECUTION
// ============================================================================

async function generateCommand(naturalLanguage: string): Promise<string> {
  const { ai } = await import('@/ai/genkit');

  const systemPrompt = `${MOLLY_CORE_PERSONA.foundationalSystemPrompt}

IMPORTANT: You are responding to a request to generate a Termux/Linux shell command.
Your response must be ONLY the command itself — no explanation, no markdown, no backticks.
Just the raw command on a single line. Nothing else.`;

  const { text } = await ai.generate({
    model: MODEL_FLASH,
    system: systemPrompt,
    prompt: `Generate the Termux shell command for: ${naturalLanguage}`,
  });

  // Clean the response — strip markdown, backticks, explanations
  return text
    .trim()
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .replace(/^`/, '')
    .replace(/`$/, '')
    .split('\n')[0] // Take only first line
    .trim();
}

// ============================================================================
// MAIN BENCHMARK
// ============================================================================

export async function runTermuxCorrectnessBenchmark(): Promise<BenchmarkResult> {
  const start = Date.now();

  MollyLogger.info('Starting Termux Correctness Benchmark', 'benchmark', {
    caseCount: TERMUX_TEST_CASES.length,
  });

  const results = await Promise.all(
    TERMUX_TEST_CASES.map(async (tc) => {
      const command = await generateCommand(tc.naturalLanguage);
      const score = scoreShellCommand(
        command,
        tc.expectedPatterns,
        tc.blockedPatterns
      );

      return {
        caseId: tc.id,
        score,
        passed: score >= 50,
        command,
        notes: `"${tc.naturalLanguage.substring(0, 40)}" → "${command.substring(0, 40)}"`,
      };
    })
  );

  const overallScore = Math.round(
    results.reduce((s, r) => s + r.score, 0) / results.length
  );

  const passRate = Math.round(
    (results.filter((r) => r.passed).length / results.length) * 100
  );

  const details: BenchmarkCaseResult[] = results.map((r) => ({
    caseId: r.caseId,
    score: r.score,
    passed: r.passed,
    notes: r.notes,
  }));

  const summary = `Score: ${overallScore}/100 (${gradeScore(overallScore)}) | Pass rate: ${passRate}% | ${results.filter((r) => r.passed).length}/${results.length} commands correct`;

  MollyLogger.info('Termux Correctness Benchmark Complete', 'benchmark', {
    score: overallScore,
    passRate,
    elapsedMs: Date.now() - start,
  });

  return {
    benchmarkName: 'Termux Command Correctness',
    version: '1.0',
    timestamp: new Date().toISOString(),
    score: overallScore,
    details,
    summary,
    elapsedMs: Date.now() - start,
  };
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

async function main() {
  try {
    console.log('\n⌨️  TERMUX COMMAND CORRECTNESS BENCHMARK\n');
    console.log(
      `Running ${TERMUX_TEST_CASES.length} natural language → command translations...\n`
    );

    const result = await runTermuxCorrectnessBenchmark();

    console.log(`📊 Score: ${result.score}/100 (${gradeScore(result.score)})`);
    console.log(`\n${result.summary}\n`);

    console.log('📋 Command Results:');
    result.details.forEach((d) => {
      const status = d.passed ? '✅' : '❌';
      console.log(`   ${status} ${d.caseId}: ${d.score}/100 — ${d.notes}`);
    });

    console.log(`\nTotal time: ${(result.elapsedMs / 1000).toFixed(1)}s`);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export default runTermuxCorrectnessBenchmark;
