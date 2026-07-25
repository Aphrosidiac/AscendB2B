'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminGetCampaign } from '@/lib/api';
import { CampaignForm } from '../CampaignForm';
import type { PreorderCampaign } from '@/types';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [campaign, setCampaign] = useState<PreorderCampaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    if (!token) return;
    adminGetCampaign(token, params.id)
      .then(setCampaign)
      .catch(() => setError('Campaign not found'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, params.id]);

  if (loading) return <p className="text-sm text-text-secondary">Loading campaign...</p>;

  if (error || !campaign) {
    return (
      <div>
        <Link href="/admin/campaigns" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Campaigns
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Campaign not found'}</p>
      </div>
    );
  }

  return <CampaignForm campaign={campaign} onSaved={load} />;
}
