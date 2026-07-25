'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, MapPin, Pencil, Trash2, Plus, X } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { companyListAddresses, companyCreateAddress, companyUpdateAddress, companyDeleteAddress } from '@/lib/api';
import { MALAYSIAN_STATES } from '@/lib/constants';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Animate, Stagger } from '@/components/ui/Animate';
import { FadeSwap } from '@/components/orders/FadeSwap';
import type { CompanyAddress, CompanyAddressType } from '@/types';

const TYPE_OPTIONS: { value: CompanyAddressType; label: string }[] = [
  { value: 'BOTH', label: 'Billing & Shipping' },
  { value: 'SHIPPING', label: 'Shipping only' },
  { value: 'BILLING', label: 'Billing only' },
];

const TYPE_LABELS: Record<CompanyAddressType, string> = {
  BOTH: 'Billing & Shipping',
  SHIPPING: 'Shipping only',
  BILLING: 'Billing only',
};

const emptyForm = {
  label: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  postcode: '',
  type: 'BOTH' as CompanyAddressType,
};

function apiErrorMessage(err: unknown): string | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const data = (err as { response?: { data?: { message?: string; error?: string } } }).response?.data;
  return data?.message || data?.error;
}

export default function AddressesPage() {
  const router = useRouter();
  const { token, loading: authLoading, isAuthenticated } = useCompanyAuth();
  const [addresses, setAddresses] = useState<CompanyAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listError, setListError] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push('/login?redirect=/account/addresses');
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) return;
    companyListAddresses(token)
      .then(setAddresses)
      .catch(() => setListError('Failed to load addresses'))
      .finally(() => setLoading(false));
  }, [token]);

  if (authLoading || !isAuthenticated) return null;

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  };

  const openEditForm = (address: CompanyAddress) => {
    setEditingId(address.id);
    setForm({
      label: address.label,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      state: address.state,
      postcode: address.postcode,
      type: address.type,
    });
    setFieldErrors({});
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFieldErrors((fe) => (fe[field] ? { ...fe, [field]: '' } : fe));
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!form.label.trim()) errors.label = 'Give this address a label, e.g. Main Warehouse';
    if (!form.line1.trim()) errors.line1 = 'Please enter the address';
    if (!form.city.trim()) errors.city = 'Please enter a city';
    if (!form.state) errors.state = 'Please select a state';
    if (!form.postcode.trim()) errors.postcode = 'Please enter a postcode';
    else if (!/^\d{5}$/.test(form.postcode.trim())) errors.postcode = 'Postcode must be 5 digits';
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const errors = validate();
    if (Object.values(errors).some(Boolean)) {
      setFieldErrors(errors);
      return;
    }
    setSaving(true);
    setFormError('');
    const payload = {
      label: form.label.trim(),
      line1: form.line1.trim(),
      line2: form.line2.trim() || undefined,
      city: form.city.trim(),
      state: form.state,
      postcode: form.postcode.trim(),
      type: form.type,
    };
    try {
      if (editingId) {
        const updated = await companyUpdateAddress(token, editingId, payload);
        setAddresses((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      } else {
        const created = await companyCreateAddress(token, payload);
        setAddresses((prev) => [created, ...prev]);
      }
      setFormOpen(false);
    } catch (err: unknown) {
      setFormError(apiErrorMessage(err) || 'Failed to save address. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    setListError('');
    setDeletingId(id);
    try {
      await companyDeleteAddress(token, id);
      setAddresses((prev) => prev.filter((a) => a.id !== id));
    } catch (err: unknown) {
      setListError(apiErrorMessage(err) || 'Failed to delete address');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Account
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-display text-3xl font-bold">Saved Addresses</h1>
          {!formOpen && (
            <Button size="sm" onClick={openAddForm}>
              <Plus className="w-4 h-4" /> Add Address
            </Button>
          )}
        </div>
      </Animate>

      {formOpen && (
        <Animate variant="fadeUp" duration={0.3} className="mb-6">
          <form onSubmit={handleSubmit} noValidate className="bg-surface rounded-xl border border-border p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg">{editingId ? 'Edit Address' : 'New Address'}</h2>
              <button type="button" onClick={closeForm} className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer">
                <X className="w-4 h-4 text-text-muted" />
              </button>
            </div>
            <Input label="Label" id="label" placeholder="e.g. Main Warehouse" value={form.label} onChange={(e) => updateField('label', e.target.value)} error={fieldErrors.label} required />
            <Input label="Address Line 1" id="line1" value={form.line1} onChange={(e) => updateField('line1', e.target.value)} error={fieldErrors.line1} required />
            <Input label="Address Line 2 (optional)" id="line2" value={form.line2} onChange={(e) => updateField('line2', e.target.value)} />
            <div className="grid sm:grid-cols-3 gap-4">
              <Input label="City" id="city" value={form.city} onChange={(e) => updateField('city', e.target.value)} error={fieldErrors.city} required />
              <Select
                label="State"
                id="state"
                value={form.state}
                onChange={(e) => updateField('state', e.target.value)}
                options={MALAYSIAN_STATES.map((s) => ({ value: s, label: s }))}
                error={fieldErrors.state}
                required
              />
              <Input label="Postcode" id="postcode" value={form.postcode} onChange={(e) => updateField('postcode', e.target.value)} error={fieldErrors.postcode} required />
            </div>
            <Select
              label="Use For"
              id="type"
              value={form.type}
              onChange={(e) => updateField('type', e.target.value as CompanyAddressType)}
              options={TYPE_OPTIONS}
            />
            {formError && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{formError}</p>}
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Address'}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
            </div>
          </form>
        </Animate>
      )}

      {listError && <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-4">{listError}</p>}

      <FadeSwap swapKey={loading ? 'loading' : addresses.length}>
        {loading ? (
          <p className="text-sm text-text-secondary">Loading addresses...</p>
        ) : addresses.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
            <MapPin className="w-10 h-10 text-text-muted mx-auto mb-3" />
            <p className="text-text-secondary mb-4">No saved addresses yet.</p>
            {!formOpen && <Button size="sm" onClick={openAddForm}><Plus className="w-4 h-4" /> Add your first address</Button>}
          </div>
        ) : (
          <Stagger className="grid sm:grid-cols-2 gap-4" stagger={0.06}>
            {addresses.map((address) => (
              <div key={address.id} className="bg-surface rounded-xl border border-border p-4 sm:p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 text-text-muted shrink-0" />
                    <p className="font-display font-semibold truncate">{address.label}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium bg-surface-elevated text-text-secondary px-2 py-0.5 rounded-full">
                    {TYPE_LABELS[address.type]}
                  </span>
                </div>
                <p className="text-sm text-text-secondary leading-relaxed flex-1">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}<br />
                  {address.city}, {address.state} {address.postcode}
                </p>
                <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                  <button
                    onClick={() => openEditForm(address)}
                    className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(address.id)}
                    disabled={deletingId === address.id}
                    className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-danger transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {deletingId === address.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </Stagger>
        )}
      </FadeSwap>
    </div>
  );
}
