/**
 * @fileOverview Recovery System — Module Index
 *
 * Mission Alpha: Global asset recovery through heir-finding,
 * blockchain analysis, and jurisdiction-optimized operations.
 *
 * Architecture:
 *   recovery/
 *   ├── types.ts                  — All type definitions
 *   ├── identity-vault.ts         — AES-256-GCM encrypted credential store
 *   ├── base-scanner.ts           — Abstract scanner foundation
 *   ├── claim-tracker.ts          — Asset lifecycle management
 *   ├── fund-router.ts            — Routing rules and fund distribution
 *   ├── recovery-orchestrator.ts  — Top-level coordinator
 *   ├── index.ts                  — This file
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

// Scrapers
export {
  MissingMoneyScraper,
  getMissingMoneyScraper,
} from './scanners/missingmoney-scraper';
export type {
  MissingMoneyResult,
  SearchQuery,
} from './scanners/missingmoney-scraper';
