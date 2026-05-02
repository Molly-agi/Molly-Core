/**
 * @fileOverview Hunt Orchestrator
 *
 * The brain of Molly's bug hunting system.
 * Coordinates all components to execute systematic vulnerability hunting:
 *
 * - Campaign management (track multiple programs)
 * - Hunt session orchestration
 * - Intelligent target prioritization
 * - Finding correlation and deduplication
 * - Progress tracking and metrics
 * - Autonomous hunting cycles
 *
 * This is where Molly becomes a hunter.
 */

import type {
  BugBountyProgram,
  HuntCampaign,
  HuntSession,
  HuntAction,
  VulnerabilityFinding,
  VulnerabilityCategory,
  ReconTarget,
  SourceCodeAnalysis,
} from './bug-hunter-types';
import { reconEngine, ReconEngine } from './recon-engine';
import { codeAnalyzer, SourceCodeAnalyzer } from './code-analyzer';
import { scopeManager, ScopeManager } from './scope-manager';
import {
  reportGenerator,
  ReportGenerator,
  CVSSCalculator,
  IMPACT_TEMPLATES,
} from './report-generator';
import {
  ALL_VULNERABILITY_PATTERNS,
  CWE_DATABASE,
} from './vulnerability-patterns';
import { MollyLogger, generateTraceId } from '../logger';

// ============================================
// HUNT STRATEGY
// ============================================

interface HuntStrategy {
  name: string;
  description: string;
  phases: HuntPhase[];
  focusAreas: VulnerabilityCategory[];
  priority: number;
}

interface HuntPhase {
  name: string;
  actions: string[];
  durationMinutes: number;
}

const HUNT_STRATEGIES: HuntStrategy[] = [
  {
    name: 'Quick Wins',
    description: 'Focus on low-hanging fruit and common misconfigurations',
    priority: 1,
    focusAreas: ['security_misconfig', 'information_leak', 'xss'],
    phases: [
      {
        name: 'Surface Scan',
        actions: [
          'security_headers',
          'error_pages',
          'robots_txt',
          'common_files',
        ],
        durationMinutes: 15,
      },
      {
        name: 'Input Points',
        actions: ['form_xss', 'url_params', 'reflected_input'],
        durationMinutes: 30,
      },
    ],
  },
  {
    name: 'Authentication Focus',
    description: 'Deep dive into authentication and authorization',
    priority: 2,
    focusAreas: ['auth', 'access_control', 'business_logic'],
    phases: [
      {
        name: 'Auth Analysis',
        actions: [
          'login_flow',
          'session_management',
          'password_reset',
          'mfa_bypass',
        ],
        durationMinutes: 45,
      },
      {
        name: 'Authorization',
        actions: ['idor_hunting', 'privilege_escalation', 'role_bypass'],
        durationMinutes: 60,
      },
    ],
  },
  {
    name: 'API Deep Dive',
    description: 'Systematic API security testing',
    priority: 3,
    focusAreas: ['api_security', 'injection', 'access_control'],
    phases: [
      {
        name: 'API Discovery',
        actions: [
          'endpoint_discovery',
          'schema_analysis',
          'documentation_review',
        ],
        durationMinutes: 30,
      },
      {
        name: 'API Testing',
        actions: [
          'auth_bypass',
          'rate_limiting',
          'input_validation',
          'bola',
          'mass_assignment',
        ],
        durationMinutes: 90,
      },
    ],
  },
  {
    name: 'Source Code Review',
    description: 'Static analysis of available source code',
    priority: 4,
    focusAreas: ['injection', 'auth', 'cryptography', 'deserialization'],
    phases: [
      {
        name: 'Automated Scan',
        actions: ['static_analysis', 'dependency_check', 'secret_scan'],
        durationMinutes: 20,
      },
      {
        name: 'Manual Review',
        actions: [
          'taint_analysis',
          'auth_review',
          'crypto_review',
          'injection_sinks',
        ],
        durationMinutes: 120,
      },
    ],
  },
  {
    name: 'Infrastructure',
    description: 'Server-side vulnerabilities',
    priority: 5,
    focusAreas: ['ssrf', 'xxe', 'file_handling', 'injection'],
    phases: [
      {
        name: 'SSRF Hunting',
        actions: [
          'url_params',
          'webhook_features',
          'file_imports',
          'pdf_generators',
        ],
        durationMinutes: 45,
      },
      {
        name: 'File Operations',
        actions: ['file_upload', 'path_traversal', 'file_inclusion'],
        durationMinutes: 45,
      },
    ],
  },
];

// ============================================
// HUNT ORCHESTRATOR CLASS
// ============================================

export class HuntOrchestrator {
  private campaigns: Map<string, HuntCampaign> = new Map();
  private activeSessions: Map<string, HuntSession> = new Map();
  private findings: Map<string, VulnerabilityFinding> = new Map();
  private traceId: string;

  // Component references
  private recon: ReconEngine;
  private analyzer: SourceCodeAnalyzer;
  private scope: ScopeManager;
  private reporter: ReportGenerator;

  constructor() {
    this.traceId = generateTraceId();
    this.recon = reconEngine;
    this.analyzer = codeAnalyzer;
    this.scope = scopeManager;
    this.reporter = reportGenerator;
  }

  // ============================================
  // CAMPAIGN MANAGEMENT
  // ============================================

  /**
   * Create a new hunt campaign
   */
  createCampaign(
    name: string,
    program: BugBountyProgram,
    focusAreas?: VulnerabilityCategory[]
  ): HuntCampaign {
    const campaign: HuntCampaign = {
      id: generateTraceId(),
      name,
      programId: program.id,
      program,
      status: 'planning',
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
      reconComplete: false,
      targetsAnalyzed: 0,
      totalTargets: program.inScope.length,
      findings: [],
      submittedFindings: [],
      focusAreas: focusAreas || ['xss', 'access_control', 'injection'],
      methodology: [],
      notes: '',
      hoursSpent: 0,
      totalEarned: 0,
    };

    this.campaigns.set(campaign.id, campaign);
    this.scope.registerProgram(program);

    MollyLogger.info(
      `Campaign created: ${name}`,
      'hunt-orchestrator',
      { campaignId: campaign.id, program: program.name },
      this.traceId
    );

    return campaign;
  }

  /**
   * Get suggested strategy for a campaign
   */
  suggestStrategy(campaign: HuntCampaign): HuntStrategy {
    // Analyze program to suggest best strategy
    const program = campaign.program;

    // If source code available, prioritize code review
    const hasSource = program.inScope.some((t) => t.type === 'source_code');
    if (hasSource) {
      return HUNT_STRATEGIES.find((s) => s.name === 'Source Code Review')!;
    }

    // If API-heavy, focus on API
    const hasApi = program.inScope.some(
      (t) =>
        t.target.includes('api') || t.description?.toLowerCase().includes('api')
    );
    if (hasApi) {
      return HUNT_STRATEGIES.find((s) => s.name === 'API Deep Dive')!;
    }

    // Default to quick wins for new hunters
    return HUNT_STRATEGIES[0];
  }

  // ============================================
  // HUNT EXECUTION
  // ============================================

  /**
   * Start a hunt session
   */
  startSession(campaignId: string, target: string): HuntSession {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    // Validate target is in scope
    const scopeCheck = this.scope.isInScope(campaign.programId, target);
    if (!scopeCheck.inScope) {
      throw new Error(`Target not in scope: ${scopeCheck.reason}`);
    }

    const session: HuntSession = {
      id: generateTraceId(),
      campaignId,
      startedAt: Date.now(),
      phase: 'recon',
      target,
      actions: [],
      findings: [],
      notes: '',
      nextSteps: [],
    };

    this.activeSessions.set(session.id, session);
    campaign.status = 'hunting';
    campaign.lastActivityAt = Date.now();

    MollyLogger.info(
      `Hunt session started: ${target}`,
      'hunt-orchestrator',
      { sessionId: session.id, campaignId },
      this.traceId
    );

    return session;
  }

  /**
   * Run reconnaissance on a target
   */
  async runRecon(sessionId: string): Promise<ReconTarget> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.phase = 'recon';
    this.recordAction(
      session,
      'scan',
      `Starting reconnaissance on ${session.target}`
    );

    const reconResult = await this.recon.fullRecon(session.target);

    // Record findings from recon
    this.recordAction(
      session,
      'analysis',
      `Recon complete: ${reconResult.technologies.length} technologies, ${reconResult.apiEndpoints.length} endpoints`,
      true
    );

    // Check for immediate findings
    for (const header of reconResult.headers) {
      if (
        header.security === 'missing' ||
        header.security === 'misconfigured'
      ) {
        this.createFinding(session, {
          title: `Missing/Misconfigured Security Header: ${header.name}`,
          category: 'security_misconfig',
          severity: header.security === 'misconfigured' ? 'medium' : 'low',
          endpoint: session.target,
          description:
            header.notes || `The ${header.name} header is ${header.security}`,
          confidence: 90,
        });
      }
    }

    // Check for secrets in JS files
    for (const jsFile of reconResult.jsFiles) {
      for (const secret of jsFile.secrets) {
        if (secret.confidence >= 70) {
          this.createFinding(session, {
            title: `Potential ${secret.type} Exposed in JavaScript`,
            category: 'information_leak',
            severity:
              secret.type === 'api_key' || secret.type === 'aws_key'
                ? 'high'
                : 'medium',
            endpoint: jsFile.url,
            description: `A potential ${secret.pattern} was found exposed in JavaScript code.`,
            proofOfConcept: `Found in: ${jsFile.url}\nPattern: ${secret.pattern}\nValue: ${secret.value}`,
            confidence: secret.confidence,
          });
        }
      }
    }

    const campaign = this.campaigns.get(session.campaignId);
    if (campaign) {
      campaign.reconComplete = true;
      campaign.lastActivityAt = Date.now();
    }

    return reconResult;
  }

  /**
   * Analyze source code
   */
  async analyzeCode(
    sessionId: string,
    files: Array<{ path: string; content: string }>
  ): Promise<SourceCodeAnalysis> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.phase = 'analysis';
    this.recordAction(
      session,
      'analysis',
      `Analyzing ${files.length} source files`
    );

    const analysis = await this.analyzer.analyzeRepository(files);

    // Convert code findings to vulnerability findings
    for (const codeFinding of analysis.findings) {
      if (codeFinding.confidence >= 60 && codeFinding.falsePositiveRisk < 50) {
        this.createFinding(session, {
          title: codeFinding.message,
          category: codeFinding.category,
          severity: codeFinding.severity,
          filePath: codeFinding.file,
          lineNumber: codeFinding.line,
          codeSnippet: codeFinding.snippet,
          description: `${codeFinding.rule}: ${codeFinding.message}`,
          cweIds: codeFinding.cwe ? [codeFinding.cwe] : undefined,
          confidence: codeFinding.confidence,
        });
      }
    }

    // Check for secrets
    for (const secret of analysis.secrets) {
      if (secret.confidence >= 70) {
        this.createFinding(session, {
          title: `Hardcoded ${secret.type} in Source Code`,
          category: 'auth',
          severity: 'high',
          description: `${secret.pattern} found exposed in source code at ${secret.context}`,
          confidence: secret.confidence,
        });
      }
    }

    this.recordAction(
      session,
      'analysis',
      `Code analysis complete: ${analysis.findings.length} findings, ${analysis.hotspots.length} hotspots`,
      analysis.findings.length > 0
    );

    return analysis;
  }

  /**
   * Test for a specific vulnerability pattern
   */
  async testPattern(
    sessionId: string,
    patternId: string,
    target: string
  ): Promise<VulnerabilityFinding | null> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const pattern = ALL_VULNERABILITY_PATTERNS.find((p) => p.id === patternId);
    if (!pattern) {
      throw new Error(`Pattern not found: ${patternId}`);
    }

    const campaign = this.campaigns.get(session.campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${session.campaignId}`);
    }

    // Validate we can make the request
    const validation = this.scope.validateTestRequest(
      campaign.programId,
      target,
      'test'
    );
    if (!validation.valid) {
      this.recordAction(
        session,
        'test',
        `Skipped ${pattern.name}: ${validation.errors.join(', ')}`
      );
      return null;
    }

    session.phase = 'exploitation';
    this.recordAction(session, 'test', `Testing ${pattern.name} on ${target}`);

    // This is where actual testing would happen
    // For now, we create a template finding that would need manual verification
    const finding = this.createFinding(session, {
      title: `Potential ${pattern.name}`,
      category: pattern.category,
      severity: pattern.severity,
      endpoint: target,
      description: pattern.description,
      verifiedManually: false,
      automated: true,
      confidence: 50, // Lower confidence for automated findings
    });

    this.scope.recordRequest(campaign.programId, target);

    return finding;
  }

  // ============================================
  // FINDING MANAGEMENT
  // ============================================

  /**
   * Create a vulnerability finding
   */
  createFinding(
    session: HuntSession,
    data: Partial<VulnerabilityFinding> & { cweIds?: string[] }
  ): VulnerabilityFinding {
    // Calculate CVSS if not provided
    const cvssParams = CVSSCalculator.suggestFromCategory(
      data.category || 'security_misconfig'
    );
    const cvss = data.cvss || CVSSCalculator.calculate(cvssParams);

    // Get CWE references from IDs if provided, or use existing cwe array
    let cweRefs: (typeof CWE_DATABASE)[keyof typeof CWE_DATABASE][] = [];
    if (data.cweIds) {
      cweRefs = data.cweIds
        .map((id) => CWE_DATABASE[id])
        .filter((c): c is NonNullable<typeof c> => Boolean(c));
    } else if (data.cwe) {
      cweRefs = data.cwe;
    }

    const finding: VulnerabilityFinding = {
      id: generateTraceId(),
      title: data.title || 'Untitled Finding',
      category: data.category || 'security_misconfig',
      severity: data.severity || cvss.severity,
      cvss,
      cwe: cweRefs,
      endpoint: data.endpoint,
      parameter: data.parameter,
      filePath: data.filePath,
      lineNumber: data.lineNumber,
      codeSnippet: data.codeSnippet,
      description: data.description || '',
      impact:
        data.impact || IMPACT_TEMPLATES[data.category || 'security_misconfig'],
      proofOfConcept: data.proofOfConcept || '',
      reproductionSteps: data.reproductionSteps || [],
      evidence: data.evidence || [],
      remediation:
        data.remediation ||
        this.suggestRemediation(data.category || 'security_misconfig'),
      references: data.references || [],
      confidence: data.confidence || 70,
      automated: data.automated ?? true,
      verifiedManually: data.verifiedManually ?? false,
      discoveredAt: Date.now(),
      campaignId: session.campaignId,
    };

    // Check for duplicates
    const isDuplicate = this.checkDuplicate(finding);
    if (isDuplicate) {
      MollyLogger.info(
        `Duplicate finding skipped: ${finding.title}`,
        'hunt-orchestrator',
        { findingId: finding.id },
        this.traceId
      );
      return isDuplicate;
    }

    this.findings.set(finding.id, finding);
    session.findings.push(finding);

    const campaign = this.campaigns.get(session.campaignId);
    if (campaign) {
      campaign.findings.push(finding);
      campaign.lastActivityAt = Date.now();
    }

    MollyLogger.info(
      `Finding created: ${finding.title} (${finding.severity})`,
      'hunt-orchestrator',
      { findingId: finding.id, severity: finding.severity },
      this.traceId
    );

    return finding;
  }

  /**
   * Check if finding is a duplicate
   */
  private checkDuplicate(
    finding: VulnerabilityFinding
  ): VulnerabilityFinding | null {
    const existingFindings = Array.from(this.findings.values());
    for (const existing of existingFindings) {
      // Same endpoint and category
      if (
        existing.endpoint === finding.endpoint &&
        existing.category === finding.category
      ) {
        return existing;
      }

      // Same file and line
      if (
        existing.filePath === finding.filePath &&
        existing.lineNumber === finding.lineNumber
      ) {
        return existing;
      }
    }

    return null;
  }

  /**
   * Suggest remediation for a category
   */
  private suggestRemediation(category: VulnerabilityCategory): string {
    const remediations: Record<VulnerabilityCategory, string> = {
      injection:
        'Use parameterized queries or prepared statements. Validate and sanitize all input. Apply the principle of least privilege to database accounts.',
      xss: 'Encode all user input before rendering. Implement Content-Security-Policy. Use modern frameworks with auto-escaping.',
      auth: 'Implement multi-factor authentication. Use secure session management. Enforce strong password policies.',
      access_control:
        'Implement proper authorization checks on every request. Deny by default. Use indirect object references.',
      security_misconfig:
        'Apply security hardening guidelines. Remove unnecessary features. Keep software updated.',
      cryptography:
        'Use strong, modern cryptographic algorithms. Secure key management. Use TLS 1.2+ for transport.',
      ssrf: 'Validate and sanitize URLs. Use allowlists for permitted domains. Block internal IP ranges.',
      xxe: 'Disable external entity processing. Use less complex data formats (JSON). Keep XML parsers updated.',
      deserialization:
        'Avoid deserializing untrusted data. Implement integrity checks. Use allowlists for permitted classes.',
      components:
        'Keep all dependencies updated. Monitor security advisories. Remove unused dependencies.',
      logging:
        'Implement comprehensive logging. Monitor for suspicious activity. Protect log files.',
      business_logic:
        'Implement server-side validation. Use database transactions. Test edge cases thoroughly.',
      information_leak:
        'Minimize data exposure. Use generic error messages. Remove debug information in production.',
      file_handling:
        'Validate file paths. Store files outside webroot. Implement file type validation.',
      api_security:
        'Implement rate limiting. Use proper authentication. Validate all input.',
    };

    return remediations[category] || 'Review and address the security issue.';
  }

  /**
   * Generate report for a finding
   */
  generateReport(
    findingId: string,
    platform: 'hackerone' | 'bugcrowd' | 'intigriti' | 'generic' = 'generic'
  ) {
    const finding = this.findings.get(findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    return this.reporter.generateReport(finding, platform);
  }

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  /**
   * Record an action in a session
   */
  private recordAction(
    session: HuntSession,
    type: HuntAction['type'],
    description: string,
    interesting: boolean = false,
    result?: string
  ): void {
    session.actions.push({
      timestamp: Date.now(),
      type,
      description,
      result,
      interesting,
    });

    const campaign = this.campaigns.get(session.campaignId);
    if (campaign) {
      campaign.lastActivityAt = Date.now();
    }
  }

  /**
   * End a hunt session
   */
  endSession(sessionId: string, notes?: string): HuntSession {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.endedAt = Date.now();
    if (notes) {
      session.notes = notes;
    }

    // Update campaign metrics
    const campaign = this.campaigns.get(session.campaignId);
    if (campaign) {
      campaign.targetsAnalyzed++;
      campaign.hoursSpent += (session.endedAt - session.startedAt) / 3600000;
      campaign.lastActivityAt = Date.now();

      // Check if campaign is complete
      if (campaign.targetsAnalyzed >= campaign.totalTargets) {
        campaign.status = 'completed';
        campaign.completedAt = Date.now();
      }
    }

    this.activeSessions.delete(sessionId);

    MollyLogger.info(
      `Session ended: ${session.findings.length} findings`,
      'hunt-orchestrator',
      { sessionId, findings: session.findings.length },
      this.traceId
    );

    return session;
  }

  // ============================================
  // METRICS AND STATUS
  // ============================================

  /**
   * Get campaign status
   */
  getCampaignStatus(campaignId: string) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      return null;
    }

    const findingsBySeverity = {
      critical: campaign.findings.filter((f) => f.severity === 'critical')
        .length,
      high: campaign.findings.filter((f) => f.severity === 'high').length,
      medium: campaign.findings.filter((f) => f.severity === 'medium').length,
      low: campaign.findings.filter((f) => f.severity === 'low').length,
      informational: campaign.findings.filter(
        (f) => f.severity === 'informational'
      ).length,
    };

    const estimatedBounty = this.estimateBounty(campaign);

    return {
      id: campaign.id,
      name: campaign.name,
      program: campaign.program.name,
      status: campaign.status,
      progress: `${campaign.targetsAnalyzed}/${campaign.totalTargets}`,
      reconComplete: campaign.reconComplete,
      findings: {
        total: campaign.findings.length,
        bySeverity: findingsBySeverity,
        submitted: campaign.submittedFindings.length,
      },
      metrics: {
        hoursSpent: campaign.hoursSpent.toFixed(1),
        estimatedBounty,
        totalEarned: campaign.totalEarned,
      },
    };
  }

  /**
   * Estimate potential bounty
   */
  private estimateBounty(campaign: HuntCampaign): { min: number; max: number } {
    let min = 0;
    let max = 0;

    for (const finding of campaign.findings) {
      const range = this.scope.getBountyRange(
        campaign.programId,
        finding.severity
      );
      if (range) {
        min += range.min;
        max += range.max;
      }
    }

    return { min, max };
  }

  /**
   * Get all campaigns
   */
  getCampaigns() {
    return Array.from(this.campaigns.values());
  }

  /**
   * Get all findings
   */
  getFindings(campaignId?: string) {
    if (campaignId) {
      return Array.from(this.findings.values()).filter(
        (f) => f.campaignId === campaignId
      );
    }
    return Array.from(this.findings.values());
  }

  /**
   * Get hunt strategies
   */
  getStrategies(): HuntStrategy[] {
    return HUNT_STRATEGIES;
  }
}

// ============================================
// EXPORT
// ============================================

export const huntOrchestrator = new HuntOrchestrator();

// Re-export all components
export { reconEngine } from './recon-engine';
export { codeAnalyzer } from './code-analyzer';
export { scopeManager } from './scope-manager';
export { reportGenerator, CVSSCalculator } from './report-generator';
export {
  ALL_VULNERABILITY_PATTERNS,
  CWE_DATABASE,
} from './vulnerability-patterns';
export * from './bug-hunter-types';
