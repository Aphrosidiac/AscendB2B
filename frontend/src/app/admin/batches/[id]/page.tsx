'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminGetBatch } from '@/lib/api';
import { BatchForm } from '../BatchForm';
import type { Batch } from '@/types';

export default function BatchDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    adminGetBatch(token, params.id)
      .then(setBatch)
      .catch(() => setError('Batch not found'))
      .finally(() => setLoading(false));
  }, [token, params.id]);

  if (loading) return <p className="text-sm text-text-secondary">Loading batch...</p>;

  if (error || !batch) {
    return (
      <div>
        <Link href="/admin/batches" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Batches
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Batch not found'}</p>
      </div>
    );
  }

  return <BatchForm batch={batch} />;
}
