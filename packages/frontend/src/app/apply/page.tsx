'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { MultiStepForm } from '@/components/form/MultiStepForm';

export default function ApplyPage() {
  const router = useRouter();
  const { token, loading } = useAuth();

  useEffect(() => {
    if (!loading && !token) {
      router.replace('/login');
    }
  }, [token, loading, router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-white text-sm animate-pulse">Loading...</div>
      </main>
    );
  }

  if (!token) return null;

  return (
    <main className="min-h-screen py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Business Funding Application</h1>
          <p className="text-violet-200 text-sm mt-1">
            To ensure a prompt response, please fill in all fields accurately.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-violet-100/90 rounded-2xl shadow-2xl p-6 sm:p-8">
          <MultiStepForm token={token} />
        </div>

        {/* Privacy notice */}
        <p className="text-center text-xs text-violet-300 mt-4 px-4">
          🔒 Your data is encrypted in transit and at rest. We log field interaction times to
          improve form usability and detect fraud, as disclosed in our Privacy Policy.
          This application complies with GLBA, ESIGN Act, and UETA.
        </p>
      </div>
    </main>
  );
}

