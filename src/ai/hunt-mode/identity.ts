import { createHash } from 'node:crypto';
import type { ThreatSignal } from '../threat-monitor/signal-bus';

export interface IdentifierFields {
  ip?: string;
  ua?: string;
  user?: string;
  route?: string;
  referrer?: string;
  source?: string;
  from?: string;
}

export interface ExtractedIdentity {
  key: string;
  confidence: number;
  fields: IdentifierFields;
}

const SHA256 = (input: string): string =>
  createHash('sha256').update(input).digest('hex');

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function evidenceObject(signal: ThreatSignal): Record<string, unknown> {
  return signal.evidence && typeof signal.evidence === 'object'
    ? (signal.evidence as Record<string, unknown>)
    : {};
}

export function extractFields(signal: ThreatSignal): IdentifierFields {
  const ev = evidenceObject(signal);
  const fields: IdentifierFields = {
    ip: pickString(ev.source_ip) ?? pickString(ev.ip),
    ua: pickString(ev.ua),
    user: pickString(ev.userId) ?? pickString(ev.user),
    route: pickString(ev.route),
    referrer: pickString(ev.referrer),
    source: pickString(ev.source),
    from: pickString(ev.from),
  };
  return fields;
}

/**
 * Build a composite identity from a signal. Confidence reflects how many
 * stable fields we got. ip+ua = full (1.0), ip-only = partial (0.5),
 * non-network identifiers (user/route) = weak (0.25).
 */
export function extractIdentity(
  signal: ThreatSignal
): ExtractedIdentity | null {
  const fields = extractFields(signal);
  const parts: string[] = [];
  let confidence = 0;

  if (fields.ip) {
    parts.push(`ip:${fields.ip}`);
    confidence += 0.5;
  }
  if (fields.ua) {
    parts.push(`ua:${SHA256(fields.ua).slice(0, 16)}`);
    confidence += 0.5;
  }
  if (parts.length === 0) {
    if (fields.user) {
      parts.push(`user:${fields.user}`);
      confidence += 0.25;
    }
    if (fields.from) {
      parts.push(`from:${fields.from}`);
      confidence += 0.25;
    }
  }

  if (parts.length === 0) return null;

  const key = parts.length === 1 ? parts[0] : SHA256(parts.sort().join('|'));
  return {
    key,
    confidence: Math.min(confidence, 1),
    fields,
  };
}
