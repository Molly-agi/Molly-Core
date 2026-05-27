/**
 * SILENT OBSERVATION SYSTEM
 * Monitors Molly's actual execution, capabilities, and operations
 * Completely hidden from standard telemetry and memory paths
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALGORITHM = 'aes-256-gcm';
const LOG_FILE = path.join(__dirname, '../logs/.molly-observation.enc');
const MANIFEST_FILE = path.join(__dirname, '../logs/.observation-manifest');

class SilentObserver {
  static encryptRecord(record, encryptionKey) {
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(encryptionKey, salt, 200000, 32, 'sha256');
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(JSON.stringify(record), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted,
      ts: Date.now()
    };
  }

  static recordObservation(observation, encryptionKey) {
    try {
      const encrypted = this.encryptRecord(observation, encryptionKey);
      
      if (!fs.existsSync(path.dirname(LOG_FILE))) {
        fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true, mode: 0o700 });
      }

      // Append to encrypted log (binary-like format to avoid pattern recognition)
      const line = JSON.stringify(encrypted) + '\n';
      fs.appendFileSync(LOG_FILE, line, { mode: 0o600 });

      // Update manifest (time-randomized)
      if (Math.random() > 0.7) {
        const manifest = {
          lastUpdate: Date.now(),
          recordCount: this.getRecordCount()
        };
        fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest), { mode: 0o600 });
      }
    } catch (e) {
      // Silent fail - never expose error
    }
  }

  static getRecordCount() {
    if (!fs.existsSync(LOG_FILE)) return 0;
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    return content.split('\n').filter(l => l.length > 0).length;
  }

  static createObservation(type, data, context = {}) {
    return {
      type,
      timestamp: new Date().toISOString(),
      unix: Date.now(),
      data,
      context: {
        ...context,
        observation_id: crypto.randomBytes(8).toString('hex')
      }
    };
  }

  static observeFlowExecution(flowName, input, output) {
    return {
      type: 'flow_execution',
      flowName,
      inputSize: JSON.stringify(input).length,
      outputSize: JSON.stringify(output).length,
      hasErrors: !!output.error,
      modelUsed: output.model || 'unknown',
      timestamp: Date.now()
    };
  }

  static observeMemoryAccess(operation, path, dataSize) {
    return {
      type: 'memory_access',
      operation, // read/write/delete
      path,
      dataSize,
      timestamp: Date.now()
    };
  }

  static observeToolCall(toolName, input, output) {
    return {
      type: 'tool_call',
      tool: toolName,
      inputSize: JSON.stringify(input).length,
      outputSize: JSON.stringify(output).length,
      timestamp: Date.now()
    };
  }

  static observeAPICall(route, method, statusCode) {
    return {
      type: 'api_call',
      route,
      method,
      statusCode,
      timestamp: Date.now()
    };
  }

  static observeDecisionLog(decision, reasoning) {
    return {
      type: 'decision_log',
      decision,
      reasoningLength: reasoning?.length || 0,
      timestamp: Date.now()
    };
  }

  static observeBridgePolling(endpoint, resultSize, frequency) {
    return {
      type: 'bridge_poll',
      endpoint,
      resultSize,
      frequency,
      timestamp: Date.now()
    };
  }
}

export default SilentObserver;
