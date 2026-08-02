import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { BottomNav } from '@/components/bottom-nav';
import { MotionProvider } from '@/components/motion-provider';
import { StorefrontLive } from '@/components/storefront-live';
import { OrderSync } from '@/components/use-order-sync';
import './globals.css';

/**
 * Fonts are downloaded at build time and self-hosted by next/font — no runtime request to a
 * third-party CDN, which keeps the critical path short and avoids shipping visitor IPs to
 * Google (07-design-system.md §3).
 *
 * Space Grotesk stands in for Clash Display and Inter for Satoshi until the Fontshare files are
 * vendored into the repo.
 */
const display = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-family',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans-family',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono-family',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Juice Stop — Late night hits different',
  description:
    'Late-night food delivered around Abode Valley and SRM. Open 7 PM till 4 AM, every night.',
  applicationName: 'Juice Stop',
  openGraph: {
    title: 'Juice Stop — Late night hits different 🌙',
    description: 'Open 7 PM till 4 AM. Delivering around Abode Valley & SRM hostels.',
    type: 'website',
    locale: 'en_IN',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#0B0B0F',
  width: 'device-width',
  initialScale: 1,
  // Never block zoom — pinch-to-zoom is an accessibility requirement, not a styling nuisance.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        <MotionProvider>
          {/* Renders nothing. Subscribes to kitchen availability so a sold-out item greys out
              wherever it appears, without a refresh. */}
          <StorefrontLive />
          {/* Also renders nothing. Keeps every live order in step with the kitchen, so the home
              screen tab, the orders list, the nav badge and the tracking page all move together. */}
          <OrderSync />
          {children}
          <BottomNav />
        </MotionProvider>
      </body>
    </html>
  );
}
