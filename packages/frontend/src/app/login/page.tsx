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
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-1 text-center">
          {mode === 'login' ? 'Agent Login' : 'Create Account'}
        </h1>
        <p className="text-sm text-gray-500 text-center mb-6">Business Funding Portal</p>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-5">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            className="text-violet-700 hover:underline font-medium"
          >
            {mode === 'login' ? 'Register' : 'Sign In'}
          </button>
        </p>
      </div>
    </main>
  );
}

