import type { Metadata } from 'next';
import { SectionCard, SiteShell } from '../_components/site-shell';

export const metadata: Metadata = {
  title: 'Titan Echo | Contact',
  description: 'Pilot intake and contact flow for Titan Echo evaluations.',
};

export default function ContactPage() {
  return (
    <SiteShell
      title="Pilot Intake & Contact"
      subtitle="Use this page as the handoff destination in text messages, LinkedIn, and direct outreach."
    >
      <SectionCard title="48-Hour Pilot Offer">
        <p>
          Fixed-scope benchmark pilot on your data with clear outputs:
          compression ratio, latency, recall integrity, and rollout recommendation.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Price: $500 fixed</li>
          <li>Turnaround: 48 hours from dataset receipt</li>
          <li>Output: executive + technical report bundle</li>
        </ul>
      </SectionCard>

      <SectionCard title="What To Send First">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Dataset sample (anonymized is acceptable)</li>
          <li>Current memory/context pipeline description</li>
          <li>Target constraints (cost, latency, recall)</li>
        </ol>
      </SectionCard>

      <SectionCard title="Contact Path">
        <p>
          Email: add your live outreach inbox here (example:
          {' '}
          <span className="font-medium text-slate-100">ej@yourdomain.com</span>)
          .
        </p>
        <p>
          Upwork: link your active profile here once published.
        </p>
        <p>
          GitHub proof: Molly-agi/Molly-Core benchmark artifacts and technical
          documentation.
        </p>
      </SectionCard>
    </SiteShell>
  );
}