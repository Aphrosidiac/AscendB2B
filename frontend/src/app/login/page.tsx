'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { companyLogin } from '@/lib/api';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Animate } from '@/components/ui/Animate';

// useSearchParams (for ?redirect=) requires a Suspense boundary in the App
// Router, even in a fully client-rendered page like this one.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useCompanyAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { token, company } = await companyLogin(email.trim(), password);
      setSession(token, company);
      // /checkout links here with ?redirect=/checkout when an anonymous
      // visitor tries to check out — send them back where they came from.
      const redirect = searchParams.get('redirect');
      router.push(redirect && redirect.startsWith('/') ? redirect : '/account');
    } catch {
      setError('Invalid email or password');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background px-4 py-12">
      <Animate variant="fadeUp" duration={0.5} className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold">Sign In</h1>
          <p className="text-sm text-text-secondary mt-1">Sign in to your business account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <Input label="Email" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input label="Password" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
          <p className="text-sm text-text-secondary text-center">
            Don&apos;t have an account? <Link href="/signup" className="text-text-primary font-medium hover:underline">Create one</Link>
          </p>
        </form>
      </Animate>
    </div>
  );
}
