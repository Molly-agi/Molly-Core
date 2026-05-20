/**
 * @fileOverview Feedback-driven fuzzing engine for HackerOne vulnerability discovery.
 * Generates mutated payload variants based on prior server response context, then
 * executes single-step fuzzing ticks against a target URL + parameter.
 * All network activity is blocked when the CircuitBreaker is in ISOLATED_FALLBACK.
 */

import { CircuitBreaker } from '../security/CircuitBreaker';

export interface FuzzResponse {
  statusCode: number;
  responseTimeMs: number;
  bodyLength: number;
  hasStackTrace: boolean;
  body: string;
}

export const MUTATION_DICTIONARY = [
  "'",
  '"',
  '`',
  '<script>alert(1)</script>',
  '../../etc/passwd',
  '%00',
  '\\x00',
  '\r\n',
  '{{7*7}}',
  '${7*7}',
  ';ls',
  '|id',
  'null',
  "' OR '1'='1",
  '1 UNION SELECT null--',
  '<img src=x onerror=alert(1)>',
] as const;

const STACK_TRACE_SIGNALS = [
  'Exception',
  'Fatal error',
  'Stack trace',
  'Traceback',
  'at Object.',
  'at Function.',
  'SyntaxError',
  'ReferenceError',
  'TypeError',
  'NullPointerException',
  'Cannot read propert',
  'Unhandled promise',
];

export class FuzzingEngine {
  /**
   * Generate a context-aware mutation based on the prior response body.
   * Uses feedback signals to bias toward the most relevant attack class.
   */
  public static generateMutation(
    basePayload: string,
    feedbackContext: string
  ): string {
    const lower = feedbackContext.toLowerCase();

    if (
      lower.includes('sql') ||
      lower.includes('syntax') ||
      lower.includes('query')
    ) {
      return `${basePayload}' OR '1'='1`;
    }
    if (
      lower.includes('html') ||
      lower.includes('reflect') ||
      lower.includes('xss')
    ) {
      return `${basePayload}<img src=x onerror=alert(1)>`;
    }
    if (
      lower.includes('path') ||
      lower.includes('file') ||
      lower.includes('directory')
    ) {
      return `${basePayload}../../etc/passwd`;
    }

    // Default: random boundary fuzz from the dictionary
    const tag =
      MUTATION_DICTIONARY[
        Math.floor(Math.random() * MUTATION_DICTIONARY.length)
      ];
    return `${basePayload}${tag}`;
  }

  /**
   * Execute a single fuzzing tick against url?paramName=mutationPayload.
   * Throws if network is isolated — never leaks payloads over untrusted paths.
   */
  public static async executeFuzzTick(
    url: string,
    paramName: string,
    mutationPayload: string
  ): Promise<FuzzResponse> {
    const breaker = CircuitBreaker.getInstance();

    if (breaker.getNetworkState() === 'ISOLATED_FALLBACK') {
      throw new Error(
        '[FUZZ_GUARD]: Network isolated. Mutation engine locked down.'
      );
    }

    const startTime = Date.now();
    const targetUrl = `${url}?${paramName}=${encodeURIComponent(mutationPayload)}`;

    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });

    const body = await response.text();
    const hasStackTrace = STACK_TRACE_SIGNALS.some((sig) => body.includes(sig));

    return {
      statusCode: response.status,
      responseTimeMs: Date.now() - startTime,
      bodyLength: body.length,
      hasStackTrace,
      body,
    };
  }
}
