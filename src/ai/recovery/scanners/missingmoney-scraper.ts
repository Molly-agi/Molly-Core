/**
 * @fileOverview MissingMoney.com Scraper
 *
 * MissingMoney.com is the NAUPA (National Association of Unclaimed
 * Property Administrators) official multi-state search tool.
 * One search covers 40+ states simultaneously.
 *
 * Search endpoint: POST https://www.missingmoney.com/Main/Search
 * Required fields: FirstName, LastName, State (optional)
 *
 * This scraper:
 * 1. Submits search forms via HTTP POST
 * 2. Parses result tables with Cheerio
 * 3. Extracts: property type, reported by, state, and value (when shown)
 * 4. Returns structured DiscoveredAsset objects
 *
 * Rate limiting: 3 seconds between requests (be respectful)
 * Human gates: CAPTCHA detection built in
 */

import * as cheerio from 'cheerio';
import { MollyLogger } from '@/ai/logger';
import type { DiscoveredAsset, AssetSource, IdentityProfile } from '../types';

const FLOW_NAME = 'missingmoney-scraper';

// ============================================================================
// CONSTANTS
// ============================================================================

const BASE_URL = 'https://www.missingmoney.com';
const SEARCH_URL = `${BASE_URL}/Main/Search`;
const RATE_LIMIT_MS = 3000;
const REQUEST_TIMEOUT_MS = 15000;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Content-Type': 'application/x-www-form-urlencoded',
  Origin: BASE_URL,
  Referer: `${BASE_URL}/Main/Search`,
};

// ============================================================================
// TYPES
// ============================================================================

export interface MissingMoneyResult {
  /** Name as listed in the registry */
  listedName: string;
  /** Property type (e.g., "Checking Account", "Wages", "Refund") */
  propertyType: string;
  /** Who reported it (company name) */
  reportedBy: string;
  /** State where the property is held */
  state: string;
  /** Amount if shown (many states don't show amounts) */
  amount?: number;
  /** Link to claim, if available */
  claimUrl?: string;
}

export interface SearchQuery {
  firstName: string;
  lastName: string;
  state?: string;
  city?: string;
}

// ============================================================================
// SCRAPER
// ============================================================================

export class MissingMoneyScraper {
  private lastRequestAt = 0;
  private sessionCookies: string = '';

  /**
   * Initialize a session by loading the search page.
   * Captures any session cookies and CSRF tokens.
   */
  async initSession(): Promise<boolean> {
    try {
      const response = await this.fetchWithTimeout(SEARCH_URL, {
        method: 'GET',
        headers: {
          ...HEADERS,
          'Content-Type': 'text/html',
        },
      });

      if (!response.ok) {
        MollyLogger.warn(`Session init failed: ${response.status}`, FLOW_NAME);
        return false;
      }

      // Capture session cookies
      const setCookies = response.headers.getSetCookie?.() || [];
      this.sessionCookies = setCookies.map((c) => c.split(';')[0]).join('; ');

      MollyLogger.info('Session initialized', FLOW_NAME, {
        hasCookies: this.sessionCookies.length > 0,
      });

      return true;
    } catch (error) {
      MollyLogger.error('Session init error', FLOW_NAME, undefined, error);
      return false;
    }
  }

  /**
   * Search MissingMoney.com for unclaimed property belonging to a name.
   */
  async search(query: SearchQuery): Promise<MissingMoneyResult[]> {
    await this.rateLimit();

    MollyLogger.info(
      `Searching: ${query.firstName} ${query.lastName}`,
      FLOW_NAME,
      { state: query.state || 'ALL' }
    );

    try {
      // Build form data
      const formData = new URLSearchParams();
      formData.append('FirstName', query.firstName);
      formData.append('LastName', query.lastName);
      if (query.state) {
        formData.append('State', query.state);
      }
      if (query.city) {
        formData.append('City', query.city);
      }

      const headers: Record<string, string> = { ...HEADERS };
      if (this.sessionCookies) {
        headers['Cookie'] = this.sessionCookies;
      }

      const response = await this.fetchWithTimeout(SEARCH_URL, {
        method: 'POST',
        headers,
        body: formData.toString(),
        redirect: 'follow',
      });

      if (!response.ok) {
        MollyLogger.warn(`Search failed: HTTP ${response.status}`, FLOW_NAME);
        return [];
      }

      const html = await response.text();

      // Check for human gates
      if (this.detectHumanGate(html)) {
        MollyLogger.warn('CAPTCHA detected — human gate required', FLOW_NAME);
        return [];
      }

      return this.parseResults(html);
    } catch (error) {
      MollyLogger.error('Search error', FLOW_NAME, undefined, error);
      return [];
    }
  }

  /**
   * Run a comprehensive search for an identity profile.
   * Searches primary name + all variants.
   */
  async searchProfile(profile: IdentityProfile): Promise<DiscoveredAsset[]> {
    const allResults: MissingMoneyResult[] = [];
    const allNames = [profile.primaryName, ...profile.nameVariants];

    // Init session first
    await this.initSession();

    for (const name of allNames) {
      const parts = name.trim().split(/\s+/);
      if (parts.length < 2) continue;

      const firstName = parts[0];
      const lastName = parts[parts.length - 1];

      // Search all states first
      const broadResults = await this.search({ firstName, lastName });
      allResults.push(...broadResults);

      // Then search priority states specifically (some portals
      // return different results when state is specified)
      const priorityRegions = profile.addresses
        .filter((a) => a.country === 'US')
        .map((a) => a.region);

      for (const state of priorityRegions) {
        const stateResults = await this.search({
          firstName,
          lastName,
          state,
        });
        allResults.push(...stateResults);
      }
    }

    // Deduplicate
    const deduped = this.deduplicateResults(allResults);

    // Convert to DiscoveredAssets
    return deduped.map((r) => this.toDiscoveredAsset(r));
  }

  // ==========================================================================
  // PARSING
  // ==========================================================================

  /**
   * Parse the search results HTML page.
   * MissingMoney returns results in a table format.
   */
  private parseResults(html: string): MissingMoneyResult[] {
    const $ = cheerio.load(html);
    const results: MissingMoneyResult[] = [];

    // MissingMoney uses various table/div structures for results.
    // We look for common patterns:

    // Pattern 1: Table rows with class 'searchResultRow' or similar
    $(
      'table.search-results tr, table#searchResults tr, .search-result-row, .property-row'
    ).each((_i, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const result: MissingMoneyResult = {
        listedName: $(cells[0]).text().trim(),
        propertyType: $(cells[1]).text().trim(),
        reportedBy: $(cells[2]).text().trim(),
        state: cells.length > 3 ? $(cells[3]).text().trim() : '',
      };

      // Try to extract amount if present
      if (cells.length > 4) {
        const amountText = $(cells[4]).text().trim();
        const amount = this.parseAmount(amountText);
        if (amount > 0) {
          result.amount = amount;
        }
      }

      // Try to extract claim link
      const link = $(row)
        .find('a[href*="claim"], a[href*="Claim"]')
        .attr('href');
      if (link) {
        result.claimUrl = link.startsWith('http') ? link : `${BASE_URL}${link}`;
      }

      if (result.listedName && result.propertyType) {
        results.push(result);
      }
    });

    // Pattern 2: Div-based results (some states use AJAX-loaded divs)
    if (results.length === 0) {
      $('.result-item, .property-item, [data-property-id]').each((_i, el) => {
        const name = $(el)
          .find('.owner-name, .name, .property-owner')
          .first()
          .text()
          .trim();
        const type = $(el).find('.property-type, .type').first().text().trim();
        const reportedBy = $(el)
          .find('.reported-by, .holder, .company')
          .first()
          .text()
          .trim();
        const state = $(el).find('.state, .jurisdiction').first().text().trim();
        const amountText = $(el)
          .find('.amount, .value, .property-value')
          .first()
          .text()
          .trim();

        if (name && type) {
          results.push({
            listedName: name,
            propertyType: type,
            reportedBy: reportedBy || 'Unknown',
            state: state || '',
            amount: this.parseAmount(amountText),
          });
        }
      });
    }

    // Pattern 3: Check for "no results" indicators
    const noResults =
      $('body').text().includes('No results found') ||
      $('body').text().includes('no matching records') ||
      $('body').text().includes('0 results');

    if (results.length === 0 && !noResults) {
      // May have results in an unexpected format — log the page structure
      MollyLogger.info(
        'No results parsed — page may have new format',
        FLOW_NAME,
        {
          bodyLength: html.length,
          hasTables: $('table').length,
          hasDivResults: $('.result').length,
        }
      );
    }

    MollyLogger.info(`Parsed ${results.length} results`, FLOW_NAME);
    return results;
  }

  /**
   * Parse a dollar amount from text.
   */
  private parseAmount(text: string): number {
    if (!text) return 0;
    const cleaned = text.replace(/[^0-9.,]/g, '').replace(/,/g, '');
    const amount = parseFloat(cleaned);
    return isNaN(amount) ? 0 : amount;
  }

  // ==========================================================================
  // CONVERSION
  // ==========================================================================

  /**
   * Convert a raw search result to a DiscoveredAsset.
   */
  private toDiscoveredAsset(result: MissingMoneyResult): DiscoveredAsset {
    const source: AssetSource = {
      name: `MissingMoney.com — ${result.state || 'Multi-State'}`,
      url: result.claimUrl || SEARCH_URL,
      country: 'US',
      region: result.state || undefined,
      hasApi: false,
      referenceNumber: undefined,
    };

    const id = `mm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
      id,
      type: this.inferAssetType(result.propertyType),
      status: 'discovered',
      description: `${result.propertyType} — reported by ${result.reportedBy}`,
      estimatedValue: result.amount || 0,
      currency: 'USD',
      source,
      matchedIdentity: result.listedName,
      matchConfidence: 0, // Will be scored by BaseScanner
      discoveredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      auditLog: [
        {
          action: 'discovered',
          timestamp: new Date().toISOString(),
          actor: 'scanner',
          details: `Found on MissingMoney.com: ${result.propertyType} from ${result.reportedBy}`,
        },
      ],
    };
  }

  /**
   * Infer the asset type from the property type description.
   */
  private inferAssetType(propertyType: string): DiscoveredAsset['type'] {
    const lower = propertyType.toLowerCase();

    if (
      lower.includes('check') ||
      lower.includes('account') ||
      lower.includes('deposit')
    ) {
      return 'dormant-account';
    }
    if (
      lower.includes('refund') ||
      lower.includes('credit') ||
      lower.includes('rebate')
    ) {
      return 'unclaimed-refund';
    }
    if (
      lower.includes('stock') ||
      lower.includes('share') ||
      lower.includes('bond') ||
      lower.includes('securit')
    ) {
      return 'abandoned-securities';
    }
    if (
      lower.includes('inherit') ||
      lower.includes('estate') ||
      lower.includes('probate')
    ) {
      return 'unclaimed-inheritance';
    }
    if (lower.includes('dividend') || lower.includes('interest')) {
      return 'unclaimed-dividend';
    }
    if (lower.includes('royalt')) {
      return 'unclaimed-royalty';
    }
    if (lower.includes('insurance') || lower.includes('policy')) {
      return 'unclaimed-insurance';
    }
    if (lower.includes('safe') || lower.includes('box')) {
      return 'abandoned-safe-deposit';
    }
    if (
      lower.includes('wage') ||
      lower.includes('salary') ||
      lower.includes('payroll')
    ) {
      return 'unclaimed-property';
    }
    if (
      lower.includes('crypto') ||
      lower.includes('bitcoin') ||
      lower.includes('digital')
    ) {
      return 'dormant-exchange';
    }

    return 'unclaimed-property';
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Detect CAPTCHA or other human gates.
   */
  private detectHumanGate(html: string): boolean {
    const lower = html.toLowerCase();
    return [
      'captcha',
      'recaptcha',
      'hcaptcha',
      'verify you are human',
      'prove you are not a robot',
      'challenge-form',
      'cf-turnstile',
    ].some((gate) => lower.includes(gate));
  }

  /**
   * Rate limit between requests.
   */
  private async rateLimit(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, RATE_LIMIT_MS - elapsed)
      );
    }
    this.lastRequestAt = Date.now();
  }

  /**
   * Fetch with timeout.
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Deduplicate results by name + property type + reported by.
   */
  private deduplicateResults(
    results: MissingMoneyResult[]
  ): MissingMoneyResult[] {
    const seen = new Set<string>();
    return results.filter((r) => {
      const key =
        `${r.listedName}|${r.propertyType}|${r.reportedBy}|${r.state}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let scraper: MissingMoneyScraper | null = null;

export function getMissingMoneyScraper(): MissingMoneyScraper {
  if (!scraper) {
    scraper = new MissingMoneyScraper();
  }
  return scraper;
}
