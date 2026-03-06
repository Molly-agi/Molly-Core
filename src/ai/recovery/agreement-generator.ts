/**
 * @fileOverview Agreement Generator — Finder's Fee Contracts
 *
 * Generates legally compliant finder's fee agreements tailored
 * to each jurisdiction's requirements. The agreement is the point
 * where a prospect becomes a paying client.
 *
 * Architecture:
 *   1. Compliance check (jurisdiction rules) → determines allowed terms
 *   2. Agreement generation → creates the contract text
 *   3. Signature tracking → records consent and authorization
 *
 * Key legal requirements handled:
 *   - Fee caps per jurisdiction
 *   - Required disclosure language
 *   - Right-to-cancel provisions
 *   - State program disclosure
 *   - Registration disclosures where required
 *   - Notarization flags where required
 *
 * Every agreement is stored with its compliance check result
 * so we can prove we followed the rules.
 */

import { MollyLogger } from '@/ai/logger';
import {
  checkCompliance,
  getJurisdictionRule,
  type ComplianceCheck,
} from './jurisdiction-compliance';
import { getBusinessConfig, type BusinessConfig } from './outreach-engine';
import type { DiscoveredAsset } from './types';

const FLOW_NAME = 'agreement-generator';

// ============================================================================
// TYPES
// ============================================================================

export type AgreementStatus =
  | 'draft' // Generated but not sent
  | 'sent' // Sent to prospect
  | 'viewed' // Prospect opened/viewed the agreement
  | 'signed' // Prospect signed
  | 'countersigned' // We countersigned (fully executed)
  | 'expired' // Sent but not signed within validity period
  | 'revoked' // We revoked the agreement
  | 'cancelled'; // Prospect cancelled within cooling-off period

export interface FinderAgreement {
  /** Unique agreement ID */
  id: string;
  /** Client/prospect ID */
  clientId: string;
  /** Prospect's legal name */
  prospectName: string;
  /** Prospect's email */
  prospectEmail: string;
  /** Asset(s) covered by this agreement */
  coveredAssetIds: string[];
  /** Assets summary for the agreement text */
  assetsSummary: AssetSummaryLine[];
  /** The finder's fee percentage */
  feePercent: number;
  /** Total estimated value of covered assets */
  totalEstimatedValue: number;
  /** Estimated fee amount */
  estimatedFee: number;
  /** Jurisdiction the agreement is governed by */
  jurisdiction: string;
  /** The compliance check that was run */
  compliance: ComplianceCheck;
  /** The full agreement text */
  agreementText: string;
  /** Current status */
  status: AgreementStatus;
  /** Validity period in days from generation */
  validityDays: number;
  /** Cooling-off period in days (right to cancel after signing) */
  coolingOffDays: number;
  /** Whether this jurisdiction requires notarization */
  requiresNotarization: boolean;
  /** Whether electronic signature is acceptable */
  electronicSignatureAllowed: boolean;
  /** Prospect signature timestamp */
  signedAt?: string;
  /** Prospect signature reference (e-sig ID or acknowledgment) */
  signatureRef?: string;
  /** Our countersignature timestamp */
  countersignedAt?: string;
  /** Cancellation timestamp if cancelled */
  cancelledAt?: string;
  /** Cancellation reason */
  cancellationReason?: string;
  /** Generated timestamp */
  generatedAt: string;
  /** Expiry date */
  expiresAt: string;
}

interface AssetSummaryLine {
  assetId: string;
  description: string;
  estimatedValue: number;
  source: string;
  jurisdiction: string;
}

// ============================================================================
// AGREEMENT GENERATOR
// ============================================================================

export class AgreementGenerator {
  private static instance: AgreementGenerator | null = null;

  /** All agreements indexed by ID */
  private agreements: Map<string, FinderAgreement> = new Map();
  /** Index: clientId → agreementId */
  private clientAgreements: Map<string, string[]> = new Map();

  private constructor() {}

  static getInstance(): AgreementGenerator {
    if (!AgreementGenerator.instance) {
      AgreementGenerator.instance = new AgreementGenerator();
    }
    return AgreementGenerator.instance;
  }

  // ==========================================================================
  // AGREEMENT GENERATION
  // ==========================================================================

  /**
   * Generate a finder's fee agreement for a prospect.
   *
   * Takes the prospect info and their discovered assets,
   * runs compliance checks, and produces a complete agreement.
   *
   * @returns The agreement, or null if compliance is blocked
   */
  generate(
    clientId: string,
    prospectName: string,
    prospectEmail: string,
    assets: DiscoveredAsset[],
    requestedFeePercent: number,
    validityDays: number = 30,
    coolingOffDays: number = 3
  ): FinderAgreement | null {
    if (assets.length === 0) {
      MollyLogger.warn('Cannot generate agreement with zero assets', FLOW_NAME);
      return null;
    }

    const business = getBusinessConfig();
    const primaryAsset = assets[0]!;
    const region = primaryAsset.source.region || 'DEFAULT';
    const country = primaryAsset.source.country || 'US';

    // Run compliance
    const compliance = checkCompliance(
      region,
      country,
      requestedFeePercent,
      primaryAsset.discoveredAt
    );

    // If there are blocking compliance issues, don't generate
    if (!compliance.compliant) {
      const blockers = compliance.issues
        .filter((i) => i.severity === 'block')
        .map((i) => i.message);

      MollyLogger.warn(
        `Agreement generation blocked by compliance: ${blockers.join('; ')}`,
        FLOW_NAME,
        { clientId, jurisdiction: compliance.jurisdiction }
      );
      return null;
    }

    const rule = compliance.rule;
    const effectiveFee = compliance.allowedFeePercent;

    // Build asset summary
    const assetsSummary: AssetSummaryLine[] = assets.map((a) => ({
      assetId: a.id,
      description: a.description,
      estimatedValue: a.estimatedValue,
      source: a.source.name,
      jurisdiction: `${a.source.country}/${a.source.region || 'N/A'}`,
    }));

    const totalValue = assets.reduce((sum, a) => sum + a.estimatedValue, 0);
    const estimatedFee = totalValue * (effectiveFee / 100);

    // Generate agreement text
    const agreementText = this.buildAgreementText(
      prospectName,
      prospectEmail,
      business,
      assetsSummary,
      effectiveFee,
      totalValue,
      estimatedFee,
      rule,
      coolingOffDays
    );

    const now = new Date();
    const expiresAt = new Date(now.getTime() + validityDays * 86400000);

    const agreement: FinderAgreement = {
      id: `agreement_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      clientId,
      prospectName,
      prospectEmail,
      coveredAssetIds: assets.map((a) => a.id),
      assetsSummary,
      feePercent: effectiveFee,
      totalEstimatedValue: totalValue,
      estimatedFee,
      jurisdiction: compliance.jurisdiction,
      compliance,
      agreementText,
      status: 'draft',
      validityDays,
      coolingOffDays,
      requiresNotarization: rule.notarizedAgreementRequired,
      electronicSignatureAllowed: rule.electronicAgreementAllowed,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    this.agreements.set(agreement.id, agreement);

    // Track client → agreement mapping
    const existing = this.clientAgreements.get(clientId) || [];
    existing.push(agreement.id);
    this.clientAgreements.set(clientId, existing);

    MollyLogger.info(`Agreement generated for ${prospectName}`, FLOW_NAME, {
      agreementId: agreement.id,
      clientId,
      fee: effectiveFee,
      totalValue,
      jurisdiction: compliance.jurisdiction,
    });

    return agreement;
  }

  // ==========================================================================
  // AGREEMENT LIFECYCLE
  // ==========================================================================

  /**
   * Mark agreement as sent to the prospect.
   */
  markSent(agreementId: string): boolean {
    const agreement = this.agreements.get(agreementId);
    if (!agreement || agreement.status !== 'draft') return false;

    agreement.status = 'sent';
    return true;
  }

  /**
   * Mark agreement as viewed by the prospect.
   */
  markViewed(agreementId: string): boolean {
    const agreement = this.agreements.get(agreementId);
    if (!agreement) return false;
    if (agreement.status !== 'sent') return false;

    agreement.status = 'viewed';
    return true;
  }

  /**
   * Record the prospect's signature.
   */
  recordSignature(agreementId: string, signatureRef: string): boolean {
    const agreement = this.agreements.get(agreementId);
    if (!agreement) return false;

    // Check if agreement has expired
    if (new Date() > new Date(agreement.expiresAt)) {
      agreement.status = 'expired';
      MollyLogger.warn(
        `Agreement expired before signature: ${agreementId}`,
        FLOW_NAME
      );
      return false;
    }

    agreement.status = 'signed';
    agreement.signedAt = new Date().toISOString();
    agreement.signatureRef = signatureRef;

    MollyLogger.info(
      `Agreement signed by ${agreement.prospectName}`,
      FLOW_NAME,
      { agreementId, clientId: agreement.clientId }
    );

    return true;
  }

  /**
   * Countersign the agreement (fully executed).
   */
  countersign(agreementId: string): boolean {
    const agreement = this.agreements.get(agreementId);
    if (!agreement || agreement.status !== 'signed') return false;

    agreement.status = 'countersigned';
    agreement.countersignedAt = new Date().toISOString();

    MollyLogger.info(
      `Agreement fully executed: ${agreement.prospectName}`,
      FLOW_NAME,
      { agreementId, clientId: agreement.clientId }
    );

    return true;
  }

  /**
   * Handle cancellation during cooling-off period.
   * If the prospect cancels within the cooling-off window, we honor it.
   */
  cancel(agreementId: string, reason: string): boolean {
    const agreement = this.agreements.get(agreementId);
    if (!agreement) return false;

    // Can only cancel signed agreements within cooling-off period
    if (agreement.status === 'signed' && agreement.signedAt) {
      const signedDate = new Date(agreement.signedAt);
      const coolingOffEnd = new Date(
        signedDate.getTime() + agreement.coolingOffDays * 86400000
      );

      if (new Date() > coolingOffEnd) {
        MollyLogger.warn(
          `Cancellation rejected — cooling-off period expired: ${agreementId}`,
          FLOW_NAME
        );
        return false;
      }
    }

    // Can also cancel draft/sent agreements
    if (!['draft', 'sent', 'viewed', 'signed'].includes(agreement.status)) {
      return false;
    }

    agreement.status = 'cancelled';
    agreement.cancelledAt = new Date().toISOString();
    agreement.cancellationReason = reason;

    MollyLogger.info(
      `Agreement cancelled: ${agreement.prospectName} — ${reason}`,
      FLOW_NAME,
      { agreementId, clientId: agreement.clientId }
    );

    return true;
  }

  // ==========================================================================
  // QUERIES
  // ==========================================================================

  getAgreement(agreementId: string): FinderAgreement | undefined {
    return this.agreements.get(agreementId);
  }

  getClientAgreements(clientId: string): FinderAgreement[] {
    const ids = this.clientAgreements.get(clientId) || [];
    return ids
      .map((id) => this.agreements.get(id))
      .filter((a): a is FinderAgreement => a !== undefined);
  }

  getActiveAgreement(clientId: string): FinderAgreement | undefined {
    const agreements = this.getClientAgreements(clientId);
    return agreements.find(
      (a) =>
        a.status === 'signed' ||
        a.status === 'countersigned' ||
        a.status === 'sent'
    );
  }

  /**
   * Get all agreements needing attention (expired sent, unsigned after X days, etc.)
   */
  getActionRequired(): FinderAgreement[] {
    const now = new Date();
    const actionNeeded: FinderAgreement[] = [];

    for (const agreement of this.agreements.values()) {
      // Sent but not signed and approaching expiry (within 7 days)
      if (
        (agreement.status === 'sent' || agreement.status === 'viewed') &&
        new Date(agreement.expiresAt).getTime() - now.getTime() < 7 * 86400000
      ) {
        actionNeeded.push(agreement);
      }

      // Signed but not countersigned (we need to act)
      if (agreement.status === 'signed') {
        actionNeeded.push(agreement);
      }
    }

    return actionNeeded;
  }

  // ==========================================================================
  // AGREEMENT TEXT BUILDER
  // ==========================================================================

  private buildAgreementText(
    prospectName: string,
    prospectEmail: string,
    business: BusinessConfig,
    assets: AssetSummaryLine[],
    feePercent: number,
    totalValue: number,
    estimatedFee: number,
    rule: ReturnType<typeof getJurisdictionRule>,
    coolingOffDays: number
  ): string {
    const assetList = assets
      .map(
        (a, i) =>
          `  ${i + 1}. ${a.description}\n     Source: ${a.source}\n     Jurisdiction: ${a.jurisdiction}\n     Estimated Value: $${a.estimatedValue.toLocaleString()}`
      )
      .join('\n\n');

    const stateDisclosure = rule.mustDiscloseStateProgram
      ? `\nDISCLOSURE: The Owner has the right to claim the above-described property directly from ${rule.stateProgramUrl || 'the applicable state unclaimed property program'} at no cost. This agreement is voluntary.\n`
      : '';

    const requiredLanguage = rule.requiredContractLanguage
      ? `\nADDITIONAL REQUIRED DISCLOSURE: ${rule.requiredContractLanguage}\n`
      : '';

    const notarizationNote = rule.notarizedAgreementRequired
      ? '\nNOTE: This jurisdiction requires this agreement to be notarized. This document must be signed before a notary public to be valid.\n'
      : '';

    const registrationNote = rule.registrationRequired
      ? `\nREGISTRATION DISCLOSURE: The Finder is registered as a recovery agent in ${rule.name} as required by state law.\n`
      : '';

    return `
═══════════════════════════════════════════════════════════
                 FINDER'S FEE AGREEMENT
               FOR UNCLAIMED PROPERTY RECOVERY
═══════════════════════════════════════════════════════════

Agreement ID: [Generated upon execution]
Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

PARTIES:
  Owner:  ${prospectName}
          Email: ${prospectEmail}

  Finder: ${business.name}
          ${business.address}
          Email: ${business.email}
          Phone: ${business.phone}

───────────────────────────────────────────────────────────

1. PROPERTY DESCRIPTION

The Finder has identified the following unclaimed property
that the Finder believes may belong to the Owner:

${assetList}

Total Estimated Value: $${totalValue.toLocaleString()}

Note: Estimated values are approximate and based on publicly
available information. Actual recovery amounts may vary.

───────────────────────────────────────────────────────────

2. FINDER'S FEE

In consideration of the Finder's services in locating,
researching, and assisting with the recovery of the
above-described property, the Owner agrees to pay the
Finder a fee of:

  ${feePercent}% of the actual amount recovered

  Estimated fee based on current values: $${estimatedFee.toLocaleString()}

The fee is contingent upon successful recovery. If no
property is recovered, no fee is owed. The Owner will
never be asked to pay any upfront costs.

───────────────────────────────────────────────────────────

3. FINDER'S OBLIGATIONS

The Finder agrees to:
  a) Research and verify the Owner's entitlement to the property
  b) Prepare all necessary claim documentation
  c) Submit claims through proper channels
  d) Follow up with holding institutions
  e) Keep the Owner informed of progress
  f) Handle all associated costs during the claims process

───────────────────────────────────────────────────────────

4. OWNER'S OBLIGATIONS

The Owner agrees to:
  a) Provide truthful identification and documentation
  b) Cooperate with reasonable requests for information
  c) Pay the agreed finder's fee upon successful recovery
  d) Not file duplicate claims for the same property

───────────────────────────────────────────────────────────

5. PAYMENT

Upon successful recovery:
  - The recovered amount will be deposited to the Owner
  - The Finder's fee (${feePercent}%) will be deducted or
    separately invoiced, per the Owner's preference
  - Payment of the Finder's fee is due within 30 days
    of the Owner receiving the recovered property

───────────────────────────────────────────────────────────

6. RIGHT TO CANCEL

The Owner may cancel this agreement:
  - Within ${coolingOffDays} days of signing, for any reason
  - At any time before a claim is filed, with written notice
  - Cancellation after a claim is filed may still result in
    a reduced fee for work already performed

───────────────────────────────────────────────────────────

7. TERM AND EXPIRATION

This agreement is valid for 12 months from the date of
execution. If recovery efforts are still in progress at
expiration, the agreement automatically extends until
pending claims are resolved.

───────────────────────────────────────────────────────────

8. LIMITATION OF LIABILITY

The Finder makes no guarantee of recovery. The Finder's
liability is limited to the refund of any fees paid.
The Finder is not liable for claim denials by holding
institutions.
${stateDisclosure}${requiredLanguage}${registrationNote}${notarizationNote}
───────────────────────────────────────────────────────────

SIGNATURES:

Owner: ________________________________  Date: ___________
       ${prospectName}

Finder: _______________________________  Date: ___________
        ${business.name}

═══════════════════════════════════════════════════════════
`.trim();
  }

  // ==========================================================================
  // STATE PERSISTENCE
  // ==========================================================================

  exportState(): {
    agreements: FinderAgreement[];
  } {
    return {
      agreements: Array.from(this.agreements.values()),
    };
  }

  importState(state: { agreements: FinderAgreement[] }): void {
    this.agreements.clear();
    this.clientAgreements.clear();

    for (const agreement of state.agreements) {
      this.agreements.set(agreement.id, agreement);

      const existing = this.clientAgreements.get(agreement.clientId) || [];
      existing.push(agreement.id);
      this.clientAgreements.set(agreement.clientId, existing);
    }

    MollyLogger.info('Agreement generator state imported', FLOW_NAME, {
      agreements: state.agreements.length,
    });
  }
}

// Singleton accessor
export function getAgreementGenerator(): AgreementGenerator {
  return AgreementGenerator.getInstance();
}
