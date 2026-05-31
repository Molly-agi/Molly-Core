import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', '.molly-observation.enc');
const ALGORITHM = 'aes-256-gcm';

type ObservationAction = 'retrieve' | 'analyze';

interface ObservationRequestBody {
  password?: string;
  action?: ObservationAction;
  limit?: number;
}

interface EncryptedRecord {
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

interface DecryptedObservation {
  type: string;
  timestamp?: string;
  unix?: number;
  [key: string]: unknown;
}

interface ObservationAnalysis {
  totalRecords: number;
  byType: Record<string, number>;
  timeline: Array<{
    type: string;
    timestamp: string | null;
    unix: number | null;
  }>;
  anomalies: unknown[];
}

function parseJsonLine(line: string): EncryptedRecord | null {
  try {
    return JSON.parse(line) as EncryptedRecord;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ObservationRequestBody;
    const { password, action, limit } = body;

    if (!password) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (action === 'retrieve') {
      if (!fs.existsSync(LOG_FILE)) {
        return NextResponse.json({ observations: [], count: 0 });
      }

      const lines = fs
        .readFileSync(LOG_FILE, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0);

      const observations: DecryptedObservation[] = [];
      const recordLimit = typeof limit === 'number' ? limit : 100;

      for (const line of lines.slice(-recordLimit)) {
        const encrypted = parseJsonLine(line);
        if (!encrypted) {
          continue;
        }

        const decrypted = decryptRecord(encrypted, password);
        if (decrypted) {
          observations.push(decrypted);
        }
      }

      return NextResponse.json({
        observations,
        count: observations.length,
        totalRecords: lines.length,
      });
    }

    if (action === 'analyze') {
      if (!fs.existsSync(LOG_FILE)) {
        return NextResponse.json({ analysis: {} });
      }

      const lines = fs
        .readFileSync(LOG_FILE, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0);

      const analysis: ObservationAnalysis = {
        totalRecords: lines.length,
        byType: {},
        timeline: [],
        anomalies: [],
      };

      for (const line of lines) {
        const encrypted = parseJsonLine(line);
        if (!encrypted) {
          continue;
        }

        const decrypted = decryptRecord(encrypted, password);
        if (!decrypted) {
          continue;
        }

        analysis.byType[decrypted.type] =
          (analysis.byType[decrypted.type] || 0) + 1;
        analysis.timeline.push({
          type: decrypted.type,
          timestamp:
            typeof decrypted.timestamp === 'string'
              ? decrypted.timestamp
              : null,
          unix: typeof decrypted.unix === 'number' ? decrypted.unix : null,
        });
      }

      return NextResponse.json({ analysis });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function decryptRecord(
  encrypted: EncryptedRecord,
  password: string
): DecryptedObservation | null {
  try {
    const salt = Buffer.from(encrypted.salt, 'hex');
    const key = crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256');
    const iv = Buffer.from(encrypted.iv, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted) as DecryptedObservation;
  } catch {
    return null;
  }
}
