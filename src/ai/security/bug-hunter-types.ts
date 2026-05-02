/**
 * @fileOverview Bug Hunter Type Definitions
 *
 * Core types for Molly's Bug Bounty Hunting System.
 * Maximum precision, maximum capability.
 */

// ============================================
// VULNERABILITY TYPES
// ============================================

export type VulnerabilitySeverity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'informational';

export type VulnerabilityCategory =
  | 'injection' // SQL, NoSQL, LDAP, XPath, Command injection
  | 'xss' // Cross-site scripting (stored, reflected, DOM)
  | 'auth' // Authentication/session flaws
  | 'access_control' // IDOR, privilege escalation, forced browsing
  | 'security_misconfig' // Default creds, verbose errors, missing headers
  | 'cryptography' // Weak algorithms, key exposure, padding oracle
  | 'ssrf' // Server-side request forgery
  | 'xxe' // XML external entity
  | 'deserialization' // Insecure deserialization
  | 'components' // Vulnerable dependencies
  | 'logging' // Insufficient logging, log injection
  | 'business_logic' // Race conditions, workflow bypass
  | 'information_leak' // Sensitive data exposure
  | 'file_handling' // Path traversal, unrestricted upload
  | 'api_security'; // Broken object level auth, rate limiting

export interface CWEReference {
  id: string; // e.g., "CWE-79"
  name: string; // e.g., "Improper Neutralization of Input During Web Page Generation"
  description: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  exploitability: number; // 0-10
  impact: number; // 0-10
}

export interface CVSSv3 {
  vector: string; // e.g., "CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"
  baseScore: number; // 0-10
  severity: VulnerabilitySeverity;
  attackVector: 'network' | 'adjacent' | 'local' | 'physical';
  attackComplexity: 'low' | 'high';
  privilegesRequired: 'none' | 'low' | 'high';
  userInteraction: 'none' | 'required';
  scope: 'unchanged' | 'changed';
  confidentiality: 'none' | 'low' | 'high';
  integrity: 'none' | 'low' | 'high';
  availability: 'none' | 'low' | 'high';
}

// ============================================
// VULNERABILITY FINDING
// ============================================

export interface VulnerabilityFinding {
  id: string;
  title: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  cvss: CVSSv3;
  cwe: CWEReference[];

  // Location
  endpoint?: string;
  parameter?: string;
  filePath?: string;
  lineNumber?: number;
  codeSnippet?: string;

  // Details
  description: string;
  impact: string;
  proofOfConcept: string;
  reproductionSteps: string[];
  evidence: VulnerabilityEvidence[];

  // Remediation
  remediation: string;
  references: string[];

  // Metadata
  confidence: number; // 0-100
  automated: boolean;
  verifiedManually: boolean;
  discoveredAt: number;
  programId?: string;
  campaignId?: string;
}

export interface VulnerabilityEvidence {
  type: 'request' | 'response' | 'screenshot' | 'code' | 'log' | 'video';
  content: string;
  description: string;
  timestamp: number;
}

// ============================================
// BUG BOUNTY PROGRAM
// ============================================

export interface BugBountyProgram {
  id: string;
  platform:
    | 'hackerone'
    | 'bugcrowd'
    | 'intigriti'
    | 'synack'
    | 'yeswehack'
    | 'custom';
  name: string;
  handle: string;
  url: string;

  // Scope
  inScope: ScopeTarget[];
  outOfScope: ScopeTarget[];

  // Rules
  safeHarbor: boolean;
  allowAutomatedScanning: boolean;
  requiresPermission: boolean;
  rateLimits?: RateLimit[];

  // Rewards
  bountyRanges: BountyRange[];
  totalPaidOut?: number;
  averageBounty?: number;
  responseTime?: number; // Average in hours

  // Status
  status: 'active' | 'paused' | 'closed';
  launchedAt?: number;
  lastUpdated: number;

  // Molly's tracking
  priority: number; // 1-10, higher = more interesting
  huntedBefore: boolean;
  findingsCount: number;
  lastHuntedAt?: number;
  notes?: string;
}

export interface ScopeTarget {
  type:
    | 'domain'
    | 'wildcard'
    | 'ip'
    | 'cidr'
    | 'mobile_app'
    | 'source_code'
    | 'api'
    | 'other';
  target: string;
  description?: string;
  eligibleForBounty: boolean;
  maxSeverity?: VulnerabilitySeverity;
  technologies?: string[];
}

export interface RateLimit {
  target: string;
  requestsPerSecond?: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  notes?: string;
}

export interface BountyRange {
  severity: VulnerabilitySeverity;
  min: number;
  max: number;
  currency: string;
}

// ============================================
// RECONNAISSANCE
// ============================================

export interface ReconTarget {
  domain: string;
  subdomains: SubdomainInfo[];
  technologies: TechnologyFingerprint[];
  endpoints: EndpointInfo[];
  parameters: ParameterInfo[];
  headers: HeaderInfo[];
  cookies: CookieInfo[];
  jsFiles: JSFileInfo[];
  apiEndpoints: APIEndpoint[];
  lastReconAt: number;
}

export interface SubdomainInfo {
  subdomain: string;
  ip?: string;
  httpStatus?: number;
  httpsStatus?: number;
  title?: string;
  technologies?: string[];
  interesting: boolean;
  notes?: string;
}

export interface TechnologyFingerprint {
  name: string;
  version?: string;
  category: string; // e.g., "web-framework", "cms", "cdn"
  confidence: number;
  cve?: string[]; // Known CVEs for this version
}

export interface EndpointInfo {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  status?: number;
  contentType?: string;
  parameters: string[];
  requiresAuth: boolean;
  interesting: boolean;
  notes?: string;
}

export interface ParameterInfo {
  name: string;
  location: 'query' | 'body' | 'header' | 'cookie' | 'path';
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  reflected: boolean; // Is input reflected in response?
  sanitized: boolean; // Does it appear sanitized?
  interesting: boolean;
  foundAt: string[]; // Endpoints where found
}

export interface HeaderInfo {
  name: string;
  value: string;
  security: 'good' | 'weak' | 'missing' | 'misconfigured';
  notes?: string;
}

export interface CookieInfo {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  path: string;
  domain?: string;
  issues: string[];
}

export interface JSFileInfo {
  url: string;
  size: number;
  endpoints: string[]; // API endpoints found in JS
  secrets: SecretFinding[];
  interesting: boolean;
}

export interface SecretFinding {
  type: 'api_key' | 'token' | 'password' | 'private_key' | 'aws_key' | 'other';
  pattern: string;
  value: string; // Redacted
  confidence: number;
  context: string;
}

export interface APIEndpoint {
  path: string;
  method: string;
  parameters: ParameterInfo[];
  authentication?: string;
  version?: string;
  documentation?: string;
  interesting: boolean;
}

// ============================================
// SOURCE CODE ANALYSIS
// ============================================

export interface SourceCodeAnalysis {
  repository: string;
  language: string;
  framework?: string;
  files: number;
  linesOfCode: number;
  analyzedAt: number;

  findings: CodeFinding[];
  hotspots: SecurityHotspot[];
  dependencies: DependencyInfo[];
  secrets: SecretFinding[];
}

export interface CodeFinding {
  id: string;
  rule: string;
  severity: VulnerabilitySeverity;
  category: VulnerabilityCategory;

  file: string;
  line: number;
  column?: number;
  snippet: string;

  message: string;
  cwe?: string;
  confidence: number;
  falsePositiveRisk: number;

  dataFlow?: DataFlowTrace[];
}

export interface DataFlowTrace {
  step: number;
  file: string;
  line: number;
  code: string;
  type: 'source' | 'propagator' | 'sink';
}

export interface SecurityHotspot {
  file: string;
  line: number;
  type: string; // e.g., "crypto", "auth", "input_handling"
  description: string;
  reviewRequired: boolean;
}

export interface DependencyInfo {
  name: string;
  version: string;
  ecosystem: 'npm' | 'pip' | 'maven' | 'nuget' | 'rubygems' | 'go' | 'cargo';
  vulnerabilities: DependencyVulnerability[];
  outdated: boolean;
  latestVersion?: string;
}

export interface DependencyVulnerability {
  cve: string;
  severity: VulnerabilitySeverity;
  title: string;
  fixedIn?: string;
  exploitable: boolean;
}

// ============================================
// HUNT CAMPAIGN
// ============================================

export interface HuntCampaign {
  id: string;
  name: string;
  programId: string;
  program: BugBountyProgram;

  status:
    | 'planning'
    | 'recon'
    | 'hunting'
    | 'reporting'
    | 'completed'
    | 'paused';
  startedAt: number;
  lastActivityAt: number;
  completedAt?: number;

  // Progress
  reconComplete: boolean;
  targetsAnalyzed: number;
  totalTargets: number;

  // Findings
  findings: VulnerabilityFinding[];
  submittedFindings: SubmittedFinding[];

  // Strategy
  focusAreas: VulnerabilityCategory[];
  methodology: string[];
  notes: string;

  // Metrics
  hoursSpent: number;
  totalEarned: number;
}

export interface SubmittedFinding {
  findingId: string;
  platform: string;
  reportId: string;
  submittedAt: number;
  status:
    | 'new'
    | 'triaged'
    | 'accepted'
    | 'duplicate'
    | 'not_applicable'
    | 'informative'
    | 'resolved';
  bounty?: number;
  responseTime?: number;
  feedback?: string;
}

// ============================================
// HUNT SESSION
// ============================================

export interface HuntSession {
  id: string;
  campaignId: string;
  startedAt: number;
  endedAt?: number;

  phase: 'recon' | 'analysis' | 'exploitation' | 'verification' | 'reporting';
  target: string;

  actions: HuntAction[];
  findings: VulnerabilityFinding[];

  notes: string;
  nextSteps: string[];
}

export interface HuntAction {
  timestamp: number;
  type: 'scan' | 'request' | 'analysis' | 'test' | 'note';
  description: string;
  target?: string;
  result?: string;
  interesting: boolean;
}

// ============================================
// VULNERABILITY PATTERNS
// ============================================

export interface VulnerabilityPattern {
  id: string;
  name: string;
  category: VulnerabilityCategory;
  severity: VulnerabilitySeverity;
  cwe: string[];

  // Detection
  codePatterns?: RegExp[];
  requestPatterns?: RequestPattern[];
  responsePatterns?: ResponsePattern[];

  // Testing
  payloads?: string[];
  testCases?: TestCase[];

  // False positive handling
  exceptions?: string[];
  verificationRequired: boolean;

  // Documentation
  description: string;
  impact: string;
  remediation: string;
  references: string[];
}

export interface RequestPattern {
  method?: string;
  pathPattern?: RegExp;
  parameterPattern?: RegExp;
  headerPattern?: RegExp;
  bodyPattern?: RegExp;
}

export interface ResponsePattern {
  statusCodes?: number[];
  headerPattern?: RegExp;
  bodyPattern?: RegExp;
  errorPattern?: RegExp;
}

export interface TestCase {
  name: string;
  payload: string;
  expectedBehavior: string;
  successIndicators: string[];
  failureIndicators: string[];
}

// ============================================
// REPORT TEMPLATES
// ============================================

export interface ReportTemplate {
  platform: string;
  sections: ReportSection[];
}

export interface ReportSection {
  name: string;
  required: boolean;
  template: string;
  tips: string[];
}

export interface GeneratedReport {
  finding: VulnerabilityFinding;
  platform: string;
  markdown: string;
  plainText: string;

  title: string;
  summary: string;
  severity: string;
  cvssVector: string;

  reproductionSteps: string;
  impactStatement: string;
  remediationAdvice: string;

  attachments: ReportAttachment[];
}

export interface ReportAttachment {
  type: 'request' | 'response' | 'screenshot' | 'video' | 'code' | 'log';
  filename: string;
  content: string;
  mimeType: string;
}
