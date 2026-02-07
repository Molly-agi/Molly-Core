#!/usr/bin/env node
/**
 * Manual session save script
 * Run this to force-save the current session state
 *
 * Usage: node scripts/save-session.mjs
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const sessionFile = join(rootDir, 'COPILOT_SESSION_STATE.md');
const timestamp = new Date().toISOString();

console.log('🔄 Updating session state timestamp...');

try {
  // Read current session state
  const content = await import('fs').then((fs) =>
    fs.readFileSync(sessionFile, 'utf-8')
  );

  // Update timestamp
  const updated = content.replace(
    /\*\*Last Updated:\*\* .+/,
    `**Last Updated:** ${timestamp}`
  );

  writeFileSync(sessionFile, updated, 'utf-8');

  console.log('✅ Session state saved successfully');
  console.log(`   Timestamp: ${timestamp}`);
  console.log(`   Location: ${sessionFile}`);
} catch (error) {
  console.error('❌ Failed to save session state:', error.message);
  process.exit(1);
}
