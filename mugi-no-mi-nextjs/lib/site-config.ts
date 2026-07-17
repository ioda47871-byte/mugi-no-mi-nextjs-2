export const siteConfig = {
  // 本番ドメインが決まったら .env の NEXT_PUBLIC_SITE_URL を書き換えてください。
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://example.com',
  name: '麦の実 -Mugi no Mi- Boulangerie',
  locale: 'ja_JP',
  defaultDescription:
    '麦の実 -Mugi no Mi- Boulangerie。石臼挽きの小麦と山の湧水、18時間の低温発酵だけで仕上げる高級ベーカリー。毎日のパンに、静かな贅沢を。',
};
