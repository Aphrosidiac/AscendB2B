'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminGetCompany, adminUpdateCompany } from '@/lib/api';
import { formatPrice, formatDate } from '@/lib/utils';
import { CREDIT_TERMS_LABELS, COMPANY_ORDER_STATUS_LABELS, COMPANY_ORDER_STATUS_COLORS } from '@/lib/constants';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { AdminCompany, CreditTerms } from '@/types';

const CREDIT_TERMS_OPTIONS: { value: CreditTerms; label: string }[] = (['PREPAID', 'NET15', 'NET30', 'NET60'] as const).map((v) => ({ value: v, label: CREDIT_TERMS_LABELS[v] }));

export default function AdminCompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();

  const [company, setCompany] = useState<AdminCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [creditTerms, setCreditTerms] = useState<CreditTerms>('PREPAID');
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    if (!token) return;
    adminGetCompany(token, params.id)
      .then((c) => {
        setCompany(c);
        setName(c.name);
        setTaxId(c.taxId ?? '');
        setContactName(c.contactName);
        setPhone(c.phone);
        setEmail(c.email);
        setCreditTerms(c.creditTerms);
      })
      .catch(() => setError('Company not found'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, params.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setSubmitting(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      await adminUpdateCompany(token, company.id, {
        name,
        taxId: taxId || null,
        contactName,
        phone,
        email,
        creditTerms,
      });
      setSaveSuccess(true);
      load();
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string; message?: string } } }).response?.data?.error ?? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setSaveError(message ?? 'Failed to save company');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <p className="text-sm text-text-secondary">Loading company...</p>;

  if (error || !company) {
    return (
      <div>
        <Link href="/admin/companies" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Companies
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Company not found'}</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/admin/companies" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Companies
      </Link>

      <h1 className="font-display text-2xl font-bold mb-1">{company.name}</h1>
      <p className="text-sm text-text-muted mb-6">Joined {formatDate(company.createdAt)}</p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Orders</p>
          <p className="font-display text-2xl font-bold">{company._count?.orders ?? 0}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Quotations</p>
          <p className="font-display text-2xl font-bold">{company._count?.quotations ?? 0}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Lifetime Order Value</p>
          <p className="font-display text-2xl font-bold">{formatPrice(company.lifetimeOrderValue ?? 0)}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <form onSubmit={handleSave} className="bg-surface rounded-xl border border-border p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Company Details</h2>
            <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
            <Input label="Tax ID (optional)" value={taxId} onChange={(e) => setTaxId(e.target.value)} />
            <Input label="Contact Name" value={contactName} onChange={(e) => setContactName(e.target.value)} required />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Select
              label="Credit Terms"
              value={creditTerms}
              onChange={(e) => setCreditTerms(e.target.value as CreditTerms)}
              options={CREDIT_TERMS_OPTIONS}
            />
            <p className="text-xs text-text-muted">
              Raising credit terms off Prepaid <span className="font-medium text-text-secondary">is</span> the credit-approval mechanism — there is no separate approval flag.
            </p>
            {saveError && <p className="text-sm text-danger">{saveError}</p>}
            {saveSuccess && <p className="text-sm text-success">Saved.</p>}
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Save Changes'}</Button>
          </form>

          <div className="bg-surface rounded-xl border border-border p-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-text-muted" />
              <h2 className="font-display font-semibold text-lg">Addresses</h2>
            </div>
            {(company.addresses ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">No saved addresses.</p>
            ) : (
              <div className="space-y-3">
                {company.addresses!.map((a) => (
                  <div key={a.id} className="text-sm border-b border-border last:border-0 pb-3 last:pb-0">
                    <p className="font-medium">{a.label} <span className="text-xs text-text-muted font-normal">({a.type})</span></p>
                    <p className="text-text-secondary">{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postcode}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-border p-6">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingBag className="w-4 h-4 text-text-muted" />
            <h2 className="font-display font-semibold text-lg">Recent Orders</h2>
          </div>
          {(company.recentOrders ?? []).length === 0 ? (
            <p className="text-sm text-text-muted">No orders yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {company.recentOrders!.map((o) => (
                <Link key={o.id} href={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 hover:opacity-80 transition-opacity">
                  <div>
                    <p className="text-sm font-medium">{o.orderNumber}</p>
                    <p className="text-xs text-text-muted">{formatDate(o.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{formatPrice(o.total)}</span>
                    <Badge className={COMPANY_ORDER_STATUS_COLORS[o.status]}>{COMPANY_ORDER_STATUS_LABELS[o.status]}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
