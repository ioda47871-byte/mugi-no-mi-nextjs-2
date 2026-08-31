import { describe, expect, it } from 'vitest';
import { inspectCatalog, validateCatalog, CatalogValidationError } from '@/lib/catalog/validate';
import { filterProducts, sortProducts, outerSizeSumMm } from '@/lib/catalog/filter';
import {
  TEST_TODAY,
  fact,
  makeArticle,
  makeCatalogInput,
  makeMerchantLink,
  makeProduct,
  testSources,
  unknownFact,
} from './fixtures/catalog';

const opts = { now: TEST_TODAY };

function errorCodes(input: ReturnType<typeof makeCatalogInput>) {
  return inspectCatalog(input, opts)
    .issues.filter((issue) => issue.severity === 'error')
    .map((issue) => issue.code);
}

describe('validateCatalog: 根拠のないデータを通さない', () => {
  it('正しいデータは検証を通る', () => {
    const catalog = validateCatalog(makeCatalogInput(), opts);
    expect(catalog.products).toHaveLength(1);
    expect(catalog.sources).toHaveLength(2);
  });

  it('値があるのに出典が無い仕様を拒否する', () => {
    const product = makeProduct({
      weightG: { value: 2600, sourceId: null, checkedAt: null },
    });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain('fact.missing-evidence');
  });

  it('存在しない出典IDの参照を検出する', () => {
    const product = makeProduct({ weightG: fact(2600, 'src-does-not-exist') });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain('fact.unknown-source');
  });

  it('未来の確認日を拒否する', () => {
    const product = makeProduct({ weightG: fact(2600, 'src-test-maker', '2099-01-01') });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain('fact.future-checked-at');
  });

  it('負の重量を拒否する', () => {
    const product = makeProduct({ weightG: fact(-100) });
    expect(errorCodes(makeCatalogInput({ products: [product] })).length).toBeGreaterThan(0);
  });

  it('公開商品には editorialUse: verified の出典を要求する', () => {
    const product = makeProduct({ weightG: fact(2600, 'src-test-unverified') });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain('fact.unverified-source');
  });

  it('未公開(draft)商品なら未確認出典でも保存はできる', () => {
    const product = makeProduct({
      status: 'draft',
      weightG: fact(2600, 'src-test-unverified'),
    });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).not.toContain(
      'fact.unverified-source',
    );
  });

  it('カテゴリで許可されていない spec キーを拒否する', () => {
    const product = makeProduct({
      specs: { ratedWh: fact(50) }, // suitcases に ratedWh は無い
    });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain('product.schema');
  });

  it('spec の型違いを拒否する（stopper は boolean）', () => {
    const product = makeProduct({ specs: { stopper: fact('あり') } });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain('product.schema');
  });

  it('ブランド・型番・バリエーションが同一の重複登録を拒否する', () => {
    const a = makeProduct({ id: 'p-dup-a' });
    const b = makeProduct({ id: 'p-dup-b' });
    expect(errorCodes(makeCatalogInput({ products: [a, b] }))).toContain('product.duplicate-identity');
  });

  it('容量違いは別バリエーションとして共存できる', () => {
    const a = makeProduct({ id: 'p-var-a', variant: '38L', capacityL: fact(38) });
    const b = makeProduct({ id: 'p-var-b', variant: '48L', capacityL: fact(48) });
    expect(errorCodes(makeCatalogInput({ products: [a, b] }))).toHaveLength(0);
  });

  it('公開商品に比較できる値が1つも無ければ拒否する', () => {
    const product = makeProduct({
      weightG: unknownFact(),
      outerSizeMm: unknownFact(),
      bodySizeMm: unknownFact(),
      capacityL: unknownFact(),
      specs: {},
    });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain(
      'product.no-comparable-fact',
    );
  });

  it('拡張時の寸法を主要値と同じ状態で登録できない', () => {
    const product = makeProduct({
      measurementState: 'normal',
      alternateMeasurements: [
        {
          label: '拡張時',
          state: 'normal',
          sizeMm: fact<[number, number, number]>([400, 550, 250]),
          sizeBasis: 'excludes-handle',
          capacityL: fact(48),
        },
      ],
    });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain(
      'product.redundant-measurement',
    );
  });

  it('別条件の寸法にも出典と確認日を要求する', () => {
    const product = makeProduct({
      measurementState: 'normal',
      alternateMeasurements: [
        {
          label: '拡張時',
          state: 'expanded',
          sizeMm: { value: [400, 550, 250], sourceId: null, checkedAt: null },
          sizeBasis: 'excludes-handle',
          capacityL: unknownFact(),
        },
      ],
    });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain('fact.missing-evidence');
  });

  it('外寸が本体のみ条件なら本体寸法の二重登録を拒否する', () => {
    const product = makeProduct({ sizeBasis: 'body-only' });
    expect(errorCodes(makeCatalogInput({ products: [product] }))).toContain(
      'product.duplicate-body-size',
    );
  });

  it('未知の商品IDを参照する記事を拒否する', () => {
    const article = makeArticle({ productIds: ['p-missing'] });
    expect(errorCodes(makeCatalogInput({ articles: [article] }))).toContain('article.unknown-product');
  });

  it('同じ検索意図キーの記事重複を拒否する', () => {
    const a = makeArticle({ slug: 'a-1' });
    const b = makeArticle({ slug: 'a-2' });
    expect(errorCodes(makeCatalogInput({ articles: [a, b] }))).toContain('article.duplicate-intent');
  });

  it('記事本文の生HTML・スクリプトを拒否する', () => {
    const article = makeArticle({ body: `${'あ'.repeat(400)}\n\n<script>alert(1)</script>` });
    expect(errorCodes(makeCatalogInput({ articles: [article] }))).toContain('article.unsafe-body');
  });

  it('販売先のバリエーション不一致を拒否する', () => {
    const link = makeMerchantLink({ matchedVariant: '48L / 別サイズ' });
    expect(errorCodes(makeCatalogInput({ merchantLinks: [link] }))).toContain(
      'merchant.variant-mismatch',
    );
  });

  it('照合済みリンクに判断根拠を要求する', () => {
    const link = makeMerchantLink({ verificationMethod: undefined });
    expect(errorCodes(makeCatalogInput({ merchantLinks: [link] }))).toContain(
      'merchant.missing-verification-method',
    );
  });

  it('目視確認と型番一致を区別して記録できる', () => {
    const visual = makeMerchantLink({ verificationMethod: 'visual' });
    expect(errorCodes(makeCatalogInput({ merchantLinks: [visual] }))).toHaveLength(0);
  });

  it('楽天の verified リンクに発行済み紹介URLを要求する', () => {
    const link = makeMerchantLink({ merchant: 'rakuten', affiliateUrl: null });
    expect(errorCodes(makeCatalogInput({ merchantLinks: [link] }))).toContain(
      'merchant.rakuten-missing-url',
    );
  });

  it('不正なASINの verified リンクを拒否する', () => {
    const link = makeMerchantLink({ externalProductId: 'not-an-asin' });
    expect(errorCodes(makeCatalogInput({ merchantLinks: [link] }))).toContain('merchant.invalid-asin');
  });

  it('エラーには対象IDと理由が含まれる', () => {
    const product = makeProduct({ id: 'p-broken', weightG: fact(2600, 'src-nope') });
    try {
      validateCatalog(makeCatalogInput({ products: [product] }), opts);
      throw new Error('検証が通ってしまいました');
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogValidationError);
      const issues = (error as CatalogValidationError).issues;
      expect(issues.some((i) => i.subject === 'p-broken' && i.message.includes('src-nope'))).toBe(true);
    }
  });

  it('提供資料からの取り込みには資料名と取込日を要求する', () => {
    const sources = [
      { ...testSources[0]!, provenance: 'provided-document', importedFrom: null },
      testSources[1]!,
    ];
    expect(errorCodes(makeCatalogInput({ sources }))).toContain('source.missing-import-record');
  });

  it('保存物からの取り込みにも元資料と取込日を要求する', () => {
    const sources = [
      { ...testSources[0]!, provenance: 'archived-primary-source', importedFrom: null },
      testSources[1]!,
    ];
    expect(errorCodes(makeCatalogInput({ sources }))).toContain('source.missing-import-record');
  });

  it('保存物の出典は元資料のパスと取込日があれば通る', () => {
    const sources = [
      {
        ...testSources[0]!,
        provenance: 'archived-primary-source',
        importedFrom: {
          document: 'datasets/production/research-materials/2026-08-20-maker-spec.pdf',
          importedAt: '2026-08-20',
        },
      },
      testSources[1]!,
    ];
    expect(errorCodes(makeCatalogInput({ sources }))).toHaveLength(0);
  });

  it('自力で接続していない出典を direct-fetch として記録できない', () => {
    const sources = [
      {
        ...testSources[0]!,
        provenance: 'direct-fetch',
        importedFrom: { document: 'research.md', importedAt: '2026-08-20' },
      },
      testSources[1]!,
    ];
    expect(errorCodes(makeCatalogInput({ sources }))).toContain('source.unexpected-import-record');
  });

  it('取込日が未来なら拒否する', () => {
    const sources = [
      {
        ...testSources[0]!,
        provenance: 'provided-document',
        importedFrom: { document: 'research.md', importedAt: '2099-01-01' },
      },
      testSources[1]!,
    ];
    expect(errorCodes(makeCatalogInput({ sources }))).toContain('source.future-imported-at');
  });

  it('出典の checkedAt が未来なら拒否する', () => {
    const sources = [{ ...testSources[0]!, checkedAt: '2099-01-01' }, testSources[1]!];
    expect(errorCodes(makeCatalogInput({ sources }))).toContain('source.future-checked-at');
  });
});

describe('filterProducts: 不明値を条件一致と扱わない', () => {
  const known = makeProduct({ id: 'p-known', weightG: fact(2600), capacityL: fact(38) });
  const unknownWeight = makeProduct({
    id: 'p-unknown',
    variant: '重量非公表モデル',
    weightG: unknownFact(),
    capacityL: fact(40),
  });
  const products = [known, unknownWeight];

  it('重量条件を付けると、重量不明の商品は除外される', () => {
    const result = filterProducts(products, { weightG: { max: 3000 } });
    expect(result.map((p) => p.id)).toEqual(['p-known']);
  });

  it('重量条件が無ければ重量不明の商品も残る', () => {
    const result = filterProducts(products, { capacityL: { min: 30 } });
    expect(result.map((p) => p.id).sort()).toEqual(['p-known', 'p-unknown']);
  });

  it('boolean spec は不明・未掲載を「条件を満たす」と扱わない', () => {
    const noStopper = makeProduct({ id: 'p-nostopper', variant: 'ストッパー情報なし', specs: {} });
    const result = filterProducts([known, noStopper], { requiredBooleanSpecs: ['stopper'] });
    expect(result.map((p) => p.id)).toEqual(['p-known']);
  });

  it('外寸が不明なら外寸条件の対象外になる', () => {
    const noSize = makeProduct({
      id: 'p-nosize',
      variant: '外寸非公表',
      outerSizeMm: unknownFact(),
    });
    expect(outerSizeSumMm(noSize)).toBeNull();
    const result = filterProducts([known, noSize], { outerSizeSumMm: { max: 1200 } });
    expect(result.map((p) => p.id)).toEqual(['p-known']);
  });

  it('既定では published のみを返す', () => {
    const draft = makeProduct({ id: 'p-draft', variant: '下書き', status: 'draft' });
    expect(filterProducts([known, draft]).map((p) => p.id)).toEqual(['p-known']);
  });
});

describe('sortProducts: 不明値に順位を付けない', () => {
  it('数値不明の商品は常に末尾へ置く', () => {
    const light = makeProduct({ id: 'p-light', variant: '軽量', weightG: fact(1900) });
    const heavy = makeProduct({ id: 'p-heavy', variant: '重量級', weightG: fact(3800) });
    const unknown = makeProduct({ id: 'p-unknown', variant: '非公表', weightG: unknownFact() });
    const sorted = sortProducts([heavy, unknown, light], 'weightG');
    expect(sorted.map((p) => p.id)).toEqual(['p-light', 'p-heavy', 'p-unknown']);
  });
});
