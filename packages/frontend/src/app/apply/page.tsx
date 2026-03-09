'use client';
import { useAuth } from '@/hooks/useAuth';
import { MultiStepForm } from '@/components/form/MultiStepForm';

const intakeStats = [
  { label: 'Flow', value: '5 Steps' },
  { label: 'Autosave', value: 'Active' },
  { label: 'Transport', value: 'Encrypted' },
];

export default function ApplyPage() {
  const { token } = useAuth();

  return (
    <main className="min-h-screen py-8">
      <div className="surface-shell max-w-6xl">
        <section className="surface-panel grid gap-5 px-6 py-7 sm:px-8 lg:grid-cols-[minmax(0,1.2fr)_320px]">
          <div>
            <span className="surface-kicker">Funding Intake</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Complete your application inside a cleaner, higher-trust workflow.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
              To ensure a prompt response, fill in each section accurately. Your progress is saved
              automatically as you move through the form.
            </p>
          </div>

          <aside className="surface-panel-soft p-5">
            <p className="text-[10px] uppercase tracking-[0.3em] text-cyan-300">Application status</p>
            <div className="mt-4 grid gap-3">
              {intakeStats.map((item) => (
                <div key={item.label} className="surface-stat flex items-center justify-between gap-4 p-4">
                  <span className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{item.label}</span>
                  <span className="text-sm font-semibold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section className="surface-panel mt-6 px-5 py-6 sm:px-8 sm:py-8">
          <MultiStepForm token={token} />
        </section>

        <p className="mt-4 px-3 text-center text-xs leading-6 text-slate-400">
          🔒 Your data is encrypted in transit and at rest. We log field interaction timing to
          improve usability and detect fraud, as disclosed in our Privacy Policy. This flow is
          designed to support GLBA, ESIGN Act, and UETA compliance requirements.
        </p>
      </div>
    </main>
  );
}

