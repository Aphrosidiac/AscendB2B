'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Building2, Hash, User, Phone, Mail, Lock } from 'lucide-react';
import { companySignup } from '@/lib/api';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Animate } from '@/components/ui/Animate';
import { MolecularNetwork } from '@/components/ui/MolecularNetwork';

const FIELD_ORDER = ['name', 'contactName', 'phone', 'email', 'password'] as const;

// Same shape as the checkout/admin-login forms in this codebase: manual
// per-field validation into a fieldErrors record rather than a schema
// library — zod is a dependency but isn't actually used client-side
// anywhere in this repo, so this matches the established convention.
export default function SignupPage() {
  const router = useRouter();
  const { setSession } = useCompanyAuth();
  const [form, setForm] = useState({
    name: '',
    taxId: '',
    contactName: '',
    phone: '',
    email: '',
    password: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const updateField = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((fe) => (fe[field] ? { ...fe, [field]: '' } : fe));
  };

  const validateForm = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Please enter your company name';
    if (!form.contactName.trim()) errors.contactName = 'Please enter a contact name';
    if (!form.phone.trim()) errors.phone = 'Please enter a phone number';
    if (!form.email.trim()) errors.email = 'Please enter an email address';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Please enter a valid email address';
    if (!form.password) errors.password = 'Please enter a password';
    else if (form.password.length < 8) errors.password = 'Password must be at least 8 characters';
    return errors;
  };

  const apiErrorMessage = (err: unknown): string | undefined => {
    if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
    const data = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
    return data?.message || data?.error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateForm();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      const first = FIELD_ORDER.find((f) => errors[f]);
      if (first) document.getElementById(first)?.focus();
      return;
    }
    setFieldErrors({});
    setError('');
    setLoading(true);
    try {
      const { token, company } = await companySignup({
        name: form.name.trim(),
        taxId: form.taxId.trim() || undefined,
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setSession(token, company);
      router.push('/account');
    } catch (err: unknown) {
      setError(apiErrorMessage(err) || 'Failed to create account. Please try again.');
      setLoading(false);
    }
  };

  return (
    // Same dark-hero identity as /login and /admin/login — a new trade
    // account is the start of the relationship, not a lesser gateway than
    // the internal admin login.
    <div className="min-h-[calc(100vh-4rem)] bg-primary relative overflow-hidden flex items-center justify-center px-4 py-12">
      <MolecularNetwork className="absolute inset-0 w-full h-full" />

      <div className="relative z-10 w-full max-w-md">
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
          <form onSubmit={handleSubmit} noValidate className="bg-white/95 backdrop-blur-sm rounded-2xl border border-white/10 shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="text-center">
              <h2 className="font-display text-lg font-bold text-text-primary">Create a Business Account</h2>
              <p className="text-sm text-text-muted mt-1">Sign up to see bulk pricing and place orders on trade terms.</p>
            </div>

            <div className="space-y-4">
              <Input icon={Building2} label="Company Name" id="name" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={fieldErrors.name} required />
              <Input icon={Hash} label="Business Registration No. (optional)" id="taxId" value={form.taxId} onChange={(e) => updateField('taxId', e.target.value)} error={fieldErrors.taxId} />
              <div className="grid sm:grid-cols-2 gap-4">
                <Input icon={User} label="Contact Name" id="contactName" value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} error={fieldErrors.contactName} required />
                <Input icon={Phone} label="Phone Number" id="phone" type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="012-3456789" error={fieldErrors.phone} required />
              </div>
              <Input icon={Mail} label="Email" id="email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={fieldErrors.email} autoComplete="username" required />
              <Input icon={Lock} label="Password" id="password" type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} error={fieldErrors.password} autoComplete="new-password" required />
            </div>

            {error && <p className="text-sm text-danger text-center">{error}</p>}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
            <p className="text-sm text-text-muted text-center">
              Already have an account? <Link href="/login" className="text-text-primary font-medium hover:underline">Sign in</Link>
            </p>
          </form>
        </Animate>
      </div>
    </div>
  );
}
