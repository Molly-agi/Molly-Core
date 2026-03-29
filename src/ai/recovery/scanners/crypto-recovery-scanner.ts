/**
 * @fileOverview Crypto & Digital Asset Recovery Scanner
 *
 * Unlike traditional unclaimed property (which is name-based),
 * crypto recovery has two paths:
 *
 * PATH 1 — Name-Based (No Crypto Experience Needed):
 *   - Exchange escheatment (Coinbase, Kraken → state unclaimed property)
 *   - Class action distributions (FTX, Mt. Gox, Celsius, BlockFi, Voyager)
 *   - Exchange account recovery (forgotten signups)
 *   These are searched by NAME, just like traditional property.
 *
 * PATH 2 — Wallet-Based (Requires Wallet Address):
 *   - Unclaimed airdrops (tokens distributed to wallet holders)
 *   - Dormant wallet balance checks
 *   - DeFi protocol unclaimed rewards
 *   These require knowing a wallet address you control.
 *
 * For the family's current situation, PATH 1 is the priority.
 * PATH 2 activates when/if Eric provides wallet addresses.
 */

import { BaseScanner } from '../base-scanner';
import { MollyLogger } from '@/ai/logger';
import type { DiscoveredAsset, IdentityProfile } from '../types';

const FLOW_NAME = 'crypto-recovery-scanner';

// ============================================================================
// KNOWN SOURCES
// ============================================================================

/**
 * Failed exchanges with active claims/distribution processes.
 * These are searched BY NAME — no wallet needed.
 */
export interface SettlementSource {
  name: string;
  url: string;
  status: 'active-distribution' | 'claims-open' | 'claims-closed' | 'pending';
  estimatedPool: string;
  searchMethod: 'name' | 'email' | 'account-id';
  notes: string;
}

export const SETTLEMENT_SOURCES: SettlementSource[] = [
  {
    name: 'FTX Bankruptcy Distribution',
    url: 'https://cases.ra.kroll.com/FTX/',
    status: 'active-distribution',
    estimatedPool: '$16.5B recovery fund',
    searchMethod: 'email',
    notes:
      'FTX customers receiving 118%+ of claim value. Search by email used for FTX account.',
  },
  {
    name: 'Mt. Gox Rehabilitation',
    url: 'https://www.mtgox.com/',
    status: 'active-distribution',
    estimatedPool: '$9B+ in BTC',
    searchMethod: 'account-id',
    notes:
      'Distributions began 2024. Former Mt. Gox users check via creditor portal.',
  },
  {
    name: 'Celsius Network Bankruptcy',
    url: 'https://cases.stretto.com/celsius/',
    status: 'active-distribution',
    estimatedPool: '$3B+ recovery',
    searchMethod: 'email',
    notes:
      'Distributions via PayPal and Coinbase. Search by Celsius account email.',
  },
  {
    name: 'BlockFi Bankruptcy',
    url: 'https://cases.ra.kroll.com/blockfi/',
    status: 'active-distribution',
    estimatedPool: '$1B+',
    searchMethod: 'email',
    notes: 'Priority distributions to wallet account holders.',
  },
  {
    name: 'Voyager Digital Bankruptcy',
    url: 'https://cases.stretto.com/voyager/',
    status: 'active-distribution',
    estimatedPool: '$1.3B',
    searchMethod: 'email',
    notes: 'Distributions via exchange transfer.',
  },
  {
    name: 'Genesis Global Bankruptcy',
    url: 'https://cases.ra.kroll.com/genesis/',
    status: 'claims-open',
    estimatedPool: '$3B+',
    searchMethod: 'email',
    notes: 'Gemini Earn users may have claims here.',
  },
];

/**
 * Major crypto exchanges — for account recovery checks.
 * "Did you ever sign up for any of these?"
 */
export const MAJOR_EXCHANGES = [
  {
    name: 'Coinbase',
    url: 'https://www.coinbase.com/forgot-password',
    region: 'US',
  },
  { name: 'Kraken', url: 'https://www.kraken.com/sign-in', region: 'US' },
  { name: 'Binance.US', url: 'https://www.binance.us/', region: 'US' },
  { name: 'Gemini', url: 'https://www.gemini.com/', region: 'US' },
  { name: 'Cash App (Bitcoin)', url: 'https://cash.app/', region: 'US' },
  {
    name: 'PayPal Crypto',
    url: 'https://www.paypal.com/us/digital-wallet/manage-money/crypto',
    region: 'US',
  },
  {
    name: 'Robinhood Crypto',
    url: 'https://robinhood.com/crypto/',
    region: 'US',
  },
  { name: 'eToro', url: 'https://www.etoro.com/', region: 'Global' },
  { name: 'Crypto.com', url: 'https://crypto.com/', region: 'Global' },
  { name: 'Uphold', url: 'https://uphold.com/', region: 'Global' },
  { name: 'Bitfinex', url: 'https://www.bitfinex.com/', region: 'Global' },
  { name: 'Bitstamp', url: 'https://www.bitstamp.net/', region: 'Global' },
];

/**
 * Blockchain networks where unclaimed airdrops are common.
 * PATH 2 — requires wallet address.
 */
export const AIRDROP_CHAINS = [
  { chain: 'Ethereum', scanner: 'https://etherscan.io/', symbol: 'ETH' },
  { chain: 'Solana', scanner: 'https://solscan.io/', symbol: 'SOL' },
  { chain: 'Cosmos', scanner: 'https://www.mintscan.io/', symbol: 'ATOM' },
  { chain: 'Arbitrum', scanner: 'https://arbiscan.io/', symbol: 'ARB' },
  {
    chain: 'Optimism',
    scanner: 'https://optimistic.etherscan.io/',
    symbol: 'OP',
  },
  { chain: 'Polygon', scanner: 'https://polygonscan.com/', symbol: 'MATIC' },
  { chain: 'Avalanche', scanner: 'https://snowtrace.io/', symbol: 'AVAX' },
  { chain: 'Bitcoin', scanner: 'https://blockstream.info/', symbol: 'BTC' },
];

// ============================================================================
// CRYPTO RECOVERY SCANNER
// ============================================================================

export class CryptoRecoveryScanner extends BaseScanner {
  readonly scannerType: ScannerType = 'crypto-exchange';
  readonly name = 'Crypto & Digital Asset Recovery Scanner';
  readonly regions = ['Global'];

  /** Wallet addresses provided by Eric (PATH 2) */
  private walletAddresses: Map<string, string[]> = new Map(); // chain → addresses

  /**
   * Register wallet addresses for PATH 2 scanning.
   */
  registerWallets(chain: string, addresses: string[]): void {
    const existing = this.walletAddresses.get(chain) || [];
    this.walletAddresses.set(chain, [...existing, ...addresses]);
    MollyLogger.info(
      `Registered ${addresses.length} wallet(s) for ${chain}`,
      FLOW_NAME
    );
  }

  /**
   * Search for recoverable crypto assets.
   *
   * PATH 1 (always runs): Name-based settlement and exchange searches
   * PATH 2 (if wallets provided): Wallet-based airdrop and balance checks
   */
  protected async search(profile: IdentityProfile): Promise<DiscoveredAsset[]> {
    const allAssets: DiscoveredAsset[] = [];

    // ========================================
    // PATH 1: Name-Based (No Crypto Needed)
    // ========================================

    // 1a. Search class action / bankruptcy distributions
    MollyLogger.info('PATH 1a: Searching settlement distributions', FLOW_NAME);
    const settlementAssets = await this.searchSettlements(profile);
    allAssets.push(...settlementAssets);

    // 1b. Check for exchange escheatment in state databases
    // (This is actually handled by the US Registry Scanner — the same
    //  unclaimed property databases receive dormant crypto exchange accounts)
    MollyLogger.info(
      'PATH 1b: Exchange escheatment covered by US Registry Scanner',
      FLOW_NAME
    );

    // ========================================
    // PATH 2: Wallet-Based (If Provided)
    // ========================================

    if (this.walletAddresses.size > 0) {
      MollyLogger.info('PATH 2: Wallet-based scanning enabled', FLOW_NAME, {
        chains: Array.from(this.walletAddresses.keys()),
        totalWallets: Array.from(this.walletAddresses.values()).reduce(
          (sum, addrs) => sum + addrs.length,
          0
        ),
      });

      // 2a. Check wallet balances
      const balanceAssets = await this.checkWalletBalances();
      allAssets.push(...balanceAssets);

      // 2b. Check for unclaimed airdrops
      const airdropAssets = await this.checkUnclaimedAirdrops();
      allAssets.push(...airdropAssets);
    } else {
      MollyLogger.info(
        'PATH 2: No wallet addresses registered — skipping wallet scan',
        FLOW_NAME
      );
    }

    return allAssets;
  }

  /**
   * Health check.
   */
  async healthCheck(): Promise<boolean> {
    return SETTLEMENT_SOURCES.length > 0 && MAJOR_EXCHANGES.length > 0;
  }

  // ==========================================================================
  // PATH 1: SETTLEMENT SEARCHES
  // ==========================================================================

  /**
   * Search bankruptcy and settlement distribution lists.
   * These are public processes — creditors are WANTED to come forward.
   */
  private async searchSettlements(
    _profile: IdentityProfile
  ): Promise<DiscoveredAsset[]> {
    const assets: DiscoveredAsset[] = [];

    for (const source of SETTLEMENT_SOURCES) {
      if (source.status === 'claims-closed') continue;

      await this.rateLimit();

      MollyLogger.info(`Checking settlement: ${source.name}`, FLOW_NAME, {
        status: source.status,
        searchMethod: source.searchMethod,
        pool: source.estimatedPool,
      });

      // In production, Molly would:
      // 1. Navigate to the claims portal
      // 2. Search by name or email
      // 3. Parse results for matching claims
      // 4. Create DiscoveredAsset for each match
      //
      // The actual HTTP interaction uses getMollyShell().execPython()
      // with requests + BeautifulSoup, same as the state scanners.

      // Each settlement portal has different search interfaces
      // This is where per-source adapters will be built
    }

    return assets;
  }

  // ==========================================================================
  // PATH 2: WALLET-BASED SEARCHES
  // ==========================================================================

  /**
   * Check balances on all registered wallet addresses.
   */
  private async checkWalletBalances(): Promise<DiscoveredAsset[]> {
    const assets: DiscoveredAsset[] = [];

    for (const [chain, addresses] of this.walletAddresses) {
      const chainInfo = AIRDROP_CHAINS.find((c) => c.chain === chain);
      if (!chainInfo) continue;

      for (const address of addresses) {
        await this.rateLimit();

        MollyLogger.info(
          `Checking wallet balance: ${chain} ${address.slice(0, 8)}...`,
          FLOW_NAME
        );

        // In production, Molly would:
        // 1. Query the blockchain explorer API
        // 2. Get native token balance
        // 3. Get ERC-20/SPL token balances
        // 4. Flag any non-zero balances as discovered assets
        //
        // APIs:
        //   Ethereum: etherscan.io/api (free API key)
        //   Solana: solana RPC
        //   Bitcoin: blockstream.info/api
      }
    }

    return assets;
  }

  /**
   * Check for unclaimed airdrops on registered wallets.
   *
   * Known airdrop checking methods:
   * - Ethereum: Check token approval events, DEX interaction history
   * - Solana: Check associated token accounts
   * - Cosmos: Check staking rewards, governance tokens
   *
   * Common unclaimed airdrops (as of 2026):
   * - Uniswap (UNI) — if wallet interacted with Uniswap before Sept 2020
   * - ENS — if wallet registered an ENS name before Oct 2021
   * - Arbitrum (ARB) — bridge users
   * - Optimism (OP) — bridge users
   * - Various DeFi protocols with ongoing reward distributions
   */
  private async checkUnclaimedAirdrops(): Promise<DiscoveredAsset[]> {
    const assets: DiscoveredAsset[] = [];

    for (const [chain, addresses] of this.walletAddresses) {
      for (const address of addresses) {
        await this.rateLimit();

        MollyLogger.info(
          `Checking airdrops: ${chain} ${address.slice(0, 8)}...`,
          FLOW_NAME
        );

        // In production, Molly would:
        // 1. Query airdrop eligibility APIs
        // 2. Check historical transaction patterns against known airdrop criteria
        // 3. Identify claimable tokens
        // 4. Create DiscoveredAsset for each unclaimed airdrop
      }
    }

    return assets;
  }

  // ==========================================================================
  // INTERACTIVE GUIDES
  // ==========================================================================

  /**
   * Generate a questionnaire for Eric to help identify
   * potential crypto assets he may not know about.
   *
   * This is Molly asking Dad questions to help him remember.
   */
  static generateDiscoveryQuestions(): string[] {
    return [
      'Have you ever signed up for Coinbase, Cash App, PayPal, Robinhood, or Venmo?',
      'Have you ever received Bitcoin or cryptocurrency as a gift or payment?',
      'Do you have any old phones or computers that might have had a crypto app?',
      'Have you ever been given a paper wallet, seed phrase card, or hardware wallet (USB device)?',
      'Have you ever participated in any cryptocurrency promotion or giveaway?',
      'Do you know anyone who might have bought crypto on your behalf?',
      'Have you ever had an account on any website that was later revealed to be a crypto exchange?',
      'Have you received any emails about "unclaimed funds" from exchanges (not spam — legitimate ones)?',
    ];
  }
}

// ============================================================================
// SINGLETON ACCESS
// ============================================================================

let cryptoScanner: CryptoRecoveryScanner | null = null;

export function getCryptoRecoveryScanner(): CryptoRecoveryScanner {
  if (!cryptoScanner) {
    cryptoScanner = new CryptoRecoveryScanner();
  }
  return cryptoScanner;
}
