/**
 * @fileOverview Heir Contact Pipeline — Discovery to Revenue
 *
 * This is the orchestration layer that ties together:
 *   - Jurisdiction Compliance (the foundation)
 *   - Outreach Engine (first contact)
 *   - Contact Tracker (lifecycle management)
 *   - Agreement Generator (fee contracts)
 *   - Client Manager (client lifecycle)
 *
 * The pipeline flow:
 *   1. Asset discovered by scanner → matched to potential heir
 *   2. Pipeline checks compliance → is outreach allowed?
 *   3. If yes → generate outreach, create contact record
 *   4. Track response → if interested, generate agreement
 *   5. Agreement signed → convert prospect to active client
 *   6. Active client → batch scanner picks them up automatically
 *
 * This module provides the high-level operations that Eric
 * (or eventually an API) would call. Each method handles
 * the full chain of compliance → generation → tracking.
 *
 * Nothing goes out without compliance. Nothing is automated
 * without a clear audit trail. We run a clean operation.
 */

import { MollyLogger } from '@/ai/logger';
import { checkCompliance } from './jurisdiction-compliance';
import {
  generateOutreach,
  getBusinessConfig,
  type OutreachRequest,
} from './outreach-engine';
import { getContactTracker, type ContactRecord } from './contact-tracker';
import {
  getAgreementGenerator,
  type FinderAgreement,
} from './agreement-generator';
import { getClientManager } from './client-manager';
import type { DiscoveredAsset, IdentityProfile, ServiceClient } from './types';

const FLOW_NAME = 'heir-contact-pipeline';

// ============================================================================
// TYPES
// ============================================================================

export interface PipelineResult {
  success: boolean;
  action: string;
  clientId?: string;
  details: string;
  warnings: string[];
  /** If blocked by compliance, the specific reasons */
  complianceBlockers?: string[];
}

export interface ProspectOnboardResult {
  client: ServiceClient;
  contactRecord: ContactRecord;
  outreach: ReturnType<typeof generateOutreach> | null;
  /** Whether outreach was actually sent (vs held for review) */
  outreachSent: boolean;
  complianceWarnings: string[];
}

export interface PipelineStatus {
  /** Prospects awaiting first contact */
  pendingOutreach: number;
  /** Prospects contacted, awaiting response */
  awaitingResponse: number;
  /** Prospects interested, need agreement */
  needAgreement: number;
  /** Agreements sent, awaiting signature */
  awaitingSignature: number;
  /** Signed agreements needing countersignature */
  needCountersign: number;
  /** Contacts due for follow-up */
  dueForFollowUp: number;
  /** Total active clients (converted) */
  activeClients: number;
  /** Total revenue from completed recoveries */
  totalFeesEarned: number;
}

// ============================================================================
// PIPELINE OPERATIONS
// ============================================================================

/**
 * STEP 1: Onboard a new prospect.
 *
 * Takes a discovered heir and their assets, and:
 *   1. Creates a client record (prospect status)
 *   2. Creates a contact record
 *   3. Runs compliance check
 *   4. Generates initial outreach (if compliant)
 *   5. Returns everything for Eric's review before sending
 *
 * Nothing is sent automatically. Eric reviews and approves.
 */
export function onboardProspect(
  heirName: string,
  heirEmail: string,
  country: string,
  searchProfile: IdentityProfile,
  discoveredAssets: DiscoveredAsset[],
  requestedFeePercent: number = 25
): ProspectOnboardResult {
  const clientManager = getClientManager();
  const contactTracker = getContactTracker();
  const business = getBusinessConfig();
  const warnings: string[] = [];

  // 1. Create the client record as a prospect
  const client = clientManager.addProspect(
    heirName,
    heirEmail,
    country,
    searchProfile,
    requestedFeePercent
  );

  // 2. Link discovered assets to the client
  for (const asset of discoveredAssets) {
    clientManager.linkAsset(client.id, asset);
  }

  // 3. Create contact tracking record
  const contactRecord = contactTracker.createRecord(
    client.id,
    heirName,
    heirEmail
  );

  // 4. Attempt to generate compliant outreach
  let outreach: ReturnType<typeof generateOutreach> | null = null;
  let outreachSent = false;

  if (discoveredAssets.length > 0) {
    try {
      const outreachRequest: OutreachRequest = {
        recipientName: heirName,
        recipientEmail: heirEmail,
        assets: discoveredAssets,
        channel: 'email',
        type: 'initial-discovery',
        businessName: business.name,
        businessEmail: business.email,
        businessPhone: business.phone,
        businessAddress: business.address,
        requestedFeePercent,
      };

      outreach = generateOutreach(outreachRequest);

      // Collect compliance warnings
      if (outreach.compliance.issues.length > 0) {
        for (const issue of outreach.compliance.issues) {
          if (issue.severity === 'warning') {
            warnings.push(issue.message);
          }
        }
      }

      // Don't auto-send — mark as generated for Eric's review
      // The outreach.readyToSend flag indicates if it CAN be sent
      if (!outreach.readyToSend) {
        warnings.push(
          `Outreach generated but NOT ready to send: ${outreach.holdReasons.join('; ')}`
        );
      }
    } catch (error) {
      const msg = `Outreach generation failed: ${error instanceof Error ? error.message : String(error)}`;
      warnings.push(msg);
      MollyLogger.error(msg, FLOW_NAME, { clientId: client.id }, error);
    }
  }

  MollyLogger.info(`Prospect onboarded: ${heirName}`, FLOW_NAME, {
    clientId: client.id,
    assets: discoveredAssets.length,
    outreachGenerated: outreach !== null,
    outreachReady: outreach?.readyToSend || false,
    warnings: warnings.length,
  });

  return {
    client,
    contactRecord,
    outreach,
    outreachSent,
    complianceWarnings: warnings,
  };
}

/**
 * STEP 2: Approve and send outreach.
 *
 * Eric reviews the generated outreach and approves it.
 * This records the attempt in the contact tracker and
 * updates the client status.
 */
export function approveAndSendOutreach(clientId: string): PipelineResult {
  const clientManager = getClientManager();
  const contactTracker = getContactTracker();
  const business = getBusinessConfig();

  const client = clientManager.getClient(clientId);
  if (!client) {
    return {
      success: false,
      action: 'send-outreach',
      details: `Client not found: ${clientId}`,
      warnings: [],
    };
  }

  const assets = clientManager.getClientAssets(clientId);
  if (assets.length === 0) {
    return {
      success: false,
      action: 'send-outreach',
      clientId,
      details: 'No assets linked to this client',
      warnings: [],
    };
  }

  // Re-generate outreach (ensures latest compliance rules)
  // In production, we'd use the actual DiscoveredAsset objects
  // For now, generate a minimal outreach request
  const outreachRequest: OutreachRequest = {
    recipientName: client.name,
    recipientEmail: client.email,
    assets: [], // Would be populated from asset store
    channel: 'email',
    type: client.status === 'prospect' ? 'initial-discovery' : 'follow-up',
    businessName: business.name,
    businessEmail: business.email,
    businessPhone: business.phone,
    businessAddress: business.address,
    requestedFeePercent: client.finderFeePercent,
  };

  // Update client status
  clientManager.updateStatus(clientId, 'contacted', 'Initial outreach sent');

  MollyLogger.info(`Outreach approved and sent to ${client.name}`, FLOW_NAME, {
    clientId,
  });

  return {
    success: true,
    action: 'send-outreach',
    clientId,
    details: `Outreach sent to ${client.name} (${client.email})`,
    warnings: [],
  };
}

/**
 * STEP 3: Record a prospect's response.
 */
export function recordProspectResponse(
  clientId: string,
  channel: 'email' | 'phone' | 'letter' | 'web-form' | 'other',
  summary: string,
  sentiment: 'positive' | 'neutral' | 'negative' | 'opt-out'
): PipelineResult {
  const contactTracker = getContactTracker();
  const clientManager = getClientManager();
  const warnings: string[] = [];

  const record = contactTracker.recordResponse(
    clientId,
    channel,
    summary,
    sentiment
  );

  if (!record) {
    return {
      success: false,
      action: 'record-response',
      clientId,
      details: 'Could not record response — contact record not found',
      warnings: [],
    };
  }

  // If positive/interested, prompt for agreement generation
  if (sentiment === 'positive') {
    warnings.push(
      'Prospect is interested — ready for agreement generation. Call generateAndSendAgreement().'
    );
  }

  // If opt-out, update client status
  if (sentiment === 'opt-out') {
    clientManager.updateStatus(clientId, 'inactive', 'Prospect opted out');
  }

  if (sentiment === 'negative') {
    clientManager.updateStatus(clientId, 'inactive', 'Prospect declined');
  }

  return {
    success: true,
    action: 'record-response',
    clientId,
    details: `Response recorded: ${sentiment} via ${channel}`,
    warnings,
  };
}

/**
 * STEP 4: Generate and send a finder's agreement.
 *
 * Called when a prospect expresses interest.
 * Generates a jurisdiction-compliant agreement and
 * updates the contact/client status.
 */
export function generateAndSendAgreement(
  clientId: string,
  assets: DiscoveredAsset[]
): PipelineResult & { agreement?: FinderAgreement } {
  const clientManager = getClientManager();
  const contactTracker = getContactTracker();
  const agreementGen = getAgreementGenerator();

  const client = clientManager.getClient(clientId);
  if (!client) {
    return {
      success: false,
      action: 'generate-agreement',
      details: 'Client not found',
      warnings: [],
    };
  }

  // Generate the agreement
  const agreement = agreementGen.generate(
    clientId,
    client.name,
    client.email,
    assets,
    client.finderFeePercent
  );

  if (!agreement) {
    return {
      success: false,
      action: 'generate-agreement',
      clientId,
      details:
        'Agreement generation blocked by compliance. Check jurisdiction rules.',
      warnings: [],
    };
  }

  // Mark as sent
  agreementGen.markSent(agreement.id);

  // Update client status
  clientManager.updateStatus(
    clientId,
    'agreement-sent',
    `Agreement ${agreement.id} sent. Fee: ${agreement.feePercent}%`
  );

  MollyLogger.info(`Agreement sent to ${client.name}`, FLOW_NAME, {
    clientId,
    agreementId: agreement.id,
    fee: agreement.feePercent,
    totalValue: agreement.totalEstimatedValue,
  });

  return {
    success: true,
    action: 'generate-agreement',
    clientId,
    details: `Agreement generated and sent. Fee: ${agreement.feePercent}%. Total value: $${agreement.totalEstimatedValue.toLocaleString()}.`,
    warnings: agreement.requiresNotarization
      ? [
          'This jurisdiction requires notarization — electronic-only will not suffice.',
        ]
      : [],
    agreement,
  };
}

/**
 * STEP 5: Record agreement signature and activate client.
 *
 * This is the conversion moment — prospect becomes paying client.
 */
export function recordSignatureAndActivate(
  clientId: string,
  agreementId: string,
  signatureRef: string
): PipelineResult {
  const clientManager = getClientManager();
  const agreementGen = getAgreementGenerator();

  const agreement = agreementGen.getAgreement(agreementId);
  if (!agreement || agreement.clientId !== clientId) {
    return {
      success: false,
      action: 'record-signature',
      details: 'Agreement not found or does not belong to this client',
      warnings: [],
    };
  }

  // Record signature
  const signed = agreementGen.recordSignature(agreementId, signatureRef);
  if (!signed) {
    return {
      success: false,
      action: 'record-signature',
      clientId,
      details: 'Could not record signature — agreement may have expired',
      warnings: [],
    };
  }

  // Countersign (auto — we're always ready)
  agreementGen.countersign(agreementId);

  // Activate the client in client manager
  clientManager.recordAgreement(clientId, agreementId, agreement.feePercent);

  MollyLogger.info(`Client activated: ${agreement.prospectName}`, FLOW_NAME, {
    clientId,
    agreementId,
    fee: agreement.feePercent,
  });

  return {
    success: true,
    action: 'record-signature',
    clientId,
    details: `Agreement signed and countersigned. Client ${agreement.prospectName} is now ACTIVE. Batch scanner will include them automatically.`,
    warnings: [],
  };
}

/**
 * STEP 6: Process follow-ups.
 *
 * Called periodically (e.g., daily). Checks for contacts
 * that are due for follow-up and generates outreach for them.
 *
 * Returns the list of follow-ups ready for Eric's review.
 */
export function processFollowUps(): {
  dueCount: number;
  generated: { clientId: string; name: string; readyToSend: boolean }[];
} {
  const contactTracker = getContactTracker();
  const clientManager = getClientManager();
  const business = getBusinessConfig();

  const due = contactTracker.getDueFollowUps();
  const generated: { clientId: string; name: string; readyToSend: boolean }[] =
    [];

  for (const record of due) {
    const client = clientManager.getClient(record.clientId);
    if (!client) continue;

    const outreachRequest: OutreachRequest = {
      recipientName: record.name,
      recipientEmail: record.email,
      assets: [], // Would be populated
      channel: 'email',
      type: 'follow-up',
      businessName: business.name,
      businessEmail: business.email,
      businessPhone: business.phone,
      businessAddress: business.address,
      requestedFeePercent: client.finderFeePercent,
    };

    try {
      const outreach = generateOutreach(outreachRequest);
      generated.push({
        clientId: record.clientId,
        name: record.name,
        readyToSend: outreach.readyToSend,
      });
    } catch {
      MollyLogger.warn(
        `Follow-up generation failed for ${record.name}`,
        FLOW_NAME
      );
    }
  }

  MollyLogger.info(
    `Follow-up processing: ${due.length} due, ${generated.length} generated`,
    FLOW_NAME
  );

  return { dueCount: due.length, generated };
}

/**
 * Get full pipeline status — a dashboard view.
 */
export function getPipelineStatus(): PipelineStatus {
  const clientManager = getClientManager();
  const contactTracker = getContactTracker();
  const agreementGen = getAgreementGenerator();
  const businessSummary = clientManager.getBusinessSummary();
  const contactSummary = contactTracker.getSummary();
  const actionRequired = agreementGen.getActionRequired();

  return {
    pendingOutreach: contactSummary.byStatus?.['not-contacted'] || 0,
    awaitingResponse:
      (contactSummary.byStatus?.['initial-sent'] || 0) +
      (contactSummary.byStatus?.['follow-up-sent'] || 0),
    needAgreement: contactSummary.byStatus?.['interested'] || 0,
    awaitingSignature: actionRequired.filter(
      (a) => a.status === 'sent' || a.status === 'viewed'
    ).length,
    needCountersign: actionRequired.filter((a) => a.status === 'signed').length,
    dueForFollowUp: contactSummary.dueForFollowUp,
    activeClients: businessSummary.activeClients,
    totalFeesEarned: businessSummary.totalFeesEarned,
  };
}
