'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Layers, PackagePlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminCreateCampaign, adminUpdateCampaign } from '@/lib/api';
import { formatDate, formatPrice } from '@/lib/utils';
import { CAMPAIGN_STATUS_LABELS, BATCH_STATUS_LABELS, BATCH_STATUS_COLORS } from '@/lib/constants';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { PreorderCampaign, CampaignStatus } from '@/types';

const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = (['DRAFT', 'OPEN', 'CLOSED', 'SOLD_OUT'] as const).map((v) => ({ value: v, label: CAMPAIGN_STATUS_LABELS[v] }));

// datetime-local inputs need "YYYY-MM-DDTHH:mm" (no seconds/timezone) — the
// schema's z.string().datetime() wants a full ISO string back, so this pair
// of helpers is the only place that conversion happens.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface CampaignFormProps {
  campaign?: PreorderCampaign;
  onSaved?: () => void;
}

export function CampaignForm({ campaign, onSaved }: CampaignFormProps) {
  const router = useRouter();
  const { token } = useAuth();
  const isEdit = !!campaign;

  const [name, setName] = useState(campaign?.name ?? '');
  const [opensAt, setOpensAt] = useState(campaign ? toLocalInputValue(campaign.opensAt) : '');
  const [closesAt, setClosesAt] = useState(campaign ? toLocalInputValue(campaign.closesAt) : '');
  const [estimatedArrival, setEstimatedArrival] = useState(campaign ? toLocalInputValue(campaign.estimatedArrival) : '');
  const [status, setStatus] = useState<CampaignStatus>(campaign?.status ?? 'DRAFT');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError('');
    const data = {
      name,
      opensAt: new Date(opensAt).toISOString(),
      closesAt: new Date(closesAt).toISOString(),
      estimatedArrival: new Date(estimatedArrival).toISOString(),
      status,
    };
    try {
      if (isEdit) {
        await adminUpdateCampaign(token, campaign.id, data);
        onSaved?.();
      } else {
        const created = await adminCreateCampaign(token, data);
        router.push(`/admin/campaigns/${created.id}`);
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(message ?? 'Failed to save campaign');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link href="/admin/campaigns" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Campaigns
      </Link>

      <h1 className="font-display text-2xl font-bold mb-6">{isEdit ? campaign.name : 'New Campaign'}</h1>

      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border p-6 space-y-4 max-w-xl mb-8">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <div className="grid sm:grid-cols-3 gap-4">
          <Input label="Opens At" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} required />
          <Input label="Closes At" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} required />
          <Input label="Estimated Arrival" type="datetime-local" value={estimatedArrival} onChange={(e) => setEstimatedArrival(e.target.value)} required />
        </div>
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value as CampaignStatus)} options={STATUS_OPTIONS} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Campaign'}</Button>
      </form>

      {isEdit && (
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-text-muted" />
              <h2 className="font-display font-semibold">Batches ({campaign.batches?.length ?? 0})</h2>
            </div>
            {(campaign.batches ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">No batches attached to this campaign yet.</p>
            ) : (
              <div className="bg-surface rounded-xl border border-border divide-y divide-border">
                {campaign.batches!.map((b) => (
                  <Link key={b.id} href={`/admin/batches/${b.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-surface-elevated/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{b.variant?.product.name} {b.variant?.size}</p>
                      <p className="text-xs text-text-muted">{b.batchNumber} &middot; Exp {formatDate(b.expiry)}</p>
                    </div>
                    <Badge className={BATCH_STATUS_COLORS[b.status]}>{BATCH_STATUS_LABELS[b.status]}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <PackagePlus className="w-4 h-4 text-text-muted" />
              <h2 className="font-display font-semibold">Kits ({campaign.kits?.length ?? 0})</h2>
            </div>
            {(campaign.kits ?? []).length === 0 ? (
              <p className="text-sm text-text-muted">No kits attached to this campaign yet.</p>
            ) : (
              <div className="bg-surface rounded-xl border border-border divide-y divide-border">
                {campaign.kits!.map((k) => (
                  <Link key={k.id} href={`/admin/kits/${k.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-surface-elevated/50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{k.name}</p>
                      <p className="text-xs text-text-muted">{k.items.length} component{k.items.length === 1 ? '' : 's'}</p>
                    </div>
                    <span className="text-sm font-semibold shrink-0">{formatPrice(k.pricePerKit)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
