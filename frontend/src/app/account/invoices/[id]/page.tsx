'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Package, Receipt, TriangleAlert, Wallet, FileText } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { getCompanyInvoice, listCompanyOrders } from '@/lib/api';
import { formatPrice, formatDate, cn } from '@/lib/utils';
import { invoiceOutstanding, daysPastDue } from '@/lib/invoices';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS, CREDIT_TERMS_LABELS } from '@/lib/constants';
import { Badge } from '@/components/ui/Badge';
import { Animate } from '@/components/ui/Animate';
import type { Invoice, InvoiceItem } from '@/types';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  WHATSAPP: 'Bank transfer (recorded by our team)',
  BILLPLZ: 'Billplz online payment',
};

function itemDisplayName(item: { variant?: { code: string; size: string | null; product: { name: string } } | null; kit?: { name: string } | null } | undefined): string {
  if (!item) return 'Item';
  if (item.variant) return `${item.variant.product.name}${item.variant.size ? ` ${item.variant.size}` : ''}`;
  if (item.kit) return item.kit.name;
  return 'Item';
}

interface OrderGroup {
  orderId: string;
  items: InvoiceItem[];
  amount: number;
}

// Every invoice line traces back to a ShipmentItem, which belongs to a
// Shipment, which belongs to an Order (Invoice itself has no order FK — see
// docs/erd-b2b.md's shipment/invoice decoupling, which is what allows one
// invoice to consolidate several orders). Grouping by that order is how the
// customer connects "what I'm being billed for" to "what I ordered".
function groupByOrder(items: InvoiceItem[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const item of items) {
    const orderId = item.shipmentItem?.shipment.orderId ?? 'unknown';
    const group = groups.get(orderId) ?? { orderId, items: [], amount: 0 };
    group.items.push(item);
    group.amount += item.amount;
    groups.set(orderId, group);
  }
  return [...groups.values()];
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const router = useRouter();
  const { token, company, loading: authLoading, isAuthenticated } = useCompanyAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // orderId -> orderNumber. The invoice payload carries only the order's id,
  // so the human-readable number comes from the company's own order list.
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && !isAuthenticated) router.push(`/login?redirect=/account/invoices/${invoiceId}`);
  }, [authLoading, isAuthenticated, invoiceId, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError('');
    getCompanyInvoice(token, invoiceId)
      // Someone else's invoice id 404s server-side (the controller returns 404
      // rather than 403 so it can't be used to probe for existence), and lands
      // here as a clean not-found rather than a crash.
      .then(setInvoice)
      .catch(() => setError('Invoice not found'))
      .finally(() => setLoading(false));
  }, [token, invoiceId]);

  useEffect(() => {
    if (!token) return;
    listCompanyOrders(token, { limit: '100' })
      .then((res) => setOrderNumbers(Object.fromEntries(res.data.map((o) => [o.id, o.orderNumber]))))
      .catch(() => {});
  }, [token]);

  if (authLoading || !isAuthenticated) return null;

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-sm text-text-secondary">Loading invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/account/invoices" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </Link>
        <div className="text-center py-12 bg-surface rounded-xl border border-border border-dashed">
          <Receipt className="w-10 h-10 text-text-muted mx-auto mb-3" />
          <p className="font-display font-semibold mb-1">{error || 'Invoice not found'}</p>
          <p className="text-sm text-text-secondary">
            This invoice doesn&apos;t exist, or it isn&apos;t on your account.
          </p>
        </div>
      </div>
    );
  }

  const owed = invoiceOutstanding(invoice);
  const late = daysPastDue(invoice);
  const groups = groupByOrder(invoice.items ?? []);
  const payments = invoice.payments ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href="/account/invoices" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Invoices
      </Link>

      <Animate variant="fadeUp" duration={0.5}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">{invoice.invoiceNumber}</h1>
            <p className="text-sm text-text-muted mt-1">
              Issued {formatDate(invoice.issueDate)} &middot; Due {formatDate(invoice.dueDate)}
              {company && ` · ${CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms} terms`}
            </p>
          </div>
          <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
            {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
          </Badge>
        </div>
      </Animate>

      {late > 0 && (
        <Animate variant="fadeUp" delay={0.03} duration={0.4} className="mt-4">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-danger">
            <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-semibold text-sm">
                {late} day{late === 1 ? '' : 's'} overdue
              </p>
              <p className="text-sm opacity-90 mt-0.5">
                {formatPrice(owed)} was due on {formatDate(invoice.dueDate)}.
              </p>
            </div>
          </div>
        </Animate>
      )}

      {invoice.void && (
        <Animate variant="fadeUp" delay={0.03} duration={0.4} className="mt-4">
          <div className="rounded-xl border border-border bg-surface-elevated px-4 py-3.5 text-sm text-text-secondary">
            This invoice has been voided and is no longer payable.
          </div>
        </Animate>
      )}

      <Animate variant="fadeUp" delay={0.05} duration={0.5} className="mt-6 mb-6">
        <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 grid sm:grid-cols-3 gap-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Invoiced</p>
            <p className="font-display text-2xl font-bold tabular-nums">{formatPrice(invoice.total)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Paid</p>
            <p className="font-display text-2xl font-bold tabular-nums text-text-secondary">{formatPrice(invoice.paidAmount)}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Outstanding</p>
            <p className={cn('font-display text-2xl font-bold tabular-nums', late > 0 && 'text-danger')}>{formatPrice(owed)}</p>
          </div>
        </div>
      </Animate>

      <Animate variant="fadeUp" delay={0.1} duration={0.4} className="mb-6">
        <div className="space-y-4">
          <h2 className="font-display font-semibold text-lg">What you&apos;re being billed for</h2>
          {groups.length === 0 ? (
            <div className="text-center py-10 bg-surface rounded-xl border border-border border-dashed">
              <FileText className="w-9 h-9 text-text-muted mx-auto mb-2" />
              <p className="text-sm text-text-secondary">No line items on this invoice.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.orderId} className="bg-surface rounded-xl border border-border overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 bg-surface-elevated border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <Package className="w-4 h-4 text-text-muted shrink-0" />
                    {group.orderId === 'unknown' ? (
                      <span className="text-sm font-medium">Unlinked items</span>
                    ) : (
                      <Link
                        href={`/account/orders/${group.orderId}`}
                        className="text-sm font-display font-semibold hover:underline"
                      >
                        {orderNumbers[group.orderId] ?? 'View order'}
                      </Link>
                    )}
                  </div>
                  <span className="text-sm font-display font-semibold tabular-nums">{formatPrice(group.amount)}</span>
                </div>
                <div className="divide-y divide-border">
                  {group.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between gap-3 p-4 sm:p-5">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{itemDisplayName(item.shipmentItem?.orderItem)}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          Qty {item.shipmentItem?.quantity ?? '—'}
                          {item.shipmentItem?.shipment.shipmentNumber && ` · Shipment ${item.shipmentItem.shipment.shipmentNumber}`}
                          {item.shipmentItem?.batch.batchNumber && ` · Batch ${item.shipmentItem.batch.batchNumber}`}
                        </p>
                      </div>
                      <p className="font-display font-semibold shrink-0 tabular-nums">{formatPrice(item.amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Animate>

      <Animate variant="fadeUp" delay={0.15} duration={0.4}>
        <div className="bg-surface rounded-xl border border-border p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-text-muted" />
            <h2 className="font-display font-semibold text-lg">Payments Received</h2>
          </div>

          {payments.length === 0 ? (
            <p className="text-sm text-text-secondary">No payments have been recorded against this invoice yet.</p>
          ) : (
            <div className="divide-y divide-border -mx-1">
              {payments.map((payment) => (
                <div key={payment.id} className="flex items-start justify-between gap-3 py-3 px-1 first:pt-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{formatDate(payment.paidAt)}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}
                      {payment.paymentRef && ` · Ref ${payment.paymentRef}`}
                    </p>
                  </div>
                  <p className="font-display font-semibold shrink-0 tabular-nums text-success">
                    {formatPrice(payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Payment is recorded by our team against a bank transfer — there is
              deliberately no self-serve payment control here. */}
          {owed > 0 && !invoice.void && (
            <p className="text-xs text-text-muted mt-4 pt-4 border-t border-border">
              Payments are reconciled and recorded by our accounts team once your transfer clears. Contact your account
              manager with the invoice number if a payment isn&apos;t showing here.
            </p>
          )}
        </div>
      </Animate>
    </div>
  );
}
