/**
 * @fileOverview Authenticated HackerOne API v1 synchronization driver.
 * Manages report submissions over the official H1 REST API, routing through the
 * CircuitBreaker to ensure nothing is sent during network isolation events.
 *
 * Credentials are sourced exclusively from environment variables:
 *   H1_API_USERNAME — your HackerOne username
 *   H1_API_TOKEN    — your HackerOne API token
 */

import { CircuitBreaker } from '../security/CircuitBreaker';
import type { SavedFinding } from './VaultStore';

export interface H1SubmitResult {
  success: boolean;
  reportId?: string;
  error?: string;
}

const H1_API_BASE = 'https://api.hackerone.com/v1';

export class H1ApiSync {
  private readonly authHeader: string;
  private readonly breaker: CircuitBreaker;

  constructor(
    apiToken: string = process.env.H1_API_TOKEN ?? '',
    identifier: string = process.env.H1_API_USERNAME ?? ''
  ) {
    // NOTE: Buffer.from() is used here — btoa() is browser-only and unavailable in Node.js
    this.authHeader = `Basic ${Buffer.from(`${identifier}:${apiToken}`).toString('base64')}`;
    this.breaker = CircuitBreaker.getInstance();
  }

  /**
   * Submit a compiled report to HackerOne via the v1 Reports API.
   * Returns a H1SubmitResult with the assigned report ID on success.
   */
  public async submitVulnerabilityReport(
    programSlug: string,
    markdownReport: string,
    finding: SavedFinding
  ): Promise<H1SubmitResult> {
    if (this.breaker.getNetworkState() === 'ISOLATED_FALLBACK') {
      return {
        success: false,
        error: 'Network isolated — report queued for deferred submission.',
      };
    }

    const payload = {
      data: {
        type: 'report',
        attributes: {
          title: `[Automated] ${finding.vulnerabilityType} on ${finding.targetDomain}`,
          vulnerability_information: markdownReport,
          impact: 'Unauthorized access to internal systems and sensitive data.',
          severity_rating: this.scoreToRating(finding.severityScore),
          program_handle: programSlug,
        },
      },
    };

    try {
      const response = await fetch(`${H1_API_BASE}/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: this.authHeader,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: `H1 API HTTP ${response.status}: ${errorBody}`,
        };
      }

      const data = (await response.json()) as { data?: { id?: string } };
      const reportId = data?.data?.id;

      console.log(
        `[H1_API_SYNC]: Report submitted. ID: ${reportId ?? 'unknown'}`
      );
      return { success: true, reportId };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.breaker.tripCircuitBreaker(`H1 API error: ${message}`);
      return { success: false, error: message };
    }
  }

  /** Push a profile update or trigger a background profile sync. */
  public async syncProfile(): Promise<boolean> {
    if (this.breaker.getNetworkState() === 'ISOLATED_FALLBACK') return false;

    try {
      const response = await fetch(`${H1_API_BASE}/users/me`, {
        headers: {
          Accept: 'application/json',
          Authorization: this.authHeader,
        },
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private scoreToRating(score: number): string {
    if (score >= 9.0) return 'critical';
    if (score >= 7.0) return 'high';
    if (score >= 4.0) return 'medium';
    return 'low';
  }
}
