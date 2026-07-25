'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { adminGetKit } from '@/lib/api';
import { KitForm } from '../KitForm';
import type { Kit } from '@/types';

export default function KitDetailPage() {
  const params = useParams<{ id: string }>();
  const { token } = useAuth();
  const [kit, setKit] = useState<Kit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    adminGetKit(token, params.id)
      .then(setKit)
      .catch(() => setError('Kit not found'))
      .finally(() => setLoading(false));
  }, [token, params.id]);

  if (loading) return <p className="text-sm text-text-secondary">Loading kit...</p>;

  if (error || !kit) {
    return (
      <div>
        <Link href="/admin/kits" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Kits
        </Link>
        <p className="text-sm text-danger bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">{error || 'Kit not found'}</p>
      </div>
    );
  }

  return <KitForm kit={kit} />;
}
