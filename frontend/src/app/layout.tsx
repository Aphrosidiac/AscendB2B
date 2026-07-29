import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, Outfit } from 'next/font/google';
import { CartProvider } from '@/lib/cart';
import { CompanyAuthProvider } from '@/hooks/useCompanyAuth';
import { SiteChrome } from '@/components/layout/SiteChrome';
import { OrganizationJsonLd, WebSiteJsonLd } from '@/components/JsonLd';
import { getSettingsServer, getProductsServer } from '@/lib/server-api';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

const outfit = Outfit({
  variable: '--font-outfit',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://ascendpeptides.my'),
  // Trade voice, not retail. The previous copy ("#1 Premium Peptides
  // Malaysia", "trusted source", "Buy ...", "fast shipping", "Number 1
  // peptides provider") was inherited verbatim from the consumer storefront
  // and sold to the wrong reader.
  title: {
    default: 'ASCEND Trade Supply — Wholesale Research Peptides, Malaysia',
    template: '%s | ASCEND Trade Supply',
  },
  description: 'Wholesale research peptides for Malaysian clinics, pharmacies and laboratories. Quantity-break pricing, Net 15/30/60 credit terms, per-SKU minimum order quantities and quoted volume. Trade accounts only.',
  // Trade-intent terms. The retail set ("buy peptides malaysia", "peptide
  // shop malaysia", "premium peptides") chased consumer searches this site
  // can't serve — every order here needs an approved trade account.
  keywords: [
    'wholesale peptides malaysia',
    'peptide supplier malaysia',
    'bulk peptides malaysia',
    'research peptide distributor malaysia',
    'peptide trade account malaysia',
    'peptides for clinics malaysia',
    'research peptides wholesale',
    'retatrutide wholesale malaysia',
    'GHK-Cu bulk malaysia',
    'BPC-157 wholesale malaysia',
    'tesamorelin bulk malaysia',
    'peptide price list malaysia',
    'net terms peptide supplier',
    'peptide pre-order malaysia',
    'laboratory supplies malaysia',
  ],
  authors: [{ name: 'ASCEND' }],
  creator: 'ASCEND',
  publisher: 'ASCEND',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_MY',
    url: 'https://ascendpeptides.my',
    siteName: 'ASCEND Trade Supply',
    title: 'ASCEND Trade Supply — Wholesale Research Peptides, Malaysia',
    description: 'Quantity-break pricing, Net 15/30/60 credit terms and quoted volume for Malaysian clinics, pharmacies and research laboratories.',
    images: [
      {
        url: '/images/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ASCEND Trade Supply — Wholesale Research Peptides in Malaysia',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ASCEND Trade Supply — Wholesale Research Peptides, Malaysia',
    description: 'Quantity-break pricing, Net 15/30/60 credit terms and quoted volume for Malaysian clinics, pharmacies and research laboratories.',
    images: ['/images/og-image.png'],
  },
  alternates: {
    canonical: 'https://ascendpeptides.my',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/favicon.png', sizes: '48x48', type: 'image/png' },
      { url: '/images/pill-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/images/pill-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/images/pill-icon-192.png',
  },
  verification: {},
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [settings, catalog] = await Promise.all([getSettingsServer(), getProductsServer({ limit: 100 })]);
  const announcementEnabled = settings.announcement_enabled === 'true' && !!settings.announcement_text;

  // Real min-max price range for Organization.priceRange, computed from the
  // live catalog rather than a hardcoded placeholder.
  const prices = catalog.data.flatMap((p) => p.variants.filter((v) => v.active).map((v) => v.price));
  const priceRange =
    prices.length > 0
      ? `RM${Math.min(...prices) / 100} - RM${Math.max(...prices) / 100}`
      : undefined;

  return (
    <html lang="en-MY" className={`${inter.variable} ${outfit.variable} h-full antialiased overflow-x-hidden`}>
      <body className="min-h-full flex flex-col bg-background text-text-primary font-body overflow-x-hidden">
        <OrganizationJsonLd priceRange={priceRange} />
        <WebSiteJsonLd />
        {/* Preconnect to GA4's origins — cuts DNS+TCP+TLS handshake time off
            the critical path for a request that fires on every page load. */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://www.google-analytics.com" />
        {/* Google Analytics 4 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-4PHY1Z9BHD"
          strategy="afterInteractive"
        />
        <Script id="ga4" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-4PHY1Z9BHD');`}
        </Script>
        <CompanyAuthProvider>
          <CartProvider>
            <SiteChrome announcementEnabled={announcementEnabled} announcementText={settings.announcement_text || ''}>
              {children}
            </SiteChrome>
          </CartProvider>
        </CompanyAuthProvider>
      </body>
    </html>
  );
}
