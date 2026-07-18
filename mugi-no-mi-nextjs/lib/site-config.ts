export const siteConfig = {
  // 本番ドメインが決まったら .env の NEXT_PUBLIC_SITE_URL を書き換えてください。
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com',
  name: 'Brot yanagi',
  nameJa: 'ブロット ヤナギ',
  locale: 'ja_JP',
  defaultDescription:
    '名古屋市熱田区新尾頭、金山駅近くのベーカリー「Brot yanagi」。営業時間は8:00〜17:00、月曜・火曜定休。パンが売り切れ次第営業終了です。',
};
