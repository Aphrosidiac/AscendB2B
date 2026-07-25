'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminCreateKit, adminUpdateKit, adminGetProducts, adminListCampaigns } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { Kit, Product, PreorderCampaign } from '@/types';

interface ItemRow {
  id?: string;
  variantId: string;
  quantity: string;
}

interface KitFormProps {
  kit?: Kit;
}

export function KitForm({ kit }: KitFormProps) {
  const router = useRouter();
  const { token } = useAuth();
  const isEdit = !!kit;

  const [products, setProducts] = useState<Product[]>([]);
  const [campaigns, setCampaigns] = useState<PreorderCampaign[]>([]);
  const [name, setName] = useState(kit?.name ?? '');
  const [pricePerKit, setPricePerKit] = useState(kit ? (kit.pricePerKit / 100).toFixed(2) : '');
  const [qtyPerKit, setQtyPerKit] = useState(kit ? String(kit.qtyPerKit) : '1');
  const [campaignId, setCampaignId] = useState(kit?.campaignId ?? '');
  const [active, setActive] = useState(kit?.active ?? true);
  const [items, setItems] = useState<ItemRow[]>(
    kit?.items.map((i) => ({ id: i.id, variantId: i.variantId, quantity: String(i.quantity) })) ?? [{ variantId: '', quantity: '1' }]
  );
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    adminGetProducts(token, { limit: '200' }).then((r) => setProducts(r.data)).catch(() => {});
    adminListCampaigns(token, { limit: '200' }).then((r) => setCampaigns(r.data)).catch(() => {});
  }, [token]);

  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const addItem = () => setItems((prev) => [...prev, { variantId: '', quantity: '1' }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const validItems = items.filter((r) => r.variantId);
    if (validItems.length === 0) {
      setError('Add at least one component variant');
      return;
    }
    setSubmitting(true);
    setError('');
    const data = {
      name,
      pricePerKit: Math.round(parseFloat(pricePerKit || '0') * 100),
      qtyPerKit: parseInt(qtyPerKit, 10) || 1,
      campaignId: campaignId || null,
      active,
      items: validItems.map((r) => ({ id: r.id, variantId: r.variantId, quantity: parseInt(r.quantity, 10) || 1 })),
    };
    try {
      if (isEdit) {
        await adminUpdateKit(token, kit.id, data);
      } else {
        await adminCreateKit(token, data);
      }
      router.push('/admin/kits');
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message ?? 'Failed to save kit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link href="/admin/kits" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Kits
      </Link>

      <h1 className="font-display text-2xl font-bold mb-6">{isEdit ? kit.name : 'New Kit'}</h1>

      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border p-6 space-y-4 max-w-2xl">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />

        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Price per Kit (RM)" type="number" min="0" step="0.01" value={pricePerKit} onChange={(e) => setPricePerKit(e.target.value)} required />
          <Input label="Quantity per Kit" type="number" min={1} value={qtyPerKit} onChange={(e) => setQtyPerKit(e.target.value)} required />
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

        <label className="flex items-center gap-2 text-sm font-medium text-text-secondary cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="cursor-pointer" />
          Active
        </label>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-text-secondary">Components</label>
            <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="w-3.5 h-3.5" /> Add Component</Button>
          </div>
          <div className="space-y-2">
            {items.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={row.variantId}
                  onChange={(e) => updateItem(idx, { variantId: e.target.value })}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
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
                <input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                  className="w-20 px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button type="button" onClick={() => removeItem(idx)} className="p-2 hover:bg-red-50 rounded cursor-pointer shrink-0">
                  <Trash2 className="w-4 h-4 text-text-muted hover:text-danger" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Kit'}</Button>
      </form>
    </div>
  );
}
