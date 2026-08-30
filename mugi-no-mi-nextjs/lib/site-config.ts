export const siteConfig = {
  // 本番ドメインが決まったら .env の NEXT_PUBLIC_SITE_URL を書き換えてください。
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com',
  name: 'Brot yanagi',
  nameJa: 'ブロット ヤナギ',
  locale: 'ja_JP',
  defaultDescription:
    '名古屋市熱田区新尾頭、金山駅近くのベーカリー「Brot yanagi」。営業時間は8:00〜17:00、月曜・火曜定休。パンが売り切れ次第営業終了です。',
};

/**
 * ページ個別のopenGraphを組み立てるヘルパー。
 *
 * Next.jsのMetadata APIは、階層(layout→page)をまたいでopenGraphオブジェクトを
 * フィールド単位でマージしない。ページ側でopenGraphを定義すると、
 * siteName/locale/type/imagesなどlayout側の値が丸ごと失われるため、
 * 各ページで必ずこのヘルパーを通して完全なopenGraphを組み立てる。
 *
 * imageは必須(デフォルト値を持たない)。管理画面でアップロードされた写真が
 * 反映されるよう、呼び出し側で必ずlib/site-photos.tsのgetSitePhoto()等から
 * 取得した動的なURLを渡すこと(静的パスのハードコードによる形骸化を防ぐため)。
 */
export function pageOpenGraph({
  title,
  description,
  image,
  imageAlt,
}: {
  title: string;
  description: string;
  image: string;
  imageAlt?: string;
}) {
  return {
    type: 'website' as const,
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    title: `${title} | ${siteConfig.name}`,
    description,
    images: [{ url: image, alt: imageAlt ?? title }],
  };
}
