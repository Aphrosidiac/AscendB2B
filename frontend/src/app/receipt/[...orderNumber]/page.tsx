'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';

// The old guest phone+orderNumber receipt lookup is gone entirely — a
// receipt is now only reachable from an authenticated order's own detail
// page (Order Info tab -> Download Receipt, which hits the company-scoped
// /api/v1/orders/:id/receipt/pdf endpoint). This route can't resolve
// `orderNumber` to an order id without that old lookup, so it just forwards
// to the real, authenticated destination rather than trying to preserve any
// part of the guest flow.
export default function ReceiptPage() {
  const router = useRouter();
  const { loading, isAuthenticated } = useCompanyAuth();

  useEffect(() => {
    if (loading) return;
    router.replace(isAuthenticated ? '/account/orders' : '/login?redirect=/account/orders');
  }, [loading, isAuthenticated, router]);

  return null;
}
