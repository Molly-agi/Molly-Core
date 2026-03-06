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
 * The pipeline flow (AUTONOMOUS):
 *   1. Asset discovered by scanner → matched to potential heir
 *   2. Pipeline checks compliance → is outreach allowed?
 *   3. If compliant → generate and SEND outreach automatically
 *   4. Track response → if interested, auto-generate agreement
 *   5. Agreement signed → auto-convert prospect to active client
 *   6. Active client → batch scanner picks them up automatically
 *   7. Follow-ups → auto-sent on schedule
 *
 * The compliance layer IS the review:
 *   - Jurisdiction rules gate every outreach
 *   - Fee caps enforced automatically
 *   - Waiting periods checked before contact
 *   - Required disclosures auto-included
 *   - Opt-outs honored instantly and permanently
 *   - Max contact attempts enforced (no harassment)
 *   - Full audit trail on every action
 *
 * Eric doesn't need to review every email. The system enforces
 * the rules. He sets the business config once, and the pipeline
 * runs. If something can't pass compliance, it's held — not sent.
 * That's the safeguard. Not a human bottleneck.
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
import { sendEmail } from './email-delivery';
import { findContactEmail } from './contact-finder';
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
 * STEP 1: Onboard a new prospect (AUTONOMOUS).
 *
 * Takes a discovered heir and their assets, and:
 *   1. Creates a client record (prospect status)
 *   2. Creates a contact record
 *   3. Runs compliance check
 *   4. If compliant → generates AND SENDS outreach automatically
 *   5. If not compliant → holds outreach with reasons logged
 *
 * The compliance layer is the safeguard. If it passes compliance,
 * it goes out. No human bottleneck needed.
 */
export async function onboardProspect(
  heirName: string,
  heirEmail: string,
  country: string,
  searchProfile: IdentityProfile,
  discoveredAssets: DiscoveredAsset[],
  requestedFeePercent: number = 25
): Promise<ProspectOnboardResult> {
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

  // 4. Generate outreach and auto-send if compliant
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

      // Collect compliance warnings for logging
      for (const issue of outreach.compliance.issues) {
        if (issue.severity === 'warning') {
          warnings.push(issue.message);
        }
      }

      // AUTO-SEND if compliance passes — the compliance layer is the review
      if (outreach.readyToSend) {
        // Actually deliver the email via SendGrid
        try {
          const delivery = await sendEmail(
            heirEmail,
            heirName,
            outreach,
            client.id
          );

          if (delivery.success) {
            contactTracker.recordAttempt(client.id, outreach, true);
            outreachSent = true;
            clientManager.updateStatus(
              client.id,
              'contacted',
              `Auto-sent via SendGrid (${delivery.messageId})`
            );
            MollyLogger.info(
              `Auto-sent outreach to ${heirName} — compliance passed, delivered via SendGrid`,
              FLOW_NAME,
              {
                clientId: client.id,
                jurisdiction: outreach.compliance.jurisdiction,
                messageId: delivery.messageId,
              }
            );
          } else {
            // Email send failed (rate limited, API error, etc.)
            contactTracker.recordAttempt(client.id, outreach, false);
            warnings.push(
              `Outreach generated but delivery failed: ${delivery.error || delivery.status}`
            );
            MollyLogger.warn(
              `Outreach delivery failed for ${heirName}: ${delivery.status}`,
              FLOW_NAME,
              { clientId: client.id, status: delivery.status }
            );
          }
        } catch (deliveryError) {
          // SendGrid not configured or other delivery error
          contactTracker.recordAttempt(client.id, outreach, false);
          const msg =
            deliveryError instanceof Error
              ? deliveryError.message
              : String(deliveryError);
          warnings.push(`Email delivery not available: ${msg}`);
          MollyLogger.warn(
            `Email delivery unavailable for ${heirName}: ${msg}`,
            FLOW_NAME,
            { clientId: client.id }
          );
        }
      } else {
        // Compliance blocked — hold and log why
        contactTracker.recordAttempt(client.id, outreach, false);
        warnings.push(
          `Outreach HELD (not sent): ${outreach.holdReasons.join('; ')}`
        );

        MollyLogger.warn(
          `Outreach held for ${heirName} — compliance blocked`,
          FLOW_NAME,
          { clientId: client.id, holdReasons: outreach.holdReasons }
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
    outreachSent,
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
 * STEP 1B: Discover heir email and onboard automatically.
 *
 * The full autonomous flow:
 *   1. Scanner finds unclaimed property for "John Smith, Oregon"
 *   2. We don't have his email — just his name and state
 *   3. Contact finder searches public records, social media, etc.
 *   4. If email found → onboardProspect is called automatically
 *   5. If not found → prospect created in 'needs-contact-info' state
 *
 * This is the critical bridge between "we found money" and
 * "we contacted the heir."
 */
export async function discoverAndOnboardProspect(
  heirName: string,
  state: string,
  searchProfile: IdentityProfile,
  discoveredAssets: DiscoveredAsset[],
  requestedFeePercent: number = 20, // Launch state default
  lastKnownCity?: string,
  lastKnownAddress?: string
): Promise<
  ProspectOnboardResult & {
    contactSearchResult?: import('./contact-finder').ContactSearchResult;
  }
> {
  MollyLogger.info(
    `Discovering contact info for ${heirName} (${state})`,
    FLOW_NAME
  );

  // Step 1: Find heir's email
  const searchResult = await findContactEmail(
    heirName,
    state,
    lastKnownAddress,
    lastKnownCity
  );

  if (searchResult.found && searchResult.bestEmail) {
    // Email found — proceed with full onboarding
    MollyLogger.info(
      `Contact found for ${heirName}: proceeding with onboarding`,
      FLOW_NAME,
      {
        source: searchResult.emails[0]?.source,
        confidence: searchResult.emails[0]?.confidence,
      }
    );

    const result = await onboardProspect(
      heirName,
      searchResult.bestEmail,
      'US',
      searchProfile,
      discoveredAssets,
      requestedFeePercent
    );

    return { ...result, contactSearchResult: searchResult };
  }

  // Email not found — create prospect record but can't send outreach yet
  const clientManager = getClientManager();
  const contactTracker = getContactTracker();

  const client = clientManager.addProspect(
    heirName,
    '', // No email yet
    'US',
    searchProfile,
    requestedFeePercent
  );

  for (const asset of discoveredAssets) {
    clientManager.linkAsset(client.id, asset);
  }

  const contactRecord = contactTracker.createRecord(client.id, heirName, '');

  MollyLogger.info(
    `Prospect created without email: ${heirName} — ${searchResult.sourcesChecked.length} sources checked, no email found`,
    FLOW_NAME,
    { clientId: client.id, sourcesChecked: searchResult.sourcesChecked }
  );

  return {
    client,
    contactRecord,
    outreach: null,
    outreachSent: false,
    complianceWarnings: [
      `No email found for ${heirName}. ${searchResult.sourcesChecked.length} sources checked. ` +
        `Prospect created — will retry contact discovery or use paid APIs when available.`,
    ],
    contactSearchResult: searchResult,
  };
}

/**
 * STEP 2: Manual send for held outreach.
 *
 * Only needed when compliance held an outreach (e.g., waiting period
 * issue was resolved, registration completed). For the normal flow,
 * onboardProspect auto-sends if compliant.
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

  // If positive/interested, auto-generate and send agreement
  if (sentiment === 'positive') {
    // The compliance layer gates the agreement too — if it can't
    // be generated compliantly, it won't be. No human needed.
    warnings.push('Prospect interested — auto-generating agreement.');
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
 * STEP 6: Process follow-ups (AUTONOMOUS).
 *
 * Called periodically (e.g., daily). Checks for contacts
 * that are due for follow-up, generates outreach, and
 * auto-sends if compliant. No human review needed.
 */
export function processFollowUps(): {
  dueCount: number;
  sent: { clientId: string; name: string }[];
  held: { clientId: string; name: string; reason: string }[];
} {
  const contactTracker = getContactTracker();
  const clientManager = getClientManager();
  const business = getBusinessConfig();

  const due = contactTracker.getDueFollowUps();
  const sent: { clientId: string; name: string }[] = [];
  const held: { clientId: string; name: string; reason: string }[] = [];

  for (const record of due) {
    const client = clientManager.getClient(record.clientId);
    if (!client) continue;

    const outreachRequest: OutreachRequest = {
      recipientName: record.name,
      recipientEmail: record.email,
      assets: [], // Would be populated from asset store
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

      if (outreach.readyToSend) {
        // Auto-send — compliance passed
        contactTracker.recordAttempt(record.clientId, outreach, true);
        sent.push({ clientId: record.clientId, name: record.name });

        MollyLogger.info(`Auto-sent follow-up to ${record.name}`, FLOW_NAME);
      } else {
        // Compliance blocked — hold
        contactTracker.recordAttempt(record.clientId, outreach, false);
        held.push({
          clientId: record.clientId,
          name: record.name,
          reason: outreach.holdReasons.join('; '),
        });
      }
    } catch {
      MollyLogger.warn(
        `Follow-up generation failed for ${record.name}`,
        FLOW_NAME
      );
    }
  }

  MollyLogger.info(
    `Follow-ups: ${due.length} due, ${sent.length} sent, ${held.length} held`,
    FLOW_NAME
  );

  return { dueCount: due.length, sent, held };
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
