'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Mail, Lock } from 'lucide-react';
import { companyLogin } from '@/lib/api';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Animate } from '@/components/ui/Animate';
import { MolecularNetwork } from '@/components/ui/MolecularNetwork';

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
    // Same dark-hero treatment as /admin/login and the homepage: bg-primary
    // + the animated molecular network canvas. This is the first thing a new
    // trade customer sees, so it gets the same identity as every other
    // gateway on the site rather than a plain form on a flat background.
    <div className="min-h-[calc(100vh-4rem)] bg-primary relative overflow-hidden flex items-center justify-center px-4 py-12">
      <MolecularNetwork className="absolute inset-0 w-full h-full" />

      <div className="relative z-10 w-full max-w-sm">
        <Animate variant="fade" duration={0.7}>
          <div className="flex flex-col items-center gap-3 mb-8">
            <Image src="/images/pill-icon.png" alt="" width={40} height={40} className="invert" />
            <div className="text-center">
              <h1 className="font-display text-2xl font-bold text-white tracking-tight">ASCEND</h1>
              <p className="text-sm text-white/50 mt-0.5">Business Account</p>
            </div>
          </div>
        </Animate>

        <Animate variant="fadeUp" delay={0.15} duration={0.6}>
          <form onSubmit={handleSubmit} className="bg-white/95 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="text-center">
              <h2 className="font-display text-lg font-bold text-text-primary">Welcome back</h2>
              <p className="text-sm text-text-muted mt-1">Sign in to your business account</p>
            </div>

            <div className="space-y-4">
              <Input
                icon={Mail}
                label="Email"
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
              <Input
                icon={Lock}
                label="Password"
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <p className="text-sm text-danger text-center">{error}</p>}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
            <p className="text-sm text-text-muted text-center">
              Don&apos;t have an account? <Link href="/signup" className="text-text-primary font-medium hover:underline">Create one</Link>
            </p>
          </form>
        </Animate>
      </div>
    </div>
  );
}
