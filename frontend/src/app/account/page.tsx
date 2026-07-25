'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, MapPin, Package, FileText, LogOut } from 'lucide-react';
import { useCompanyAuth } from '@/hooks/useCompanyAuth';
import { Animate, Stagger } from '@/components/ui/Animate';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';

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
  { href: '/account/quotations', label: 'Quotations', description: 'Request and review quotes', icon: FileText },
  { href: '/account/addresses', label: 'Addresses', description: 'Manage saved shipping addresses', icon: MapPin },
];

export default function AccountPage() {
  const router = useRouter();
  const { company, loading, isAuthenticated, logout } = useCompanyAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) router.push('/login?redirect=/account');
  }, [loading, isAuthenticated, router]);

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
              <p className="text-sm text-text-secondary">{company.contactName} &middot; {company.email}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="w-3.5 h-3.5" /> Sign Out
          </Button>
        </div>
      </Animate>

      <Animate variant="fadeUp" delay={0.05}>
        <div className="bg-surface rounded-xl border border-border p-5 sm:p-6 mb-6 grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Credit Terms</p>
            <p className="font-display font-semibold text-lg">{CREDIT_TERMS_LABELS[company.creditTerms] ?? company.creditTerms}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Business Registration</p>
            <p className="font-display font-semibold text-lg">{company.taxId || '—'}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-text-muted mb-1">Customer Since</p>
            <p className="font-display font-semibold text-lg">{formatDate(company.createdAt).split(',')[0]}</p>
          </div>
        </div>
      </Animate>

      <Stagger className="grid sm:grid-cols-3 gap-4" stagger={0.06}>
        {QUICK_LINKS.map(({ href, label, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="bg-surface rounded-xl border border-border p-5 hover:border-border-hover hover:shadow-sm transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-surface-elevated flex items-center justify-center mb-3 group-hover:bg-primary group-hover:text-white transition-colors">
              <Icon className="w-5 h-5" />
            </div>
            <p className="font-display font-semibold mb-1">{label}</p>
            <p className="text-sm text-text-secondary">{description}</p>
          </Link>
        ))}
      </Stagger>
    </div>
  );
}
