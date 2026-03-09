'use client';
import { useAuth } from '@/hooks/useAuth';
import { MultiStepForm } from '@/components/form/MultiStepForm';

export default function ApplyPage() {
  const { token } = useAuth();

  return (
    <main className="min-h-screen py-4 sm:py-6">
      <div className="surface-shell max-w-5xl">
        <section className="surface-panel px-5 py-6 sm:px-8 sm:py-8">
          <MultiStepForm token={token} />
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

