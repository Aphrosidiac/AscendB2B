'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, MapPin, Package, FileText, LogOut, Receipt, TriangleAlert } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { listCompanyInvoices } from '@/lib/api';
import { summariseInvoices } from '@/lib/invoices';
import { Animate, Stagger } from '@/components/ui/Animate';
import { Button } from '@/components/ui/Button';
import { formatDate, formatPrice, cn } from '@/lib/utils';

const CREDIT_TERMS_LABELS: Record<string, string> = {
  PREPAID: 'Prepaid',
  NET15: 'Net 15',
  NET30: 'Net 30',
  NET60: 'Net 60',
};

// Quick links point at routes owned by the quotation/order-tracking pass
// (docs/frontend-design.md "New — Quotation" / "New — Orders & Billing")
// that build alongside this one — /account/orders and /account/quotations,
// mirroring the /account/addresses convention established here.
const QUICK_LINKS = [
  { href: '/account/orders', label: 'Orders', description: 'Track order status and history', icon: Package },
  { href: '/account/invoices', label: 'Invoices', description: 'See what you owe and when it falls due', icon: Receipt },
  { href: '/account/quotations', label: 'Quotations', description: 'Request and review quotes', icon: FileText },
  { href: '/account/addresses', label: 'Addresses', description: 'Manage saved shipping addresses', icon: MapPin },
];

export default function AccountPage() {
  const router = useRouter();
  const { token, company, loading, isAuthenticated, logout } = useCompanyAuth();

  // "What do I owe" is the first thing a credit-terms buyer wants off this
  // screen, so the balance is surfaced on landing rather than only one click
  // deep. Derived client-side — the company invoice endpoint returns no
  // server-side rollup (see backend/src/modules/companies/company-invoices.controller.ts).
  const [balance, setBalance] = useState<{ outstanding: number; overdue: number; overdueCount: number } | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push('/login?redirect=/account');
  }, [loading, isAuthenticated, router]);

  useEffect(() => {
    if (!token) return;
    listCompanyInvoices(token, { limit: '100' })
      .then((res) => setBalance(summariseInvoices(res.data)))
      .catch(() => {});
  }, [token]);

  if (loading || !isAuthenticated || !company) return null;

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Animate variant="fadeUp" duration={0.5}>
        <div className="flex items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary text-white flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">{company.name}</h1>
              <p className="text-sm text-text-secondary">
                {company.contactName} &middot; {company.email}
                {/* Registration number is administrative metadata, not
                    something a returning buyer needs every visit — a small
                    caption here beats giving it an equal-weight stat slot
                    next to the outstanding balance below. */}
                {company.taxId && <> &middot; Reg. {company.taxId}</>}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </Button>
        </div>
      </Animate>

      {balance && balance.overdue > 0 && (
        <Animate variant="fadeUp" delay={0.03} className="mb-6">
          <Link
            href="/account/invoices"
            className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-danger hover:border-red-300 transition-colors"
          >
            <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-display font-semibold text-sm">
                {formatPrice(balance.overdue)} overdue across {balance.overdueCount} invoice{balance.overdueCount === 1 ? '' : 's'}
              </p>
              <p className="text-sm opacity-90 mt-0.5">Review your invoices and settle the outstanding balance.</p>
            </div>
          </Link>
        </Animate>
      )}

      {/* Same treatment as /account/invoices' summary card (text-3xl hero
          number, card-wide red tint when overdue) — a buyer bouncing between
          the two pages should see the same number carry the same weight,
          not a smaller demoted version here. */}
      <Animate variant="fadeUp" delay={0.05}>
        <div
          className={cn(
            'rounded-xl border p-5 sm:p-6 mb-6',
            balance && balance.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-surface border-border'
          )}
        >
          <div className="grid sm:grid-cols-3 gap-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Outstanding Balance</p>
              <p className={cn('font-display text-3xl font-bold tabular-nums', balance && balance.overdue > 0 && 'text-danger')}>
                {balance ? formatPrice(balance.outstanding) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Credit Terms</p>
              <p className="font-display font-semibold text-lg mt-1.5">{CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Customer Since</p>
              <p className="font-display font-semibold text-lg mt-1.5">{formatDate(company.createdAt).split(',')[0]}</p>
            </div>
          </div>
        </div>
      </Animate>

      <Stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" stagger={0.06}>
        {QUICK_LINKS.map(({ href, label, description, icon: Icon }) => {
          const isInvoices = href === '/account/invoices';
          return (
            <Link
              key={href}
              href={href}
              className="bg-surface rounded-xl border border-border p-5 hover:border-border-hover hover:shadow-sm transition-all group flex flex-col"
            >
              <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center mb-3">
                <Icon className="w-5 h-5" />
              </div>
              <p className="font-display font-semibold mb-1">{label}</p>
              <p className="text-sm text-text-secondary">{description}</p>
              {isInvoices && balance && (
                <p
                  className={cn(
                    'text-sm font-display font-semibold mt-3 pt-3 border-t border-border tabular-nums',
                    balance.overdue > 0 ? 'text-danger' : 'text-text-primary'
                  )}
                >
                  {formatPrice(balance.outstanding)} outstanding
                </p>
              )}
            </Link>
          );
        })}
      </Stagger>
    </div>
  );
}
