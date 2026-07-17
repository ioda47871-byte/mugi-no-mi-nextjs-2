/**
 * PLACEHOLDER CONTENT REGISTRY
 * ----------------------------------------------------------------
 * このファイルに、まだ実店舗の情報に差し替えていない「仮データ」を
 * すべて集約しています。各項目は `isPlaceholder: true` を持ち、
 * scripts/check-placeholders.mjs がビルド時にこのファイルを解析して
 * 一覧を警告として出力します。
 *
 * 実データが確定したら、value を書き換えて isPlaceholder を false に
 * してください。false のまま出荷して問題ありません(警告は消えます)。
 *
 * 詳細な差し替えチェックリストは「実店舗情報チェックリスト.md」を参照してください。
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
  brandNameEn: PlaceholderField<string>;
  tagline: PlaceholderField<string>;
  heroHeadline: PlaceholderField<string>;
  heroSubcopy: PlaceholderField<string>;

  founderName: PlaceholderField<string>;
  founderRole: PlaceholderField<string>;
  founderQuote: PlaceholderField<string>;
  founderPortrait: PlaceholderField<string | null>;

  address: PlaceholderField<string>;
  phone: PlaceholderField<string>; // 表示用 (例: 0566-00-0000)
  phoneHref: PlaceholderField<string>; // tel:リンク用 (例: 0566000000)
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

export const siteContent: SiteContent = {
  brandName: { value: '麦の実', isPlaceholder: true, note: '架空の店名。正式な屋号に差し替えてください。' },
  brandNameEn: { value: 'Mugi no Mi', isPlaceholder: true },
  tagline: { value: '毎日のパンに、静かな贅沢を。', isPlaceholder: true },
  heroHeadline: { value: '焼きたての一斤に、朝がひとつ、生まれる。', isPlaceholder: true },
  heroSubcopy: {
    value: '小麦と水、そして時間だけで仕上げる一斤。派手さのない、静かな贅沢を毎日の食卓へ。',
    isPlaceholder: true,
  },

  founderName: { value: '桐山 誠一郎', isPlaceholder: true, note: '架空の人物名です。' },
  founderRole: { value: 'Founder / Head Baker', isPlaceholder: true },
  founderQuote: { value: 'パンは、待つことでしか生まれない。', isPlaceholder: true },
  founderPortrait: {
    value: null,
    isPlaceholder: true,
    note: '本番写真が用意できない場合は null のままで問題ありません。ArtisanCompactコンポーネントは写真なしレイアウトに自動対応します。',
  },

  address: { value: '〒444-0000 愛知県安城市桜町1-2-3', isPlaceholder: true },
  phone: { value: '0566-00-0000', isPlaceholder: true },
  phoneHref: { value: '0566000000', isPlaceholder: true },
  hours: { value: '8:00 - 19:00', isPlaceholder: true },
  closedDay: { value: '毎週火曜日・年末年始', isPlaceholder: true },
  parking: { value: '専用駐車場 5台完備', isPlaceholder: true },
  accessNote: { value: '名鉄西尾線 新安城駅より徒歩12分', isPlaceholder: true },
  mapEmbedUrl: {
    value: 'https://www.google.com/maps?q=Anjo,Aichi,Japan&output=embed',
    isPlaceholder: true,
    note: '実店舗のGoogleビジネスプロフィールが確定したら、共有用の埋め込みURLに差し替えてください。',
  },
  mapViewUrl: {
    value: 'https://www.google.com/maps?q=Anjo,Aichi,Japan',
    isPlaceholder: true,
    note: '「Google Mapで見る」リンク先。Googleビジネスプロフィールの共有URLに差し替えてください。',
  },

  instagramHandle: { value: '@muginomi_boulangerie', isPlaceholder: true },
  instagramUrl: { value: 'https://instagram.com/', isPlaceholder: true },
  instagramFeaturedPostUrl: {
    value: null,
    isPlaceholder: true,
    note: '実際の投稿URLを設定すると、AboutページにInstagram公式の埋め込み(oEmbed)が表示されます。nullの間はプレースホルダーカードを表示します。',
  },
  twitterUrl: { value: null, isPlaceholder: true },

  contactFormRecipient: {
    value: null,
    isPlaceholder: true,
    note: '第二段階でフォーム送信APIを実装する際に、受信先メールアドレスを設定してください。',
  },
};
