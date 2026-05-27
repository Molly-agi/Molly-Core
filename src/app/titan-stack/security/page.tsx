import type { Metadata } from 'next';
import { SectionCard, SiteShell } from '../_components/site-shell';

export const metadata: Metadata = {
  title: 'Titan Echo | Security',
  description: 'Security posture and deployment boundaries for Titan Echo.',
};

export default function SecurityPage() {
  return (
    <SiteShell
      title="Security Posture"
      subtitle="This page gives technical buyers the boundary conditions and deployment model they need before evaluation."
    >
      <SectionCard title="Current Security Position">
        <ul className="list-disc space-y-1 pl-5">
          <li>Pilot-first engagement on anonymized datasets</li>
          <li>No production credential sharing required for initial benchmark</li>
          <li>Benchmark artifacts delivered as isolated outputs</li>
          <li>No data resale or secondary use in pilot scope</li>
        </ul>
      </SectionCard>

      <SectionCard title="Enterprise Readiness Path">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Run controlled pilot with partner-provided sample data</li>
          <li>Document integration architecture and access controls</li>
          <li>Define target hosting boundary (single tenant or on-prem)</li>
          <li>Execute legal and security checklist before production</li>
        </ol>
      </SectionCard>

      <SectionCard title="Why This Works Commercially">
        <p>
          You do not need to pass every enterprise certification before first
          validation. You need a clean, low-risk pilot model that proves value
          while reducing buyer risk. This page exists to make that explicit.
        </p>
      </SectionCard>
    </SiteShell>
  );
}