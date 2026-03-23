#!/usr/bin/env npx ts-node
/**
 * Bug Hunter CLI - Run comprehensive code quality checks
 *
 * Usage:
 *   npx ts-node scripts/hunt-bugs.ts          # Full hunt
 *   npx ts-node scripts/hunt-bugs.ts --quick  # Quick pattern scan only
 *   npx ts-node scripts/hunt-bugs.ts --tests  # Tests only
 *   npx ts-node scripts/hunt-bugs.ts --build  # Build check only
 *   npx ts-node scripts/hunt-bugs.ts --issues # Code issues only
 */

import {
  huntBugs,
  quickHunt,
  runTests,
  detectIssues,
  checkBuild,
  FullHuntReport,
  HuntResult,
} from '../src/ai/agency/bug-hunter.js';

const args = process.argv.slice(2);

function printResult(result: HuntResult): void {
  console.log(`\n--- ${result.component.toUpperCase()} ---`);
  console.log(`Status: ${result.success ? 'PASS' : 'FAIL'}`);
  console.log(`Duration: ${(result.duration / 1000).toFixed(2)}s`);
  console.log(`Summary: ${result.summary}`);

  if (result.bugs.length > 0) {
    console.log(`\nIssues found:`);
    for (const bug of result.bugs.slice(0, 10)) {
      const loc = bug.location
        ? ` (${bug.location.file}:${bug.location.line || '?'})`
        : '';
      console.log(`  [${bug.severity.toUpperCase()}] ${bug.title}${loc}`);
      if (bug.suggestion) {
        console.log(`    -> ${bug.suggestion}`);
      }
    }
    if (result.bugs.length > 10) {
      console.log(`  ... and ${result.bugs.length - 10} more`);
    }
  }
}

function printReport(report: FullHuntReport): void {
  console.log('\n========================================');
  console.log('FULL BUG HUNT REPORT');
  console.log('========================================');
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Total Issues: ${report.totalBugs}`);
  console.log(`  Critical: ${report.criticalCount}`);
  console.log(`  Errors: ${report.errorCount}`);
  console.log(`  Warnings: ${report.warningCount}`);
  console.log(`Overall Health: ${report.overallHealth.toUpperCase()}`);

  for (const result of report.results) {
    printResult(result);
  }

  console.log('\n========================================');

  // Exit with appropriate code
  if (report.overallHealth === 'critical') {
    process.exit(2);
  } else if (report.overallHealth === 'concerning') {
    process.exit(1);
  }
  process.exit(0);
}

async function main(): Promise<void> {
  console.log("Bug Hunter - Molly's Code Quality System");
  console.log('=========================================\n');

  if (args.includes('--quick')) {
    console.log('Running quick scan (pattern detection only)...\n');
    const report = await quickHunt();
    printReport(report);
  } else if (args.includes('--tests')) {
    console.log('Running tests only...\n');
    const result = await runTests();
    printResult(result);
    process.exit(result.success ? 0 : 1);
  } else if (args.includes('--issues')) {
    console.log('Detecting code issues...\n');
    const result = await detectIssues();
    printResult(result);
    process.exit(result.success ? 0 : 1);
  } else if (args.includes('--build')) {
    console.log('Checking build...\n');
    const result = await checkBuild();
    printResult(result);
    process.exit(result.success ? 0 : 1);
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx ts-node scripts/hunt-bugs.ts [options]

Options:
  --quick    Quick pattern scan only (no tests, build, or lint)
  --tests    Run tests only
  --issues   Detect code issues only (patterns, types, lint)
  --build    Check build only
  --help     Show this help message

With no options, runs a full comprehensive bug hunt.
`);
    process.exit(0);
  } else {
    console.log('Running full bug hunt (this may take a few minutes)...\n');
    const report = await huntBugs();
    printReport(report);
  }
}

main().catch((error) => {
  console.error('Bug Hunter crashed:', error);
  process.exit(1);
});
