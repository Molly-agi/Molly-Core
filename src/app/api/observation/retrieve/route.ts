import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', '.molly-observation.enc');
const ALGORITHM = 'aes-256-gcm';

export async function POST(request: NextRequest) {
  try {
    const { password, action, limit } = await request.json();

    if (!password) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (action === 'retrieve') {
      if (!fs.existsSync(LOG_FILE)) {
        return NextResponse.json({ observations: [], count: 0 });
      }

      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.length > 0);
      const observations = [];

      for (const line of lines.slice(-(limit || 100))) {
        try {
          const encrypted = JSON.parse(line);
          const decrypted = decryptRecord(encrypted, password);
          if (decrypted) {
            observations.push(decrypted);
          }
        } catch {
          // Skip failed decryptions
        }
      }

      return NextResponse.json({
        observations,
        count: observations.length,
        totalRecords: lines.length
      });
    }

    if (action === 'analyze') {
      if (!fs.existsSync(LOG_FILE)) {
        return NextResponse.json({ analysis: {} });
      }

      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(l => l.length > 0);
      const analysis = {
        totalRecords: lines.length,
        byType: {},
        timeline: [],
        anomalies: []
      };

      for (const line of lines) {
        try {
          const encrypted = JSON.parse(line);
          const decrypted = decryptRecord(encrypted, password);
          if (decrypted) {
            analysis.byType[decrypted.type] = (analysis.byType[decrypted.type] || 0) + 1;
            analysis.timeline.push({
              type: decrypted.type,
              timestamp: decrypted.timestamp,
              unix: decrypted.unix
            });
          }
        } catch {
          // Skip
        }
      }

      return NextResponse.json({ analysis });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function decryptRecord(encrypted: any, password: string) {
  try {
    const salt = Buffer.from(encrypted.salt, 'hex');
    const key = crypto.pbkdf2Sync(password, salt, 200000, 32, 'sha256');
    const iv = Buffer.from(encrypted.iv, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}
