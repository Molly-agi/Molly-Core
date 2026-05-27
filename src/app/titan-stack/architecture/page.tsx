import type { Metadata } from 'next';
import { SectionCard, SiteShell } from '../_components/site-shell';

export const metadata: Metadata = {
  title: 'Titan Echo | Architecture',
  description:
    'Architecture and integration model for Titan Echo AI memory compression.',
};

export default function ArchitecturePage() {
  return (
    <SiteShell
      title="Architecture"
      subtitle="Titan Echo is positioned as a memory-pipeline layer for AI systems, not a drop-in replacement for every byte codec workload."
    >
      <SectionCard title="Core Pipeline Stages">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Schema stripping to remove structural overhead</li>
          <li>Semantic deduplication to remove near-duplicate entries</li>
          <li>Temporal delta modeling for change-only storage</li>
          <li>Vocabulary/dictionary compression for repeated patterns</li>
          <li>Final encoded artifact with deterministic reconstruction path</li>
        </ol>
      </SectionCard>

      <SectionCard title="Integration Points">
        <ul className="list-disc space-y-1 pl-5">
          <li>Memory consolidation flows in agent backends</li>
          <li>Pre-embedding and post-retrieval memory transforms</li>
          <li>Archival layers for episodic memory stores</li>
          <li>Cost-control gates for long-context workloads</li>
        </ul>
      </SectionCard>

      <SectionCard title="Operational Positioning">
        <p>
          Titan Echo should be evaluated against business objectives: saved
          percent, recall fidelity, and end-to-end latency under production
          load. This avoids the common mistake of comparing only raw byte
          compression in isolation.
        </p>
      </SectionCard>
    </SiteShell>
  );
}