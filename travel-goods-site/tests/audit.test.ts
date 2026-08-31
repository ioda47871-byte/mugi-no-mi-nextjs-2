import { describe, expect, it } from 'vitest';
import { auditCatalog, DEFAULT_THRESHOLDS } from '@/lib/catalog/audit';
import type { Catalog } from '@/lib/catalog/types';
import type { MerchantConfig } from '@/config/merchants';
import { fact, makeArticle, makeMerchantLink, makeProduct, testSources } from './fixtures/catalog';

const CONFIG: MerchantConfig = { amazonAssociateTag: 'example-22', rakutenEnabled: true };
const NOW = new Date('2026-08-31T00:00:00Z');

function catalogOf(overrides: Partial<Catalog> = {}): Catalog {
  return {
    dataset: { kind: 'demo', label: 'テスト', notice: null },
    products: [makeProduct()],
    sources: testSources,
    merchantLinks: [],
    articles: [],
    ...overrides,
  };
}

function codes(catalog: Catalog, extra: Parameters<typeof auditCatalog>[0]['candidates'] = []) {
  return auditCatalog({ catalog, merchantConfig: CONFIG, now: NOW, candidates: extra }).findings.map(
    (f) => f.code,
  );
}

describe('点検: 放っておくと壊れるものを見つける', () => {
  it('新しいデータなら何も報告しない', () => {
    const product = makeProduct({
      weightG: fact(2600, 'src-test-maker', '2026-08-25'),
      outerSizeMm: fact<[number, number, number]>([390, 540, 230], 'src-test-maker', '2026-08-25'),
      bodySizeMm: undefined,
      capacityL: fact(38, 'src-test-maker', '2026-08-25'),
      specs: {},
    });
    const sources = testSources.map((s) => ({ ...s, checkedAt: '2026-08-25' }));
    const link = makeMerchantLink({ verifiedAt: '2026-08-25', verificationMethod: 'visual' });
    const result = auditCatalog({
      catalog: catalogOf({ products: [product], sources, merchantLinks: [link] }),
      merchantConfig: CONFIG,
      now: NOW,
    });
    expect(result.findings).toEqual([]);
    expect(result.hasActionRequired).toBe(false);
  });

  it('一部の値だけ古い場合も見逃さない（最も古い確認日で判断する）', () => {
    const product = makeProduct({
      // 重量だけ1年以上前のまま。他の値は新しい。
      weightG: fact(2600, 'src-test-maker', '2025-01-01'),
    });
    const result = auditCatalog({
      catalog: catalogOf({ products: [product] }),
      merchantConfig: CONFIG,
      now: NOW,
    });
    const stale = result.findings.find((f) => f.code === 'product.stale-facts');
    expect(stale).toBeDefined();
    expect(stale!.message).toContain('2025-01-01');
  });

  it('モバイルバッテリーは短い期限で「要対応」にする', () => {
    const battery = makeProduct({
      id: 'p-battery',
      category: 'power-banks',
      variant: '10000mAh',
      weightG: fact(200, 'src-test-maker', '2026-01-01'),
      outerSizeMm: fact<[number, number, number]>([64, 91, 24], 'src-test-maker', '2026-01-01'),
      bodySizeMm: undefined,
      capacityL: { value: null, sourceId: null, checkedAt: null },
      specs: { capacityMah: fact(10000, 'src-test-maker', '2026-01-01') },
    });
    const result = auditCatalog({
      catalog: catalogOf({ products: [battery] }),
      merchantConfig: CONFIG,
      now: NOW,
    });
    const safety = result.findings.find((f) => f.code === 'safety.recheck-due');
    expect(safety?.severity).toBe('action-required');
    expect(result.hasActionRequired).toBe(true);
    expect(safety?.suggestedAction).toContain('回収・リコール');
  });

  it('通常カテゴリはバッテリーより長い期限を使う', () => {
    // 100日前 … バッテリー(90日)なら超過、通常(180日)なら未超過
    const product = makeProduct({ weightG: fact(2600, 'src-test-maker', '2026-05-23') });
    expect(codes(catalogOf({ products: [product] }))).not.toContain('product.stale-facts');
  });

  it('購入リンクが無い公開商品を知らせる', () => {
    expect(codes(catalogOf())).toContain('product.no-merchant-link');
  });

  it('目視未確認のまま表示しているリンクを知らせる', () => {
    const link = makeMerchantLink({ verificationMethod: 'identifier-match' });
    expect(codes(catalogOf({ merchantLinks: [link] }))).toContain('link.not-visually-checked');
  });

  it('目視確認済みのリンクは知らせない', () => {
    const link = makeMerchantLink({ verificationMethod: 'visual' });
    expect(codes(catalogOf({ merchantLinks: [link] }))).not.toContain('link.not-visually-checked');
  });

  it('照合から時間が経ったリンクを知らせる', () => {
    const link = makeMerchantLink({ verifiedAt: '2025-01-01', verificationMethod: 'visual' });
    expect(codes(catalogOf({ merchantLinks: [link] }))).toContain('link.stale-verification');
  });

  it('公開記事が未公開商品を参照していたら「要対応」', () => {
    const draft = makeProduct({ status: 'draft' });
    const article = makeArticle();
    const result = auditCatalog({
      catalog: catalogOf({ products: [draft], articles: [article] }),
      merchantConfig: CONFIG,
      now: NOW,
    });
    const finding = result.findings.find((f) => f.code === 'article.references-unpublished-product');
    expect(finding?.severity).toBe('action-required');
  });

  it('長く更新されていない公開記事を知らせる', () => {
    const article = makeArticle({ publishedAt: '2024-01-01', updatedAt: '2024-01-01' });
    expect(codes(catalogOf({ articles: [article] }))).toContain('article.stale');
  });

  it('放置された商品候補を知らせる', () => {
    const codesFound = codes(catalogOf(), [
      { itemCode: 'shop:a', itemName: '候補A', status: 'new', fetchedAt: '2026-01-01' },
      { itemCode: 'shop:b', itemName: '候補B', status: 'rejected', fetchedAt: '2026-01-01' },
    ]);
    expect(codesFound.filter((c) => c === 'candidate.unreviewed')).toHaveLength(1);
  });

  it('未公開(draft)の商品は点検対象にしない', () => {
    const draft = makeProduct({ status: 'draft', weightG: fact(2600, 'src-test-maker', '2024-01-01') });
    const found = codes(catalogOf({ products: [draft] }));
    expect(found).not.toContain('product.stale-facts');
    expect(found).not.toContain('product.no-merchant-link');
  });

  it('期限は調整できる', () => {
    const product = makeProduct({ weightG: fact(2600, 'src-test-maker', '2026-08-01') });
    const strict = auditCatalog({
      catalog: catalogOf({ products: [product] }),
      merchantConfig: CONFIG,
      now: NOW,
      thresholds: { productFactDays: 7 },
    });
    expect(strict.findings.map((f) => f.code)).toContain('product.stale-facts');
    expect(DEFAULT_THRESHOLDS.productFactDays).toBe(180);
  });

  it('報告には対象と、次にやることが必ず入る', () => {
    const result = auditCatalog({ catalog: catalogOf(), merchantConfig: CONFIG, now: NOW });
    for (const finding of result.findings) {
      expect(finding.subject.length).toBeGreaterThan(0);
      expect(finding.suggestedAction.length).toBeGreaterThan(0);
    }
  });
});
