'use client';
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState(process.env.NEXT_PUBLIC_TENANT_SLUG || '');
  const [tenantName, setTenantName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password, tenantSlug);
      } else {
        await register(email, password, tenantSlug, tenantName || undefined);
      }
      router.push('/apply');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen py-8">
      <div className="surface-shell flex items-center justify-center">
        <section className="surface-panel grid w-full max-w-6xl overflow-hidden lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-white/10 px-6 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:py-10">
            <span className="surface-kicker">Operator Access</span>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold tracking-tight text-white">
              {mode === 'login' ? 'Access the funding operations console.' : 'Create a new organization workspace.'}
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-7 text-slate-300">
              Keep the same premium surface across auth and intake: dark panels, clean hierarchy,
              and stronger trust signals for every operator touchpoint.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="surface-stat">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Mode</p>
                <p className="mt-2 text-lg font-semibold text-white">Secure</p>
              </div>
              <div className="surface-stat">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Session</p>
                <p className="mt-2 text-lg font-semibold text-white">Tenant scoped</p>
              </div>
              <div className="surface-stat">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Flow</p>
                <p className="mt-2 text-lg font-semibold text-white">Low friction</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-8 lg:px-10 lg:py-10">
            <div className="surface-panel-soft p-6 sm:p-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-300">Business Funding Portal</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                {mode === 'login' ? 'Agent Login' : 'Create Account'}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {mode === 'login' ? 'Sign in to continue managing applications.' : 'Set up access for a new organization.'}
              </p>

              <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-4">
                <Input
                  label="Email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
                <Input
                  label="Password"
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  hint="Minimum 8 characters"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <Input
                  label="Organization Slug"
                  required
                  value={tenantSlug}
                  onChange={(e) => setTenantSlug(e.target.value)}
                  hint="Your organization identifier"
                />
                {mode === 'register' && (
                  <Input
                    label="Organization Name"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    hint="Required for new organizations"
                  />
                )}

                {error && <p className="text-sm text-red-400">{error}</p>}

                <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">
                  {mode === 'login' ? 'Sign In' : 'Create Account'}
                </Button>
              </form>

              <p className="mt-5 text-center text-sm text-slate-400">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                  className="font-medium text-cyan-300 transition hover:text-cyan-200 hover:underline"
                >
                  {mode === 'login' ? 'Register' : 'Sign In'}
                </button>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

