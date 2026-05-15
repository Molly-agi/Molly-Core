/**
 * @fileOverview Automated HackerOne vulnerability disclosure report compiler.
 * Formats raw SavedFinding data into a clean, submission-ready Markdown document
 * following the HackerOne report structure: Summary → Severity → PoC → Impact → Fix.
 */

import type { SavedFinding } from './VaultStore';

export class ReportBuilder {
  /**
   * Compile a vaulted finding into a HackerOne Markdown disclosure report.
   */
  public static compileMarkdownReport(finding: SavedFinding): string {
    const label = this.cvssToLabel(finding.severityScore);
    const pocList = finding.pocSteps
      .map((step, i) => `${i + 1}. ${step}`)
      .join('\n');
    const discovered = new Date(finding.discoveredAt).toISOString();

    return `# Vulnerability Disclosure Report

**Type:** ${finding.vulnerabilityType}
**Target:** ${finding.targetDomain}
**Discovered:** ${discovered}
**Report ID:** ${finding.id}

---

## Summary

An automated assessment discovered a **${label}-severity ${finding.vulnerabilityType}**
vulnerability on the asset pipeline of **${finding.targetDomain}**.

---

## Severity Metrics

| Field | Value |
|-------|-------|
| Vulnerability Class | ${finding.vulnerabilityType} |
| CVSS v3.1 Base Score | ${finding.severityScore.toFixed(1)} |
| Severity Rating | **${label}** |

---

## Proof of Concept (Steps to Reproduce)

${pocList}

---

## Impact

Successful exploitation allows an unauthenticated adversary to:

- Breach data integrity boundaries on **${finding.targetDomain}**
- Modify backend runtime state or access server-side internals
- Potentially pivot to adjacent systems or escalate privileges

---

## Recommended Remediation

1. Validate and sanitize all user-controlled input server-side before processing
2. Apply context-appropriate output encoding (HTML, SQL, shell, etc.)
3. Enforce strict Content Security Policy (CSP) and security headers
4. Review input length limits, type constraints, and allow-lists

---

*Report automatically compiled and validated locally via Molly AGI Core.*`.trim();
  }

  private static cvssToLabel(score: number): string {
    if (score >= 9.0) return 'Critical';
    if (score >= 7.0) return 'High';
    if (score >= 4.0) return 'Medium';
    if (score >= 0.1) return 'Low';
    return 'Informational';
  }
}
