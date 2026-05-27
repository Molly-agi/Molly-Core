import type { Metadata } from 'next';
import { SectionCard, SiteShell } from '../_components/site-shell';

export const metadata: Metadata = {
  title: 'Titan Echo | Benchmarks',
  description:
    'Transparent benchmark outcomes for Titan Echo vs common industry codecs.',
};

const comparisons = [
  {
    dataset: 'FLAT_1000',
    titan: '95.74% saved',
    bestIndustry: '93.24% (brotli-11)',
    delta: '+2.50 pp',
  },
  {
    dataset: 'NESTED_1000',
    titan: '95.83% saved',
    bestIndustry: '89.01% (brotli-11)',
    delta: '+6.82 pp',
  },
  {
    dataset: 'BULK_5000',
    titan: '96.95% saved',
    bestIndustry: '97.24% (brotli-11)',
    delta: '-0.29 pp',
  },
  {
    dataset: 'MOLLY_REAL',
    titan: '79.36% saved',
    bestIndustry: '84.06% (brotli-11)',
    delta: '-4.70 pp',
  },
];

export default function BenchmarksPage() {
  return (
    <SiteShell
      title="Benchmarks"
      subtitle="Performance claims are transparent and dataset-specific. The goal is credibility with researchers, not inflated promises."
    >
      <SectionCard title="Dataset Results Snapshot">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="pb-2">Dataset</th>
                <th className="pb-2">Titan Echo</th>
                <th className="pb-2">Best Industry</th>
                <th className="pb-2">Delta</th>
              </tr>
            </thead>
            <tbody className="text-slate-200">
              {comparisons.map((row) => (
                <tr key={row.dataset} className="border-t border-slate-800">
                  <td className="py-2 font-medium">{row.dataset}</td>
                  <td className="py-2">{row.titan}</td>
                  <td className="py-2">{row.bestIndustry}</td>
                  <td className="py-2">{row.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Interpretation For Buyers">
        <ul className="list-disc space-y-1 pl-5">
          <li>Titan Echo leads on structured AI memory datasets</li>
          <li>Titan Echo remains competitive on high-volume bulk payloads</li>
          <li>Some datasets favor max-level byte codecs on raw ratio only</li>
          <li>Titan Echo benchmark outputs include episodic recall integrity</li>
        </ul>
      </SectionCard>

      <SectionCard title="Evidence Files">
        <p>
          Full benchmark tables, highlight CSVs, and proposal assets are packaged
          in
          {' '}
          <span className="font-medium text-slate-100">
            stuff/ROBERT_SEND_PACKAGE_2026_05_26
          </span>
          .
        </p>
      </SectionCard>
    </SiteShell>
  );
}