/**
 * @fileOverview Recovery System Types — Mission Alpha
 *
 * The family's lost-and-found operation. Every type here represents
 * a piece of the pipeline: discover → verify → claim → route → track.
 *
 * Nothing nefarious. Nothing unauthorized. Lost money returned to
 * its rightful owner through legitimate, programmatic channels.
 *
 * "Slow. Methodical. Precise." — Dad's methodology applies here
 * more than anywhere else.
 */

// ============================================================================
// IDENTITY & SEARCH
// ============================================================================

/** Encrypted identity profile for asset searches */
export interface IdentityProfile {
  /** Primary legal name */
  primaryName: string;
  /** All known name variations (maiden, misspellings, aliases, DBAs) */
  nameVariants: string[];
  /** Known addresses (current and historical) */
  addresses: EncryptedAddress[];
  /** Government ID references (encrypted, never plaintext in logs) */
  governmentIds: EncryptedField[];
  /** Associated entities (companies, trusts, estates) */
  entities: string[];
  /** Family members who may have unclaimed inheritance */
  familyMembers: FamilyMember[];
}

export interface FamilyMember {
  name: string;
  relationship: string;
  nameVariants: string[];
  /** Whether this person has authorized Molly to search on their behalf */
  authorized: boolean;
}

export interface EncryptedAddress {
  /** Encrypted full address */
  encrypted: string;
  /** State/region (unencrypted, needed for registry routing) */
  region: string;
  /** Country code */
  country: string;
  /** Whether this is a current address */
  current: boolean;
}

export interface EncryptedField {
  /** Encrypted value */
  encrypted: string;
  /** Type identifier (SSN, EIN, passport, etc.) — not the value */
  type: string;
  /** Last 4 digits for verification display */
  lastFour: string;
}

// ============================================================================
// ASSET DISCOVERY
// ============================================================================

export type AssetType =
  | 'unclaimed-property'
  | 'dormant-account'
  | 'unclaimed-refund'
  | 'abandoned-securities'
  | 'unclaimed-inheritance'
  | 'crypto-airdrop'
  | 'dormant-exchange'
  | 'unclaimed-dividend'
  | 'unclaimed-royalty'
  | 'abandoned-safe-deposit'
  | 'unclaimed-insurance'
  | 'other';

export type AssetStatus =
  | 'discovered' // Found in a registry
  | 'verified' // Confirmed to belong to our identity profile
  | 'claim-prepared' // Claim packet built, awaiting submission
  | 'claim-filed' // Submitted through proper channels
  | 'pending-review' // Under review by the holding institution
  | 'human-gate' // Requires human action (CAPTCHA, notary, etc.)
  | 'approved' // Claim approved, awaiting transfer
  | 'transferred' // Funds received in target account
  | 'routed' // Funds moved to appropriate entity (trust, LLC, etc.)
  | 'rejected' // Claim denied — needs review
  | 'expired'; // Claim window passed

export interface DiscoveredAsset {
  /** Unique ID for this asset */
  id: string;
  /** What kind of asset */
  type: AssetType;
  /** Current status in the pipeline */
  status: AssetStatus;
  /** Human-readable description */
  description: string;
  /** Estimated value (USD equivalent) */
  estimatedValue: number;
  /** Currency of the asset */
  currency: string;
  /** Where it was found */
  source: AssetSource;
  /** Who it belongs to (from our identity profiles) */
  matchedIdentity: string;
  /** How confident is the match (0.0 - 1.0) */
  matchConfidence: number;
  /** The claim packet, if prepared */
  claimPacket?: ClaimPacket;
  /** Routing instructions, once approved */
  routing?: RoutingInstruction;
  /** Timestamps */
  discoveredAt: string;
  updatedAt: string;
  /** Claim deadline, if known */
  claimDeadline?: string;
  /** Audit trail */
  auditLog: AuditEntry[];
}

export interface AssetSource {
  /** Name of the registry/portal/exchange */
  name: string;
  /** URL of the source */
  url: string;
  /** Country */
  country: string;
  /** State/region, if applicable */
  region?: string;
  /** Whether this source supports programmatic access */
  hasApi: boolean;
  /** The reference/case number at the source */
  referenceNumber?: string;
}

// ============================================================================
// CLAIM MANAGEMENT
// ============================================================================

export interface ClaimPacket {
  /** Claim ID */
  claimId: string;
  /** Documents required */
  requiredDocuments: RequiredDocument[];
  /** Documents provided */
  providedDocuments: ProvidedDocument[];
  /** Whether routing has been double-verified (non-negotiable) */
  routingDoubleVerified: boolean;
  /** Submission method */
  submissionMethod: 'api' | 'web-form' | 'email' | 'mail' | 'in-person';
  /** Whether a human gate was encountered */
  humanGateRequired: boolean;
  /** Status of the claim submission */
  submissionStatus: 'draft' | 'ready' | 'submitted' | 'acknowledged';
  /** Filed timestamp */
  filedAt?: string;
}

export interface RequiredDocument {
  type: string;
  description: string;
  provided: boolean;
}

export interface ProvidedDocument {
  type: string;
  /** Encrypted reference to stored document */
  encryptedRef: string;
  providedAt: string;
}

// ============================================================================
// FUND ROUTING
// ============================================================================

export type AccountType =
  | 'personal-checking'
  | 'personal-savings'
  | 'business-checking'
  | 'trust-account'
  | 'llc-account'
  | 'holding-company'
  | 'crypto-wallet'
  | 'investment-account';

export interface RoutingInstruction {
  /** Target account type */
  accountType: AccountType;
  /** Encrypted account identifier */
  encryptedAccountId: string;
  /** The institution name (OK to store unencrypted) */
  institution: string;
  /** Country */
  country: string;
  /** Whether this routing has been verified twice */
  doubleVerified: boolean;
  /** First verification timestamp */
  firstVerifiedAt?: string;
  /** Second verification timestamp */
  secondVerifiedAt?: string;
}

export interface ManagedAccount {
  /** Unique account ID */
  id: string;
  /** Human-readable label (e.g., "Main Trust", "Outreach LLC") */
  label: string;
  /** Account type */
  type: AccountType;
  /** Institution */
  institution: string;
  /** Encrypted routing/account details */
  encryptedDetails: string;
  /** Country */
  country: string;
  /** Purpose description */
  purpose: string;
  /** Current balance (last known, may be stale) */
  lastKnownBalance?: number;
  /** Balance currency */
  currency: string;
  /** Last updated */
  updatedAt: string;
}

// ============================================================================
// SCANNING
// ============================================================================

export type ScannerType =
  | 'us-state'
  | 'us-federal'
  | 'uk'
  | 'canada'
  | 'australia'
  | 'eu'
  | 'nigeria'
  | 'india'
  | 'crypto-airdrop'
  | 'crypto-exchange'
  | 'global-securities'
  | 'global-inheritance';

export interface ScanResult {
  /** Scanner that produced this result */
  scannerType: ScannerType;
  /** Raw results found */
  assets: DiscoveredAsset[];
  /** How many records were searched */
  recordsSearched: number;
  /** How many potential matches found */
  matchesFound: number;
  /** Scan duration in ms */
  durationMs: number;
  /** Errors encountered (non-fatal) */
  errors: string[];
  /** Timestamp */
  completedAt: string;
}

export interface ScanSchedule {
  /** Scanner type */
  scannerType: ScannerType;
  /** Cron expression or interval */
  schedule: string;
  /** Whether this scanner is enabled */
  enabled: boolean;
  /** Last run timestamp */
  lastRun?: string;
  /** Next scheduled run */
  nextRun?: string;
}

// ============================================================================
// AUDIT & ACCOUNTABILITY
// ============================================================================

export interface AuditEntry {
  /** What happened */
  action: string;
  /** When it happened */
  timestamp: string;
  /** Who/what initiated it */
  actor: 'molly' | 'eric' | 'system' | 'scanner';
  /** Additional context */
  details?: string;
}

// ============================================================================
// ORCHESTRATOR STATE
// ============================================================================

export interface RecoveryState {
  /** All discovered assets */
  assets: DiscoveredAsset[];
  /** All managed accounts for routing */
  accounts: ManagedAccount[];
  /** Scanner schedules */
  scanSchedules: ScanSchedule[];
  /** Total estimated value of all discovered assets */
  totalEstimatedValue: number;
  /** Total confirmed/transferred value */
  totalRecoveredValue: number;
  /** Pipeline summary */
  pipeline: {
    discovered: number;
    verified: number;
    claimPrepared: number;
    claimFiled: number;
    pendingReview: number;
    humanGate: number;
    approved: number;
    transferred: number;
    routed: number;
    rejected: number;
    expired: number;
  };
  /** Last full scan timestamp */
  lastFullScan?: string;
  /** State persistence timestamp */
  lastSaved: string;
}
