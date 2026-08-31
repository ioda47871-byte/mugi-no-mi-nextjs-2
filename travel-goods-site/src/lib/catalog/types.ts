/**
 * 商品カタログの型契約（計画書 5-3節）。
 *
 * 単位の約束（例外を作らない）:
 *   重量 = g / 寸法 = mm / 容量 = L / 出力 = W / 電力量 = Wh / 電池容量 = mAh
 *
 * 値が不明なら null。0・推定値・類似商品の値で埋めない。
 */

export const CATEGORIES = ['suitcases', 'backpacks', 'pouches', 'power-banks'] as const;
export type Category = (typeof CATEGORIES)[number];

export const PUBLICATION_STATUSES = ['draft', 'review', 'published', 'retired'] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

/**
 * 事実 1 件。値を持つなら必ず出典IDと確認日を伴う。
 * 「値はあるが出典が無い」状態は検証で拒否する。
 */
export type Fact<T> = {
  value: T | null;
  sourceId: string | null;
  checkedAt: string | null; // ISO 8601 (YYYY-MM-DD)
  /** 値が null のときに、なぜ不明なのかを残す（任意）。 */
  note?: string;
};

/** [幅, 高さ, 奥行] mm */
export type SizeMm = [number, number, number];

export type SpecValue = string | number | boolean;

export type Product = {
  id: string;
  category: Category;
  brand: string;
  model: string;
  /** 容量違い・拡張前後・単品/セットなどを区別する識別子。 */
  variant: string;
  status: PublicationStatus;
  /** 一覧・カード用の短い説明。仕様の言い換えに留め、使用感を書かない。 */
  summary: string;
  weightG: Fact<number>;
  /** ハンドル・キャスターを含む外寸。 */
  outerSizeMm: Fact<SizeMm>;
  /** 本体寸法（外寸と別項目）。スーツケース以外では null のことが多い。 */
  bodySizeMm?: Fact<SizeMm>;
  capacityL: Fact<number>;
  specs: Record<string, Fact<SpecValue>>;
  /** 仕様上の制約・注意点。断定的な使用感は書かない。 */
  caveats: string[];
  /** 画像は権利確認できたものだけ。未確認なら null（文字主体のカードで表示）。 */
  image: { src: string; alt: string; sourceId: string } | null;
};

export type MerchantName = 'amazon' | 'rakuten';

export type MerchantLink = {
  productId: string;
  merchant: MerchantName;
  /** Amazon なら ASIN、楽天なら itemCode 等。 */
  externalProductId: string;
  /** 楽天は発行済み紹介URLをそのまま保持。Amazon は tag から生成するため null 可。 */
  affiliateUrl: string | null;
  /** 販売ページ側で確認したバリエーション。Product.variant と一致しなければ表示しない。 */
  matchedVariant: string;
  verifiedAt: string | null;
  status: 'verified' | 'unverified' | 'unavailable';
  note?: string;
};

export type Source = {
  id: string;
  url: string;
  publisher: string;
  checkedAt: string;
  /** 表・見出しなど参照箇所。 */
  locator: string;
  /** 編集上、事実として採用してよいか確認済みか。 */
  editorialUse: 'verified' | 'unverified';
  /** 自動取得の可否確認。未確認なら自動化の対象外。 */
  automatedFetch: 'allowed' | 'not-allowed' | 'unverified';
  /** 原文を外部AIへ渡してよいか。公開ページを見つけただけでは allowed にしない。 */
  llmInput: 'allowed' | 'not-allowed' | 'unverified';
  usageNote: string;
};

export type ArticleMeta = {
  slug: string;
  title: string;
  description: string;
  category: Category | 'packing';
  status: PublicationStatus;
  productIds: string[];
  sourceIds: string[];
  publishedAt: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  reviewer: string | null;
  /** 検索意図キー。重複した意図の記事を量産しないための識別子。 */
  intentKey: string;
};

export type Article = ArticleMeta & {
  /** Markdown 本文（生HTMLは検証で拒否される）。 */
  body: string;
};

export type DatasetKind = 'production' | 'demo';

export type DatasetInfo = {
  kind: DatasetKind;
  label: string;
  /** demo の場合、画面に必ず表示する注意文。 */
  notice: string | null;
};

export type Catalog = {
  dataset: DatasetInfo;
  products: Product[];
  sources: Source[];
  merchantLinks: MerchantLink[];
  articles: Article[];
};

export const CATEGORY_LABELS: Record<Category, string> = {
  suitcases: 'スーツケース',
  backpacks: '旅行用リュック',
  pouches: '収納・圧縮・洗面ポーチ',
  'power-banks': 'モバイルバッテリー',
};

export const CATEGORY_SHORT_LABELS: Record<Category, string> = {
  suitcases: 'スーツケース',
  backpacks: 'リュック',
  pouches: 'ポーチ',
  'power-banks': 'バッテリー',
};

export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  suitcases: '外寸・本体重量・容量・ストッパーの有無などを、公表仕様から横並びにします。',
  backpacks: '本体重量・容量・開き方・収納構成を比べて、2〜3泊に合う大きさを探せます。',
  pouches: 'ポーチ自身の重量と収納時の寸法、仕切りや吊り下げ機能を比べます。',
  'power-banks': '重量・電池容量・定格電力量(Wh)・出力・端子を並べて確認できます。',
};

export const ARTICLE_CATEGORY_LABELS: Record<Category | 'packing', string> = {
  ...CATEGORY_LABELS,
  packing: '荷づくり・準備',
};

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}
