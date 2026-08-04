import type { Metadata } from 'next';
import { Zen_Old_Mincho, Cormorant_Garamond, Noto_Sans_JP } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileActionBar } from '@/components/layout/MobileActionBar';
import { siteConfig } from '@/lib/site-config';
import { siteContent } from '@/lib/placeholder-content';
import { getSitePhoto } from '@/lib/site-photos';

// weight 700は現在サイト内のどこでも使用していないため含めていない
// (h1〜h4はfont-medium(500)、それ以外は継承されたfont-light(300)から
// 最も近いウェイトとして400にフォールバックする)。太字を新たに使う場合は
// weight配列に'700'を追加してください。
const zenOldMincho = Zen_Old_Mincho({
  subsets: ['latin'],
  weight: ['400', '500'],
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

// VERCEL_ENVが'production'の場合のみ本番として扱う(Preview/Development/
// ローカルなど未設定の場合は、提案・デモ用サイトとして安全側に倒す)。
const isProductionEnv = process.env.VERCEL_ENV === 'production';

// サイト写真(Supabase)は60秒ごとに再取得する(ISR)。
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const showcasePhoto = await getSitePhoto('showcase');

  return {
    metadataBase: new URL(siteConfig.url),
    title: {
      default: `${siteConfig.name}｜名古屋・金山のベーカリー`,
      template: `%s | ${siteConfig.name}`,
    },
    description: siteConfig.defaultDescription,
    // Preview/Development環境では検索エンジンに登録されないよう、
    // <meta name="robots" content="noindex, nofollow"> を出力する
    // (app/robots.ts のクロール禁止設定と合わせた二重の対策)。
    ...(isProductionEnv ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      type: 'website',
      locale: siteConfig.locale,
      siteName: siteConfig.name,
      title: siteConfig.name,
      description: siteConfig.defaultDescription,
      images: [{ url: showcasePhoto.url, alt: showcasePhoto.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      images: [showcasePhoto.url],
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const exteriorPhoto = await getSitePhoto('exterior');

  // 構造化データ(JSON-LD)。確認できている情報(店名・住所・電話番号・営業時間・
  // 定休日・Instagram)のみを記載しており、緯度経度・価格帯・評価・予約可否などの
  // 未確認情報は含めていない。
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Bakery',
    name: siteContent.brandName.value,
    alternateName: siteContent.brandNameEn.value,
    url: siteConfig.url,
    telephone: '+81-52-880-2474',
    image: exteriorPhoto.url.startsWith('http') ? exteriorPhoto.url : `${siteConfig.url}${exteriorPhoto.url}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: '新尾頭3-3-10',
      addressLocality: '名古屋市熱田区',
      addressRegion: '愛知県',
      postalCode: '456-0018',
      addressCountry: 'JP',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        opens: '08:00',
        closes: '17:00',
      },
    ],
    sameAs: [siteContent.instagramUrl.value],
  };

  return (
    <html lang="ja" className={`${zenOldMincho.variable} ${cormorant.variable} ${notoSansJp.variable}`}>
      <body>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger -- JSON-LDは固定オブジェクトをJSON化しているだけで、
          // ユーザー入力は含まれない
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <a
          href="#main"
          className="fixed left-[-999px] top-0 z-[1000] bg-ink px-5 py-3.5 text-brand-pale focus:left-5 focus:top-5"
        >
          本文へスキップ
        </a>
        {!isProductionEnv && (
          <div className="pointer-events-none fixed bottom-4 left-4 z-[200] rounded-full bg-ink/85 px-4 py-1.5 text-[10px] tracking-[0.08em] text-brand-pale shadow-lg backdrop-blur-sm">
            サイトリニューアル提案用デモ
          </div>
        )}
        <Header />
        <main id="main">{children}</main>
        <MobileActionBar />
        <Footer />
      </body>
    </html>
  );
}
