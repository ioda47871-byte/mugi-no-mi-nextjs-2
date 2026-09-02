/**
 * テスト用の fixture factory。
 *
 * すべての factory は引数なしで呼んで検証（productSchema / sourceSchema /
 * inspectCatalog）を通る値を返す。`over` で任意のフィールドだけ差し替えられる。
 * 実在の紹介ID・資格情報は含めない。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '../../src/lib/catalog/types';
import type {
  Article,
  Catalog,
  DatasetInfo,
  Fact,
  MerchantLink,
  Product,
  PublicationStatus,
  Source,
} from '../../src/lib/catalog/types';
import type { CatalogInput } from '../../src/lib/catalog/validate';
import type { TierInput } from '../../src/lib/automation/tier';
import type { LinkHealthEntry, LinkSignals } from '../../src/lib/automation/state/schema';
import type { RakutenItem } from '../../src/lib/rakuten/types';

const CHECKED_AT = '2026-08-31';

export const AFFILIATE_URL_FIXTURE =
  'https://hb.afl.rakuten.co.jp/ichiba/0000test0.00000000.0000test1.00000000/' +
  '?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Ftestshop%2Ftest-item-001%2F&link_type=text';

export function makeFact<T>(value: T | null, over: Partial<Fact<T>> = {}): Fact<T> {
  return {
    value,
    sourceId: value === null ? null : 'src-fixture-ace-06936',
    checkedAt: value === null ? null : CHECKED_AT,
    ...over,
  };
}

export function makeSource(over: Partial<Source> = {}): Source {
  return {
    id: 'src-fixture-ace-06936',
    url: 'https://store.ace.jp/shop/g/g06936-01/',
    publisher: 'エース株式会社（エース公式通販）',
    checkedAt: CHECKED_AT,
    provenance: 'direct-fetch',
    importedFrom: null,
    locator: '商品ページ「スペックとサイズ」欄',
    editorialUse: 'verified',
    automatedFetch: 'allowed',
    llmInput: 'unverified',
    usageNote: 'テスト用の合成データ。実ページの本文は含まない',
    ...over,
  };
}

export function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: 'fixture-ace-06936',
    category: 'suitcases',
    brand: 'エース（ACE）',
    model: 'クレスタ2 06936',
    variant: '35L / 01 ブラックヘアライン',
    jan: null,
    status: 'published',
    summary: '公表値の重量・外寸・容量を並べるためのテスト用商品です。',
    weightG: makeFact(2900),
    outerSizeMm: makeFact<[number, number, number]>([350, 550, 250]),
    sizeBasis: 'with-handle-and-wheels',
    measurementState: 'normal',
    capacityL: makeFact(35),
    alternateMeasurements: [],
    specs: {},
    caveats: [],
    image: null,
    ...over,
  };
}

export function makeMerchantLink(over: Partial<MerchantLink> = {}): MerchantLink {
  return {
    productId: 'fixture-ace-06936',
    merchant: 'rakuten',
    externalProductId: 'testshop:test-item-001',
    affiliateUrl: AFFILIATE_URL_FIXTURE,
    matchedVariant: '35L / 01 ブラックヘアライン',
    verifiedAt: CHECKED_AT,
    status: 'verified',
    verificationMethod: 'visual',
    note: 'テスト用の合成リンク',
    ...over,
  };
}

export function makeArticle(over: Partial<Article> = {}): Article {
  return {
    slug: 'fixture-article',
    title: 'テスト用の比較記事',
    description: '公表値だけを並べたテスト用の記事です。',
    category: 'suitcases',
    status: 'published',
    productIds: ['fixture-ace-06936'],
    sourceIds: ['src-fixture-ace-06936'],
    publishedAt: CHECKED_AT,
    updatedAt: CHECKED_AT,
    reviewedAt: CHECKED_AT,
    reviewer: '編集部',
    intentKey: 'fixture-suitcases-weight',
    // evaluatePublication の本文下限（400 文字）を満たすため繰り返す
    body: 'テスト用の本文です。'.repeat(40),
    ...over,
  };
}

export function makeCatalog(over: Partial<Catalog> = {}): Catalog {
  const dataset: DatasetInfo = { kind: 'production', label: 'テスト用', notice: null };
  return {
    dataset,
    products: [makeProduct()],
    sources: [makeSource()],
    merchantLinks: [makeMerchantLink()],
    articles: [makeArticle()],
    ...over,
  };
}

export function makeRakutenItem(over: Partial<RakutenItem> = {}): RakutenItem {
  return {
    itemCode: 'testshop:test-item-001',
    itemName: 'エース クレスタ2 06936 スーツケース 35L 01 ブラックヘアライン',
    itemUrl: 'https://item.rakuten.co.jp/testshop/test-item-001/',
    affiliateUrl: AFFILIATE_URL_FIXTURE,
    shopName: 'テスト商店',
    shopCode: 'testshop',
    itemCaption: '本体重量2.9kg。外寸 幅35×高さ55×奥行25cm。容量35L。',
    ...over,
  };
}

export type CandidatePair = { product: Product; source: Source };

/**
 * Product と、その全 Fact が参照する Source を対で作る。
 * Fact の sourceId を既定値のまま残さないことがこの関数の目的である。
 * makeProduct({ id }) だけを差し替えると sourceId が 'src-fixture-ace-06936' に
 * 残り、同時に保存する Source と一致せず inspectCatalog が落ちる。
 */
export function makeCandidatePair(
  productId: string,
  status: PublicationStatus = 'review',
  checkedAt: string = CHECKED_AT,
): CandidatePair {
  const sourceId = `src-${productId}`;
  const at = { sourceId, checkedAt };
  return {
    source: makeSource({ id: sourceId, checkedAt }),
    product: makeProduct({
      id: productId,
      status,
      weightG: makeFact(2900, at),
      outerSizeMm: makeFact<[number, number, number]>([350, 550, 250], at),
      capacityL: makeFact(35, at),
      // bodySizeMm / alternateMeasurements / specs を持たせるときも、
      // それぞれの Fact に同じ `at` を渡して sourceId を揃える。
      alternateMeasurements: [],
      specs: {},
    }),
  };
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

/** datasets/production と同じ構造の、空の最小データセットを rootDir に作る。 */
export function seedMinimalDataset(rootDir: string): void {
  fs.mkdirSync(path.join(rootDir, 'products'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'merchants'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'articles'), { recursive: true });
  writeJson(path.join(rootDir, 'dataset.json'), {
    kind: 'production',
    label: 'テスト用の最小データセット',
    notice: null,
  });
  // カテゴリを増やしたときに直し忘れないよう CATEGORIES から生成する
  for (const category of CATEGORIES) {
    writeJson(path.join(rootDir, 'products', `${category}.json`), []);
  }
  writeJson(path.join(rootDir, 'sources.json'), []);
  writeJson(path.join(rootDir, 'merchants', 'rakuten.json'), []);
  writeJson(path.join(rootDir, 'merchants', 'amazon.json'), []);
}

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
}

function readJsonArrayDir(dir: string): unknown[] {
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .flatMap((file) => readJson(path.join(dir, file)) as unknown[]);
}

/**
 * seedMinimalDataset で作ったディレクトリを CatalogInput として読み戻す。
 * src/lib/catalog/load.ts の readDatasetInput は DatasetKind でしか解決できないため、
 * テスト側に置く。src/ は変更しない。
 */
export function readSeededDataset(rootDir: string): CatalogInput {
  return {
    dataset: readJson(path.join(rootDir, 'dataset.json')),
    products: readJsonArrayDir(path.join(rootDir, 'products')),
    sources: readJson(path.join(rootDir, 'sources.json')),
    merchantLinks: readJsonArrayDir(path.join(rootDir, 'merchants')),
    articles: [],
  };
}

/** S の 9 条件をすべて満たす既定値。テストはここから 1 項目ずつ崩す。 */
export function makeTierInput(over: Partial<TierInput> = {}): TierInput {
  return {
    manufacturerId: 'ace',
    officialFetchStatus: 'ok',
    extraction: {
      ok: true,
      rangeHash: 'a'.repeat(64),
      spec: {
        weightG: 2900,
        outerSizeMm: [350, 550, 250],
        capacityL: 35,
        sizeBasis: 'with-handle-and-wheels',
        measurementState: 'normal',
        specs: {},
      },
    },
    recallStatus: 'clear',
    jan: 'published-and-matched',
    model: 'exact',
    variant: 'matched',
    initialSelection: '6b-inferred',
    affiliateUrl: 'valid-item-page',
    duplicate: 'unique',
    excludedTerm: 'clean',
    officialConsistency: 'consistent',
    recheck: 'matched-previous-day',
    ...over,
  };
}

export function makeLinkSignals(over: Partial<LinkSignals> = {}): LinkSignals {
  return {
    observationStatus: 'ok',
    itemCodeAlive: true,
    availability: 1,
    affiliateTargetChanged: false,
    httpStatus: null,
    identifierMatch: 'strong',
    variantMatch: true,
    ...over,
  };
}

export function makeLinkHealthEntry(over: Partial<LinkHealthEntry> = {}): LinkHealthEntry {
  return {
    productId: 'fixture-ace-06936',
    merchant: 'rakuten',
    externalProductId: 'testshop:test-item-001',
    signals: makeLinkSignals(),
    consecutiveFailures: 0,
    consecutiveOutOfStock: 0,
    lastHealthyAt: '2026-09-01',
    state: 'healthy',
    ...over,
  };
}
