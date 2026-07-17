import type { Metadata } from 'next';
import { Zen_Old_Mincho, Cormorant_Garamond, Noto_Sans_JP } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileActionBar } from '@/components/layout/MobileActionBar';
import { siteConfig } from '@/lib/site-config';

const zenOldMincho = Zen_Old_Mincho({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-zen-old-mincho',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
});

const notoSansJp = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-noto-sans-jp',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `${siteConfig.name} | 焼きたての一斤に、朝がひとつ生まれる。`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.defaultDescription,
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.defaultDescription,
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${zenOldMincho.variable} ${cormorant.variable} ${notoSansJp.variable}`}>
      <body>
        <a
          href="#main"
          className="fixed left-[-999px] top-0 z-[1000] bg-ink px-5 py-3.5 text-brand-pale focus:left-5 focus:top-5"
        >
          本文へスキップ
        </a>
        <Header />
        <main id="main">{children}</main>
        <MobileActionBar />
        <Footer />
      </body>
    </html>
  );
}
