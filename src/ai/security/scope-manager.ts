/**
 * @fileOverview Scope Manager
 *
 * Manages bug bounty program scope for Molly.
 * - Parses program scope from HackerOne/Bugcrowd
 * - Tracks in-scope vs out-of-scope targets
 * - Validates targets before testing
 * - Manages rate limits per program
 * - Caches program information
 *
 * CRITICAL: Only test what's explicitly in scope.
 */

import type {
  BugBountyProgram,
  ScopeTarget,
  RateLimit,
  BountyRange,
  VulnerabilitySeverity,
} from './bug-hunter-types';
import { MollyLogger, generateTraceId } from '../logger';

// ============================================
// SCOPE MANAGER CLASS
// ============================================

export class ScopeManager {
  private programs: Map<string, BugBountyProgram> = new Map();
  private rateTrackers: Map<string, RateTracker> = new Map();
  private traceId: string;

  constructor() {
    this.traceId = generateTraceId();
  }

  /**
   * Register a bug bounty program
   */
  registerProgram(program: BugBountyProgram): void {
    this.programs.set(program.id, program);
    MollyLogger.info(
      `Program registered: ${program.name}`,
      'scope-manager',
      { programId: program.id, inScopeCount: program.inScope.length },
      this.traceId
    );
  }

  /**
   * Parse scope from text (copy-pasted from program page)
   */
  parseScopeText(programId: string, scopeText: string): BugBountyProgram {
    const program: BugBountyProgram = {
      id: programId,
      platform: 'custom',
      name: programId,
      handle: programId,
      url: '',
      inScope: [],
      outOfScope: [],
      safeHarbor: false,
      allowAutomatedScanning: false,
      requiresPermission: true,
      bountyRanges: [],
      status: 'active',
      lastUpdated: Date.now(),
      priority: 5,
      huntedBefore: false,
      findingsCount: 0,
    };

    const lines = scopeText.split('\n');
    let currentSection: 'in' | 'out' | null = null;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();

      // Detect section headers
      if (
        trimmed.includes('in scope') ||
        trimmed.includes('in-scope') ||
        trimmed.includes('eligible')
      ) {
        currentSection = 'in';
        continue;
      }
      if (
        trimmed.includes('out of scope') ||
        trimmed.includes('out-of-scope') ||
        trimmed.includes('not eligible')
      ) {
        currentSection = 'out';
        continue;
      }

      // Parse targets
      if (currentSection && trimmed.length > 0) {
        const target = this.parseTargetLine(line);
        if (target) {
          if (currentSection === 'in') {
            program.inScope.push(target);
          } else {
            program.outOfScope.push(target);
          }
        }
      }

      // Parse bounty ranges
      const bountyMatch = trimmed.match(
        /(\w+):\s*\$?([\d,]+)\s*[-–]\s*\$?([\d,]+)/
      );
      if (bountyMatch) {
        const severity = this.parseSeverity(bountyMatch[1]);
        if (severity) {
          program.bountyRanges.push({
            severity,
            min: parseInt(bountyMatch[2].replace(/,/g, '')),
            max: parseInt(bountyMatch[3].replace(/,/g, '')),
            currency: 'USD',
          });
        }
      }

      // Parse flags
      if (trimmed.includes('safe harbor')) {
        program.safeHarbor = true;
      }
      if (trimmed.includes('automated') && trimmed.includes('allow')) {
        program.allowAutomatedScanning = true;
      }
    }

    this.registerProgram(program);
    return program;
  }

  /**
   * Parse a single target line
   */
  private parseTargetLine(line: string): ScopeTarget | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return null;
    }

    // Try to extract target
    const patterns = [
      // Domain patterns
      {
        regex: /\*\.([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/,
        type: 'wildcard' as const,
      },
      { regex: /([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/, type: 'domain' as const },
      // IP patterns
      {
        regex: /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2})/,
        type: 'cidr' as const,
      },
      { regex: /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/, type: 'ip' as const },
      // App patterns
      {
        regex: /(com\.[a-zA-Z0-9.]+|ios\.[a-zA-Z0-9.]+)/i,
        type: 'mobile_app' as const,
      },
      // GitHub patterns
      {
        regex: /github\.com\/([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)/i,
        type: 'source_code' as const,
      },
    ];

    for (const { regex, type } of patterns) {
      const match = trimmed.match(regex);
      if (match) {
        return {
          type,
          target: type === 'wildcard' ? `*.${match[1]}` : match[1],
          eligibleForBounty: !trimmed.toLowerCase().includes('no bounty'),
          description: trimmed,
        };
      }
    }

    // Generic text target
    if (trimmed.length > 3) {
      return {
        type: 'other',
        target: trimmed.split(/\s+/)[0],
        eligibleForBounty: true,
        description: trimmed,
      };
    }

    return null;
  }

  /**
   * Parse severity from text
   */
  private parseSeverity(text: string): VulnerabilitySeverity | null {
    const lower = text.toLowerCase();
    if (lower.includes('critical')) return 'critical';
    if (lower.includes('high')) return 'high';
    if (lower.includes('medium') || lower.includes('med')) return 'medium';
    if (lower.includes('low')) return 'low';
    if (lower.includes('info')) return 'informational';
    return null;
  }

  /**
   * Check if a target is in scope
   */
  isInScope(
    programId: string,
    target: string
  ): { inScope: boolean; reason: string } {
    const program = this.programs.get(programId);
    if (!program) {
      return { inScope: false, reason: 'Program not found' };
    }

    // Check out-of-scope first (deny takes precedence)
    for (const oos of program.outOfScope) {
      if (this.matchesTarget(target, oos)) {
        return {
          inScope: false,
          reason: `Explicitly out of scope: ${oos.description || oos.target}`,
        };
      }
    }

    // Check in-scope
    for (const is of program.inScope) {
      if (this.matchesTarget(target, is)) {
        return {
          inScope: true,
          reason: `In scope: ${is.description || is.target}`,
        };
      }
    }

    return { inScope: false, reason: 'Not explicitly in scope' };
  }

  /**
   * Match a target against a scope entry
   */
  private matchesTarget(target: string, scopeTarget: ScopeTarget): boolean {
    const normalizedTarget = target
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0];
    const scopeValue = scopeTarget.target.toLowerCase();

    switch (scopeTarget.type) {
      case 'domain':
        return (
          normalizedTarget === scopeValue ||
          normalizedTarget.endsWith('.' + scopeValue)
        );

      case 'wildcard':
        const baseDomain = scopeValue.replace('*.', '');
        return (
          normalizedTarget === baseDomain ||
          normalizedTarget.endsWith('.' + baseDomain)
        );

      case 'ip':
        return normalizedTarget === scopeValue;

      case 'cidr':
        return this.ipInCIDR(normalizedTarget, scopeValue);

      case 'source_code':
        return target.includes(scopeValue);

      default:
        return normalizedTarget.includes(scopeValue);
    }
  }

  /**
   * Check if IP is in CIDR range
   */
  private ipInCIDR(ip: string, cidr: string): boolean {
    const [cidrIp, cidrMask] = cidr.split('/');
    if (!cidrMask) return ip === cidrIp;

    const ipParts = ip.split('.').map(Number);
    const cidrParts = cidrIp.split('.').map(Number);
    const mask = parseInt(cidrMask);

    if (ipParts.length !== 4 || ipParts.some(isNaN)) return false;

    const ipNum =
      (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
    const cidrNum =
      (cidrParts[0] << 24) +
      (cidrParts[1] << 16) +
      (cidrParts[2] << 8) +
      cidrParts[3];
    const maskNum = ~((1 << (32 - mask)) - 1);

    return (ipNum & maskNum) === (cidrNum & maskNum);
  }

  /**
   * Check rate limit for a target
   */
  canMakeRequest(
    programId: string,
    target: string
  ): { allowed: boolean; waitMs?: number } {
    const program = this.programs.get(programId);
    if (!program) {
      return { allowed: false };
    }

    const key = `${programId}:${target}`;
    let tracker = this.rateTrackers.get(key);

    if (!tracker) {
      // Get rate limit for target
      const limit = this.getRateLimitForTarget(program, target);
      tracker = new RateTracker(limit);
      this.rateTrackers.set(key, tracker);
    }

    return tracker.checkLimit();
  }

  /**
   * Record a request for rate limiting
   */
  recordRequest(programId: string, target: string): void {
    const key = `${programId}:${target}`;
    const tracker = this.rateTrackers.get(key);
    if (tracker) {
      tracker.recordRequest();
    }
  }

  /**
   * Get rate limit for a target
   */
  private getRateLimitForTarget(
    program: BugBountyProgram,
    target: string
  ): RateLimit {
    // Check for target-specific limits
    if (program.rateLimits) {
      for (const limit of program.rateLimits) {
        if (target.includes(limit.target)) {
          return limit;
        }
      }
    }

    // Default conservative limits
    return {
      target: '*',
      requestsPerSecond: 1,
      requestsPerMinute: 30,
      requestsPerHour: 500,
    };
  }

  /**
   * Get all registered programs
   */
  getPrograms(): BugBountyProgram[] {
    return Array.from(this.programs.values());
  }

  /**
   * Get a specific program
   */
  getProgram(programId: string): BugBountyProgram | undefined {
    return this.programs.get(programId);
  }

  /**
   * Get in-scope targets for a program
   */
  getInScopeTargets(programId: string): ScopeTarget[] {
    const program = this.programs.get(programId);
    return program?.inScope || [];
  }

  /**
   * Get bounty range for a severity
   */
  getBountyRange(
    programId: string,
    severity: VulnerabilitySeverity
  ): BountyRange | undefined {
    const program = this.programs.get(programId);
    return program?.bountyRanges.find((r) => r.severity === severity);
  }

  /**
   * Validate a test request before execution
   */
  validateTestRequest(
    programId: string,
    target: string,
    testType: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check program exists
    const program = this.programs.get(programId);
    if (!program) {
      errors.push('Program not registered');
      return { valid: false, errors };
    }

    // Check program is active
    if (program.status !== 'active') {
      errors.push(`Program is ${program.status}`);
    }

    // Check target is in scope
    const scopeCheck = this.isInScope(programId, target);
    if (!scopeCheck.inScope) {
      errors.push(scopeCheck.reason);
    }

    // Check rate limit
    const rateCheck = this.canMakeRequest(programId, target);
    if (!rateCheck.allowed) {
      errors.push(`Rate limited. Wait ${rateCheck.waitMs}ms`);
    }

    // Check if automated scanning is allowed
    if (testType === 'automated' && !program.allowAutomatedScanning) {
      errors.push('Program does not allow automated scanning');
    }

    return { valid: errors.length === 0, errors };
  }
}

// ============================================
// RATE TRACKER
// ============================================

class RateTracker {
  private limit: RateLimit;
  private requests: number[] = [];

  constructor(limit: RateLimit) {
    this.limit = limit;
  }

  checkLimit(): { allowed: boolean; waitMs?: number } {
    const now = Date.now();
    this.cleanOldRequests(now);

    // Check per-second limit
    if (this.limit.requestsPerSecond) {
      const lastSecond = this.requests.filter((t) => t > now - 1000);
      if (lastSecond.length >= this.limit.requestsPerSecond) {
        const oldest = Math.min(...lastSecond);
        return { allowed: false, waitMs: 1000 - (now - oldest) };
      }
    }

    // Check per-minute limit
    if (this.limit.requestsPerMinute) {
      const lastMinute = this.requests.filter((t) => t > now - 60000);
      if (lastMinute.length >= this.limit.requestsPerMinute) {
        const oldest = Math.min(...lastMinute);
        return { allowed: false, waitMs: 60000 - (now - oldest) };
      }
    }

    // Check per-hour limit
    if (this.limit.requestsPerHour) {
      const lastHour = this.requests.filter((t) => t > now - 3600000);
      if (lastHour.length >= this.limit.requestsPerHour) {
        const oldest = Math.min(...lastHour);
        return { allowed: false, waitMs: 3600000 - (now - oldest) };
      }
    }

    return { allowed: true };
  }

  recordRequest(): void {
    this.requests.push(Date.now());
  }

  private cleanOldRequests(now: number): void {
    // Keep only last hour of requests
    this.requests = this.requests.filter((t) => t > now - 3600000);
  }
}

// ============================================
// PRESET PROGRAM TEMPLATES
// ============================================

export const PROGRAM_TEMPLATES: Partial<BugBountyProgram>[] = [
  {
    platform: 'hackerone',
    name: 'HackerOne Program Template',
    bountyRanges: [
      { severity: 'critical', min: 5000, max: 25000, currency: 'USD' },
      { severity: 'high', min: 2500, max: 7500, currency: 'USD' },
      { severity: 'medium', min: 500, max: 2500, currency: 'USD' },
      { severity: 'low', min: 100, max: 500, currency: 'USD' },
    ],
    safeHarbor: true,
    allowAutomatedScanning: false,
    rateLimits: [{ target: '*', requestsPerSecond: 1, requestsPerMinute: 30 }],
  },
  {
    platform: 'bugcrowd',
    name: 'Bugcrowd Program Template',
    bountyRanges: [
      { severity: 'critical', min: 3000, max: 15000, currency: 'USD' },
      { severity: 'high', min: 1500, max: 5000, currency: 'USD' },
      { severity: 'medium', min: 300, max: 1500, currency: 'USD' },
      { severity: 'low', min: 50, max: 300, currency: 'USD' },
    ],
    safeHarbor: true,
    allowAutomatedScanning: false,
  },
];

// ============================================
// COMMON VULNERABILITY EXCLUSIONS
// ============================================

export const COMMON_EXCLUSIONS = [
  'Self-XSS',
  'Missing security headers without demonstrated impact',
  'CSRF on logout',
  'CSRF on non-sensitive functionality',
  'Clickjacking without demonstration of impact',
  'Content spoofing / text injection',
  'Rate limiting / brute force on non-authentication endpoints',
  'Missing cookie flags on non-session cookies',
  'Software version disclosure',
  'Stack traces without additional sensitive information',
  'SPF/DKIM/DMARC issues',
  'User enumeration',
  'Host header injection without impact',
  'Tabnabbing',
  'Physical attacks',
  'Social engineering',
  'Denial of Service (DoS) attacks',
  'Open redirects without additional impact',
  'Issues in third-party applications',
  'Issues found through automated scanning without verification',
  'Reports of spam or social engineering techniques',
  'Vulnerabilities requiring physical access',
  'Vulnerabilities affecting outdated browsers',
];

// ============================================
// EXPORT
// ============================================

export const scopeManager = new ScopeManager();
