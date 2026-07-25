'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';

// The old guest phone+orderNumber lookup is gone entirely — B2B orders are
// only ever reachable via an authenticated Company session (see
// orders.routes.ts's top-level authenticateCompany hook). This route is kept
// only because external links/bookmarks/nav still point at /track; it just
// forwards straight to the real, authenticated destination.
export default function TrackPage() {
  const router = useRouter();
  const { loading, isAuthenticated } = useCompanyAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated ? '/account/orders' : '/login?redirect=/account/orders');
  }, [loading, isAuthenticated, router]);

  return null;
}
