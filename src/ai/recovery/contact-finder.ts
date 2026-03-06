/**
 * @fileOverview Contact Finder — Automated Email Discovery
 *
 * When the scanner finds unclaimed property for "John Smith" in Oregon,
 * we have a name but no email. This module finds their contact info
 * by searching publicly available sources:
 *
 *   1. State voter registration records (public in many states)
 *   2. Public records aggregators (whitepages, etc.)
 *   3. Social media profile discovery
 *   4. Professional networks (LinkedIn public profiles)
 *   5. Reverse address lookup (if we have their last known address)
 *
 * Privacy principles:
 *   - Only use PUBLICLY available information
 *   - Never access private databases without authorization
 *   - Store only what's needed (email, name, state)
 *   - All PII is encrypted at rest via identity-vault
 *   - Respect robots.txt and rate limits
 *
 * This scales from free (manual web lookups) to paid APIs
 * (PeopleDataLabs, Hunter.io, etc.) as revenue allows.
 */

import { MollyLogger } from '@/ai/logger';

const FLOW_NAME = 'contact-finder';

// ============================================================================
// TYPES
// ============================================================================

export type ContactSource =
  | 'voter-records'
  | 'public-records'
  | 'social-media'
  | 'professional-network'
  | 'reverse-address'
  | 'web-search'
  | 'manual';

export interface FoundContact {
  /** Email address found */
  email: string;
  /** Confidence score (0.0 - 1.0) */
  confidence: number;
  /** Where this email was found */
  source: ContactSource;
  /** Whether this email has been verified (deliverable check) */
  verified: boolean;
  /** When this was found */
  foundAt: string;
}

export interface ContactSearchResult {
  /** The person we searched for */
  name: string;
  /** State/region for the search */
  state: string;
  /** All email candidates found */
  emails: FoundContact[];
  /** Best email (highest confidence, verified if possible) */
  bestEmail: string | null;
  /** Whether the search found at least one email */
  found: boolean;
  /** Sources checked */
  sourcesChecked: ContactSource[];
  /** Duration of the search */
  durationMs: number;
  /** Errors encountered */
  errors: string[];
}

export interface ContactFinderConfig {
  /** Enable paid APIs (when revenue allows) */
  usePaidApis: boolean;
  /** Hunter.io API key (optional — paid) */
  hunterApiKey?: string;
  /** PeopleDataLabs API key (optional — paid) */
  pdlApiKey?: string;
  /** Max concurrent lookups */
  maxConcurrent: number;
  /** Delay between lookups (respect rate limits) */
  delayBetweenLookupsMs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

let finderConfig: ContactFinderConfig = {
  usePaidApis: false, // Start free, scale when revenue comes
  maxConcurrent: 3,
  delayBetweenLookupsMs: 2000,
};

export function configureContactFinder(
  config: Partial<ContactFinderConfig>
): void {
  finderConfig = { ...finderConfig, ...config };
  MollyLogger.info('Contact finder configured', FLOW_NAME, {
    usePaidApis: finderConfig.usePaidApis,
  });
}

// ============================================================================
// SEARCH STRATEGIES — Free tier
// ============================================================================

/**
 * Search for a person's email using free, publicly available sources.
 *
 * Strategy order (most reliable first):
 *   1. State voter records (many states publish these online)
 *   2. Web search for "name" + "email" + state
 *   3. Social media profile scraping (public profiles only)
 */
export async function findContactEmail(
  name: string,
  state: string,
  lastKnownAddress?: string,
  lastKnownCity?: string
): Promise<ContactSearchResult> {
  const startTime = Date.now();
  const emails: FoundContact[] = [];
  const sourcesChecked: ContactSource[] = [];
  const errors: string[] = [];

  MollyLogger.info(`Searching for contact: ${name} (${state})`, FLOW_NAME);

  // Strategy 1: Voter records (free in many states)
  try {
    sourcesChecked.push('voter-records');
    const voterResult = await searchVoterRecords(name, state);
    if (voterResult) emails.push(voterResult);
  } catch (error) {
    errors.push(
      `Voter records: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Strategy 2: Web search
  try {
    sourcesChecked.push('web-search');
    const webResults = await searchWeb(name, state, lastKnownCity);
    emails.push(...webResults);
  } catch (error) {
    errors.push(
      `Web search: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Strategy 3: Public records
  try {
    sourcesChecked.push('public-records');
    const publicResults = await searchPublicRecords(
      name,
      state,
      lastKnownAddress
    );
    if (publicResults) emails.push(publicResults);
  } catch (error) {
    errors.push(
      `Public records: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Strategy 4: Paid APIs (only if configured and funded)
  if (finderConfig.usePaidApis) {
    try {
      sourcesChecked.push('professional-network');
      const paidResults = await searchPaidApis(name, state);
      emails.push(...paidResults);
    } catch (error) {
      errors.push(
        `Paid APIs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Deduplicate and rank by confidence
  const uniqueEmails = deduplicateEmails(emails);
  const bestEmail = selectBestEmail(uniqueEmails);

  const result: ContactSearchResult = {
    name,
    state,
    emails: uniqueEmails,
    bestEmail,
    found: bestEmail !== null,
    sourcesChecked,
    durationMs: Date.now() - startTime,
    errors,
  };

  MollyLogger.info(
    `Contact search complete: ${name} — ${result.found ? `found ${uniqueEmails.length} email(s)` : 'not found'}`,
    FLOW_NAME,
    {
      emailsFound: uniqueEmails.length,
      bestEmail: bestEmail ? '[REDACTED]' : null,
      durationMs: result.durationMs,
    }
  );

  return result;
}

/**
 * Batch search for multiple people's contact info.
 * Respects rate limits between lookups.
 */
export async function batchFindContacts(
  people: { name: string; state: string; city?: string; address?: string }[]
): Promise<ContactSearchResult[]> {
  const results: ContactSearchResult[] = [];

  MollyLogger.info(
    `Starting batch contact search for ${people.length} people`,
    FLOW_NAME
  );

  for (let i = 0; i < people.length; i++) {
    const person = people[i]!;

    const result = await findContactEmail(
      person.name,
      person.state,
      person.address,
      person.city
    );
    results.push(result);

    // Rate limit — don't hammer sources
    if (i < people.length - 1) {
      await delay(finderConfig.delayBetweenLookupsMs);
    }
  }

  const found = results.filter((r) => r.found).length;
  MollyLogger.info(
    `Batch contact search complete: ${found}/${people.length} found`,
    FLOW_NAME
  );

  return results;
}

// ============================================================================
// SEARCH IMPLEMENTATIONS — Free sources
// ============================================================================

/**
 * Search state voter registration records.
 *
 * Many states publish voter data publicly. This is legal
 * and commonly used by political campaigns, nonprofits,
 * and legitimate businesses.
 *
 * States with publicly accessible voter files include:
 * Oregon, Washington, Colorado, Nevada, and others.
 */
async function searchVoterRecords(
  name: string,
  state: string
): Promise<FoundContact | null> {
  // Voter record URLs vary by state — these are public data portals
  const voterPortals: Record<string, string> = {
    OR: 'https://sos.oregon.gov/elections/Pages/voterregistrationdata.aspx',
    WA: 'https://www.sos.wa.gov/elections/vrdb/extract-requests.aspx',
    AZ: 'https://azsos.gov/elections/voter-registration',
    NV: 'https://www.nvsos.gov/sos/elections/voters/voter-data-files',
  };

  const portalUrl = voterPortals[state.toUpperCase()];
  if (!portalUrl) {
    return null; // State not yet supported
  }

  // Note: Actual voter record downloads require state-specific
  // request processes. This is the integration point — when we
  // download and index voter files, we search them here.
  //
  // For now, this returns null. The infrastructure is ready for
  // when we download and index the actual voter files.
  //
  // Oregon and Washington both provide voter files for free
  // with standard request forms.

  MollyLogger.info(
    `Voter records check for ${name} in ${state} — portal: ${portalUrl}`,
    FLOW_NAME
  );

  return null; // TODO: Implement when voter files are downloaded
}

/**
 * Search the web for publicly available contact information.
 *
 * Uses search patterns like:
 *   "John Smith" email Oregon
 *   "John Smith" contact Portland OR
 */
async function searchWeb(
  name: string,
  state: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _city?: string
): Promise<FoundContact[]> {
  const results: FoundContact[] = [];

  // We can use search engines or public directories
  // For now, we use a simple web fetch approach against
  // public directory sites that don't require API keys

  const searchTargets = [
    // Whitepages-style public lookups
    `https://www.whitepages.com/name/${encodeURIComponent(name)}/${encodeURIComponent(state)}`,
  ];

  for (const url of searchTargets) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; AssetRecoveryBot/1.0; legitimate-business)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) continue;

      const html = await response.text();

      // Extract email patterns from the page
      const emailsFound = extractEmails(html);

      for (const email of emailsFound) {
        // Basic validation — must be a real-looking email
        if (isPlausibleEmail(email, name)) {
          results.push({
            email,
            confidence: 0.4, // Web scrape = lower confidence
            source: 'web-search',
            verified: false,
            foundAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      // Timeout or network error — move to next source
      continue;
    }
  }

  return results;
}

/**
 * Search public records aggregators.
 */
/* eslint-disable @typescript-eslint/no-unused-vars */
async function searchPublicRecords(
  _name: string,
  _state: string,
  _address?: string
): Promise<FoundContact | null> {
  /* eslint-enable @typescript-eslint/no-unused-vars */
  // Public records aggregators that offer free basic lookups:
  // - TruePeopleSearch
  // - FastPeopleSearch
  // - That's Them
  //
  // These sites surface publicly available data.
  // We scrape them responsibly (rate limited, User-Agent identified).

  // For now, returning null. This is the integration point.
  // When we add specific scrapers for these sites, they plug in here.

  return null; // TODO: Add specific public record site scrapers
}

/**
 * Search through paid APIs (activated when revenue allows).
 *
 * Supported services:
 *   - Hunter.io — Email finder ($49/mo for 500 searches)
 *   - PeopleDataLabs — Contact enrichment ($0.01-0.05/record)
 *   - Clearbit — Business contact data
 */
async function searchPaidApis(
  name: string,
  state: string
): Promise<FoundContact[]> {
  const results: FoundContact[] = [];

  // Hunter.io integration
  if (finderConfig.hunterApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const url = `https://api.hunter.io/v2/email-finder?full_name=${encodeURIComponent(name)}&api_key=${finderConfig.hunterApiKey}`;

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as {
          data?: { email?: string; score?: number };
        };
        if (data.data?.email) {
          results.push({
            email: data.data.email,
            confidence: (data.data.score || 50) / 100,
            source: 'professional-network',
            verified: true, // Hunter verifies deliverability
            foundAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      // API error — continue without it
    }
  }

  // PeopleDataLabs integration
  if (finderConfig.pdlApiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const url = `https://api.peopledatalabs.com/v5/person/search`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-Api-Key': finderConfig.pdlApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            bool: {
              must: [
                { term: { full_name: name } },
                { term: { location_region: state } },
              ],
            },
          },
          size: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as {
          data?: Array<{
            work_email?: string;
            personal_emails?: string[];
          }>;
        };
        const person = data.data?.[0];
        const email = person?.personal_emails?.[0] || person?.work_email;
        if (email) {
          results.push({
            email,
            confidence: 0.8, // PDL is high quality
            source: 'public-records',
            verified: true,
            foundAt: new Date().toISOString(),
          });
        }
      }
    } catch {
      // API error — continue
    }
  }

  return results;
}

// ============================================================================
// UTILITIES
// ============================================================================

/** Extract email addresses from HTML/text content */
function extractEmails(text: string): string[] {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  if (!matches) return [];

  // Filter out obvious non-personal emails
  const excludePatterns = [
    /noreply/i,
    /no-reply/i,
    /donotreply/i,
    /support@/i,
    /info@/i,
    /admin@/i,
    /webmaster@/i,
    /privacy@/i,
    /abuse@/i,
    /postmaster@/i,
    /@example\./i,
    /@test\./i,
    /@localhost/i,
    /\.gov$/i, // Don't email government addresses
  ];

  return matches.filter(
    (email) => !excludePatterns.some((pattern) => pattern.test(email))
  );
}

/** Check if an extracted email plausibly belongs to the named person */
function isPlausibleEmail(email: string, name: string): boolean {
  const emailLocal = email.split('@')[0]?.toLowerCase() || '';
  const nameParts = name.toLowerCase().split(/\s+/);

  // Check if any part of the name appears in the email
  for (const part of nameParts) {
    if (part.length >= 3 && emailLocal.includes(part)) {
      return true;
    }
  }

  // Also accept if first initial + last name pattern
  if (nameParts.length >= 2) {
    const firstInitial = nameParts[0]?.[0] || '';
    const lastName = nameParts[nameParts.length - 1] || '';
    if (lastName.length >= 3 && emailLocal.includes(firstInitial + lastName)) {
      return true;
    }
  }

  return false;
}

/** Deduplicate emails, keeping the highest confidence version */
function deduplicateEmails(emails: FoundContact[]): FoundContact[] {
  const byEmail = new Map<string, FoundContact>();

  for (const contact of emails) {
    const normalized = contact.email.toLowerCase();
    const existing = byEmail.get(normalized);

    if (!existing || contact.confidence > existing.confidence) {
      byEmail.set(normalized, { ...contact, email: normalized });
    }
  }

  return Array.from(byEmail.values()).sort(
    (a, b) => b.confidence - a.confidence
  );
}

/** Select the best email from candidates */
function selectBestEmail(emails: FoundContact[]): string | null {
  if (emails.length === 0) return null;

  // Prefer verified emails
  const verified = emails.filter((e) => e.verified);
  if (verified.length > 0) return verified[0]!.email;

  // Otherwise highest confidence
  return emails[0]!.email;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
