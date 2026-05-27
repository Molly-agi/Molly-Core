import Link from 'next/link';

type NavLink = {
  href: string;
  label: string;
};

const navLinks: NavLink[] = [
  { href: '/titan-stack', label: 'Overview' },
  { href: '/titan-stack/architecture', label: 'Architecture' },
  { href: '/titan-stack/benchmarks', label: 'Benchmarks' },
  { href: '/titan-stack/security', label: 'Security' },
  { href: '/titan-stack/deploy', label: 'Deploy' },
  { href: '/titan-stack/contact', label: 'Contact' },
];

export function SiteShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-2xl border border-sky-800/30 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950 p-6 shadow-2xl shadow-sky-950/40 sm:p-8">
          <div className="mb-6 flex flex-wrap gap-2 text-xs uppercase tracking-wide text-slate-300">
            <span className="rounded-full border border-sky-700/60 bg-sky-500/10 px-3 py-1">
              Titan Echo
            </span>
            <span className="rounded-full border border-emerald-700/60 bg-emerald-500/10 px-3 py-1">
              AI Memory Compression
            </span>
            <span className="rounded-full border border-violet-700/60 bg-violet-500/10 px-3 py-1">
              Molly-Core
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm text-slate-300 sm:text-base">
            {subtitle}
          </p>
          <nav className="mt-6 flex flex-wrap gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-sky-500 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>
        <div className="mt-6 space-y-6">{children}</div>
      </div>
    </main>
  );
}

export function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 sm:p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-300">{children}</div>
    </section>
  );
}

export function MetricGrid({
  metrics,
}: {
  metrics: Array<{ label: string; value: string; note?: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-xl border border-slate-800 bg-slate-900 p-4"
        >
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {metric.label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-sky-300">{metric.value}</p>
          {metric.note ? (
            <p className="mt-2 text-xs text-slate-400">{metric.note}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}