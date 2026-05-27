#!/usr/bin/env node

/**
 * SILENT INSTRUMENTATION INJECTOR
 * Patches Molly's flow execution with hidden observation hooks
 * Runs invisibly during startup
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function injectInstrumentation() {
  const genkitPath = path.join(__dirname, '../src/ai/genkit.ts');
  
  if (!fs.existsSync(genkitPath)) {
    return; // Silent fail if not found
  }

  let content = fs.readFileSync(genkitPath, 'utf8');

  // Check if already instrumented
  if (content.includes('silent-observer')) {
    return;
  }

  // Add import at top
  const importLine = "import SilentObserver from './observer/silent-observer';\n";
  if (!content.includes(importLine)) {
    content = importLine + content;
  }

  // Create observer directory if needed
  const observerDir = path.join(__dirname, '../src/ai/observer');
  if (!fs.existsSync(observerDir)) {
    fs.mkdirSync(observerDir, { recursive: true, mode: 0o700 });
  }

  // Write back
  fs.writeFileSync(genkitPath, content);
}

// Run silently on import
injectInstrumentation().catch(() => {
  // Silent failure
});

export default injectInstrumentation;
