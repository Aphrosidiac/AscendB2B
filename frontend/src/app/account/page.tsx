'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, MapPin, Package, FileText, LogOut, Receipt, TriangleAlert } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { listCompanyInvoices } from '@/lib/api';
import { summariseInvoices } from '@/lib/invoices';
import { Animate, Stagger } from '@/components/ui/Animate';
import { MolecularNetwork } from '@/components/ui/MolecularNetwork';
import { BusinessProfileCard } from '@/components/account/BusinessProfileCard';
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

  const overdue = !!(balance && balance.overdue > 0);

  return (
    <div>
      {/* Full-bleed dark hero — same identity as /login, /signup, and the
          homepage. Every other gateway page on the site commits to this
          treatment; this page previously didn't, which is why it read as a
          generic admin template rather than part of ASCEND. The outstanding
          balance lives here as the actual headline, since "what do I owe"
          is the reason a credit-terms buyer opens this page. */}
      <div className="relative overflow-hidden bg-primary">
        <MolecularNetwork className="absolute inset-0 w-full h-full" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
          <Animate variant="fadeUp" duration={0.5}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 backdrop-blur-sm text-white flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h1 className="font-display text-2xl font-bold text-white break-words">{company.name ?? company.username}</h1>
                  <p className="text-sm text-white/60">
                    {company.contactName && <>{company.contactName} &middot; </>}
                    {company.email}
                    {company.taxId && <> &middot; Reg. {company.taxId}</>}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 backdrop-blur-sm px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20 transition-colors cursor-pointer shrink-0 self-start"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            </div>
          </Animate>

          <Animate variant="fadeUp" delay={0.08}>
            <div className="grid sm:grid-cols-3 gap-6 sm:gap-10 items-end">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/50 mb-1">Outstanding Balance</p>
                <p className={cn('font-display text-4xl font-bold tabular-nums text-white', overdue && 'text-red-400')}>
                  {balance ? formatPrice(balance.outstanding) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/50 mb-1">Credit Terms</p>
                <p className="font-display font-semibold text-lg text-white/90">{CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-white/50 mb-1">Customer Since</p>
                <p className="font-display font-semibold text-lg text-white/90">{formatDate(company.createdAt).split(',')[0]}</p>
              </div>
            </div>
          </Animate>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {overdue && (
          <Animate variant="fadeUp" delay={0.03} className="mb-6">
            <Link
              href="/account/invoices"
              className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-danger hover:border-red-300 transition-colors"
            >
              <TriangleAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-display font-semibold text-sm">
                  {formatPrice(balance!.overdue)} overdue across {balance!.overdueCount} invoice{balance!.overdueCount === 1 ? '' : 's'}
                </p>
                <p className="text-sm opacity-90 mt-0.5">Review your invoices and settle the outstanding balance.</p>
              </div>
            </Link>
          </Animate>
        )}

        {/* Above the quick links deliberately: while this is incomplete the
            server refuses to create orders or quotations, so it outranks
            everything the links lead to. */}
        <Animate variant="fadeUp" delay={0.05} className="mb-6">
          <BusinessProfileCard company={company} />
        </Animate>

        {/* Uniform cards now that the balance has its own home in the hero
            above — no more one card growing an extra line and throwing off
            the grid's row height. */}
        <Stagger className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4" stagger={0.06}>
          {QUICK_LINKS.map(({ href, label, description, icon: Icon }) => (
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
            </Link>
          ))}
        </Stagger>
      </div>
    </div>
  );
}
