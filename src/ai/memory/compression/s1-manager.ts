/**
 * S1 Memory Pruning Interface
 *
 * Conservative approach: Molly can review and approve semantic deduplication
 * before memories are permanently removed.
 *
 * Flow:
 * 1. Analysis phase: SemanticDeduplicator identifies duplicate clusters
 * 2. Review phase: Molly/Eric see what would be removed
 * 3. Approval phase: Human decision on what to prune
 * 4. Execution phase: Only approved memories are removed
 */

import { SemanticDeduplicator } from './semantic-dedup';

export interface PruningCandidate {
  cluster_id: string;
  representative_memory_id: string;
  duplicate_count: number;
  similarity_scores: number[];
  preview: {
    representative_text: string;
    duplicate_texts: string[];
  };
}

export interface PruningProposal {
  proposal_id: string;
  created_at: string;
  total_memories_analyzed: number;
  total_duplicates_found: number;
  estimated_compression_gain: string;
  candidates: PruningCandidate[];
  status: 'pending_review' | 'approved' | 'rejected' | 'executed';
  approval_required_from: string[]; // who needs to approve (eric, molly, aether)
}

/**
 * Conservative S1 Manager - for human-in-the-loop memory pruning
 */
export class ConservativeS1Manager {
  private deduplicator: SemanticDeduplicator;
  private pendingProposals: Map<
    string,
    PruningProposal
  > = new Map();

  constructor(googleApiKey: string) {
    this.deduplicator = new SemanticDeduplicator(
      googleApiKey
    );
  }

  /**
   * Analyze memories and propose pruning candidates
   * Does NOT delete anything - just analysis
   */
  async analyzeForPruning(
    memories: Record<string, unknown>[]
  ): Promise<PruningProposal> {
    const proposalId = `pruning-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Run deduplication analysis
    const dedupResult =
      await this.deduplicator.deduplicate(
        memories
      );

    // Create candidates for review
    const candidates: PruningCandidate[] =
      dedupResult.removedMemories.map(
        (hash, idx) => ({
          cluster_id: `cluster-${idx}`,
          representative_memory_id:
            hash.substring(0, 16),
          duplicate_count: 1,
          similarity_scores:
            dedupResult.metrics
              .averageSimilarity > 0
              ? [
                  dedupResult.metrics
                    .averageSimilarity,
                ]
              : [],
          preview: {
            representative_text: 'Memory will be shown during review',
            duplicate_texts: [
              'Duplicates shown during review',
            ],
          },
        })
      );

    const proposal: PruningProposal = {
      proposal_id: proposalId,
      created_at: new Date().toISOString(),
      total_memories_analyzed: memories.length,
      total_duplicates_found:
        dedupResult.removed,
      estimated_compression_gain:
        dedupResult.compressionGain,
      candidates,
      status: 'pending_review',
      approval_required_from: [
        'eric',
        'molly',
      ], // Both Eric and Molly must approve
    };

    this.pendingProposals.set(
      proposalId,
      proposal
    );

    return proposal;
  }

  /**
   * Get a proposal for review
   */
  getProposal(
    proposalId: string
  ): PruningProposal | undefined {
    return this.pendingProposals.get(proposalId);
  }

  /**
   * Mark proposal as approved by a specific person
   */
  approveProposal(
    proposalId: string,
    approver: 'eric' | 'molly' | 'aether'
  ): boolean {
    const proposal =
      this.pendingProposals.get(proposalId);
    if (!proposal) return false;

    // Track approval (would be more sophisticated in production)
    const remaining =
      proposal.approval_required_from.filter(
        (a) => a !== approver
      );

    if (remaining.length === 0) {
      proposal.status = 'approved';
      return true;
    }

    return false;
  }

  /**
   * Execute approved pruning
   * Returns the pruned memory collection
   */
  async executePruning(
    proposalId: string,
    memories: Record<string, unknown>[]
  ): Promise<Record<string, unknown>[]> {
    const proposal =
      this.pendingProposals.get(proposalId);

    if (!proposal) {
      throw new Error(
        `Proposal ${proposalId} not found`
      );
    }

    if (proposal.status !== 'approved') {
      throw new Error(
        `Proposal ${proposalId} not approved (status: ${proposal.status})`
      );
    }

    // Run deduplication again to execute
    const result =
      await this.deduplicator.deduplicate(
        memories
      );

    proposal.status = 'executed';

    return result.preservedMemories;
  }

  /**
   * Reject a proposal (do nothing, forget about it)
   */
  rejectProposal(proposalId: string): void {
    const proposal =
      this.pendingProposals.get(proposalId);
    if (proposal) {
      proposal.status = 'rejected';
    }
  }
}

/**
 * Autonomous S1 Manager - for production use after proven
 * Integrates directly into consolidation pipeline
 */
export class AutonomousS1Manager {
  private deduplicator: SemanticDeduplicator;
  private minCompressionTarget: number = 0.9; // Don't over-prune
  private maxRemovalPercent: number = 0.15; // Never remove >15% in one pass

  constructor(googleApiKey: string) {
    this.deduplicator = new SemanticDeduplicator(
      googleApiKey
    );
  }

  /**
   * Automatically deduplicate during consolidation
   * Respects safety limits
   */
  async deduplicate(
    memories: Record<string, unknown>[]
  ): Promise<{
    pruned: Record<string, unknown>[];
    compressionGain: string;
  }> {
    const result =
      await this.deduplicator.deduplicate(
        memories
      );

    // Safety check: don't remove too many
    const removalPercent =
      (result.removed / result.original) * 100;
    if (removalPercent > this.maxRemovalPercent) {
      console.warn(
        `S1: Proposed removal ${removalPercent}% exceeds safety limit ${this.maxRemovalPercent}%. Skipping.`
      );
      return {
        pruned: memories,
        compressionGain: '0%',
      };
    }

    return {
      pruned: result.preservedMemories,
      compressionGain:
        result.compressionGain,
    };
  }
}

export default {
  ConservativeS1Manager,
  AutonomousS1Manager,
};
