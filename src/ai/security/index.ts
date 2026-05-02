/**
 * @fileOverview Bug Hunter Module - Main Export
 *
 * Molly's complete bug bounty hunting system.
 *
 * Components:
 * - huntOrchestrator: Main brain, coordinates all hunting
 * - reconEngine: Discovers attack surface
 * - codeAnalyzer: Static code analysis
 * - scopeManager: Tracks what's in scope
 * - reportGenerator: Creates professional reports
 *
 * Usage:
 * ```typescript
 * import { huntOrchestrator, scopeManager } from '@/ai/security';
 *
 * // Register a program
 * scopeManager.parseScopeText('example-program', scopeText);
 *
 * // Create a campaign
 * const campaign = huntOrchestrator.createCampaign('My Hunt', program);
 *
 * // Start hunting
 * const session = huntOrchestrator.startSession(campaign.id, 'example.com');
 * const recon = await huntOrchestrator.runRecon(session.id);
 *
 * // Generate reports for findings
 * const report = huntOrchestrator.generateReport(findingId, 'hackerone');
 * ```
 */

// Main orchestrator
export { huntOrchestrator, HuntOrchestrator } from './hunt-orchestrator';

// Reconnaissance
export {
  reconEngine,
  ReconEngine,
  COMMON_SUBDOMAINS,
  COMMON_DIRECTORIES,
} from './recon-engine';

// Code analysis
export { codeAnalyzer, SourceCodeAnalyzer } from './code-analyzer';

// Scope management
export {
  scopeManager,
  ScopeManager,
  PROGRAM_TEMPLATES,
  COMMON_EXCLUSIONS,
} from './scope-manager';

// Report generation
export {
  reportGenerator,
  ReportGenerator,
  CVSSCalculator,
  IMPACT_TEMPLATES,
} from './report-generator';

// Vulnerability patterns
export {
  ALL_VULNERABILITY_PATTERNS,
  XSS_PATTERNS,
  SQLI_PATTERNS,
  IDOR_PATTERNS,
  SSRF_PATTERNS,
  CMDI_PATTERNS,
  AUTH_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,
  MISCONFIG_PATTERNS,
  FILE_UPLOAD_PATTERNS,
  BUSINESS_LOGIC_PATTERNS,
  CWE_DATABASE,
  SECURITY_HEADERS,
  getPatternsByCategory,
  getPatternsBySeverity,
  getCWE,
  getPatternById,
} from './vulnerability-patterns';

// Types
export type {
  // Core vulnerability types
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityFinding,
  VulnerabilityEvidence,
  VulnerabilityPattern,
  CWEReference,
  CVSSv3,

  // Bug bounty program types
  BugBountyProgram,
  ScopeTarget,
  RateLimit,
  BountyRange,

  // Reconnaissance types
  ReconTarget,
  SubdomainInfo,
  TechnologyFingerprint,
  EndpointInfo,
  ParameterInfo,
  HeaderInfo,
  CookieInfo,
  JSFileInfo,
  APIEndpoint,
  SecretFinding,

  // Code analysis types
  SourceCodeAnalysis,
  CodeFinding,
  DataFlowTrace,
  SecurityHotspot,
  DependencyInfo,
  DependencyVulnerability,

  // Hunt types
  HuntCampaign,
  HuntSession,
  HuntAction,
  SubmittedFinding,

  // Report types
  GeneratedReport,
  ReportAttachment,
} from './bug-hunter-types';
