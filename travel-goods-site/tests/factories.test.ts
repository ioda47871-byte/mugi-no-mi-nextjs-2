// tests/factories.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { itemPageUrlFromAffiliateUrl } from '../src/lib/affiliate/rakuten';
import {
  AFFILIATE_URL_FIXTURE,
  makeCandidatePair,
  makeCatalog,
  makeProduct,
  readSeededDataset,
  seedMinimalDataset,
} from './factories';

describe('fixture factory', () => {
  it('makeCatalog() は検証を通る', () => {
    const catalog = makeCatalog();
    const result = inspectCatalog(
      {
        dataset: catalog.dataset,
        products: catalog.products,
        sources: catalog.sources,
        merchantLinks: catalog.merchantLinks,
        articles: catalog.articles,
      },
      { now: new Date('2026-09-02T00:00:00Z') },
    );
    expect(result.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('over で指定したフィールドだけが変わる', () => {
    const base = makeProduct();
    const other = makeProduct({ id: 'other-product', capacityL: base.capacityL });
    expect(other.id).toBe('other-product');
    expect(other.brand).toBe(base.brand);
    expect(other.capacityL).toEqual(base.capacityL);
  });

  it('テスト用の紹介URLから商品ページURLを取り出せる', () => {
    expect(itemPageUrlFromAffiliateUrl(AFFILIATE_URL_FIXTURE))
      .toBe('https://item.rakuten.co.jp/testshop/test-item-001/');
  });
});

describe('makeCandidatePair', () => {
  it('全 Fact の sourceId が対の Source の ID と一致する', () => {
    const { product, source } = makeCandidatePair('ace-06936-35l-4ea43263');
    expect(source.id).toBe('src-ace-06936-35l-4ea43263');
    expect(product.weightG.sourceId).toBe(source.id);
    expect(product.outerSizeMm.sourceId).toBe(source.id);
    expect(product.capacityL.sourceId).toBe(source.id);
    expect(product.bodySizeMm ?? null).toBeNull();
    expect(product.alternateMeasurements).toEqual([]);
    expect(product.specs).toEqual({});
  });

  it('既定の src-fixture-ace-06936 を残さない', () => {
    const { product } = makeCandidatePair('ace-06936-35l-4ea43263');
    const ids = [product.weightG.sourceId, product.outerSizeMm.sourceId, product.capacityL.sourceId];
    expect(ids).not.toContain('src-fixture-ace-06936');
  });

  it('対だけを渡しても inspectCatalog が ok になる', () => {
    const { product, source } = makeCandidatePair('ace-06936-35l-4ea43263', 'published');
    const result = inspectCatalog({
      dataset: { kind: 'production', label: 'テスト用', notice: null },
      products: [product],
      sources: [source],
      merchantLinks: [],
      articles: [],
    });
    expect(result.issues.map((i) => i.message)).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('seedMinimalDataset', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-dataset-'));
    seedMinimalDataset(rootDir);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('production と同じ構造を作る', () => {
    for (const rel of [
      'dataset.json',
      'products/suitcases.json',
      'products/backpacks.json',
      'products/pouches.json',
      'products/power-banks.json',
      'sources.json',
      'merchants/rakuten.json',
      'merchants/amazon.json',
      'articles',
    ]) {
      expect(fs.existsSync(path.join(rootDir, rel))).toBe(true);
    }
  });

  it('空のまま inspectCatalog を通る', () => {
    const result = inspectCatalog(readSeededDataset(rootDir));
    expect(result.issues.map((i) => i.message)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('対を書き込んだあとも inspectCatalog を通る', () => {
    const { product, source } = makeCandidatePair('ace-06936-35l-4ea43263', 'published');
    fs.writeFileSync(
      path.join(rootDir, 'products/suitcases.json'),
      `${JSON.stringify([product], null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(rootDir, 'sources.json'),
      `${JSON.stringify([source], null, 2)}\n`,
    );
    const result = inspectCatalog(readSeededDataset(rootDir));
    expect(result.issues.map((i) => i.message)).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
