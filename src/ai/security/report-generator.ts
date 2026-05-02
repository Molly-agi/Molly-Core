/**
 * @fileOverview Bug Bounty Report Generator
 *
 * Creates professional vulnerability reports for bug bounty submissions.
 * A good report is the difference between a bounty and a rejection.
 *
 * Features:
 * - Platform-specific templates (HackerOne, Bugcrowd, etc.)
 * - CVSS v3.1 scoring
 * - Structured reproduction steps
 * - Impact assessment
 * - Remediation guidance
 * - Evidence formatting
 */

import type {
  VulnerabilityFinding,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  CVSSv3,
  GeneratedReport,
  ReportAttachment,
} from './bug-hunter-types';
import { MollyLogger, generateTraceId } from '../logger';

// ============================================
// CVSS CALCULATOR
// ============================================

export class CVSSCalculator {
  /**
   * Calculate CVSS v3.1 score from components
   */
  static calculate(params: Partial<CVSSv3>): CVSSv3 {
    const defaults: CVSSv3 = {
      vector: '',
      baseScore: 0,
      severity: 'medium',
      attackVector: params.attackVector || 'network',
      attackComplexity: params.attackComplexity || 'low',
      privilegesRequired: params.privilegesRequired || 'none',
      userInteraction: params.userInteraction || 'none',
      scope: params.scope || 'unchanged',
      confidentiality: params.confidentiality || 'none',
      integrity: params.integrity || 'none',
      availability: params.availability || 'none',
    };

    // Calculate Impact Sub Score (ISS)
    const issBase =
      1 -
      (1 - this.getImpactValue(defaults.confidentiality)) *
        (1 - this.getImpactValue(defaults.integrity)) *
        (1 - this.getImpactValue(defaults.availability));

    let impact: number;
    if (defaults.scope === 'unchanged') {
      impact = 6.42 * issBase;
    } else {
      impact = 7.52 * (issBase - 0.029) - 3.25 * Math.pow(issBase - 0.02, 15);
    }

    // Calculate Exploitability Sub Score
    const exploitability =
      8.22 *
      this.getAVValue(defaults.attackVector) *
      this.getACValue(defaults.attackComplexity) *
      this.getPRValue(defaults.privilegesRequired, defaults.scope) *
      this.getUIValue(defaults.userInteraction);

    // Calculate Base Score
    let baseScore: number;
    if (impact <= 0) {
      baseScore = 0;
    } else if (defaults.scope === 'unchanged') {
      baseScore = Math.min(impact + exploitability, 10);
    } else {
      baseScore = Math.min(1.08 * (impact + exploitability), 10);
    }

    // Round up to one decimal
    baseScore = Math.ceil(baseScore * 10) / 10;

    // Determine severity
    let severity: VulnerabilitySeverity;
    if (baseScore === 0) severity = 'informational';
    else if (baseScore < 4.0) severity = 'low';
    else if (baseScore < 7.0) severity = 'medium';
    else if (baseScore < 9.0) severity = 'high';
    else severity = 'critical';

    // Build vector string
    const vector = `CVSS:3.1/AV:${defaults.attackVector[0].toUpperCase()}/AC:${defaults.attackComplexity[0].toUpperCase()}/PR:${defaults.privilegesRequired[0].toUpperCase()}/UI:${defaults.userInteraction[0].toUpperCase()}/S:${defaults.scope[0].toUpperCase()}/C:${defaults.confidentiality[0].toUpperCase()}/I:${defaults.integrity[0].toUpperCase()}/A:${defaults.availability[0].toUpperCase()}`;

    return {
      ...defaults,
      vector,
      baseScore,
      severity,
    };
  }

  private static getImpactValue(impact: 'none' | 'low' | 'high'): number {
    switch (impact) {
      case 'none':
        return 0;
      case 'low':
        return 0.22;
      case 'high':
        return 0.56;
    }
  }

  private static getAVValue(av: string): number {
    switch (av) {
      case 'network':
        return 0.85;
      case 'adjacent':
        return 0.62;
      case 'local':
        return 0.55;
      case 'physical':
        return 0.2;
      default:
        return 0.85;
    }
  }

  private static getACValue(ac: string): number {
    return ac === 'low' ? 0.77 : 0.44;
  }

  private static getPRValue(pr: string, scope: string): number {
    if (pr === 'none') return 0.85;
    if (pr === 'low') return scope === 'unchanged' ? 0.62 : 0.68;
    return scope === 'unchanged' ? 0.27 : 0.5;
  }

  private static getUIValue(ui: string): number {
    return ui === 'none' ? 0.85 : 0.62;
  }

  /**
   * Suggest CVSS components based on vulnerability category
   */
  static suggestFromCategory(category: VulnerabilityCategory): Partial<CVSSv3> {
    const suggestions: Record<VulnerabilityCategory, Partial<CVSSv3>> = {
      injection: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'high',
        availability: 'high',
      },
      xss: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'required',
        scope: 'changed',
        confidentiality: 'low',
        integrity: 'low',
        availability: 'none',
      },
      auth: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'high',
        availability: 'none',
      },
      access_control: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'low',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'low',
        availability: 'none',
      },
      security_misconfig: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'low',
        integrity: 'none',
        availability: 'none',
      },
      cryptography: {
        attackVector: 'network',
        attackComplexity: 'high',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'none',
        availability: 'none',
      },
      ssrf: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'changed',
        confidentiality: 'high',
        integrity: 'low',
        availability: 'low',
      },
      xxe: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'none',
        availability: 'none',
      },
      deserialization: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'high',
        availability: 'high',
      },
      components: {
        attackVector: 'network',
        attackComplexity: 'high',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'low',
        integrity: 'low',
        availability: 'none',
      },
      logging: {
        attackVector: 'network',
        attackComplexity: 'high',
        privilegesRequired: 'low',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'none',
        integrity: 'low',
        availability: 'none',
      },
      business_logic: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'low',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'low',
        integrity: 'high',
        availability: 'none',
      },
      information_leak: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'low',
        integrity: 'none',
        availability: 'none',
      },
      file_handling: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'none',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'low',
        availability: 'none',
      },
      api_security: {
        attackVector: 'network',
        attackComplexity: 'low',
        privilegesRequired: 'low',
        userInteraction: 'none',
        scope: 'unchanged',
        confidentiality: 'high',
        integrity: 'low',
        availability: 'none',
      },
    };

    return suggestions[category] || suggestions.security_misconfig;
  }
}

// ============================================
// REPORT GENERATOR CLASS
// ============================================

export class ReportGenerator {
  private traceId: string;

  constructor() {
    this.traceId = generateTraceId();
  }

  /**
   * Generate a complete bug bounty report
   */
  generateReport(
    finding: VulnerabilityFinding,
    platform: 'hackerone' | 'bugcrowd' | 'intigriti' | 'generic' = 'generic'
  ): GeneratedReport {
    MollyLogger.info(
      `Generating ${platform} report for ${finding.title}`,
      'report-generator',
      { findingId: finding.id },
      this.traceId
    );

    const template = this.getTemplate(platform);
    const markdown = this.buildMarkdown(finding, template);
    const plainText = this.buildPlainText(finding);

    return {
      finding,
      platform,
      markdown,
      plainText,
      title: this.generateTitle(finding),
      summary: this.generateSummary(finding),
      severity: this.formatSeverity(finding.severity, finding.cvss.baseScore),
      cvssVector: finding.cvss.vector,
      reproductionSteps: this.formatReproductionSteps(
        finding.reproductionSteps
      ),
      impactStatement: finding.impact,
      remediationAdvice: finding.remediation,
      attachments: this.formatAttachments(finding.evidence),
    };
  }

  /**
   * Get platform-specific template
   */
  private getTemplate(platform: string): ReportTemplate {
    const templates: Record<string, ReportTemplate> = {
      hackerone: {
        sections: [
          'summary',
          'vulnerability_type',
          'severity',
          'description',
          'steps_to_reproduce',
          'supporting_material',
          'impact',
          'remediation',
        ],
        severityFormat: 'cvss',
        includeVector: true,
        maxTitleLength: 100,
      },
      bugcrowd: {
        sections: [
          'title',
          'vulnerability_type',
          'url',
          'description',
          'impact',
          'steps_to_reproduce',
          'proof_of_concept',
          'remediation',
        ],
        severityFormat: 'vrt',
        includeVector: true,
        maxTitleLength: 150,
      },
      intigriti: {
        sections: [
          'title',
          'severity',
          'endpoint',
          'description',
          'steps_to_reproduce',
          'impact',
          'proof_of_concept',
        ],
        severityFormat: 'cvss',
        includeVector: true,
        maxTitleLength: 100,
      },
      generic: {
        sections: [
          'title',
          'severity',
          'description',
          'steps_to_reproduce',
          'impact',
          'proof_of_concept',
          'remediation',
          'references',
        ],
        severityFormat: 'cvss',
        includeVector: true,
        maxTitleLength: 150,
      },
    };

    return templates[platform] || templates.generic;
  }

  /**
   * Build markdown report
   */
  private buildMarkdown(
    finding: VulnerabilityFinding,
    _template: ReportTemplate
  ): string {
    const sections: string[] = [];

    // Title
    sections.push(`# ${this.generateTitle(finding)}\n`);

    // Summary/Description
    sections.push(`## Summary\n\n${this.generateSummary(finding)}\n`);

    // Severity
    sections.push(
      `## Severity\n\n**${this.formatSeverity(finding.severity, finding.cvss.baseScore)}**\n`
    );
    sections.push(`- CVSS Score: ${finding.cvss.baseScore}/10`);
    sections.push(`- Vector: \`${finding.cvss.vector}\`\n`);

    // Vulnerability Details
    sections.push(`## Vulnerability Details\n`);
    sections.push(`- **Category:** ${this.formatCategory(finding.category)}`);
    sections.push(
      `- **CWE:** ${finding.cwe.map((c) => `${c.id} - ${c.name}`).join(', ')}`
    );
    if (finding.endpoint) {
      sections.push(`- **Endpoint:** \`${finding.endpoint}\``);
    }
    if (finding.parameter) {
      sections.push(`- **Parameter:** \`${finding.parameter}\``);
    }
    sections.push('');

    // Technical Description
    sections.push(`## Technical Description\n\n${finding.description}\n`);

    // Steps to Reproduce
    sections.push(`## Steps to Reproduce\n`);
    finding.reproductionSteps.forEach((step, i) => {
      sections.push(`${i + 1}. ${step}`);
    });
    sections.push('');

    // Proof of Concept
    if (finding.proofOfConcept) {
      sections.push(`## Proof of Concept\n`);
      sections.push('```');
      sections.push(finding.proofOfConcept);
      sections.push('```\n');
    }

    // Evidence
    if (finding.evidence && finding.evidence.length > 0) {
      sections.push(`## Supporting Evidence\n`);
      for (const evidence of finding.evidence) {
        sections.push(`### ${evidence.description}\n`);
        if (evidence.type === 'request' || evidence.type === 'response') {
          sections.push('```http');
        } else if (evidence.type === 'code') {
          sections.push('```');
        }
        sections.push(evidence.content);
        if (
          evidence.type === 'request' ||
          evidence.type === 'response' ||
          evidence.type === 'code'
        ) {
          sections.push('```');
        }
        sections.push('');
      }
    }

    // Impact
    sections.push(`## Impact\n\n${finding.impact}\n`);

    // Remediation
    sections.push(`## Remediation\n\n${finding.remediation}\n`);

    // References
    if (finding.references && finding.references.length > 0) {
      sections.push(`## References\n`);
      for (const ref of finding.references) {
        sections.push(`- ${ref}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Build plain text report
   */
  private buildPlainText(finding: VulnerabilityFinding): string {
    const lines: string[] = [];

    lines.push(`VULNERABILITY REPORT`);
    lines.push(`${'='.repeat(60)}`);
    lines.push('');
    lines.push(`Title: ${this.generateTitle(finding)}`);
    lines.push(
      `Severity: ${this.formatSeverity(finding.severity, finding.cvss.baseScore)}`
    );
    lines.push(`CVSS: ${finding.cvss.baseScore}/10 (${finding.cvss.vector})`);
    lines.push('');
    lines.push(`SUMMARY`);
    lines.push(`${'-'.repeat(40)}`);
    lines.push(this.generateSummary(finding));
    lines.push('');
    lines.push(`STEPS TO REPRODUCE`);
    lines.push(`${'-'.repeat(40)}`);
    finding.reproductionSteps.forEach((step, i) => {
      lines.push(`${i + 1}. ${step}`);
    });
    lines.push('');
    lines.push(`IMPACT`);
    lines.push(`${'-'.repeat(40)}`);
    lines.push(finding.impact);
    lines.push('');
    lines.push(`REMEDIATION`);
    lines.push(`${'-'.repeat(40)}`);
    lines.push(finding.remediation);

    return lines.join('\n');
  }

  /**
   * Generate report title
   */
  private generateTitle(finding: VulnerabilityFinding): string {
    const categoryName = this.formatCategory(finding.category);
    const location = finding.endpoint || finding.filePath || 'Application';

    // Keep title concise but descriptive
    return finding.title || `${categoryName} in ${location}`;
  }

  /**
   * Generate summary
   */
  private generateSummary(finding: VulnerabilityFinding): string {
    if (finding.description.length <= 300) {
      return finding.description;
    }

    // Create a concise summary
    const firstSentence = finding.description.split('.')[0] + '.';
    const location = finding.endpoint ? ` at \`${finding.endpoint}\`` : '';
    const severity = finding.severity;

    return `A ${severity} severity ${this.formatCategory(finding.category)} vulnerability was discovered${location}. ${firstSentence}`;
  }

  /**
   * Format category name
   */
  private formatCategory(category: VulnerabilityCategory): string {
    const names: Record<VulnerabilityCategory, string> = {
      injection: 'Injection',
      xss: 'Cross-Site Scripting (XSS)',
      auth: 'Broken Authentication',
      access_control: 'Broken Access Control',
      security_misconfig: 'Security Misconfiguration',
      cryptography: 'Cryptographic Failure',
      ssrf: 'Server-Side Request Forgery (SSRF)',
      xxe: 'XML External Entity (XXE)',
      deserialization: 'Insecure Deserialization',
      components: 'Vulnerable Component',
      logging: 'Security Logging Failure',
      business_logic: 'Business Logic Flaw',
      information_leak: 'Information Disclosure',
      file_handling: 'Insecure File Handling',
      api_security: 'API Security Flaw',
    };

    return names[category] || category;
  }

  /**
   * Format severity with score
   */
  private formatSeverity(
    severity: VulnerabilitySeverity,
    score: number
  ): string {
    const severityUpper = severity.charAt(0).toUpperCase() + severity.slice(1);
    return `${severityUpper} (${score}/10)`;
  }

  /**
   * Format reproduction steps
   */
  private formatReproductionSteps(steps: string[]): string {
    return steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  }

  /**
   * Format evidence as attachments
   */
  private formatAttachments(
    evidence: VulnerabilityFinding['evidence']
  ): ReportAttachment[] {
    if (!evidence) return [];

    return evidence.map((e, i) => ({
      type: e.type,
      filename: `evidence_${i + 1}.${this.getExtensionForType(e.type)}`,
      content: e.content,
      mimeType: this.getMimeTypeForType(e.type),
    }));
  }

  private getExtensionForType(type: string): string {
    switch (type) {
      case 'request':
      case 'response':
        return 'txt';
      case 'code':
        return 'txt';
      case 'screenshot':
        return 'png';
      default:
        return 'txt';
    }
  }

  private getMimeTypeForType(type: string): string {
    switch (type) {
      case 'screenshot':
        return 'image/png';
      default:
        return 'text/plain';
    }
  }
}

// ============================================
// REPORT TEMPLATES
// ============================================

interface ReportTemplate {
  sections: string[];
  severityFormat: 'cvss' | 'vrt' | 'simple';
  includeVector: boolean;
  maxTitleLength: number;
}

// ============================================
// IMPACT TEMPLATES
// ============================================

export const IMPACT_TEMPLATES: Record<VulnerabilityCategory, string> = {
  injection: `This vulnerability allows an attacker to inject malicious code that will be executed by the server. Depending on the context, this could lead to:
- Complete database compromise (read, modify, delete data)
- Execution of arbitrary commands on the server
- Access to sensitive files and credentials
- Lateral movement within the network
- Full server takeover`,

  xss: `This Cross-Site Scripting vulnerability allows an attacker to execute arbitrary JavaScript in the context of a victim's browser session. This can lead to:
- Session hijacking via cookie theft
- Credential harvesting through fake login forms
- Keylogging of sensitive data
- Performing actions as the victim user
- Defacement of the application
- Phishing attacks with trusted domain`,

  auth: `This authentication vulnerability allows an attacker to bypass or circumvent authentication mechanisms. Impact includes:
- Unauthorized access to user accounts
- Impersonation of any user including administrators
- Access to sensitive user data
- Ability to perform privileged actions`,

  access_control: `This access control vulnerability allows an attacker to access or modify resources belonging to other users. Impact includes:
- Unauthorized access to other users' data
- Modification of unauthorized records
- Privacy violations
- Potential for automated mass data harvesting`,

  security_misconfig: `This security misconfiguration exposes sensitive information or weakens the application's security posture:
- Information disclosure aiding further attacks
- Increased attack surface
- Potential for exploitation of known vulnerabilities`,

  cryptography: `This cryptographic weakness compromises the confidentiality or integrity of sensitive data:
- Decryption of protected communications
- Forging of signed data
- Exposure of credentials or secrets`,

  ssrf: `This Server-Side Request Forgery allows an attacker to make requests from the server to internal resources:
- Access to internal services not exposed to internet
- Cloud metadata endpoint access (AWS/GCP/Azure credentials)
- Port scanning of internal network
- Potential for remote code execution via internal services`,

  xxe: `This XML External Entity vulnerability allows reading local files and potentially remote code execution:
- Reading sensitive server files (/etc/passwd, configuration files)
- Server-side request forgery
- Denial of service via billion laughs attack
- Potential remote code execution`,

  deserialization: `This insecure deserialization vulnerability can lead to remote code execution:
- Arbitrary code execution on the server
- Complete server compromise
- Data theft and manipulation
- Installation of backdoors`,

  components: `This vulnerable component introduces known security weaknesses:
- Exploitation of published vulnerabilities with available exploits
- Potential for remote code execution depending on the vulnerability`,

  logging: `This logging/monitoring failure reduces visibility into attacks:
- Attacks may go undetected
- Forensic investigation hampered
- Compliance violations`,

  business_logic: `This business logic flaw allows manipulation of application workflows:
- Financial fraud (unauthorized discounts, refunds)
- Privilege escalation
- Bypass of intended workflows
- Data manipulation`,

  information_leak: `This information disclosure reveals sensitive data:
- Exposure of user credentials or personal data
- Internal system information useful for further attacks
- Potential compliance violations (GDPR, CCPA)`,

  file_handling: `This file handling vulnerability can lead to unauthorized file access:
- Reading sensitive server files
- Writing malicious files
- Code execution via uploaded files
- Server compromise`,

  api_security: `This API security flaw allows unauthorized access or manipulation:
- Unauthorized data access
- Rate limit bypass
- Resource exhaustion
- Data manipulation`,
};

// ============================================
// EXPORT
// ============================================

export const reportGenerator = new ReportGenerator();
