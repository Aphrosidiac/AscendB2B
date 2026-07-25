'use client';

import { usePathname } from 'next/navigation';
import { AnnouncementBar } from './AnnouncementBar';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { WhatsAppButton } from './WhatsAppButton';

interface SiteChromeProps {
  announcementEnabled: boolean;
  announcementText: string;
  children: React.ReactNode;
}

// The admin panel (/admin/*) has its own sidebar/nav chrome and isn't part
// of the customer-facing storefront — it must never be wrapped in the
// public announcement bar, navbar, footer, or WhatsApp button. Gated here
// (rather than per-admin-page) so no future storefront page can forget it.
export function SiteChrome({ announcementEnabled, announcementText, children }: SiteChromeProps) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <AnnouncementBar enabled={announcementEnabled} text={announcementText} />
      <Navbar />
      {/* Same route-change entrance as the admin shell — keyed on pathname
          so it replays per navigation. Storefront pages mostly animate their
          own content with <Animate>, but that only covers pages that
          remembered to; this makes the arrival itself consistent everywhere. */}
      <main className="flex-1">
        <div key={pathname} className="animate-page-enter">
          {children}
        </div>
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
