'use client';

import dynamic from 'next/dynamic';

const ApplyFormClient = dynamic(
  () => import('@/components/form/ApplyFormClient').then((mod) => mod.ApplyFormClient),
  {
    ssr: false,
    loading: () => (
      <div className="surface-panel-soft py-12 text-center text-sm text-slate-400">
        Loading application form…
      </div>
    ),
  }
);

export default function ApplyPage() {
  return (
    <main className="min-h-screen py-4 sm:py-6">
      <div className="surface-shell max-w-5xl">
        <section className="surface-panel px-5 py-6 sm:px-8 sm:py-8">
          <ApplyFormClient />
        </section>

        <p className="mt-4 px-2 text-center text-xs leading-6 text-slate-400">
          🔒 Your data is encrypted in transit and at rest. We log field interaction timing to
          improve usability and detect fraud, as disclosed in our Privacy Policy. This flow is
          designed to support GLBA, ESIGN Act, and UETA compliance requirements.
        </p>
      </div>
    </main>
  );
}

