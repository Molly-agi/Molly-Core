/**
 * @fileOverview Outreach Template Engine — First Contact
 *
 * Generates professional, legally compliant outreach communications
 * for discovered heirs. This is the first thing a potential client sees,
 * so it must be:
 *
 *   1. Professional — not scammy, not aggressive
 *   2. Compliant — includes all required disclosures per jurisdiction
 *   3. Transparent — tells them they can claim for free themselves
 *   4. Compelling — explains the value we provide (handling paperwork,
 *      researching documentation, navigating bureaucracy)
 *
 * Every outreach is compliance-checked BEFORE generation.
 * Nothing goes out without passing the jurisdiction compliance gate.
 *
 * "We don't fix the leaks in the dam. We fix the dam itself."
 */

import { MollyLogger } from '@/ai/logger';
import {
  checkCompliance,
  type ComplianceCheck,
  type JurisdictionRule,
} from './jurisdiction-compliance';
import type { DiscoveredAsset } from './types';

const FLOW_NAME = 'outreach-engine';

// ============================================================================
// TYPES
// ============================================================================

export type OutreachChannel = 'email' | 'letter' | 'phone-script';

export type OutreachType =
  | 'initial-discovery' // First contact — we found something
  | 'follow-up' // They haven't responded
  | 'agreement-reminder' // Agreement sent but not signed
  | 'recovery-update'; // Status update during claim process

export interface OutreachContent {
  /** The generated outreach content */
  subject: string;
  body: string;
  /** The channel this was generated for */
  channel: OutreachChannel;
  /** The type of outreach */
  type: OutreachType;
  /** Compliance check result */
  compliance: ComplianceCheck;
  /** Whether this is ready to send (compliant + all checks passed) */
  readyToSend: boolean;
  /** Issues that need resolution before sending */
  holdReasons: string[];
  /** Jurisdiction-required disclosures included in the body */
  disclosuresIncluded: string[];
  /** Generated timestamp */
  generatedAt: string;
}

export interface OutreachRequest {
  /** The heir/prospect to contact */
  recipientName: string;
  /** Their email (for email channel) */
  recipientEmail?: string;
  /** Their mailing address (for letter channel) */
  recipientAddress?: string;
  /** The discovered asset(s) */
  assets: DiscoveredAsset[];
  /** What channel to use */
  channel: OutreachChannel;
  /** Type of outreach */
  type: OutreachType;
  /** Our business name */
  businessName: string;
  /** Our contact info */
  businessEmail: string;
  businessPhone: string;
  businessAddress: string;
  /** The fee we want to charge */
  requestedFeePercent: number;
}

// ============================================================================
// BUSINESS DETAILS — Configurable
// ============================================================================

export interface BusinessConfig {
  name: string;
  email: string;
  phone: string;
  address: string;
  website?: string;
  defaultFeePercent: number;
}

const DEFAULT_BUSINESS: BusinessConfig = {
  name: '[Business Name — Configure Before Use]',
  email: '[email — Configure Before Use]',
  phone: '[phone — Configure Before Use]',
  address: '[address — Configure Before Use]',
  defaultFeePercent: 25,
};

let currentBusinessConfig: BusinessConfig = { ...DEFAULT_BUSINESS };

/**
 * Configure business details for outreach.
 * Must be called before generating any outreach.
 */
export function configureOutreachBusiness(config: BusinessConfig): void {
  currentBusinessConfig = { ...config };
  MollyLogger.info('Business config updated for outreach', FLOW_NAME, {
    name: config.name,
  });
}

export function getBusinessConfig(): BusinessConfig {
  return { ...currentBusinessConfig };
}

// ============================================================================
// OUTREACH GENERATION
// ============================================================================

/**
 * Generate an outreach communication.
 *
 * This is the main entry point. It:
 *   1. Runs compliance checks for the asset's jurisdiction
 *   2. Determines the allowed fee (may be reduced by state cap)
 *   3. Builds the appropriate disclosures
 *   4. Generates the outreach content
 *   5. Returns the result with compliance status
 *
 * If compliance fails (blocking issues), the outreach is generated
 * but marked as NOT ready to send.
 */
export function generateOutreach(request: OutreachRequest): OutreachContent {
  // Determine jurisdiction from the first asset's source
  const primaryAsset = request.assets[0];
  if (!primaryAsset) {
    throw new Error('At least one asset is required for outreach generation');
  }

  const region = primaryAsset.source.region || 'DEFAULT';
  const country = primaryAsset.source.country || 'US';

  // Run compliance check
  const compliance = checkCompliance(
    region,
    country,
    request.requestedFeePercent,
    primaryAsset.discoveredAt
  );

  const rule = compliance.rule;
  const effectiveFee = compliance.allowedFeePercent;
  const holdReasons: string[] = [];
  const disclosures: string[] = [];

  // Check for blocking issues
  if (!compliance.compliant) {
    for (const issue of compliance.issues) {
      if (issue.severity === 'block') {
        holdReasons.push(issue.message);
      }
    }
  }

  // Build required disclosures
  if (rule.mustDiscloseStateProgram) {
    const programUrl =
      rule.stateProgramUrl || `the ${rule.name} unclaimed property program`;
    disclosures.push(
      `You have the right to claim this property directly from ${programUrl} at no cost to you.`
    );
  }

  if (rule.requiredContractLanguage) {
    disclosures.push(rule.requiredContractLanguage);
  }

  // Generate content based on type and channel
  let subject: string;
  let body: string;

  switch (request.type) {
    case 'initial-discovery':
      ({ subject, body } = generateInitialDiscovery(
        request,
        effectiveFee,
        disclosures,
        rule
      ));
      break;
    case 'follow-up':
      ({ subject, body } = generateFollowUp(
        request,
        effectiveFee,
        disclosures,
        rule
      ));
      break;
    case 'agreement-reminder':
      ({ subject, body } = generateAgreementReminder(request, disclosures));
      break;
    case 'recovery-update':
      ({ subject, body } = generateRecoveryUpdate(request));
      break;
    default:
      subject = 'Important Notice Regarding Unclaimed Property';
      body = '';
  }

  const result: OutreachContent = {
    subject,
    body,
    channel: request.channel,
    type: request.type,
    compliance,
    readyToSend: compliance.compliant && holdReasons.length === 0,
    holdReasons,
    disclosuresIncluded: disclosures,
    generatedAt: new Date().toISOString(),
  };

  MollyLogger.info(
    `Outreach generated: ${request.type} for ${request.recipientName}`,
    FLOW_NAME,
    {
      channel: request.channel,
      jurisdiction: compliance.jurisdiction,
      compliant: compliance.compliant,
      readyToSend: result.readyToSend,
    }
  );

  return result;
}

// ============================================================================
// TEMPLATE GENERATORS
// ============================================================================

function generateInitialDiscovery(
  request: OutreachRequest,
  effectiveFee: number,
  disclosures: string[],
  rule: JurisdictionRule
): { subject: string; body: string } {
  const totalValue = request.assets.reduce(
    (sum, a) => sum + a.estimatedValue,
    0
  );
  const assetCount = request.assets.length;
  const businessName = request.businessName || currentBusinessConfig.name;
  const businessEmail = request.businessEmail || currentBusinessConfig.email;
  const businessPhone = request.businessPhone || currentBusinessConfig.phone;
  const businessAddress =
    request.businessAddress || currentBusinessConfig.address;

  const subject = `Notice of Unclaimed Property — Action May Be Required`;

  const assetSummary = request.assets
    .map(
      (a) =>
        `  - ${a.description} (estimated value: $${a.estimatedValue.toLocaleString()})`
    )
    .join('\n');

  const disclosureBlock =
    disclosures.length > 0
      ? `\nIMPORTANT DISCLOSURES:\n${disclosures.map((d) => `• ${d}`).join('\n')}\n`
      : '';

  const body = `Dear ${request.recipientName},

We are writing to inform you that our research has identified ${assetCount === 1 ? 'unclaimed property' : `${assetCount} unclaimed properties`} that may belong to you or your family. The total estimated value is $${totalValue.toLocaleString()}.

PROPERTY SUMMARY:
${assetSummary}

WHO WE ARE:
${businessName} is a professional asset recovery service. We specialize in locating and recovering unclaimed property on behalf of rightful owners. Our service includes:
  • Researching and verifying ownership
  • Preparing and filing all required claim documentation
  • Navigating the claims process with the holding institution
  • Following up on your behalf until funds are released

OUR FEE:
Our fee is ${effectiveFee}% of the recovered amount, due only upon successful recovery. You pay nothing upfront, and if we do not recover the property, you owe us nothing.

${disclosureBlock}
YOUR OPTIONS:
1. Engage our service — We handle everything. Reply to this communication or contact us below.
2. Claim it yourself — You can file a claim directly with the state at no cost (see disclosures above).
3. Do nothing — The property will continue to be held by the state.

We encourage you to verify this information independently through ${rule.stateProgramUrl ? `the official state program at ${rule.stateProgramUrl}` : "your state's unclaimed property program"}.

If you are interested in our assistance, or have any questions, please contact us:

${businessName}
Email: ${businessEmail}
Phone: ${businessPhone}
${businessAddress}

This communication is not a solicitation from any government agency.

Sincerely,
${businessName}`;

  return { subject, body };
}

function generateFollowUp(
  request: OutreachRequest,
  effectiveFee: number,
  disclosures: string[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _rule: JurisdictionRule
): { subject: string; body: string } {
  const totalValue = request.assets.reduce(
    (sum, a) => sum + a.estimatedValue,
    0
  );
  const businessName = request.businessName || currentBusinessConfig.name;
  const businessEmail = request.businessEmail || currentBusinessConfig.email;
  const businessPhone = request.businessPhone || currentBusinessConfig.phone;

  const subject = `Follow-Up: Unclaimed Property Recovery — $${totalValue.toLocaleString()} May Be Yours`;

  const disclosureBlock =
    disclosures.length > 0
      ? `\n${disclosures.map((d) => `• ${d}`).join('\n')}\n`
      : '';

  const body = `Dear ${request.recipientName},

We recently contacted you regarding unclaimed property valued at approximately $${totalValue.toLocaleString()} that our research indicates may belong to you.

We understand you may be busy, and we want to make sure this important notice doesn't get overlooked. Property held by the state can sometimes be subject to time limitations, so we wanted to follow up.

As a reminder, our service fee is ${effectiveFee}% of the recovered amount — only if we successfully recover your property. There is no upfront cost.

${disclosureBlock}
If you would like to proceed, or if you have already begun the process on your own, please let us know.

${businessName}
Email: ${businessEmail}
Phone: ${businessPhone}

Sincerely,
${businessName}`;

  return { subject, body };
}

function generateAgreementReminder(
  request: OutreachRequest,
  disclosures: string[]
): { subject: string; body: string } {
  const businessName = request.businessName || currentBusinessConfig.name;
  const businessEmail = request.businessEmail || currentBusinessConfig.email;
  const businessPhone = request.businessPhone || currentBusinessConfig.phone;

  const subject = `Reminder: Your Asset Recovery Agreement Is Awaiting Signature`;

  const body = `Dear ${request.recipientName},

We wanted to follow up on the finder's agreement we sent you for the unclaimed property recovery service.

Once the agreement is signed, we can begin the claims process immediately. If you have any questions about the agreement terms or the recovery process, we are happy to discuss them.

${disclosures.length > 0 ? disclosures.map((d) => `• ${d}`).join('\n') + '\n' : ''}
Please contact us at your convenience:

${businessName}
Email: ${businessEmail}
Phone: ${businessPhone}

Sincerely,
${businessName}`;

  return { subject, body };
}

function generateRecoveryUpdate(request: OutreachRequest): {
  subject: string;
  body: string;
} {
  const businessName = request.businessName || currentBusinessConfig.name;
  const businessEmail = request.businessEmail || currentBusinessConfig.email;

  const subject = `Update on Your Unclaimed Property Recovery`;

  const assetUpdates = request.assets
    .map((a) => `  - ${a.description}: Status — ${a.status.replace(/-/g, ' ')}`)
    .join('\n');

  const body = `Dear ${request.recipientName},

We wanted to provide you with an update on the status of your property recovery:

${assetUpdates}

We will continue to monitor the progress and keep you informed of any developments. If you have questions, please don't hesitate to reach out.

${businessName}
Email: ${businessEmail}

Sincerely,
${businessName}`;

  return { subject, body };
}
