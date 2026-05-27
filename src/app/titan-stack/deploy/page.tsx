import type { Metadata } from 'next';
import { SectionCard, SiteShell } from '../_components/site-shell';

export const metadata: Metadata = {
  title: 'Titan Echo | Deploy Stack',
  description:
    'Deployment stack, hosting paths, and go-live checklist for Titan Echo.',
};

export default function DeployPage() {
  return (
    <SiteShell
      title="Deploy Stack"
      subtitle="A practical stack layout for immediate credibility: landing, assets, pilot intake, and deploy options."
    >
      <SectionCard title="Recommended Public Stack (Fast Launch)">
        <ul className="list-disc space-y-1 pl-5">
          <li>Frontend: Next.js App Router (already in this repository)</li>
          <li>Hosting: Vercel for fast global deployment</li>
          <li>Domain: custom domain mapped to titan-facing route</li>
          <li>Intake: form-to-email or calendar link for pilot requests</li>
        </ul>
      </SectionCard>

      <SectionCard title="Download and Asset Delivery">
        <ul className="list-disc space-y-1 pl-5">
          <li>Public docs pages for overview and benchmark context</li>
          <li>Private package delivery by email for deeper artifacts</li>
          <li>Versioned benchmark snapshots for reproducibility</li>
          <li>Optional gated download path for qualified leads</li>
        </ul>
      </SectionCard>

      <SectionCard title="Go-Live Checklist">
        <ol className="list-decimal space-y-1 pl-5">
          <li>Publish this route and verify mobile rendering</li>
          <li>Add primary CTA path to pilot intake</li>
          <li>Attach benchmark package to outbound messages</li>
          <li>Run first 3 pilot conversations with same script</li>
        </ol>
      </SectionCard>
    </SiteShell>
  );
}