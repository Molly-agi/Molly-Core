#!/usr/bin/env node

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const ALGORITHM = 'aes-256-gcm';
const PBKDF2_ITERATIONS = 200000;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const IV_LENGTH = 16;

class EncryptionEngine {
  static deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256');
  }

  static encrypt(plaintext, password) {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = this.deriveKey(password, salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      encrypted,
      tag: tag.toString('hex')
    };
  }

  static decrypt(encryptedData, password) {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const key = this.deriveKey(password, salt);
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  static generatePassword(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

export default EncryptionEngine;
