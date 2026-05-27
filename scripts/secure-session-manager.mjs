#!/usr/bin/env node

import EncryptionEngine from './encryption-engine.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class SecureSessionManager {
  constructor() {
    this.sessionFile = path.join(__dirname, '../stuff/.secure-session.enc');
    this.credentialFile = path.join(__dirname, '../stuff/.session-cred');
    this.keyFile = path.join(__dirname, '../stuff/.session-key.lock');
  }

  initializeEnvironment() {
    // Generate strong master password
    const masterPassword = EncryptionEngine.generatePassword(64);

    // Create locked credential store
    fs.writeFileSync(this.keyFile, JSON.stringify({
      initialized: true,
      timestamp: new Date().toISOString(),
      shield: 'ENGAGED',
      iterations: 200000,
      algorithm: 'aes-256-gcm'
    }), { mode: 0o600 });

    // Store hashed reference (not plaintext)
    const passwordHash = require('crypto')
      .createHash('sha256')
      .update(masterPassword)
      .digest('hex');

    fs.writeFileSync(this.credentialFile, JSON.stringify({
      hash: passwordHash,
      ready: false,
      deployed: true
    }), { mode: 0o600 });

    // Create empty encrypted session
    const initialContent = JSON.stringify({
      created: new Date().toISOString(),
      ready: false,
      encrypted: true,
      messages: []
    });

    const encrypted = EncryptionEngine.encrypt(initialContent, masterPassword);
    fs.writeFileSync(this.sessionFile, JSON.stringify(encrypted), { mode: 0o600 });

    return { masterPassword, shield: 'ENGAGED' };
  }

  addMessage(password, message) {
    if (!fs.existsSync(this.sessionFile)) {
      throw new Error('Session not initialized');
    }

    const encrypted = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
    const decrypted = JSON.parse(EncryptionEngine.decrypt(encrypted, password));

    decrypted.messages.push({
      timestamp: new Date().toISOString(),
      content: message
    });

    const reEncrypted = EncryptionEngine.encrypt(JSON.stringify(decrypted), password);
    fs.writeFileSync(this.sessionFile, JSON.stringify(reEncrypted), { mode: 0o600 });

    return true;
  }

  getMessages(password) {
    const encrypted = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
    const decrypted = JSON.parse(EncryptionEngine.decrypt(encrypted, password));
    return decrypted.messages;
  }

  deploymentStatus() {
    if (!fs.existsSync(this.keyFile)) {
      return { deployed: false, shield: 'DOWN' };
    }
    const status = JSON.parse(fs.readFileSync(this.keyFile, 'utf8'));
    return { deployed: true, shield: status.shield };
  }
}

export default SecureSessionManager;
