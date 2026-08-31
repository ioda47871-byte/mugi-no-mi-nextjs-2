/**
 * 単体テスト専用のデータ。本番データ(datasets/production)とデモデータ(datasets/demo)には混ぜない。
 * ここに出てくるID・ASIN・URLはテスト用の架空値で、公開物には使用しない。
 */
import type {
  Article,
  Fact,
  MerchantLink,
  Product,
  Source,
} from '@/lib/catalog/types';

export const TEST_TODAY = new Date('2026-08-31T00:00:00Z');

export function fact<T>(value: T | null, sourceId = 'src-test-maker', checkedAt = '2026-08-20'): Fact<T> {
  return value === null
    ? { value: null, sourceId: null, checkedAt: null }
    : { value, sourceId, checkedAt };
}

export const testSources: Source[] = [
  {
    id: 'src-test-maker',
    url: 'https://example.invalid/spec',
    publisher: 'テスト用メーカー',
    checkedAt: '2026-08-20',
    provenance: 'direct-fetch',
    importedFrom: null,
    locator: '仕様表',
    editorialUse: 'verified',
    automatedFetch: 'unverified',
    llmInput: 'not-allowed',
    usageNote: 'テスト専用。実在しません。',
  },
  {
    id: 'src-test-unverified',
    url: 'https://example.invalid/blog',
    publisher: 'テスト用の未確認ソース',
    checkedAt: '2026-08-20',
    provenance: 'direct-fetch',
    importedFrom: null,
    locator: '本文',
    editorialUse: 'unverified',
    automatedFetch: 'unverified',
    llmInput: 'not-allowed',
    usageNote: 'テスト専用。実在しません。',
  },
];

export function makeProduct(overrides: Partial<Product> = {}): Product {
  const base: Product = {
    id: 'p-test-case-a',
    category: 'suitcases',
    brand: 'テストブランド',
    model: 'TC-100',
    variant: '38L / 機内持ち込みサイズ',
    status: 'published',
    summary: 'テスト用のスーツケース。',
    weightG: fact(2600),
    outerSizeMm: fact<[number, number, number]>([390, 540, 230]),
    sizeBasis: 'with-handle-and-wheels',
    measurementState: 'not-applicable',
    bodySizeMm: fact<[number, number, number]>([360, 500, 220]),
    capacityL: fact(38),
    alternateMeasurements: [],
    specs: {
      stopper: fact(true),
      openingType: fact('両開き'),
      wheelCount: fact(4),
    },
    caveats: ['航空会社ごとの持ち込み規定は各社の公式案内で確認してください。'],
    image: null,
  };
  return { ...base, ...overrides };
}

export function makeMerchantLink(overrides: Partial<MerchantLink> = {}): MerchantLink {
  const base: MerchantLink = {
    productId: 'p-test-case-a',
    merchant: 'amazon',
    externalProductId: 'B0TEST0001',
    affiliateUrl: null,
    matchedVariant: '38L / 機内持ち込みサイズ',
    verifiedAt: '2026-08-20',
    status: 'verified',
    verificationMethod: 'identifier-match',
  };
  return { ...base, ...overrides };
}

export function makeArticle(overrides: Partial<Article> = {}): Article {
  const base: Article = {
    slug: 'test-article',
    title: 'テスト記事',
    description: 'テスト用の説明文です。',
    category: 'suitcases',
    status: 'published',
    productIds: ['p-test-case-a'],
    sourceIds: ['src-test-maker'],
    publishedAt: '2026-08-25',
    updatedAt: '2026-08-25',
    reviewedAt: '2026-08-25',
    reviewer: 'テスト担当',
    intentKey: 'test-intent',
    body: 'あ'.repeat(500),
  };
  return { ...base, ...overrides };
}

export function makeCatalogInput(overrides: {
  products?: unknown;
  sources?: unknown;
  merchantLinks?: unknown;
  articles?: unknown;
  dataset?: unknown;
} = {}) {
  return {
    dataset: overrides.dataset ?? {
      kind: 'demo',
      label: 'テスト用データセット',
      notice: 'テスト用',
    },
    products: overrides.products ?? [makeProduct()],
    sources: overrides.sources ?? testSources,
    merchantLinks: overrides.merchantLinks ?? [],
    articles: overrides.articles ?? [],
  };
}

/** 値が不明な事実。文脈から型が決まる（例: weightG: unknownFact()）。 */
export function unknownFact<T>(note?: string): Fact<T> {
  return note
    ? { value: null, sourceId: null, checkedAt: null, note }
    : { value: null, sourceId: null, checkedAt: null };
}
