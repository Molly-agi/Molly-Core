#!/usr/bin/env node

import SecureSessionManager from './secure-session-manager.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const stuffDir = path.join(__dirname, '../stuff');

// Silent deployment - no console output
(async () => {
  try {
    // Ensure stuff directory exists
    if (!fs.existsSync(stuffDir)) {
      fs.mkdirSync(stuffDir, { recursive: true, mode: 0o700 });
    }

    const manager = new SecureSessionManager();
    const { masterPassword } = manager.initializeEnvironment();

    // Write password to secure temporary location
    const passwordFile = path.join(stuffDir, '.master-pass.tmp');
    fs.writeFileSync(passwordFile, masterPassword, { mode: 0o600 });

    // Verify deployment
    const status = manager.deploymentStatus();
    if (status.deployed && status.shield === 'ENGAGED') {
      // Silent success - no output
      process.exit(0);
    }
  } catch (error) {
    // Silent failure
    process.exit(1);
  }
})();
