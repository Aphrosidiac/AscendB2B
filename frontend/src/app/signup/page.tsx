'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { companySignup } from '@/lib/api';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Animate } from '@/components/ui/Animate';

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
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-background px-4 py-12">
      <Animate variant="fadeUp" duration={0.5} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center mx-auto mb-4">
            <Building2 className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold">Create a Business Account</h1>
          <p className="text-sm text-text-secondary mt-1">Sign up to see bulk pricing and place orders on trade terms.</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="bg-surface rounded-xl border border-border p-6 space-y-4">
          <Input label="Company Name" id="name" value={form.name} onChange={(e) => updateField('name', e.target.value)} error={fieldErrors.name} required />
          <Input label="Business Registration No. (optional)" id="taxId" value={form.taxId} onChange={(e) => updateField('taxId', e.target.value)} error={fieldErrors.taxId} />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Contact Name" id="contactName" value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} error={fieldErrors.contactName} required />
            <Input label="Phone Number" id="phone" type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} placeholder="012-3456789" error={fieldErrors.phone} required />
          </div>
          <Input label="Email" id="email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} error={fieldErrors.email} required />
          <Input label="Password" id="password" type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} error={fieldErrors.password} required />
          {error && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </Button>
          <p className="text-sm text-text-secondary text-center">
            Already have an account? <Link href="/login" className="text-text-primary font-medium hover:underline">Sign in</Link>
          </p>
        </form>
      </Animate>
    </div>
  );
}
