/**
 * SITE CONTENT REGISTRY
 * ----------------------------------------------------------------
 * 実店舗「Brot yanagi(ブロット ヤナギ)」向けの店舗情報を集約しています。
 * 各項目の `isPlaceholder` は、依頼者から確認が取れていない(=まだ仮の値の)
 * 項目にのみ `true` を付けています。`false` の項目は確認済みの情報です。
 *
 * scripts/check-placeholders.mjs がビルド時にこのファイルを解析し、
 * isPlaceholder: true が残っている項目を一覧で警告表示します。
 * ----------------------------------------------------------------
 */

export interface PlaceholderField<T> {
  value: T;
  isPlaceholder: boolean;
  /** 何のためのデータか、差し替え時の注意点 */
  note?: string;
}

export interface SiteContent {
  brandName: PlaceholderField<string>;
  /** Brot yanagiの日本語表記(「ブロット ヤナギ」)。Header/Footerで小さく併記する */
  brandNameEn: PlaceholderField<string>;
  tagline: PlaceholderField<string>;
  heroHeadline: PlaceholderField<string>;
  heroSubcopy: PlaceholderField<string>;

  founderName: PlaceholderField<string>;
  founderRole: PlaceholderField<string>;
  /** 店舗紹介文(第三者紹介トーン)。ArtisanCompact / Aboutページで使用 */
  founderQuote: PlaceholderField<string>;

  address: PlaceholderField<string>;
  phone: PlaceholderField<string>;
  phoneHref: PlaceholderField<string>;
  hours: PlaceholderField<string>;
  closedDay: PlaceholderField<string>;
  parking: PlaceholderField<string>;
  accessNote: PlaceholderField<string>;
  mapEmbedUrl: PlaceholderField<string>;
  mapViewUrl: PlaceholderField<string>;

  instagramHandle: PlaceholderField<string>;
  instagramUrl: PlaceholderField<string>;
  instagramFeaturedPostUrl: PlaceholderField<string | null>;
  twitterUrl: PlaceholderField<string | null>;

  contactFormRecipient: PlaceholderField<string | null>;
}

// 住所は表示用とGoogleマップ検索用の両方で使うため、ここで一度だけ定義する。
const ADDRESS_DISPLAY = '〒456-0018 愛知県名古屋市熱田区新尾頭3-3-10';
const ADDRESS_FOR_MAP_QUERY = 'Brot yanagi 愛知県名古屋市熱田区新尾頭3-3-10';

// 正しいGoogleビジネスプロフィールの共有URLが確認できていないため、
// 住所(+店名)を使ったGoogle Maps検索URLを組み立てている(ユーザー指示に基づく方針)。
const MAP_QUERY_URL = `https://www.google.com/maps?q=${encodeURIComponent(ADDRESS_FOR_MAP_QUERY)}`;

export const siteContent: SiteContent = {
  brandName: { value: 'Brot yanagi', isPlaceholder: false },
  brandNameEn: { value: 'ブロット ヤナギ', isPlaceholder: false },
  tagline: {
    value: '金山の住宅街に佇むベーカリー。',
    isPlaceholder: false,
  },
  heroHeadline: { value: '柳の木の奥で', isPlaceholder: false },
  heroSubcopy: {
    value: '金山の住宅街にあるBrot yanagi。ひとつひとつ、丁寧にパンを焼き上げています。',
    isPlaceholder: false,
  },

  // 実在の代表者名・肩書きは確認できていないため、個人名としては記載しない
  // (ArtisanCompact / Aboutページでは、以下の founderQuote を店舗紹介文として
  // 第三者紹介のトーンで表示し、個人への帰属は行っていない)。
  founderName: { value: '', isPlaceholder: false, note: '実在の代表者名が未確認のため、個人名は記載していません。' },
  founderRole: { value: '', isPlaceholder: false },
  founderQuote: {
    value:
      'Brot yanagiは、名古屋・金山の住宅街にあるベーカリーです。柳の木が目印の店先には、日々さまざまなパンが並びます。朝の一品から、昼食、おやつ、手土産まで。その日に出会えるパンを、ぜひ店頭でお楽しみください。',
    isPlaceholder: false,
    note: '依頼者から提供された店舗紹介文をベースにしています。',
  },
  address: { value: ADDRESS_DISPLAY, isPlaceholder: false },
  phone: { value: '052-880-2474', isPlaceholder: false },
  phoneHref: { value: '0528802474', isPlaceholder: false },
  hours: { value: '8:00〜17:00', isPlaceholder: false },
  closedDay: { value: '月曜日・火曜日', isPlaceholder: false },
  parking: {
    value:
      '当店専用の駐車場はございません。お車でお越しの際は、近隣のコインパーキングをご利用くださいますようお願いいたします。',
    isPlaceholder: false,
  },
  accessNote: { value: '金山駅南口から徒歩約5〜6分', isPlaceholder: false },
  mapEmbedUrl: {
    value: `${MAP_QUERY_URL}&output=embed`,
    isPlaceholder: true,
    note: '正式なGoogleビジネスプロフィールの共有URLが確認でき次第、差し替えてください。',
  },
  mapViewUrl: {
    value: MAP_QUERY_URL,
    isPlaceholder: true,
    note: '正式なGoogleビジネスプロフィールの共有URLが確認でき次第、差し替えてください。',
  },

  instagramHandle: { value: '@brot_yanagi', isPlaceholder: false },
  instagramUrl: { value: 'https://www.instagram.com/brot_yanagi/', isPlaceholder: false },
  instagramFeaturedPostUrl: {
    value: null,
    isPlaceholder: true,
    note: '特定の投稿URLが確認でき次第、Aboutページに公式oEmbedとして埋め込まれます。',
  },
  twitterUrl: { value: null, isPlaceholder: true },

  contactFormRecipient: {
    value: null,
    isPlaceholder: true,
    note: '受信先はlib/contact/email.tsの環境変数(CONTACT_FORM_TO_EMAIL等)で管理しています。',
  },
};
