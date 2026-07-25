'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminCreateBatch, adminUpdateBatch, adminGetProducts, adminListCampaigns } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import type { Batch, BatchStatus, Product, PreorderCampaign } from '@/types';

const STATUS_OPTIONS = [
  { value: 'INCOMING', label: 'Incoming' },
  { value: 'IN_STOCK', label: 'In Stock' },
  { value: 'DEPLETED', label: 'Depleted' },
];

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

interface BatchFormProps {
  batch?: Batch;
}

export function BatchForm({ batch }: BatchFormProps) {
  const router = useRouter();
  const { token } = useAuth();
  const isEdit = !!batch;

  const [products, setProducts] = useState<Product[]>([]);
  const [campaigns, setCampaigns] = useState<PreorderCampaign[]>([]);
  const [variantId, setVariantId] = useState(batch?.variantId ?? '');
  const [campaignId, setCampaignId] = useState(batch?.campaignId ?? '');
  const [batchNumber, setBatchNumber] = useState(batch?.batchNumber ?? '');
  const [expiry, setExpiry] = useState(batch ? toDateInputValue(batch.expiry) : '');
  const [coaUrl, setCoaUrl] = useState(batch?.coaUrl ?? '');
  const [quantity, setQuantity] = useState(batch ? String(batch.quantity) : '0');
  const [status, setStatus] = useState<BatchStatus>(batch?.status ?? 'INCOMING');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    adminGetProducts(token, { limit: '200' }).then((r) => setProducts(r.data)).catch(() => {});
    adminListCampaigns(token, { limit: '200' }).then((r) => setCampaigns(r.data)).catch(() => {});
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError('');
    const data = {
      variantId,
      campaignId: campaignId || null,
      batchNumber,
      expiry: new Date(expiry).toISOString(),
      coaUrl: coaUrl || null,
      quantity: parseInt(quantity, 10) || 0,
      status,
    };
    try {
      if (isEdit) {
        await adminUpdateBatch(token, batch.id, data);
        router.push('/admin/batches');
      } else {
        await adminCreateBatch(token, data);
        router.push('/admin/batches');
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message ?? 'Failed to save batch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link href="/admin/batches" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Batches
      </Link>

      <h1 className="font-display text-2xl font-bold mb-6">{isEdit ? `Batch ${batch.batchNumber}` : 'New Batch'}</h1>

      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border p-6 space-y-4 max-w-xl">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Variant</label>
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">Select a variant...</option>
            {products.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.variants.map((v) => (
                  <option key={v.id} value={v.id}>{p.name} {v.size ?? ''} ({v.code})</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Campaign (optional)</label>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          >
            <option value="">None</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <Input label="Batch Number" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} required />

        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Expiry" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} required />
          <Input label="Quantity" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </div>

        <Input label="COA URL (optional)" value={coaUrl} onChange={(e) => setCoaUrl(e.target.value)} placeholder="https://..." />

        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as BatchStatus)} options={STATUS_OPTIONS} />

        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting || !variantId}>{submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Batch'}</Button>
      </form>
    </div>
  );
}
