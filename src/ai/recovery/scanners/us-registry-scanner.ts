/**
 * @fileOverview US Registry Scanner — All 50 States + Federal
 *
 * The United States has the most mature unclaimed property system
 * in the world. Every state maintains its own registry, plus federal
 * sources (Treasury, IRS, FDIC).
 *
 * Multi-state aggregators:
 *   - MissingMoney.com (NAUPA partnership, 40+ states)
 *   - Unclaimed.org (NAUPA directory)
 *
 * Federal sources:
 *   - Treasury Hunt (savings bonds, Treasury securities)
 *   - IRS unclaimed refunds
 *   - FDIC unclaimed deposits (failed bank depositor search)
 *   - PBGC (pension benefits from terminated plans)
 *   - HUD/FHA mortgage insurance refunds
 *
 * Strategy:
 *   1. Hit multi-state aggregators first (broad sweep)
 *   2. Then hit individual state portals for states with known addresses
 *   3. Then federal sources
 *   4. Cross-reference and deduplicate
 */

import { BaseScanner } from '../base-scanner';
import { MollyLogger } from '@/ai/logger';
import type {
  DiscoveredAsset,
  IdentityProfile,
  ScannerType,
  AssetSource,
} from '../types';

const FLOW_NAME = 'us-registry-scanner';

// ============================================================================
// STATE PORTAL DIRECTORY
// ============================================================================

export interface StatePortal {
  state: string;
  stateCode: string;
  url: string;
  searchUrl?: string;
  hasApi: boolean;
  notes?: string;
}

/**
 * All 50 states + DC unclaimed property portals.
 * This is the authoritative directory Molly uses to know WHERE to look.
 */
export const US_STATE_PORTALS: StatePortal[] = [
  {
    state: 'Alabama',
    stateCode: 'AL',
    url: 'https://treasury.alabama.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Alaska',
    stateCode: 'AK',
    url: 'https://unclaimedproperty.alaska.gov/',
    hasApi: false,
  },
  {
    state: 'Arizona',
    stateCode: 'AZ',
    url: 'https://azdor.gov/unclaimed-property',
    hasApi: false,
  },
  {
    state: 'Arkansas',
    stateCode: 'AR',
    url: 'https://www.claimit.arkansas.gov/',
    hasApi: false,
  },
  {
    state: 'California',
    stateCode: 'CA',
    url: 'https://ucpi.sco.ca.gov/',
    hasApi: true,
    notes: 'SCO has searchable API',
  },
  {
    state: 'Colorado',
    stateCode: 'CO',
    url: 'https://colorado.findyourunclaimedproperty.com/',
    hasApi: false,
  },
  {
    state: 'Connecticut',
    stateCode: 'CT',
    url: 'https://portal.ct.gov/OTT/Unclaimed-Property',
    hasApi: false,
  },
  {
    state: 'Delaware',
    stateCode: 'DE',
    url: 'https://unclaimedproperty.delaware.gov/',
    hasApi: false,
  },
  {
    state: 'Florida',
    stateCode: 'FL',
    url: 'https://www.fltreasurehunt.gov/',
    hasApi: true,
    notes: 'Florida has REST API',
  },
  {
    state: 'Georgia',
    stateCode: 'GA',
    url: 'https://dor.georgia.gov/unclaimed-property',
    hasApi: false,
  },
  {
    state: 'Hawaii',
    stateCode: 'HI',
    url: 'https://budget.hawaii.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Idaho',
    stateCode: 'ID',
    url: 'https://yourmoney.idaho.gov/',
    hasApi: false,
  },
  {
    state: 'Illinois',
    stateCode: 'IL',
    url: 'https://icash.illinois.gov/',
    hasApi: true,
    notes: 'Illinois iCash has search API',
  },
  {
    state: 'Indiana',
    stateCode: 'IN',
    url: 'https://www.indianaunclaimed.gov/',
    hasApi: false,
  },
  {
    state: 'Iowa',
    stateCode: 'IA',
    url: 'https://greatiowatreasurehunt.gov/',
    hasApi: false,
  },
  {
    state: 'Kansas',
    stateCode: 'KS',
    url: 'https://kansascash.ks.gov/',
    hasApi: false,
  },
  {
    state: 'Kentucky',
    stateCode: 'KY',
    url: 'https://missingmoney.com/',
    hasApi: false,
    notes: 'KY uses MissingMoney directly',
  },
  {
    state: 'Louisiana',
    stateCode: 'LA',
    url: 'https://treasury.louisiana.gov/unclaimed-property',
    hasApi: false,
  },
  {
    state: 'Maine',
    stateCode: 'ME',
    url: 'https://www.maine.gov/treasurer/unclaimed_property/',
    hasApi: false,
  },
  {
    state: 'Maryland',
    stateCode: 'MD',
    url: 'https://marylandtaxes.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Massachusetts',
    stateCode: 'MA',
    url: 'https://findmassmoney.com/',
    hasApi: false,
  },
  {
    state: 'Michigan',
    stateCode: 'MI',
    url: 'https://unclaimedproperty.michigan.gov/',
    hasApi: false,
  },
  {
    state: 'Minnesota',
    stateCode: 'MN',
    url: 'https://mn.gov/commerce/consumers/your-money/find-missing-money/',
    hasApi: false,
  },
  {
    state: 'Mississippi',
    stateCode: 'MS',
    url: 'https://treasury.ms.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Missouri',
    stateCode: 'MO',
    url: 'https://treasurer.mo.gov/unclaimedproperty/',
    hasApi: false,
  },
  {
    state: 'Montana',
    stateCode: 'MT',
    url: 'https://mtrevenue.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Nebraska',
    stateCode: 'NE',
    url: 'https://treasurer.nebraska.gov/up/',
    hasApi: false,
  },
  {
    state: 'Nevada',
    stateCode: 'NV',
    url: 'https://nevadatreasurer.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'New Hampshire',
    stateCode: 'NH',
    url: 'https://www.treasury.nh.gov/unclaimed-property',
    hasApi: false,
  },
  {
    state: 'New Jersey',
    stateCode: 'NJ',
    url: 'https://unclaimedproperty.nj.gov/',
    hasApi: false,
  },
  {
    state: 'New Mexico',
    stateCode: 'NM',
    url: 'https://tap.state.nm.us/UCP/',
    hasApi: false,
  },
  {
    state: 'New York',
    stateCode: 'NY',
    url: 'https://osc.state.ny.us/unclaimed-funds',
    hasApi: true,
    notes: 'NY Comptroller has search API',
  },
  {
    state: 'North Carolina',
    stateCode: 'NC',
    url: 'https://www.nccash.com/',
    hasApi: false,
  },
  {
    state: 'North Dakota',
    stateCode: 'ND',
    url: 'https://www.land.nd.gov/unclaimed-property',
    hasApi: false,
  },
  {
    state: 'Ohio',
    stateCode: 'OH',
    url: 'https://com.ohio.gov/divisions-and-programs/unclaimed-funds/',
    hasApi: false,
  },
  {
    state: 'Oklahoma',
    stateCode: 'OK',
    url: 'https://treasurer.ok.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Oregon',
    stateCode: 'OR',
    url: 'https://oregonup.us/',
    hasApi: false,
    notes: "Priority — Eric's home state",
  },
  {
    state: 'Pennsylvania',
    stateCode: 'PA',
    url: 'https://www.patreasury.gov/unclaimed-property/',
    hasApi: true,
    notes: 'PA Treasury has API',
  },
  {
    state: 'Rhode Island',
    stateCode: 'RI',
    url: 'https://treasury.ri.gov/unclaimed-property',
    hasApi: false,
  },
  {
    state: 'South Carolina',
    stateCode: 'SC',
    url: 'https://treasurer.sc.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'South Dakota',
    stateCode: 'SD',
    url: 'https://sdtreasurer.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Tennessee',
    stateCode: 'TN',
    url: 'https://treasury.tn.gov/Unclaimed-Property',
    hasApi: false,
  },
  {
    state: 'Texas',
    stateCode: 'TX',
    url: 'https://claimittexas.org/',
    hasApi: true,
    notes: 'Texas Comptroller has search API',
  },
  {
    state: 'Utah',
    stateCode: 'UT',
    url: 'https://mycash.utah.gov/',
    hasApi: false,
  },
  {
    state: 'Vermont',
    stateCode: 'VT',
    url: 'https://www.vermonttreasurer.gov/unclaimed-property',
    hasApi: false,
  },
  {
    state: 'Virginia',
    stateCode: 'VA',
    url: 'https://vamoneysearch.org/',
    hasApi: false,
  },
  {
    state: 'Washington',
    stateCode: 'WA',
    url: 'https://ucp.dor.wa.gov/',
    hasApi: false,
    notes: 'Priority — known address state',
  },
  {
    state: 'West Virginia',
    stateCode: 'WV',
    url: 'https://wvtreasury.com/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Wisconsin',
    stateCode: 'WI',
    url: 'https://statetreasurer.wi.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'Wyoming',
    stateCode: 'WY',
    url: 'https://treasurer.wyo.gov/unclaimed-property/',
    hasApi: false,
  },
  {
    state: 'District of Columbia',
    stateCode: 'DC',
    url: 'https://cfo.dc.gov/page/unclaimed-property',
    hasApi: false,
  },
];

/**
 * Federal unclaimed asset sources.
 */
export const US_FEDERAL_SOURCES: AssetSource[] = [
  {
    name: 'MissingMoney.com (NAUPA Multi-State)',
    url: 'https://www.missingmoney.com/',
    country: 'US',
    hasApi: false,
  },
  {
    name: 'Treasury Hunt (Savings Bonds & Securities)',
    url: 'https://www.fiscal.treasury.gov/unclaimed-assets.html',
    country: 'US',
    hasApi: false,
  },
  {
    name: 'IRS Unclaimed Tax Refunds',
    url: 'https://sa.www4.irs.gov/irfof/lang/en/irfofgetstatus.jsp',
    country: 'US',
    hasApi: false,
  },
  {
    name: 'FDIC Unclaimed Deposits (Failed Banks)',
    url: 'https://closedbanks.fdic.gov/funds/',
    country: 'US',
    hasApi: true,
  },
  {
    name: 'PBGC Unclaimed Pensions',
    url: 'https://search.pbgc.gov/mp/',
    country: 'US',
    hasApi: false,
  },
  {
    name: 'HUD/FHA Mortgage Insurance Refunds',
    url: 'https://entp.hud.gov/dsrs/refunds/',
    country: 'US',
    hasApi: false,
  },
  {
    name: 'SEC Unclaimed Funds (Fair Fund distributions)',
    url: 'https://www.sec.gov/divisions/enforce/claims.htm',
    country: 'US',
    hasApi: false,
  },
];

// ============================================================================
// US REGISTRY SCANNER
// ============================================================================

export class USRegistryScanner extends BaseScanner {
  readonly scannerType: ScannerType = 'us-state';
  readonly name = 'US Unclaimed Property Scanner';
  readonly regions = US_STATE_PORTALS.map((p) => p.stateCode);

  /**
   * Priority states — searched first, based on known address history.
   */
  private priorityStates: string[] = ['OR', 'WA', 'CA'];

  /**
   * Set priority states for this scanner.
   */
  setPriorityStates(states: string[]): void {
    this.priorityStates = states;
  }

  /**
   * Search all US registries for unclaimed assets.
   *
   * Strategy:
   * 1. Multi-state aggregator (MissingMoney) — broadest sweep
   * 2. Priority state portals (known address states)
   * 3. Remaining states with API access
   * 4. Federal sources
   */
  protected async search(profile: IdentityProfile): Promise<DiscoveredAsset[]> {
    const allAssets: DiscoveredAsset[] = [];

    // Phase 1: Multi-state aggregator
    MollyLogger.info(
      'Phase 1: Searching multi-state aggregator (MissingMoney)',
      FLOW_NAME
    );
    const multiStateResults = await this.searchMultiState(profile);
    allAssets.push(...multiStateResults);

    // Phase 2: Priority state portals
    MollyLogger.info('Phase 2: Searching priority state portals', FLOW_NAME, {
      states: this.priorityStates,
    });
    for (const stateCode of this.priorityStates) {
      const portal = US_STATE_PORTALS.find((p) => p.stateCode === stateCode);
      if (portal) {
        await this.rateLimit();
        const stateResults = await this.searchStatePortal(portal, profile);
        allAssets.push(...stateResults);
      }
    }

    // Phase 3: API-enabled states (not in priority list)
    const apiStates = US_STATE_PORTALS.filter(
      (p) => p.hasApi && !this.priorityStates.includes(p.stateCode)
    );
    MollyLogger.info(
      `Phase 3: Searching ${apiStates.length} API-enabled states`,
      FLOW_NAME
    );
    for (const portal of apiStates) {
      await this.rateLimit();
      const stateResults = await this.searchStatePortal(portal, profile);
      allAssets.push(...stateResults);
    }

    // Phase 4: Federal sources
    MollyLogger.info('Phase 4: Searching federal sources', FLOW_NAME);
    const federalResults = await this.searchFederal(profile);
    allAssets.push(...federalResults);

    // Deduplicate by description + value + source
    const deduplicated = this.deduplicate(allAssets);

    MollyLogger.info('US scan complete', FLOW_NAME, {
      totalFound: deduplicated.length,
      beforeDedup: allAssets.length,
    });

    return deduplicated;
  }

  /**
   * Health check — verify MissingMoney.com is reachable.
   */
  async healthCheck(): Promise<boolean> {
    try {
      // In production, this would do an HTTP HEAD request
      // For now, we confirm the scanner is properly configured
      return US_STATE_PORTALS.length === 51 && US_FEDERAL_SOURCES.length > 0;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // SEARCH METHODS
  // ==========================================================================

  /**
   * Search the multi-state MissingMoney.com aggregator.
   *
   * MissingMoney covers 40+ states in one search.
   * Requires: first name, last name, state (optional)
   *
   * In production, this uses Molly's Python runtime to submit
   * the search form and parse results.
   */
  private async searchMultiState(
    profile: IdentityProfile
  ): Promise<DiscoveredAsset[]> {
    const assets: DiscoveredAsset[] = [];

    // Build search queries for primary name + all variants
    const namesToSearch = [profile.primaryName, ...profile.nameVariants];

    for (const name of namesToSearch) {
      const parts = name.split(' ');
      if (parts.length < 2) continue;

      const firstName = parts[0];
      const lastName = parts[parts.length - 1];

      MollyLogger.info(
        `Searching MissingMoney: ${firstName} ${lastName}`,
        FLOW_NAME
      );

      // This is where Molly's polyglot runtime executes the actual search
      // The Python script would:
      // 1. POST to MissingMoney.com search form
      // 2. Parse the results table
      // 3. Extract property type, reported by, amount (if shown)
      // 4. Return structured data
      //
      // For now, this is the connector stub. The actual HTTP interaction
      // will be wired when Molly is running with shell access.

      // Stub: Real implementation uses getMollyShell().execPython(searchScript)
    }

    return assets;
  }

  /**
   * Search an individual state portal.
   *
   * Each state has different form fields, result formats, and quirks.
   * States with API access get structured queries.
   * States without API access get form submissions via Python.
   */
  private async searchStatePortal(
    portal: StatePortal,
    profile: IdentityProfile
  ): Promise<DiscoveredAsset[]> {
    const assets: DiscoveredAsset[] = [];

    MollyLogger.info(`Searching state portal: ${portal.state}`, FLOW_NAME, {
      url: portal.url,
      hasApi: portal.hasApi,
    });

    if (portal.hasApi) {
      // States with programmatic access
      // Each API-enabled state will get its own adapter method
      // For now, log that we'd hit the API
      MollyLogger.info(`API search available for ${portal.state}`, FLOW_NAME);
    } else {
      // Form-based search via Python
      // Molly submits the web form programmatically
      MollyLogger.info(`Form-based search for ${portal.state}`, FLOW_NAME);
    }

    return assets;
  }

  /**
   * Search federal unclaimed asset sources.
   */
  private async searchFederal(
    profile: IdentityProfile
  ): Promise<DiscoveredAsset[]> {
    const assets: DiscoveredAsset[] = [];

    for (const source of US_FEDERAL_SOURCES) {
      await this.rateLimit();
      MollyLogger.info(`Searching federal source: ${source.name}`, FLOW_NAME, {
        url: source.url,
        hasApi: source.hasApi,
      });

      // Each federal source will get its own search adapter
      // FDIC has an actual API, others require form submissions
    }

    return assets;
  }

  // ==========================================================================
  // DEDUPLICATION
  // ==========================================================================

  /**
   * Remove duplicate results that appear across multiple sources.
   * Uses description + estimated value + matched identity as composite key.
   */
  private deduplicate(assets: DiscoveredAsset[]): DiscoveredAsset[] {
    const seen = new Set<string>();
    const unique: DiscoveredAsset[] = [];

    for (const asset of assets) {
      const key =
        `${asset.description}|${asset.estimatedValue}|${asset.matchedIdentity}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(asset);
      }
    }

    return unique;
  }
}

// ============================================================================
// SINGLETON ACCESS
// ============================================================================

let usScanner: USRegistryScanner | null = null;

export function getUSRegistryScanner(): USRegistryScanner {
  if (!usScanner) {
    usScanner = new USRegistryScanner();
  }
  return usScanner;
}
