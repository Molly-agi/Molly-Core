/**
 * @fileOverview Bug Hunter Tools
 *
 * Tool definitions for Molly's bug hunting capabilities.
 * These tools are registered with Molly's autonomous system.
 */

import { z } from 'zod';
import type { VulnerabilityCategory } from './bug-hunter-types';
import { huntOrchestrator, scopeManager } from './index';
import { MollyLogger, generateTraceId } from '../logger';

// ============================================
// SCHEMAS
// ============================================

export const CreateCampaignSchema = z.object({
  name: z.string().describe('Name for the hunt campaign'),
  programScope: z.string().describe('Copy-pasted scope text from program page'),
  platformName: z
    .string()
    .optional()
    .describe('Platform name (hackerone, bugcrowd, etc.)'),
  focusAreas: z
    .array(z.string())
    .optional()
    .describe('Vulnerability categories to focus on'),
});

export const StartSessionSchema = z.object({
  campaignId: z.string().describe('Campaign ID'),
  target: z.string().describe('Target domain or URL'),
});

export const RunReconSchema = z.object({
  sessionId: z.string().describe('Session ID'),
});

export const AnalyzeCodeSchema = z.object({
  sessionId: z.string().describe('Session ID'),
  files: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(),
      })
    )
    .describe('Array of files to analyze'),
});

export const GenerateReportSchema = z.object({
  findingId: z.string().describe('Finding ID'),
  platform: z
    .enum(['hackerone', 'bugcrowd', 'intigriti', 'generic'])
    .optional(),
});

export const CheckScopeSchema = z.object({
  programId: z.string().describe('Program ID'),
  target: z.string().describe('Target to check'),
});

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

/**
 * Create a new bug hunt campaign
 */
export async function createHuntCampaign(
  input: z.infer<typeof CreateCampaignSchema>
) {
  const traceId = generateTraceId();
  MollyLogger.info(
    'Creating hunt campaign',
    'bug-hunter-tools',
    { name: input.name },
    traceId
  );

  try {
    // Parse the scope text into a program
    const program = scopeManager.parseScopeText(input.name, input.programScope);

    // Create the campaign
    const campaign = huntOrchestrator.createCampaign(
      input.name,
      program,
      input.focusAreas as VulnerabilityCategory[] | undefined
    );

    // Get suggested strategy
    const strategy = huntOrchestrator.suggestStrategy(campaign);

    return {
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        inScopeTargets: campaign.program.inScope.length,
        outOfScopeTargets: campaign.program.outOfScope.length,
      },
      suggestedStrategy: strategy.name,
      strategyDescription: strategy.description,
      message: `Campaign "${input.name}" created with ${campaign.program.inScope.length} in-scope targets. Suggested strategy: ${strategy.name}`,
    };
  } catch (error) {
    MollyLogger.error(
      'Failed to create campaign',
      'bug-hunter-tools',
      {},
      error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Start a hunt session on a target
 */
export async function startHuntSession(
  input: z.infer<typeof StartSessionSchema>
) {
  const traceId = generateTraceId();
  MollyLogger.info('Starting hunt session', 'bug-hunter-tools', input, traceId);

  try {
    const session = huntOrchestrator.startSession(
      input.campaignId,
      input.target
    );

    return {
      success: true,
      session: {
        id: session.id,
        target: session.target,
        phase: session.phase,
        startedAt: new Date(session.startedAt).toISOString(),
      },
      nextStep: 'Run reconnaissance with runRecon',
    };
  } catch (error) {
    MollyLogger.error('Failed to start session', 'bug-hunter-tools', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run reconnaissance on the current session target
 */
export async function runReconnaissance(input: z.infer<typeof RunReconSchema>) {
  const traceId = generateTraceId();
  MollyLogger.info(
    'Running reconnaissance',
    'bug-hunter-tools',
    input,
    traceId
  );

  try {
    const recon = await huntOrchestrator.runRecon(input.sessionId);

    return {
      success: true,
      reconnaissance: {
        domain: recon.domain,
        technologies: recon.technologies.map((t) => ({
          name: t.name,
          category: t.category,
          confidence: t.confidence,
        })),
        endpoints: recon.apiEndpoints.length,
        jsFiles: recon.jsFiles.length,
        secrets: recon.jsFiles.reduce((acc, js) => acc + js.secrets.length, 0),
        headerIssues: recon.headers.filter((h) => h.security !== 'good').length,
        cookieIssues: recon.cookies.filter((c) => c.issues.length > 0).length,
      },
      interestingFindings: recon.apiEndpoints
        .filter((e) => e.interesting)
        .map((e) => e.path),
      message: `Recon complete: ${recon.technologies.length} technologies detected, ${recon.apiEndpoints.length} endpoints found`,
    };
  } catch (error) {
    MollyLogger.error('Reconnaissance failed', 'bug-hunter-tools', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Analyze source code for vulnerabilities
 */
export async function analyzeSourceCode(
  input: z.infer<typeof AnalyzeCodeSchema>
) {
  const traceId = generateTraceId();
  MollyLogger.info(
    'Analyzing source code',
    'bug-hunter-tools',
    { fileCount: input.files.length },
    traceId
  );

  try {
    const analysis = await huntOrchestrator.analyzeCode(
      input.sessionId,
      input.files
    );

    return {
      success: true,
      analysis: {
        filesAnalyzed: analysis.files,
        linesOfCode: analysis.linesOfCode,
        findings: analysis.findings.length,
        hotspots: analysis.hotspots.length,
        secrets: analysis.secrets.length,
        dependencies: analysis.dependencies.length,
        vulnerableDeps: analysis.dependencies.filter(
          (d) => d.vulnerabilities.length > 0
        ).length,
      },
      criticalFindings: analysis.findings
        .filter((f) => f.severity === 'critical' || f.severity === 'high')
        .map((f) => ({
          rule: f.rule,
          severity: f.severity,
          file: f.file,
          line: f.line,
          message: f.message,
        })),
      message: `Analysis complete: ${analysis.findings.length} findings in ${analysis.files} files`,
    };
  } catch (error) {
    MollyLogger.error('Code analysis failed', 'bug-hunter-tools', {}, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Generate a bug bounty report for a finding
 */
export async function generateBugReport(
  input: z.infer<typeof GenerateReportSchema>
) {
  const traceId = generateTraceId();
  MollyLogger.info('Generating report', 'bug-hunter-tools', input, traceId);

  try {
    const report = huntOrchestrator.generateReport(
      input.findingId,
      input.platform
    );

    return {
      success: true,
      report: {
        title: report.title,
        severity: report.severity,
        cvssVector: report.cvssVector,
        summary: report.summary,
      },
      markdown: report.markdown,
      plainText: report.plainText,
      message: `Report generated for "${report.title}"`,
    };
  } catch (error) {
    MollyLogger.error(
      'Report generation failed',
      'bug-hunter-tools',
      {},
      error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a target is in scope
 */
export async function checkTargetScope(
  input: z.infer<typeof CheckScopeSchema>
) {
  const result = scopeManager.isInScope(input.programId, input.target);

  return {
    inScope: result.inScope,
    reason: result.reason,
    canTest: result.inScope,
  };
}

/**
 * Get campaign status and metrics
 */
export async function getCampaignStatus(campaignId: string) {
  const status = huntOrchestrator.getCampaignStatus(campaignId);
  if (!status) {
    return { success: false, error: 'Campaign not found' };
  }
  return { success: true, ...status };
}

/**
 * Get all findings for a campaign
 */
export async function getFindings(campaignId?: string) {
  const findings = huntOrchestrator.getFindings(campaignId);
  return {
    success: true,
    count: findings.length,
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      category: f.category,
      endpoint: f.endpoint,
      confidence: f.confidence,
      verified: f.verifiedManually,
    })),
  };
}

/**
 * Get available hunt strategies
 */
export async function getHuntStrategies() {
  const strategies = huntOrchestrator.getStrategies();
  return {
    success: true,
    strategies: strategies.map((s) => ({
      name: s.name,
      description: s.description,
      focusAreas: s.focusAreas,
      phases: s.phases.map((p) => p.name),
    })),
  };
}

// ============================================
// TOOL REGISTRY
// ============================================

export const BUG_HUNTER_TOOLS = {
  createHuntCampaign: {
    name: 'createHuntCampaign',
    description:
      'Create a new bug bounty hunt campaign for a program. Provide the scope text from the program page.',
    schema: CreateCampaignSchema,
    handler: createHuntCampaign,
  },
  startHuntSession: {
    name: 'startHuntSession',
    description: 'Start a hunt session on a specific target within a campaign.',
    schema: StartSessionSchema,
    handler: startHuntSession,
  },
  runReconnaissance: {
    name: 'runReconnaissance',
    description:
      'Run reconnaissance on the current session target. Discovers technologies, endpoints, secrets.',
    schema: RunReconSchema,
    handler: runReconnaissance,
  },
  analyzeSourceCode: {
    name: 'analyzeSourceCode',
    description:
      'Analyze source code files for security vulnerabilities using static analysis.',
    schema: AnalyzeCodeSchema,
    handler: analyzeSourceCode,
  },
  generateBugReport: {
    name: 'generateBugReport',
    description: 'Generate a professional bug bounty report for a finding.',
    schema: GenerateReportSchema,
    handler: generateBugReport,
  },
  checkTargetScope: {
    name: 'checkTargetScope',
    description: 'Check if a target is in scope for a program before testing.',
    schema: CheckScopeSchema,
    handler: checkTargetScope,
  },
  getCampaignStatus: {
    name: 'getCampaignStatus',
    description: 'Get the current status and metrics of a hunt campaign.',
    schema: z.object({ campaignId: z.string() }),
    handler: getCampaignStatus,
  },
  getFindings: {
    name: 'getFindings',
    description:
      'Get all vulnerability findings, optionally filtered by campaign.',
    schema: z.object({ campaignId: z.string().optional() }),
    handler: getFindings,
  },
  getHuntStrategies: {
    name: 'getHuntStrategies',
    description: 'Get available bug hunting strategies and their descriptions.',
    schema: z.object({}),
    handler: getHuntStrategies,
  },
};
