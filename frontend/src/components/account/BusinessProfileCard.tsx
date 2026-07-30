'use client';

import { useState } from 'react';
import { Building2, Check, TriangleAlert } from 'lucide-react';
import { companyUpdateMe } from '@/lib/api';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { CompanyProfile } from '@/types';

interface Props {
  company: CompanyProfile;
}

function apiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const data = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
  return data?.message || data?.error;
}

/**
 * The business details signup no longer asks for. Until name, contact name and
 * phone are all present the server refuses to create an order or a quotation
 * (assertProfileComplete), so this card opens itself and says so rather than
 * letting a buyer discover the block at checkout.
 */
export function BusinessProfileCard({ company }: Props) {
  const { token, refresh } = useCompanyAuth();
  const incomplete = !company.profileComplete;
  // An incomplete profile is the blocker for ordering, so the form starts open.
  const [editing, setEditing] = useState(incomplete);
  const [form, setForm] = useState({
    name: company.name ?? '',
    taxId: company.taxId ?? '',
    contactName: company.contactName ?? '',
    phone: company.phone ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const updateField = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((fe) => (fe[field] ? { ...fe, [field]: '' } : fe));
    setSaved(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Enter the registered company name';
    if (!form.contactName.trim()) errors.contactName = 'Enter a contact name';
    if (!form.phone.trim()) errors.phone = 'Enter a phone number';
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    setError('');
    try {
      await companyUpdateMe(token, {
        name: form.name.trim(),
        // Empty clears it rather than saving a blank string.
        taxId: form.taxId.trim() || null,
        contactName: form.contactName.trim(),
        phone: form.phone.trim(),
      });
      // Re-reads /companies/me so `profileComplete` and the header's company
      // label update from the server's answer, not a local guess.
      await refresh();
      setSaved(true);
      setEditing(false);
    } catch (err: unknown) {
      setError(apiErrorMessage(err) || 'Could not save your business details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className={`rounded-xl border p-5 sm:p-6 ${
        incomplete ? 'border-orange-300 bg-orange-50/60' : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          {incomplete ? (
            <TriangleAlert className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          ) : (
            <Building2 className="w-5 h-5 text-text-muted shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <h2 className="font-display font-semibold">
              {incomplete ? 'Complete your business profile' : 'Business details'}
            </h2>
            <p className="text-sm text-text-secondary mt-0.5">
              {incomplete
                ? 'We need these before you can place an order or request a quote — they go on your invoices.'
                : 'Used as the bill-to details on your invoices and quotations.'}
            </p>
          </div>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-text-secondary hover:text-text-primary transition-colors shrink-0 cursor-pointer"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Registered company name"
            id="profile-name"
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            error={fieldErrors.name}
            required
          />
          <Input
            label="Business registration no. (optional)"
            id="profile-taxId"
            value={form.taxId}
            onChange={(e) => updateField('taxId', e.target.value)}
          />
          <div className="grid sm:grid-cols-2 gap-4">
            <Input
              label="Contact name"
              id="profile-contactName"
              value={form.contactName}
              onChange={(e) => updateField('contactName', e.target.value)}
              error={fieldErrors.contactName}
              required
            />
            <Input
              label="Phone number"
              id="profile-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              placeholder="012-3456789"
              error={fieldErrors.phone}
              required
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save business details'}
            </Button>
            {/* No cancel while incomplete — there's nothing useful to go back
                to, since ordering is blocked until this is filled in. */}
            {!incomplete && (
              <Button type="button" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      ) : (
        <>
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider">Company</dt>
              <dd className="mt-0.5">{company.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider">Registration no.</dt>
              <dd className="mt-0.5">{company.taxId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider">Contact</dt>
              <dd className="mt-0.5">{company.contactName ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted uppercase tracking-wider">Phone</dt>
              <dd className="mt-0.5">{company.phone ?? '—'}</dd>
            </div>
          </dl>
          {saved && (
            <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-success">
              <Check className="w-4 h-4" /> Business details saved
            </p>
          )}
        </>
      )}
    </div>
  );
}
