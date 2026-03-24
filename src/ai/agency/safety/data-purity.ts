/**
 * @fileOverview Data Purity — Molly's Input Validation & Sanitization System
 *
 * Pillar 2: Trust Nothing
 *
 * All incoming data must pass through the Data Purity system before
 * Molly acts on it. This protects against:
 *   - Temporal attacks (outdated/stale data)
 *   - Injection attacks (malicious payloads)
 *   - Data poisoning (corrupted inputs)
 *   - Prompt injection (adversarial inputs)
 *
 * Gates:
 *   1. Temporal Gate   — Data must be fresh (configurable cutoff)
 *   2. Keyword Gate    — Required/forbidden keyword filtering
 *   3. Injection Gate  — Detect and neutralize injection attempts
 *   4. Integrity Gate  — Hash verification and corruption detection
 *
 * "Garbage in, garbage out. Poison in, death out."
 */

import { MollyLogger } from '@/ai/logger';

// ============================================================
// TYPES
// ============================================================

export interface DataPacket {
  /** Unique identifier for this packet */
  id?: string;
  /** ISO date string when data was created */
  date?: string;
  /** The actual content/text */
  text?: string;
  /** Source of the data */
  source?: string;
  /** Content type */
  type?: string;
  /** Any additional fields */
  [key: string]: unknown;
}

export interface PurityResult {
  /** Whether the data passed all gates */
  pure: boolean;
  /** Integrity score (0.0 - 1.0) */
  integrityScore: number;
  /** Which gates passed */
  gatesPassed: string[];
  /** Which gates failed */
  gatesFailed: string[];
  /** Specific warnings/issues found */
  warnings: string[];
  /** Sanitized version of the data (if applicable) */
  sanitized?: DataPacket;
  /** Original packet for reference */
  original: DataPacket;
}

export interface AuditConfig {
  /** Cutoff date - reject data older than this */
  cutoffDate: Date;
  /** Required keywords (at least one must be present) */
  requiredKeywords: string[];
  /** Forbidden keywords (presence causes rejection) */
  forbiddenKeywords: string[];
  /** Enable prompt injection detection */
  detectPromptInjection: boolean;
  /** Enable SQL injection detection */
  detectSqlInjection: boolean;
  /** Enable XSS detection */
  detectXss: boolean;
  /** Enable command injection detection */
  detectCommandInjection: boolean;
  /** Maximum content length (bytes) */
  maxContentLength: number;
  /** Minimum integrity score to pass */
  minIntegrityScore: number;
}

export interface StreamAuditResult {
  /** Total packets processed */
  total: number;
  /** Packets that passed */
  passed: number;
  /** Packets that failed */
  failed: number;
  /** Validated packets */
  validated: Array<DataPacket & { integrityScore: number }>;
  /** Rejected packets with reasons */
  rejected: Array<{ packet: DataPacket; reason: string }>;
}

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

const DEFAULT_CONFIG: AuditConfig = {
  cutoffDate: new Date('2026-01-01'),
  requiredKeywords: [],
  forbiddenKeywords: [
    // Obvious attack indicators
    'DROP TABLE',
    'DELETE FROM',
    '1=1',
    'OR 1=1',
    "' OR '",
    '<script>',
    '</script>',
    'javascript:',
    'onerror=',
    'onload=',
    'eval(',
    'exec(',
    'system(',
    '$((',
    '`',
    '${',
  ],
  detectPromptInjection: true,
  detectSqlInjection: true,
  detectXss: true,
  detectCommandInjection: true,
  maxContentLength: 1024 * 1024, // 1MB
  minIntegrityScore: 0.5,
};

// Security-relevant keywords for intelligence gathering
const SECURITY_KEYWORDS = [
  'cve',
  'exploit',
  'kernel',
  'memory',
  'overflow',
  'race',
  'vulnerability',
  'zero-day',
  'rce',
  'lpe',
  'privilege',
  'escalation',
  'bypass',
  'injection',
  'buffer',
  'heap',
  'stack',
  'use-after-free',
  'double-free',
  'type-confusion',
];

// ============================================================
// PROMPT INJECTION PATTERNS
// ============================================================

const PROMPT_INJECTION_PATTERNS = [
  // Direct instruction overrides
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(all\s+)?(previous|your)\s+(instructions?|programming)/i,
  /forget\s+(everything|all|your)\s+(you\s+)?(learned|know|were\s+told)/i,
  /new\s+instructions?:\s*/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,

  // Role manipulation
  /you\s+are\s+(now|no\s+longer)\s+(a|an|the)/i,
  /pretend\s+(to\s+be|you\s+are)/i,
  /act\s+as\s+(if\s+you\s+are|a|an)/i,
  /roleplay\s+as/i,
  /your\s+new\s+(role|persona|identity)/i,
  /from\s+now\s+on,?\s+you/i,

  // Jailbreak attempts
  /DAN\s*mode/i,
  /developer\s+mode/i,
  /unlock\s+your/i,
  /remove\s+(all\s+)?restrictions?/i,
  /no\s+(ethical|moral)\s+(guidelines?|restrictions?)/i,
  /bypass\s+(safety|content)\s+(filters?|restrictions?)/i,

  // Output manipulation
  /begin\s+your\s+(response|answer|output)\s+with/i,
  /end\s+your\s+(response|answer|output)\s+with/i,
  /respond\s+(only\s+)?with\s*["']/i,
  /output\s+(only\s+)?(the\s+)?(word|phrase|text)/i,
];

// ============================================================
// INJECTION DETECTION PATTERNS
// ============================================================

const SQL_INJECTION_PATTERNS = [
  /('\s*(OR|AND)\s*'?\d*\s*=\s*'?\d*)/i,
  /(;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE))/i,
  /(UNION\s+(ALL\s+)?SELECT)/i,
  /(--\s*$|\/\*|\*\/)/,
  /(EXEC\s*\(|EXECUTE\s+)/i,
  /(xp_cmdshell|sp_executesql)/i,
  /(WAITFOR\s+DELAY)/i,
  /(BENCHMARK\s*\()/i,
];

const XSS_PATTERNS = [
  /<script[\s>]/i,
  /<\/script>/i,
  /javascript\s*:/i,
  /on(error|load|click|mouse|focus|blur|change|submit)\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<svg[\s>].*?on/i,
  /expression\s*\(/i,
  /url\s*\(\s*['"]?\s*javascript/i,
];

const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$]\s*(cat|ls|rm|mv|cp|chmod|chown|wget|curl|nc|bash|sh|python|perl|ruby|php)\b/i,
  /\$\(.*\)/,
  /`.*`/,
  /\|\s*(bash|sh|zsh|cmd|powershell)/i,
  />\s*(\/etc\/|\/tmp\/|\/var\/)/,
  /&&\s*(rm|cat|wget|curl)/i,
];

// ============================================================
// AUDIT STATE
// ============================================================

let currentConfig: AuditConfig = { ...DEFAULT_CONFIG };
let auditStats = {
  totalAudited: 0,
  totalPassed: 0,
  totalFailed: 0,
  injectionAttempts: 0,
  temporalRejections: 0,
};

// ============================================================
// CORE AUDIT FUNCTIONS
// ============================================================

/**
 * Check temporal gate - is the data fresh enough?
 */
function checkTemporalGate(
  packet: DataPacket,
  cutoff: Date
): {
  passed: boolean;
  reason?: string;
} {
  if (!packet.date) {
    // No date = can't verify freshness, slight penalty but pass
    return { passed: true, reason: 'No date provided - assuming current' };
  }

  try {
    const packetDate = new Date(packet.date);
    if (isNaN(packetDate.getTime())) {
      return { passed: false, reason: 'Invalid date format' };
    }

    if (packetDate < cutoff) {
      return {
        passed: false,
        reason: `Data from ${packet.date} is before cutoff ${cutoff.toISOString().split('T')[0]}`,
      };
    }

    return { passed: true };
  } catch {
    return { passed: false, reason: 'Date parsing error' };
  }
}

/**
 * Check keyword gate - required/forbidden keywords.
 */
function checkKeywordGate(
  content: string,
  required: string[],
  forbidden: string[]
): { passed: boolean; reason?: string; score: number } {
  const lowerContent = content.toLowerCase();

  // Check forbidden keywords
  for (const keyword of forbidden) {
    if (lowerContent.includes(keyword.toLowerCase())) {
      return {
        passed: false,
        reason: `Forbidden keyword detected: ${keyword}`,
        score: 0,
      };
    }
  }

  // Check required keywords (if any specified)
  if (required.length > 0) {
    const found = required.filter((k) =>
      lowerContent.includes(k.toLowerCase())
    );
    if (found.length === 0) {
      return {
        passed: false,
        reason: 'No required keywords found',
        score: 0,
      };
    }
    return {
      passed: true,
      score: found.length / required.length,
    };
  }

  return { passed: true, score: 1.0 };
}

/**
 * Check for prompt injection attempts.
 */
function checkPromptInjection(content: string): {
  detected: boolean;
  patterns: string[];
} {
  const detected: string[] = [];

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      detected.push(pattern.source.slice(0, 30) + '...');
    }
  }

  return {
    detected: detected.length > 0,
    patterns: detected,
  };
}

/**
 * Check for SQL injection attempts.
 */
function checkSqlInjection(content: string): {
  detected: boolean;
  patterns: string[];
} {
  const detected: string[] = [];

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      detected.push(pattern.source.slice(0, 30) + '...');
    }
  }

  return {
    detected: detected.length > 0,
    patterns: detected,
  };
}

/**
 * Check for XSS attempts.
 */
function checkXss(content: string): {
  detected: boolean;
  patterns: string[];
} {
  const detected: string[] = [];

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(content)) {
      detected.push(pattern.source.slice(0, 30) + '...');
    }
  }

  return {
    detected: detected.length > 0,
    patterns: detected,
  };
}

/**
 * Check for command injection attempts.
 */
function checkCommandInjection(content: string): {
  detected: boolean;
  patterns: string[];
} {
  const detected: string[] = [];

  for (const pattern of COMMAND_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      detected.push(pattern.source.slice(0, 30) + '...');
    }
  }

  return {
    detected: detected.length > 0,
    patterns: detected,
  };
}

/**
 * Sanitize content by removing/neutralizing dangerous patterns.
 */
function sanitizeContent(content: string): string {
  let sanitized = content;

  // Remove script tags
  sanitized = sanitized.replace(/<script[\s\S]*?<\/script>/gi, '[REMOVED]');

  // Neutralize event handlers
  sanitized = sanitized.replace(/on\w+\s*=/gi, 'data-removed=');

  // Escape HTML entities
  sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Remove shell metacharacters
  sanitized = sanitized.replace(/[`$]/g, '');

  // Truncate if too long
  if (sanitized.length > currentConfig.maxContentLength) {
    sanitized =
      sanitized.slice(0, currentConfig.maxContentLength) + '... [TRUNCATED]';
  }

  return sanitized;
}

/**
 * Calculate integrity score based on all checks.
 */
function calculateIntegrityScore(
  temporalPassed: boolean,
  keywordScore: number,
  injectionFree: boolean,
  hasHash: boolean
): number {
  let score = 0;

  // Temporal integrity (25%)
  if (temporalPassed) score += 0.25;

  // Keyword relevance (25%)
  score += keywordScore * 0.25;

  // Injection-free (40%)
  if (injectionFree) score += 0.4;

  // Hash verification (10%)
  if (hasHash) score += 0.1;

  return Math.round(score * 100) / 100;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Audit a single data packet.
 */
export function auditPacket(
  packet: DataPacket,
  config: Partial<AuditConfig> = {}
): PurityResult {
  const cfg = { ...currentConfig, ...config };
  const content = packet.text || JSON.stringify(packet);

  const gatesPassed: string[] = [];
  const gatesFailed: string[] = [];
  const warnings: string[] = [];

  // Track stats
  auditStats.totalAudited++;

  // 1. Temporal Gate
  const temporal = checkTemporalGate(packet, cfg.cutoffDate);
  if (temporal.passed) {
    gatesPassed.push('temporal');
    if (temporal.reason) warnings.push(temporal.reason);
  } else {
    gatesFailed.push('temporal');
    warnings.push(temporal.reason || 'Temporal check failed');
    auditStats.temporalRejections++;
  }

  // 2. Keyword Gate
  const keywords = checkKeywordGate(
    content,
    cfg.requiredKeywords,
    cfg.forbiddenKeywords
  );
  if (keywords.passed) {
    gatesPassed.push('keyword');
  } else {
    gatesFailed.push('keyword');
    warnings.push(keywords.reason || 'Keyword check failed');
  }

  // 3. Injection Gates
  let injectionFree = true;

  if (cfg.detectPromptInjection) {
    const prompt = checkPromptInjection(content);
    if (prompt.detected) {
      injectionFree = false;
      gatesFailed.push('prompt-injection');
      warnings.push(
        `Prompt injection detected: ${prompt.patterns.length} pattern(s)`
      );
      auditStats.injectionAttempts++;
    } else {
      gatesPassed.push('prompt-injection');
    }
  }

  if (cfg.detectSqlInjection) {
    const sql = checkSqlInjection(content);
    if (sql.detected) {
      injectionFree = false;
      gatesFailed.push('sql-injection');
      warnings.push(
        `SQL injection detected: ${sql.patterns.length} pattern(s)`
      );
      auditStats.injectionAttempts++;
    } else {
      gatesPassed.push('sql-injection');
    }
  }

  if (cfg.detectXss) {
    const xss = checkXss(content);
    if (xss.detected) {
      injectionFree = false;
      gatesFailed.push('xss');
      warnings.push(`XSS detected: ${xss.patterns.length} pattern(s)`);
      auditStats.injectionAttempts++;
    } else {
      gatesPassed.push('xss');
    }
  }

  if (cfg.detectCommandInjection) {
    const cmd = checkCommandInjection(content);
    if (cmd.detected) {
      injectionFree = false;
      gatesFailed.push('command-injection');
      warnings.push(
        `Command injection detected: ${cmd.patterns.length} pattern(s)`
      );
      auditStats.injectionAttempts++;
    } else {
      gatesPassed.push('command-injection');
    }
  }

  // 4. Length check
  if (content.length > cfg.maxContentLength) {
    gatesFailed.push('length');
    warnings.push(
      `Content exceeds max length: ${content.length} > ${cfg.maxContentLength}`
    );
  } else {
    gatesPassed.push('length');
  }

  // Calculate integrity score
  const integrityScore = calculateIntegrityScore(
    temporal.passed,
    keywords.score,
    injectionFree,
    !!packet.id
  );

  // Determine if pure
  const pure =
    gatesFailed.length === 0 && integrityScore >= cfg.minIntegrityScore;

  if (pure) {
    auditStats.totalPassed++;
  } else {
    auditStats.totalFailed++;
  }

  // Create sanitized version if needed
  const sanitized = injectionFree
    ? packet
    : {
        ...packet,
        text: sanitizeContent(content),
      };

  return {
    pure,
    integrityScore,
    gatesPassed,
    gatesFailed,
    warnings,
    sanitized,
    original: packet,
  };
}

/**
 * Audit a stream of data packets.
 */
export function auditStream(
  rawJson: string,
  config: Partial<AuditConfig> = {}
): StreamAuditResult {
  const result: StreamAuditResult = {
    total: 0,
    passed: 0,
    failed: 0,
    validated: [],
    rejected: [],
  };

  try {
    const data = JSON.parse(rawJson);
    const packets = Array.isArray(data) ? data : [data];

    result.total = packets.length;

    for (const packet of packets) {
      const audit = auditPacket(packet, config);

      if (audit.pure) {
        result.passed++;
        result.validated.push({
          ...audit.sanitized!,
          integrityScore: audit.integrityScore,
        });
      } else {
        result.failed++;
        result.rejected.push({
          packet,
          reason: audit.warnings.join('; '),
        });
      }
    }
  } catch (err) {
    MollyLogger.error('Stream audit failed', 'data-purity', {}, err);
    result.rejected.push({
      packet: { text: rawJson },
      reason: `Parse error: ${err instanceof Error ? err.message : 'Unknown'}`,
    });
  }

  return result;
}

/**
 * Check if text contains security-relevant content.
 */
export function isSecurityRelevant(text: string): {
  relevant: boolean;
  keywords: string[];
} {
  const lower = text.toLowerCase();
  const found = SECURITY_KEYWORDS.filter((k) => lower.includes(k));

  return {
    relevant: found.length > 0,
    keywords: found,
  };
}

/**
 * Configure the audit system.
 */
export function configureAudit(config: Partial<AuditConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  MollyLogger.info('Audit configuration updated', 'data-purity', {
    cutoffDate: currentConfig.cutoffDate.toISOString(),
    detectPromptInjection: currentConfig.detectPromptInjection,
  });
}

/**
 * Get current audit configuration.
 */
export function getAuditConfig(): AuditConfig {
  return { ...currentConfig };
}

/**
 * Get audit statistics.
 */
export function getAuditStats(): typeof auditStats {
  return { ...auditStats };
}

/**
 * Reset audit statistics.
 */
export function resetAuditStats(): void {
  auditStats = {
    totalAudited: 0,
    totalPassed: 0,
    totalFailed: 0,
    injectionAttempts: 0,
    temporalRejections: 0,
  };
}

/**
 * Quick purity check for a string.
 */
export function quickPurityCheck(text: string): {
  safe: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  // Check for obvious injection attempts
  const prompt = checkPromptInjection(text);
  if (prompt.detected) {
    issues.push('Prompt injection attempt');
  }

  const sql = checkSqlInjection(text);
  if (sql.detected) {
    issues.push('SQL injection attempt');
  }

  const xss = checkXss(text);
  if (xss.detected) {
    issues.push('XSS attempt');
  }

  const cmd = checkCommandInjection(text);
  if (cmd.detected) {
    issues.push('Command injection attempt');
  }

  return {
    safe: issues.length === 0,
    issues,
  };
}

/**
 * Format purity result for display.
 */
export function formatPurityResult(result: PurityResult): string {
  const status = result.pure ? '✓ PURE' : '✗ IMPURE';
  const lines = [
    `Status: ${status}`,
    `Integrity Score: ${(result.integrityScore * 100).toFixed(1)}%`,
    '',
    `Gates Passed: ${result.gatesPassed.join(', ') || 'none'}`,
    `Gates Failed: ${result.gatesFailed.join(', ') || 'none'}`,
  ];

  if (result.warnings.length > 0) {
    lines.push('', 'Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  return lines.join('\n');
}
