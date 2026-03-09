import Link from 'next/link';

const stats = [
  {
    label: 'application surface',
    value: 'Live',
    detail: 'Fast intake flow with secure autosave and cleaner step completion.',
  },
  {
    label: 'document readiness',
    value: 'High-signal',
    detail: 'Built to support structured funding workflows without noisy UI chrome.',
  },
  {
    label: 'operator visibility',
    value: 'Unified',
    detail: 'A premium shell that feels closer to an operations product than a generic form.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen py-6 sm:py-8">
      <div className="surface-shell flex flex-col gap-6">
        <header className="surface-panel flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-cyan-300">FormFiller</p>
              <p className="text-sm font-semibold text-white">Premium Application Surface</p>
            </div>
            <span className="surface-kicker">Live UI Direction</span>
          </div>
          <nav className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
            <span>Overview</span>
            <span>Apply</span>
            <span>Login</span>
            <span>Funding Workflow</span>
          </nav>
        </header>

        <section className="surface-panel grid gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1.35fr)_360px] lg:px-8 lg:py-10">
          <div className="max-w-3xl">
            <span className="surface-kicker">Executive Surface</span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              One premium funding UI across every FormFiller touchpoint.
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              Dark, precise, and operations-driven. The goal is a product surface that feels
              modern and high-trust instead of a generic lending form.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/apply"
                className="inline-flex items-center justify-center rounded-xl border border-cyan-400/40 bg-[linear-gradient(135deg,rgba(34,211,238,0.22),rgba(59,130,246,0.38)_45%,rgba(15,23,42,0.92))] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(34,211,238,0.18)] transition hover:brightness-110"
              >
                Launch application flow
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-white/20 hover:bg-white/[0.08]"
              >
                Open operator access
              </Link>
            </div>
          </div>

          <aside className="surface-panel-soft p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Live product shell</p>
                <h2 className="mt-2 text-lg font-semibold text-white">Current dashboard direction</h2>
              </div>
              <span className="surface-kicker">Stable</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="surface-stat">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Primary mode</p>
                <p className="mt-2 text-2xl font-semibold text-white">Dark</p>
              </div>
              <div className="surface-stat">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Visual tone</p>
                <p className="mt-2 text-2xl font-semibold text-white">Premium</p>
              </div>
              <div className="surface-stat">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Shell style</p>
                <p className="mt-2 text-2xl font-semibold text-white">Glass</p>
              </div>
              <div className="surface-stat">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Signal</p>
                <p className="mt-2 text-2xl font-semibold text-white">Clean</p>
              </div>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className="surface-panel-soft p-5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-400">{stat.label}</p>
              <div className="mt-4 flex items-start justify-between gap-4">
                <p className="text-2xl font-semibold text-white">{stat.value}</p>
                <span className="text-cyan-300">↗</span>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-400">{stat.detail}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

