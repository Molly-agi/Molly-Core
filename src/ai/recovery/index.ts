/**
 * @fileOverview Recovery System — Module Index
 *
 * Mission Alpha: Global asset recovery through heir-finding,
 * blockchain analysis, and jurisdiction-optimized operations.
 *
 * Architecture:
 *   recovery/
 *   ├── types.ts                      — All type definitions
 *   ├── identity-vault.ts             — AES-256-GCM encrypted credential store
 *   ├── base-scanner.ts               — Abstract scanner foundation
 *   ├── claim-tracker.ts              — Asset lifecycle management
 *   ├── fund-router.ts                — Routing rules and fund distribution
 *   ├── recovery-orchestrator.ts      — Top-level coordinator
 *   ├── jurisdiction-compliance.ts    — Per-state fee caps, rules, compliance
 *   ├── outreach-engine.ts            — Compliant outreach letter generation
 *   ├── contact-tracker.ts            — Outreach lifecycle & opt-out tracking
 *   ├── agreement-generator.ts        — Finder's fee agreement contracts
 *   ├── heir-contact-pipeline.ts      — Full pipeline: discover → contact → convert
 *   ├── index.ts                      — This file
 *   └── scanners/
 *       ├── us-registry-scanner.ts    — All 50 US states + federal
 *       └── crypto-recovery-scanner.ts — Blockchain + exchange recovery
 *
 * Family Network:
 *   Eric (US) · Wife (Nigeria) · Savannah (Mexico) · Kyle (Mexico)
 *   Molly (everywhere — never sleeps)
 */

// Core
export { IdentityVault, getIdentityVault } from './identity-vault';
export { BaseScanner } from './base-scanner';
export { ClaimTracker, getClaimTracker } from './claim-tracker';
export { FundRouter, getFundRouter } from './fund-router';
export {
  RecoveryOrchestrator,
  getRecoveryOrchestrator,
  JURISDICTION_CONFIGS,
} from './recovery-orchestrator';

// Service Mode — Multi-Client Heir-Finding
export { ClientManager, getClientManager } from './client-manager';
export { runBatchScan, scanForClient } from './batch-scanner';

// Heir Contact Pipeline — Discovery to Revenue
export {
  getJurisdictionRule,
  checkCompliance,
  getPrioritizedStates,
  getOperationalStates,
  getAllRules,
  getRecommendedFee,
  isLaunchState,
  getLaunchStates,
  LAUNCH_STATES,
  FEE_SCHEDULE,
} from './jurisdiction-compliance';
export {
  generateOutreach,
  configureOutreachBusiness,
  getBusinessConfig,
} from './outreach-engine';
export { ContactTracker, getContactTracker } from './contact-tracker';
export {
  AgreementGenerator,
  getAgreementGenerator,
} from './agreement-generator';
export {
  onboardProspect,
  discoverAndOnboardProspect,
  approveAndSendOutreach,
  recordProspectResponse,
  generateAndSendAgreement,
  recordSignatureAndActivate,
  processFollowUps,
  getPipelineStatus,
} from './heir-contact-pipeline';

// Scanners
export {
  USRegistryScanner,
  getUSRegistryScanner,
  US_STATE_PORTALS,
  US_FEDERAL_SOURCES,
} from './scanners/us-registry-scanner';
export {
  CryptoRecoveryScanner,
  getCryptoRecoveryScanner,
  SETTLEMENT_SOURCES,
  MAJOR_EXCHANGES,
  AIRDROP_CHAINS,
} from './scanners/crypto-recovery-scanner';

// Types
export type {
  IdentityProfile,
  FamilyMember,
  EncryptedAddress,
  EncryptedField,
  AssetType,
  AssetStatus,
  DiscoveredAsset,
  AssetSource,
  ClaimPacket,
  RequiredDocument,
  ProvidedDocument,
  AccountType,
  RoutingInstruction,
  ManagedAccount,
  ScannerType,
  ScanResult,
  ScanSchedule,
  AuditEntry,
  RecoveryState,
  ServiceClient,
  ClientStatus,
  ClientAssetLink,
} from './types';

export type {
  OperatingMode,
  JurisdictionConfig,
} from './recovery-orchestrator';

export type { RoutingRule } from './fund-router';
export type { StatePortal } from './scanners/us-registry-scanner';
export type { SettlementSource } from './scanners/crypto-recovery-scanner';
export type { BatchScanResult } from './batch-scanner';

// Heir Contact Pipeline Types
export type {
  JurisdictionRule,
  ComplianceCheck,
  ComplianceIssue,
  FeeSchedule,
} from './jurisdiction-compliance';
export type {
  OutreachContent,
  OutreachRequest,
  OutreachChannel,
  OutreachType,
  BusinessConfig,
} from './outreach-engine';
export type {
  ContactRecord,
  ContactStatus,
  OutreachAttempt,
  ContactResponse,
} from './contact-tracker';
export type { FinderAgreement, AgreementStatus } from './agreement-generator';
export type {
  PipelineResult,
  ProspectOnboardResult,
  PipelineStatus,
} from './heir-contact-pipeline';

// Email Delivery — SendGrid Integration
export {
  sendEmail,
  configureEmail,
  configureEmailFromEnv,
  getRemainingCapacity,
} from './email-delivery';
export type {
  DeliveryResult,
  DeliveryStatus,
  EmailConfig,
} from './email-delivery';

// Contact Finder — Automated Email Discovery
export {
  findContactEmail,
  batchFindContacts,
  configureContactFinder,
} from './contact-finder';
export type {
  FoundContact,
  ContactSearchResult,
  ContactSource,
  ContactFinderConfig,
} from './contact-finder';

// Scrapers
export {
  MissingMoneyScraper,
  getMissingMoneyScraper,
} from './scanners/missingmoney-scraper';
export type {
  MissingMoneyResult,
  SearchQuery,
} from './scanners/missingmoney-scraper';
