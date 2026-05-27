import type { Metadata } from 'next';
import Link from 'next/link';
import { MetricGrid, SectionCard, SiteShell } from './_components/site-shell';

export const metadata: Metadata = {
  title: 'Titan Echo | Compression Platform',
  description:
    'Multi-page front door for Titan Echo AI memory compression, benchmark evidence, deployment stack, and partner onboarding.',
};

const primaryMetrics = [
  { label: 'Best Compression', value: '97.0%', note: 'BULK_5000 dataset' },
  { label: 'Real Memory Set', value: '79.4%', note: '535 restored records' },
  { label: 'Episodic Recall', value: '100%', note: 'Titan benchmark output' },
  { label: 'Pilot Turnaround', value: '48h', note: 'Fixed-scope benchmark pilot' },
];

export default function TitanStackOverviewPage() {
  return (
    <SiteShell
      title="Titan Echo Platform Site"
      subtitle="A complete front door for researchers, buyers, and technical reviewers. This is built as a real multi-page stack: proof, architecture, security posture, deployment path, and contact workflow."
    >
      <MetricGrid metrics={primaryMetrics} />

      <SectionCard title="Why This Is Not A One-Page Pitch">
        <p>
          Enterprise and research buyers expect structured diligence, not a single
          marketing splash. This site is organized so each stakeholder gets what
          they need without extra calls.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Leadership: business impact and adoption path</li>
          <li>Engineering: architecture and integration model</li>
          <li>Security: controls, boundaries, and deployment constraints</li>
          <li>Research: benchmark evidence and reproducibility scope</li>
        </ul>
      </SectionCard>

      <SectionCard title="Buyer Journey (Minimal Friction)">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Review benchmark summary and dataset breakdown</li>
          <li>Map Titan Echo into existing memory pipeline</li>
          <li>Run 48-hour pilot on buyer data</li>
          <li>Decide go/no-go from measured results</li>
        </ol>
        <div className="pt-2">
          <Link
            href="/titan-stack/contact"
            className="inline-flex rounded-lg border border-sky-500 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-200 transition hover:bg-sky-500/20"
          >
            Open Pilot Intake
          </Link>
        </div>
      </SectionCard>

      <SectionCard title="Assets Ready To Share Now">
        <ul className="list-disc space-y-1 pl-5">
          <li>CSV benchmark tables and highlight sheets</li>
          <li>Technical researcher brief</li>
          <li>Executive summary and formal pilot proposal</li>
          <li>HTML visual summary for non-technical forwarding</li>
        </ul>
        <p>
          These files are already packaged in
          {' '}
          <span className="font-medium text-slate-100">
            stuff/ROBERT_SEND_PACKAGE_2026_05_26
          </span>
          {' '}
          and can be attached by text or email immediately.
        </p>
      </SectionCard>
    </SiteShell>
  );
}