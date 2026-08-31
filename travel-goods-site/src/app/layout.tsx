import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import DatasetNotice from '@/components/DatasetNotice';
import DevInfoBar from '@/components/DevInfoBar';
import { absoluteUrl, shouldAllowIndexing, siteConfig } from '@/config/site';
import { getSiteData } from '@/lib/content/load';

export const metadata: Metadata = {
  metadataBase: siteConfig.baseUrl ? new URL(siteConfig.baseUrl) : undefined,
  title: {
    default: `${siteConfig.name}｜${siteConfig.tagline}`,
    template: `%s｜${siteConfig.name}`,
  },
  description: siteConfig.description,
  // プレビュー、または正規URL未設定のときは常に noindex（計画書 9節）。
  robots: shouldAllowIndexing
    ? { index: true, follow: true }
    : { index: false, follow: false, nocache: true },
  alternates: absoluteUrl('/') ? { canonical: absoluteUrl('/') as string } : undefined,
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: `${siteConfig.name}｜${siteConfig.tagline}`,
    description: siteConfig.description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { catalog, articles, products, withheldArticles } = getSiteData();
  const gaId = siteConfig.gaMeasurementId;

  return (
    <html lang={siteConfig.language}>
      <body className="flex min-h-screen flex-col">
        {/* 計測IDが未設定なら、タグ自体を出力しない（計画書 9節） */}
        {gaId ? (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`}
            </Script>
          </>
        ) : null}

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-white"
        >
          本文へスキップ
        </a>
        <DatasetNotice dataset={catalog.dataset} />
        <DevInfoBar
          catalog={catalog}
          publishedProducts={products.length}
          publishedArticles={articles.length}
          withheldArticles={withheldArticles.length}
        />
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
