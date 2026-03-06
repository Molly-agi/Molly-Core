/**
 * @fileOverview Jurisdiction Compliance — The Foundation
 *
 * Before we contact a single heir, we need to know the rules.
 * Every US state (and eventually international jurisdictions)
 * has different laws governing heir-finding / asset recovery services:
 *
 *   - Fee caps (some states cap finder's fees at 10-20%)
 *   - Disclosure requirements (must tell heir the state is holding their money)
 *   - Waiting periods (can't contact heir until X days after escheatment)
 *   - Registration requirements (some states require recovery agent registration)
 *   - Contract requirements (some require notarized agreements)
 *   - Time-after-listing restrictions (can't charge fee within X months of listing)
 *
 * This module is the source of truth. Every outreach, every agreement,
 * every fee calculation goes through here first.
 *
 * "We don't fix the leaks in the dam. We fix the dam itself."
 */

import { MollyLogger } from '@/ai/logger';

const FLOW_NAME = 'jurisdiction-compliance';

// ============================================================================
// TYPES
// ============================================================================

export interface JurisdictionRule {
  /** State/region code (e.g., 'OR', 'CA', 'IN') */
  code: string;
  /** Full name */
  name: string;
  /** Country */
  country: string;
  /** Maximum allowable finder's fee (percentage). null = no cap */
  maxFinderFeePercent: number | null;
  /** Minimum days after escheatment before contact is allowed. 0 = no restriction */
  contactWaitDays: number;
  /**
   * Months after public listing during which fee is restricted.
   * Many states say "if the property was listed within X months,
   * finder's fee is capped or prohibited." 0 = no restriction.
   */
  feeRestrictionMonthsAfterListing: number;
  /** Whether the state requires recovery agents to register */
  registrationRequired: boolean;
  /** Whether a notarized agreement is required */
  notarizedAgreementRequired: boolean;
  /** Whether we must disclose the state program URL in outreach */
  mustDiscloseStateProgram: boolean;
  /** The state's unclaimed property program URL (for disclosure) */
  stateProgramUrl: string;
  /** Whether the state allows electronic/digital agreements */
  electronicAgreementAllowed: boolean;
  /** Whether the state has specific required contract language */
  requiredContractLanguage: string | null;
  /** Additional notes or restrictions */
  notes: string;
}

export interface ComplianceCheck {
  /** Whether the outreach/agreement is compliant */
  compliant: boolean;
  /** What was checked */
  jurisdiction: string;
  /** Applied fee (may be reduced from requested if capped) */
  allowedFeePercent: number;
  /** Specific issues found */
  issues: ComplianceIssue[];
  /** The rule applied */
  rule: JurisdictionRule;
}

export interface ComplianceIssue {
  /** Severity */
  severity: 'block' | 'warning' | 'info';
  /** What's wrong */
  message: string;
  /** What to do about it */
  recommendation: string;
}

// ============================================================================
// US STATE RULES — Researched per-state regulations
// ============================================================================

/**
 * US State heir-finding / unclaimed property finder regulations.
 *
 * Sources: NAUPA guidelines, individual state statutes, NAST recommendations.
 *
 * Key patterns:
 *   - Many states cap fees (commonly 10-20%)
 *   - Most states restrict contact within 24 months of escheatment
 *   - Several states require written disclosure of the state program
 *   - Some states require the finder to be registered/licensed
 *
 * NOTE: These are best-effort compilations. Laws change.
 * The system should flag anything uncertain for human review.
 * Eric approves all outreach before it goes out.
 */
const US_STATE_RULES: JurisdictionRule[] = [
  // === States with strict fee caps ===
  {
    code: 'IN',
    name: 'Indiana',
    country: 'US',
    maxFinderFeePercent: 10,
    contactWaitDays: 730, // 24 months
    feeRestrictionMonthsAfterListing: 24,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.indianaunclaimed.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage:
      'Agreement must state that the owner may claim property directly from the state at no cost.',
    notes: 'Strict — 10% cap, 24-month wait. Must disclose state program.',
  },
  {
    code: 'IL',
    name: 'Illinois',
    country: 'US',
    maxFinderFeePercent: 10,
    contactWaitDays: 730,
    feeRestrictionMonthsAfterListing: 24,
    registrationRequired: true,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://icash.illinoistreasurer.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage:
      'Must include statement that claimant may file directly with the state at no cost.',
    notes:
      'Registration required. 10% cap. Agreements void if signed within 24 months of escheatment.',
  },
  {
    code: 'CA',
    name: 'California',
    country: 'US',
    maxFinderFeePercent: 10,
    contactWaitDays: 730,
    feeRestrictionMonthsAfterListing: 24,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.sco.ca.gov/upd.html',
    electronicAgreementAllowed: true,
    requiredContractLanguage:
      'Agreement must include notice that the property can be claimed for free from the State Controller.',
    notes:
      'Agreements made within 24 months of escheatment are voidable. 10% max fee.',
  },
  {
    code: 'NY',
    name: 'New York',
    country: 'US',
    maxFinderFeePercent: 15,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: true,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.osc.state.ny.us/unclaimed-funds',
    electronicAgreementAllowed: true,
    requiredContractLanguage:
      'Must disclose that claimant can file directly with the Comptroller at no charge.',
    notes: 'Registration required. 15% cap. Must disclose state program.',
  },
  {
    code: 'FL',
    name: 'Florida',
    country: 'US',
    maxFinderFeePercent: 20,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: true,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.fltreasurehunt.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage:
      'Agreement must notify owner of right to claim directly from the state.',
    notes: 'Must be registered. 20% cap after 12 months from listing.',
  },
  {
    code: 'TX',
    name: 'Texas',
    country: 'US',
    maxFinderFeePercent: 10,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://claimittexas.org',
    electronicAgreementAllowed: true,
    requiredContractLanguage:
      'Written agreement required. Must inform owner they can claim directly at no cost.',
    notes: '10% cap. Written agreement required before claim filed.',
  },
  {
    code: 'PA',
    name: 'Pennsylvania',
    country: 'US',
    maxFinderFeePercent: 15,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.patreasury.gov/unclaimed-property/',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '15% cap. Must disclose state program.',
  },
  // === States with moderate restrictions ===
  {
    code: 'OH',
    name: 'Ohio',
    country: 'US',
    maxFinderFeePercent: 10,
    contactWaitDays: 730,
    feeRestrictionMonthsAfterListing: 24,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://com.ohio.gov/unclaimed',
    electronicAgreementAllowed: true,
    requiredContractLanguage:
      'Must include statement that the owner can claim directly and for free.',
    notes: '10% cap. 24-month waiting period.',
  },
  {
    code: 'MI',
    name: 'Michigan',
    country: 'US',
    maxFinderFeePercent: 15,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://unclaimedproperty.michigan.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '15% cap.',
  },
  {
    code: 'GA',
    name: 'Georgia',
    country: 'US',
    maxFinderFeePercent: 20,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://dor.georgia.gov/unclaimed-property',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '20% cap.',
  },
  {
    code: 'NJ',
    name: 'New Jersey',
    country: 'US',
    maxFinderFeePercent: 15,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.unclaimedproperty.nj.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '15% cap.',
  },
  {
    code: 'VA',
    name: 'Virginia',
    country: 'US',
    maxFinderFeePercent: 10,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.vamoneysearch.org',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '10% cap.',
  },
  {
    code: 'NC',
    name: 'North Carolina',
    country: 'US',
    maxFinderFeePercent: 20,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://www.nccash.com',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '20% cap.',
  },
  // === States with lighter restrictions (our best markets) ===
  {
    code: 'OR',
    name: 'Oregon',
    country: 'US',
    maxFinderFeePercent: null, // No state-mandated cap
    contactWaitDays: 0,
    feeRestrictionMonthsAfterListing: 0,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://unclaimed.oregon.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes:
      'No statutory fee cap. Best practice: still disclose state program and keep fees reasonable (25-35%).',
  },
  {
    code: 'WA',
    name: 'Washington',
    country: 'US',
    maxFinderFeePercent: null,
    contactWaitDays: 0,
    feeRestrictionMonthsAfterListing: 0,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://ucp.dor.wa.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes:
      'No statutory fee cap. Still disclose state program per best practice.',
  },
  {
    code: 'AZ',
    name: 'Arizona',
    country: 'US',
    maxFinderFeePercent: null,
    contactWaitDays: 0,
    feeRestrictionMonthsAfterListing: 0,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://unclaimedproperty.az.gov',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: 'No statutory fee cap.',
  },
  {
    code: 'NV',
    name: 'Nevada',
    country: 'US',
    maxFinderFeePercent: null,
    contactWaitDays: 0,
    feeRestrictionMonthsAfterListing: 0,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://nevadatreasurer.gov/unclaimed-property/',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: 'No statutory fee cap.',
  },
  {
    code: 'CO',
    name: 'Colorado',
    country: 'US',
    maxFinderFeePercent: 20,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://colorado.findyourunclaimedproperty.com',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '20% cap.',
  },
  {
    code: 'WI',
    name: 'Wisconsin',
    country: 'US',
    maxFinderFeePercent: 20,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl: 'https://statetreasury.wisconsin.gov/unclaimed-property/',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '20% cap.',
  },
  {
    code: 'MN',
    name: 'Minnesota',
    country: 'US',
    maxFinderFeePercent: 15,
    contactWaitDays: 365,
    feeRestrictionMonthsAfterListing: 12,
    registrationRequired: false,
    notarizedAgreementRequired: false,
    mustDiscloseStateProgram: true,
    stateProgramUrl:
      'https://mn.gov/commerce/consumers/your-money/unclaimed-property/',
    electronicAgreementAllowed: true,
    requiredContractLanguage: null,
    notes: '15% cap.',
  },
];

// ============================================================================
// DEFAULT RULES — For states not explicitly listed
// ============================================================================

const DEFAULT_US_RULE: JurisdictionRule = {
  code: 'DEFAULT-US',
  name: 'Default US State',
  country: 'US',
  maxFinderFeePercent: 10, // Conservative — assume strict until confirmed
  contactWaitDays: 365, // Conservative — assume 12-month wait
  feeRestrictionMonthsAfterListing: 12,
  registrationRequired: false, // Assume no, but flag for review
  notarizedAgreementRequired: false,
  mustDiscloseStateProgram: true, // Always disclose — it's the right thing
  stateProgramUrl: '',
  electronicAgreementAllowed: true,
  requiredContractLanguage: null,
  notes:
    'DEFAULT RULE — jurisdiction not yet researched. Using conservative estimates. Flag for human review.',
};

const DEFAULT_INTERNATIONAL_RULE: JurisdictionRule = {
  code: 'DEFAULT-INTL',
  name: 'Default International',
  country: 'UNKNOWN',
  maxFinderFeePercent: null, // No data — don't cap but flag
  contactWaitDays: 0,
  feeRestrictionMonthsAfterListing: 0,
  registrationRequired: false,
  notarizedAgreementRequired: false,
  mustDiscloseStateProgram: false,
  stateProgramUrl: '',
  electronicAgreementAllowed: true,
  requiredContractLanguage: null,
  notes:
    'DEFAULT INTERNATIONAL RULE — jurisdiction not yet researched. Flag for human review before outreach.',
};

// ============================================================================
// INDEX for O(1) lookups
// ============================================================================

const RULES_BY_CODE = new Map<string, JurisdictionRule>();
for (const rule of US_STATE_RULES) {
  RULES_BY_CODE.set(rule.code, rule);
}

// ============================================================================
// COMPLIANCE ENGINE
// ============================================================================

/**
 * Get the compliance rule for a jurisdiction.
 *
 * @param stateOrRegionCode - US state code (e.g., 'CA', 'OR') or country code
 * @param country - Country code, defaults to 'US'
 */
export function getJurisdictionRule(
  stateOrRegionCode: string,
  country: string = 'US'
): JurisdictionRule {
  if (country === 'US') {
    const rule = RULES_BY_CODE.get(stateOrRegionCode.toUpperCase());
    if (rule) return rule;

    MollyLogger.warn(
      `No specific rule for US state: ${stateOrRegionCode}. Using conservative defaults.`,
      FLOW_NAME
    );
    return { ...DEFAULT_US_RULE, code: stateOrRegionCode.toUpperCase() };
  }

  // International jurisdictions — not yet built out
  MollyLogger.warn(
    `No specific rule for ${country}/${stateOrRegionCode}. Using international defaults.`,
    FLOW_NAME
  );
  return {
    ...DEFAULT_INTERNATIONAL_RULE,
    code: stateOrRegionCode,
    country,
  };
}

/**
 * Run a full compliance check before outreach or agreement.
 *
 * This is the gatekeeper. Nothing goes out to a prospect without
 * passing through here first.
 *
 * @param stateOrRegionCode - Where the asset is held
 * @param country - Country code
 * @param requestedFeePercent - The fee we want to charge
 * @param escheatmentDate - When the asset was escheated (ISO string)
 * @param listingDate - When the asset appeared on the public listing (ISO string, optional)
 */
export function checkCompliance(
  stateOrRegionCode: string,
  country: string,
  requestedFeePercent: number,
  escheatmentDate?: string,
  listingDate?: string
): ComplianceCheck {
  const rule = getJurisdictionRule(stateOrRegionCode, country);
  const issues: ComplianceIssue[] = [];

  // 1. Fee cap check
  let allowedFee = requestedFeePercent;
  if (
    rule.maxFinderFeePercent !== null &&
    requestedFeePercent > rule.maxFinderFeePercent
  ) {
    allowedFee = rule.maxFinderFeePercent;
    issues.push({
      severity: 'block',
      message: `${rule.name} caps finder's fees at ${rule.maxFinderFeePercent}%. Requested: ${requestedFeePercent}%.`,
      recommendation: `Reduce fee to ${rule.maxFinderFeePercent}% or lower for this jurisdiction.`,
    });
  }

  // 2. Contact waiting period check
  if (rule.contactWaitDays > 0 && escheatmentDate) {
    const escheatDate = new Date(escheatmentDate);
    const now = new Date();
    const daysSinceEscheatment = Math.floor(
      (now.getTime() - escheatDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceEscheatment < rule.contactWaitDays) {
      const daysRemaining = rule.contactWaitDays - daysSinceEscheatment;
      issues.push({
        severity: 'block',
        message: `${rule.name} requires ${rule.contactWaitDays}-day waiting period after escheatment. Only ${daysSinceEscheatment} days have passed. ${daysRemaining} days remaining.`,
        recommendation: `Schedule outreach for ${new Date(escheatDate.getTime() + rule.contactWaitDays * 86400000).toISOString().split('T')[0]}.`,
      });
    }
  } else if (rule.contactWaitDays > 0 && !escheatmentDate) {
    issues.push({
      severity: 'warning',
      message: `${rule.name} has a ${rule.contactWaitDays}-day waiting period but escheatment date is unknown.`,
      recommendation:
        'Research escheatment date before outreach. Cannot verify compliance without it.',
    });
  }

  // 3. Fee restriction after listing check
  if (rule.feeRestrictionMonthsAfterListing > 0 && listingDate) {
    const listed = new Date(listingDate);
    const now = new Date();
    const monthsSinceListing =
      (now.getFullYear() - listed.getFullYear()) * 12 +
      (now.getMonth() - listed.getMonth());

    if (monthsSinceListing < rule.feeRestrictionMonthsAfterListing) {
      const monthsRemaining =
        rule.feeRestrictionMonthsAfterListing - monthsSinceListing;
      issues.push({
        severity: 'warning',
        message: `${rule.name} restricts fees within ${rule.feeRestrictionMonthsAfterListing} months of public listing. Property was listed ${monthsSinceListing} months ago.`,
        recommendation: `Fee may be voidable. ${monthsRemaining} months until restriction lifts. Consider waiting or reducing fee.`,
      });
    }
  }

  // 4. Registration requirement
  if (rule.registrationRequired) {
    issues.push({
      severity: 'warning',
      message: `${rule.name} requires recovery agent registration.`,
      recommendation:
        'Verify registration is current before outreach. Operating without registration may void agreements.',
    });
  }

  // 5. Notarized agreement requirement
  if (rule.notarizedAgreementRequired) {
    issues.push({
      severity: 'warning',
      message: `${rule.name} requires notarized finder's agreements.`,
      recommendation:
        'Electronic-only agreement will not be sufficient. Arrange notarization.',
    });
  }

  // 6. Default rule warning
  if (rule.code === 'DEFAULT-US' || rule.code === 'DEFAULT-INTL') {
    issues.push({
      severity: 'warning',
      message: `Using default rules — ${stateOrRegionCode} has not been specifically researched.`,
      recommendation:
        'Flag for human review before proceeding. Research actual state regulations.',
    });
  }

  // 7. State program disclosure (info, not blocking)
  if (rule.mustDiscloseStateProgram) {
    issues.push({
      severity: 'info',
      message: `Outreach must include disclosure of state program: ${rule.stateProgramUrl || 'URL not yet configured'}.`,
      recommendation:
        'Include state program URL in all outreach communications.',
    });
  }

  // Determine overall compliance
  const hasBlockers = issues.some((i) => i.severity === 'block');

  const result: ComplianceCheck = {
    compliant: !hasBlockers,
    jurisdiction: `${country}/${stateOrRegionCode}`,
    allowedFeePercent: allowedFee,
    issues,
    rule,
  };

  MollyLogger.info(
    `Compliance check: ${result.jurisdiction} — ${result.compliant ? 'PASS' : 'BLOCKED'}`,
    FLOW_NAME,
    {
      requestedFee: requestedFeePercent,
      allowedFee,
      issueCount: issues.length,
      blockers: issues.filter((i) => i.severity === 'block').length,
    }
  );

  return result;
}

/**
 * Get prioritized list of states for heir-finding operations.
 * Sorted by business-friendliness: no fee cap and no waiting period first.
 */
export function getPrioritizedStates(): JurisdictionRule[] {
  return [...US_STATE_RULES].sort((a, b) => {
    // States with no fee cap first
    const aHasCap = a.maxFinderFeePercent !== null ? 1 : 0;
    const bHasCap = b.maxFinderFeePercent !== null ? 1 : 0;
    if (aHasCap !== bHasCap) return aHasCap - bHasCap;

    // Then by highest allowed fee
    const aFee = a.maxFinderFeePercent ?? 35;
    const bFee = b.maxFinderFeePercent ?? 35;
    if (aFee !== bFee) return bFee - aFee;

    // Then by shortest wait time
    return a.contactWaitDays - b.contactWaitDays;
  });
}

/**
 * Get all states that currently allow outreach (no registration required,
 * or we could operate in without barriers).
 */
export function getOperationalStates(): JurisdictionRule[] {
  return US_STATE_RULES.filter((r) => !r.registrationRequired);
}

/**
 * Get all explicitly configured state rules.
 */
export function getAllRules(): JurisdictionRule[] {
  return [...US_STATE_RULES];
}
