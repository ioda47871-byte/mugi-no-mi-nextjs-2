# 実装計画 1/4: 自動運用の土台（状態・判定・アダプター・統合CLI）

## Goal

`travel-goods-site` の自動運用に必要な**判定ロジック・状態スキーマ・メーカーアダプター**を実装し、
それらを結ぶ**統合 CLI**（楽天API検索 → brand 正規化 → 公式URL解決 → 安全な取得 → 仕様抽出 →
variant 検査 → S/A/B 判定 → 24時間再確認 → 商品・出典・販売先リンク・キュー・リンク健全性の更新）
を用意する。

この計画が終わった時点で、`CATALOG_DATASET=production npm run automation:sync -- --mode links`
が **dry-run（既定）** で「今日どの商品がどの Tier になるか」を外部通信つきで出力できる。

## Architecture

```
travel-goods-site/tests/factories/
  index.ts           … 全計画が使う fixture factory（プレースホルダーを一切使わないため）

travel-goods-site/src/lib/automation/
  state/
    schema.ts        … queue / budget / link-health の Zod スキーマと型
    io.ts            … 読み書き。安定シリアライズと「変化しなければ書かない」
  budget.ts          … 予算の消費判定と繰越（純関数）
  variant.ts         … variant トークン抽出と照合（純関数）
  tier.ts            … S/A/B 判定（純関数・fail-closed）
  link-state.ts      … リンク状態機械（純関数）
  category-expansion.ts … カテゴリ拡張の判定（純関数）

travel-goods-site/src/lib/manufacturers/
  types.ts           … アダプター契約（findProductUrl(model, variant)）
  registry.ts        … brand 文字列 → ManufacturerId → アダプター
  ace.ts             … ACE / PROTECA / World Traveler（store.ace.jp。manufacturerId は分離）
  elecom.ts anker.ts

travel-goods-site/src/lib/automation/
  sync/
    resolve-official.ts … 公式URLの決定的な解決（推測しない）
    fetch-official.ts   … robots.txt 確認つきの取得。許可ホストのみ
    pipeline.ts         … 1商品ぶんの判定パイプライン（純関数＋注入した取得関数）

travel-goods-site/scripts/
  automation-sync.ts … 統合 CLI。既定 dry-run
```

**判定は純関数**である。外部通信は `fetch-official.ts` と楽天クライアントに閉じ込め、
`pipeline.ts` には**関数として注入**する（テストで実通信なしに動かすため）。

## Tech Stack

- TypeScript 5.9（`strict`）
- Zod 3（既存 `src/lib/catalog/schema.ts` と同じ書き方。`.strict()` を使う）
- Vitest 3（`tests/*.test.ts`。実通信はループバックのモックのみ）
- Node.js 22 / `tsx`（CLI。既存 `scripts/*.ts` と同じ）

## Spec へのパス

`docs/superpowers/specs/2026-09-02-travel-goods-automation-design.md`

対応節: 2.2 / 2.3 / 2.4 / 4.2 / 4.3 / 5.1 / 5.2 / 5.3 / 5.4 / 5.5 / 5.6 / 6.1 / 6.2 / 6.3 /
8.2 / 8.3 / 8.4 / 9.1 / 9.2 / 9.3 / 10.2 / 10.3 / 10.5 / 11.4 / 14.1 / 14.2

## 他の計画書との依存順

| 順 | 計画 | この計画との関係 |
|---:|---|---|
| **1** | **本計画（foundation）** | 最初。他の 3 計画がここの型・関数・fixture factory を使う |
| 2 | `2026-09-02-travel-goods-article-automation.md` | `tests/factories/index.ts` と `VariantTokens` を使う |
| 3 | `2026-09-02-travel-goods-workflows.md` | `AUTOMATION_STATE_FILES`・`state/io.ts`・`automation:sync` を使う |
| 4 | `2026-09-02-travel-goods-shadow-rollout.md` | 段階0 の統合検証。1〜3 のすべてを前提とする |

**本計画は他の 3 計画のどれにも依存しない。単独で着手・完了できる。**

### 本計画が作る共有資産

| ファイル | 使う計画 | 扱い |
|---|---|---|
| `travel-goods-site/tests/factories/index.ts` | 1・2・3・4 | **本計画 Task 1 が作成**し、Task 9・10 が `export` を追加する。計画2・3・4 は**読むだけ**で変更しない |
| `travel-goods-site/package.json` | 1・2・3・4 | 4 計画とも**異なる名前の npm script を追加するだけ**。本計画は `automation:sync` のみ |

## Global Constraints

1. **実装コード以外を変更しない。** `datasets/` `.github/` `docs/` は触らない。
2. **`datasets/production/candidates/` に書かない。** 自動処理の候補は `automation/queue.json` に持つ（設計書 12.2）。
3. **楽天商品ページへの HTTP 取得と Browser Rendering を行わない。**
   規約確認（設計書 17.1 未解決事項1）が完了するまで、`initialSelection` の根拠は **6b（楽天APIの販売ページ文言による決定的な推定）だけ**を使う。
   `httpStatus` 信号は常に `null`。
4. **`Source.automatedFetch` が `'allowed'` の出版社のドメインだけを取得する。**
   `'unverified'` と `'not-allowed'` はどちらも取得しない（現行 ELECOM の 4 出典は `unverified` なので取得対象外）。
5. **ブロックを迂回しない。** 403 / 429 / robots 拒否を受けたら諦め、分類コードだけを記録する。
6. **公式URLを推測しない。** メーカーごとに決定的に導ける規則があるときだけ導き、それ以外は既存 `Source` の URL を使う。どちらも無ければ B 判定。
7. 各 Task は**失敗するテストを先に書く**。テストが失敗することを確認してから実装する。
8. コミットは Task 単位。1 Task = 1 コミット。
9. `npm run typecheck && npm run lint && npm test` が各 Task 終了時に成功すること。

## 完了条件

- [ ] `npm run typecheck` 成功
- [ ] `npm run lint` 成功
- [ ] `npm test` 成功。テスト件数が **147 → 292 件以上**
- [ ] `npm run validate:content:all` 成功（データに触れていないので変化なし）
- [ ] `CATALOG_DATASET=production npm run automation:sync -- --mode links --offline` が終了コード 0
- [ ] `git status --short` が `datasets/` に差分を出さない
- [ ] 計画に載せたテストコードを**そのまま貼って型検査と実行が通る**（プレースホルダー・`as` による型回避がない）

## 非対象

- workflow ファイル（計画3）
- 記事生成（計画2）
- 自動 PR・自動 revert・停止スイッチの読み取り（計画3）
- 段階1 以降の運転（計画4）
- 楽天商品ページの HTTP 取得と Browser Rendering（規約確認後）

---

## Task 1: テスト用 fixture factory

**この Task を最初に行う。** 以降のすべての Task と、計画2・3・4 のテストがここの factory を使う。
factory があることで、計画に載せたテストコードを**そのまま貼って型検査と実行が通る**状態になる。

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/tests/factories/index.ts` |
| 作成 | `travel-goods-site/tests/factories.test.ts` |

### Consumes / Produces

- Consumes: `Fact`, `Product`, `Source`, `MerchantLink`, `Article`, `Catalog`, `DatasetInfo` from `@/lib/catalog/types`、`RakutenItem` from `@/lib/rakuten/types`
- Produces:
  - `export function makeFact<T>(value: T | null, over?: Partial<Fact<T>>): Fact<T>`
  - `export function makeProduct(over?: Partial<Product>): Product`
  - `export function makeSource(over?: Partial<Source>): Source`
  - `export function makeMerchantLink(over?: Partial<MerchantLink>): MerchantLink`
  - `export function makeArticle(over?: Partial<Article>): Article`
  - `export function makeCatalog(over?: Partial<Catalog>): Catalog`
  - `export function makeRakutenItem(over?: Partial<RakutenItem>): RakutenItem`
  - `export const AFFILIATE_URL_FIXTURE: string`（`item.rakuten.co.jp` を `pc` に持つテスト用の紹介URL。**実在の紹介IDを含まない**）
  - `export type CandidatePair = { product: Product; source: Source }`
  - `export function makeCandidatePair(productId: string, status?: PublicationStatus, checkedAt?: string): CandidatePair`（**Product の全 Fact の `sourceId` を、対になる Source の ID へ揃える**）
  - `export function seedMinimalDataset(rootDir: string): void`（`datasets/production/` と同じ構造の最小データセットを作る）
  - `export function readSeededDataset(rootDir: string): CatalogInput`（`seedMinimalDataset` で作ったディレクトリを読み戻す。`inspectCatalog` にそのまま渡せる）

### 仕様

- **すべての factory が、引数なしで呼んで `validate:content` を通る値を返す。**
- `over` で任意のフィールドだけを差し替えられる。
- **実在の紹介ID・資格情報を含めない。** `AFFILIATE_URL_FIXTURE` の ID 部は `0000test0.00000000.0000test1.00000000` とする。
- 商品の既定値は、現行データセットに実在する形（`model: 'クレスタ2 06936'`、`variant: '35L / 01 ブラックヘアライン'`）に合わせる。

#### `makeCandidatePair` — Fact の `sourceId` を必ず対の Source へ揃える

`makeProduct({ id })` だけを差し替えると、Fact の `sourceId` は既定の
`'src-fixture-ace-06936'` のまま残る。その Product と `src-<新しいID>` の Source を
同時に保存すると、**`inspectCatalog` が Source 参照不整合で落ちる**。

そこで、統合テストで使う「Product と Source の対」は必ず `makeCandidatePair` で作る。
この関数は `weightG` / `outerSizeMm` / `capacityL` と、`bodySizeMm` を持たせる場合、
`alternateMeasurements[].sizeMm` / `alternateMeasurements[].capacityL` / `specs[*]` の
**すべての非 `null` Fact の `sourceId`** を、対になる Source の ID へ揃える。

`makeAutoRegisteredProduct` / `makeAutoRegisteredSource`（Task 16 で使う）も
`makeCandidatePair` の上に実装し、**同じ規則を二度書かない**。

#### `seedMinimalDataset` — tmpdir に本物と同じ構造を作る

`applyWritePlans`（Task 17）は実ディレクトリへ書くため、統合テストは tmpdir に
`datasets/production/` と同じ構造を作る必要がある。

| 作るもの | 内容 |
|---|---|
| `dataset.json` | `{ kind: 'production', label: ..., notice: null }` |
| `products/suitcases.json` | `[]` |
| `products/backpacks.json` | `[]` |
| `products/pouches.json` | `[]` |
| `products/power-banks.json` | `[]` |
| `sources.json` | `[]` |
| `merchants/rakuten.json` | `[]` |
| `merchants/amazon.json` | `[]` |
| `articles/` | 空ディレクトリ |

商品ファイルは `CATEGORIES`（`suitcases` / `backpacks` / `pouches` / `power-banks`）から
生成する。**カテゴリを増やしたときにここを直し忘れないため、配列を直書きしない。**

`readSeededDataset(rootDir)` は同じ構造を `CatalogInput` として読み戻す。
`src/lib/catalog/load.ts` の `readDatasetInput` は `DatasetKind` でしか解決できないため、
**テスト側に読み戻し用の薄い関数を置く**（`src/` は変更しない）。

### ステップ

- [ ] `makeProduct()` が `productSchema` を通る失敗テストを書く（4 分）
- [ ] `makeSource()` が `sourceSchema` を通る失敗テストを書く（3 分）
- [ ] `makeCatalog()` が `inspectCatalog` を `ok: true` で通る失敗テストを書く（5 分）
- [ ] `over` で差し替えたフィールドだけが変わる失敗テストを書く（3 分）
- [ ] `AFFILIATE_URL_FIXTURE` が `itemPageUrlFromAffiliateUrl` で `https://item.rakuten.co.jp/` を返す失敗テストを書く（4 分）
- [ ] **`makeCandidatePair('x')` の全 Fact の `sourceId` が対の Source の ID と一致する**失敗テストを書く（4 分）
- [ ] `makeCandidatePair` の対だけを `inspectCatalog` に渡して `ok: true` になる失敗テストを書く（4 分）
- [ ] `seedMinimalDataset` が 8 ファイルと `articles/` を作る失敗テストを書く（4 分）
- [ ] `readSeededDataset` の結果が `inspectCatalog` を `ok: true` で通る失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `makeFact` / `makeSource` を実装する（4 分）
- [ ] `makeProduct` / `makeMerchantLink` を実装する（4 分）
- [ ] `makeArticle` / `makeCatalog` を実装する（3 分）
- [ ] `makeRakutenItem` と `AFFILIATE_URL_FIXTURE` を実装する（3 分）
- [ ] `makeCandidatePair`（全 Fact の `sourceId` を揃える）を実装する（4 分）
- [ ] `seedMinimalDataset`（`CATEGORIES` から商品ファイルを生成）を実装する（4 分）
- [ ] `readSeededDataset` を実装する（3 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/factories.test.ts
import { describe, expect, it } from 'vitest';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { itemPageUrlFromAffiliateUrl } from '../src/lib/affiliate/rakuten';
import { AFFILIATE_URL_FIXTURE, makeCatalog, makeProduct } from './factories';

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
```

```ts
// tests/factories.test.ts（続き）
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { makeCandidatePair, readSeededDataset, seedMinimalDataset } from './factories';

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
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/factories.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ./factories (resolved id: .../tests/factories)
```

### 最小実装

```ts
// tests/factories/index.ts
import type {
  Article, Catalog, DatasetInfo, Fact, MerchantLink, Product, Source,
} from '../../src/lib/catalog/types';
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
```

> `makeArticle().body` は `evaluatePublication` の 400 文字下限を満たすため 40 回繰り返す。
> `makeProduct().jan` は `null`（現行 23 件中 20 件が JAN を持たないため、既定を実態に合わせる）。

`seedMinimalDataset` と `readSeededDataset` は同じ `tests/factories/index.ts` に置く。
**下の `import` は実ファイルでは先頭の import 群にまとめる**（ここでは読みやすさのため分けて示す）。

```ts
// tests/factories/index.ts（続き）
import fs from 'node:fs';
import path from 'node:path';
import { CATEGORIES } from '../../src/lib/catalog/types';
import type { PublicationStatus } from '../../src/lib/catalog/types';
import type { CatalogInput } from '../../src/lib/catalog/validate';

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
```

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/factories.test.ts && npm run typecheck && npm run lint
```

### コミット

```
test(travel-goods-site): テスト用 fixture factory を追加

引数なしで検証を通る Product / Source / MerchantLink / Article / Catalog / RakutenItem を返す。
makeCandidatePair は Product の全 Fact の sourceId を対の Source へ揃えるため、
統合テストで Source 参照不整合を起こさない。
seedMinimalDataset は datasets/production と同じ構造の空データセットを tmpdir に作る。
以降のすべてのテストがこれを使い、部分的なオブジェクトを as で型回避しない。
実在の紹介IDと資格情報は含めない。

```

---

## Task 2: automation 状態ファイルのスキーマ

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/state/schema.ts` |
| 作成 | `travel-goods-site/tests/automation-state.test.ts` |

### Consumes / Produces

- Consumes: `zod`
- Produces:
  - `export const AUTOMATION_STATE_FILES: readonly ['automation/queue.json', 'automation/budget.json', 'automation/link-health.json']`
  - `export const queueFileSchema`, `budgetFileSchema`, `linkHealthFileSchema`
  - 型: `QueueKind`, `QueueEntry`, `QueueFile`, `RevertRecord`, `CircuitBreaker`, `BudgetFile`, `LinkSignals`, `LinkState`, `LinkHealthEntry`, `LinkHealthFile`

### 型（正確な定義）

```ts
export type QueueKind = 'candidate' | 'tier-a-recheck' | 'link-recheck' | 'article-plan';

export type QueueEntry = {
  kind: QueueKind;
  targetId: string;                 // 商品ID / itemCode / 記事slug
  queuedAt: string;                 // YYYY-MM-DD
  attempts: number;                 // 0 以上
  lastReason: string;               // 分類コードのみ。外部本文を入れない
  payload: Record<string, string>;  // ハッシュ・分類コードのみ。原文禁止
};
export type QueueFile = { version: 1; entries: QueueEntry[] };

/** revert 1 件の記録。日付を持たないと 3 日窓を計算できない。 */
export type RevertRecord = { sha: string; revertedOn: string };  // revertedOn は YYYY-MM-DD

export type CircuitBreaker = {
  state: 'closed' | 'open';
  trippedOn: string | null;
  reason: string | null;
  /** 新しい順。保持上限 REVERT_HISTORY_LIMIT 件。 */
  revertHistory: RevertRecord[];
};

export type BudgetFile = {
  version: 1;
  date: string;
  rakutenRequests: number;
  workersAiNeurons: number;
  browserSeconds: number;
  pagesDeploysThisMonth: number;
  circuitBreaker: CircuitBreaker;
};

export type LinkSignals = {
  /** その日の観測が成立したか。'unavailable' は API 障害であり、商品の状態を意味しない。 */
  observationStatus: 'ok' | 'unavailable';
  itemCodeAlive: boolean;
  availability: 0 | 1 | null;      // null = 在庫情報を取れなかった
  affiliateTargetChanged: boolean;
  httpStatus: number | null;       // 規約確認が済むまで常に null
  identifierMatch: 'strong' | 'weak' | 'none';
  variantMatch: boolean;
};

export type LinkState = 'healthy' | 'uncertain' | 'hidden' | 'replace' | 'manual-hold';

export type LinkHealthEntry = {
  productId: string;
  merchant: 'rakuten';
  externalProductId: string;
  signals: LinkSignals;
  consecutiveFailures: number;
  consecutiveOutOfStock: number;
  lastHealthyAt: string | null;
  state: LinkState;
};
export type LinkHealthFile = { version: 1; entries: LinkHealthEntry[] };

export const REVERT_HISTORY_LIMIT = 20;
```

**`revertedShas: string[]` は使わない。** 各 revert の日付を持たないと
「3 日以内に 2 回」を計算できないため、`RevertRecord[]` として日付ごと永続化する（設計書 12.6）。

### ステップ

- [ ] `AUTOMATION_STATE_FILES` が 3 要素である失敗テストを書く（2 分）
- [ ] `budgetFileSchema` が `circuitBreaker.state` に `'half-open'` を拒否する失敗テストを書く（3 分）
- [ ] `budgetFileSchema` が `revertHistory` の各要素に `revertedOn` を要求する失敗テストを書く（4 分）
- [ ] `revertHistory` が `REVERT_HISTORY_LIMIT` 件を超えると拒否される失敗テストを書く（3 分）
- [ ] `queueFileSchema` が `payload` の 200 文字超を拒否する失敗テストを書く（3 分）
- [ ] `linkHealthFileSchema` が `state` の未知の値を拒否する失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `schema.ts` に `QueueKind` / `QueueEntry` / `queueFileSchema` を書く（4 分）
- [ ] `RevertRecord` / `CircuitBreaker` / `REVERT_HISTORY_LIMIT` と `budgetFileSchema` を書く（5 分）
- [ ] `LinkSignals` / `LinkState` / `LinkHealthEntry` / `linkHealthFileSchema` を書く（5 分）
- [ ] `AUTOMATION_STATE_FILES` を書く（2 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-state.test.ts
import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_STATE_FILES,
  REVERT_HISTORY_LIMIT,
  budgetFileSchema,
  queueFileSchema,
  type BudgetFile,
} from '../src/lib/automation/state/schema';

function budgetFixture(over: Partial<BudgetFile> = {}): BudgetFile {
  return {
    version: 1,
    date: '2026-09-02',
    rakutenRequests: 0,
    workersAiNeurons: 0,
    browserSeconds: 0,
    pagesDeploysThisMonth: 0,
    circuitBreaker: { state: 'closed', trippedOn: null, reason: null, revertHistory: [] },
    ...over,
  };
}

describe('automation 状態ファイルのスキーマ', () => {
  it('状態ファイルは queue / budget / link-health の 3 つ', () => {
    expect(AUTOMATION_STATE_FILES).toEqual([
      'automation/queue.json',
      'automation/budget.json',
      'automation/link-health.json',
    ]);
  });

  it('circuitBreaker.state は closed / open だけを受ける', () => {
    const invalid = { ...budgetFixture(), circuitBreaker: { state: 'half-open', trippedOn: null, reason: null, revertHistory: [] } };
    expect(budgetFileSchema.safeParse(invalid).success).toBe(false);
  });

  it('revert の記録には日付が必要（3 日窓の計算に使う）', () => {
    const withoutDate = {
      ...budgetFixture(),
      circuitBreaker: { state: 'open', trippedOn: '2026-09-20', reason: 'x', revertHistory: [{ sha: 'a'.repeat(40) }] },
    };
    expect(budgetFileSchema.safeParse(withoutDate).success).toBe(false);

    const withDate = budgetFixture({
      circuitBreaker: {
        state: 'open', trippedOn: '2026-09-20', reason: 'x',
        revertHistory: [{ sha: 'a'.repeat(40), revertedOn: '2026-09-20' }],
      },
    });
    expect(budgetFileSchema.safeParse(withDate).success).toBe(true);
  });

  it('revertHistory の保持上限を超えたら拒否する', () => {
    const tooMany = budgetFixture({
      circuitBreaker: {
        state: 'open', trippedOn: '2026-09-20', reason: 'x',
        revertHistory: Array.from({ length: REVERT_HISTORY_LIMIT + 1 }, (_, i) => ({
          sha: String(i).padStart(40, '0'), revertedOn: '2026-09-20',
        })),
      },
    });
    expect(budgetFileSchema.safeParse(tooMany).success).toBe(false);
  });

  it('payload に原文が入らないよう長さを制限する', () => {
    const long = {
      version: 1,
      entries: [{
        kind: 'candidate', targetId: 't1', queuedAt: '2026-09-02',
        attempts: 0, lastReason: 'no-official-page', payload: { note: 'あ'.repeat(201) },
      }],
    };
    expect(queueFileSchema.safeParse(long).success).toBe(false);
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-state.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/state/schema
```

### 最小実装

```ts
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const revertRecordSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{40}$/), revertedOn: isoDate }).strict();
const circuitBreakerSchema = z.object({
  state: z.enum(['closed', 'open']),
  trippedOn: isoDate.nullable(),
  reason: z.string().max(200).nullable(),
  revertHistory: z.array(revertRecordSchema).max(REVERT_HISTORY_LIMIT),
}).strict();
```
`payload` は `z.record(z.string().max(200))`、`targetId` は `z.string().min(1).max(200)`。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-state.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): automation 状態ファイルのスキーマを追加

queue / budget / link-health の型と Zod スキーマ。
circuitBreaker は revert ごとに日付を持つ RevertRecord[] を保持し、3 日窓を計算できるようにする。
payload には分類コードとハッシュだけを入れ、外部本文は保存しない。
```

---

## Task 3: 状態ファイルの読み書き（安定シリアライズ）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/state/io.ts` |
| 変更 | `travel-goods-site/tests/automation-state.test.ts`（describe を追加） |

### Consumes / Produces

- Consumes: `schema.ts` の 3 スキーマと型
- Produces:
  - `export function serializeQueue(file: QueueFile): string`
  - `export function serializeBudget(file: BudgetFile): string`
  - `export function serializeLinkHealth(file: LinkHealthFile): string`
  - `export function writeIfChanged(absPath: string, content: string): 'written' | 'unchanged'`
  - `export function readQueue(dir: string): QueueFile`（存在しなければ `{ version: 1, entries: [] }`）
  - `export function readBudget(dir: string, today: string): BudgetFile`（存在しないか日付が古ければ当日の初期値）
  - `export function readLinkHealth(dir: string): LinkHealthFile`

### 仕様

#### 同じ状態からは必ず同じバイト列を作る

自動 PR の差分を読めるものにするため、**入力の順序が変わっても出力が変わらない**ようにする。

- オブジェクトのキーは**昇順**で出す（`JSON.stringify` の第 2 引数にキー配列を渡さず、
  再帰的にキーを並べ替えてから直列化する）。
- インデントは 2 スペース、**末尾に改行を 1 つ**付ける（リポジトリの既存 JSON と揃える）。
- `serializeQueue` は `queuedAt` 昇順、同日は `targetId` 昇順で `entries` を並べる。
- `serializeLinkHealth` は `productId` 昇順で `entries` を並べる。
- `serializeBudget` は配列を持つのが `circuitBreaker.revertHistory` だけなので、
  そこを **`revertedOn` 降順（新しい順）、同日は `sha` 昇順**で並べる。
  **昇順にしない。** 「新しい順」は Task 2 の型コメントで定めた契約であり、
  計画3 Task 3 の `trip()` が新しい `RevertRecord` を配列の**先頭**へ足して
  `slice(0, REVERT_HISTORY_LIMIT)` で切ることを前提にしている。
  昇順で書き出すと読み戻した履歴が古い順になり、上限まで埋まった状態で
  `trip()` したとき、最古ではなく**直前の新しい履歴が落ちる**。

#### 意味が変わらない書き込みは行わない

`writeIfChanged(absPath, content)` は、既存ファイルの内容と `content` が
**バイト列として同一なら書かない**で `'unchanged'` を返す。
これにより「実行しただけで mtime と差分が出る」状態を避け、
自動 PR が空の変更で立つことを防ぐ。

#### 読み取りは常に成功させる（fail-closed の前段）

- ファイルが無ければ**空の初期値**を返す。例外にしない（初回実行で落とさない）。
- `readBudget(dir, today)` は、`budget.json` の `date` が `today` と違えば
  **消費値（`rakutenRequests` / `workersAiNeurons` / `browserSeconds`）を 0 にリセット**し、
  `date` を `today` にする。
- **`circuitBreaker` は日付が変わっても引き継ぐ。**
  breaker は日次で自動復旧しない（復旧は計画3 Task 8 の `automation-reset.yml` だけ）。
- スキーマに合わない内容は `schema.ts` の `safeParse` で弾き、**例外を投げて実行を止める**
  （壊れた状態ファイルの上に書き足さない）。

### ステップ

- [ ] 同じ内容を 2 回書いたとき 2 回目が `'unchanged'` を返す失敗テストを書く（3 分）
- [ ] `entries` の順序が入れ替わっても `serializeLinkHealth` の出力が同一になる失敗テストを書く（`productId` 昇順ソート）（3 分）
- [ ] `serializeQueue` が `queuedAt` 昇順、同日は `targetId` 昇順でソートする失敗テストを書く（3 分）
- [ ] **`serializeBudget` が `revertHistory` を `revertedOn` 降順（新しい順）、同日は `sha` 昇順で出す**失敗テストを書く（4 分）
- [ ] 読み戻した `revertHistory[0]` が最新日である（`trip()` の先頭追加と整合する）失敗テストを書く（3 分）
- [ ] `readBudget` が前日の `budget.json` を渡されたとき、消費値を 0 にリセットし `circuitBreaker` は**引き継ぐ**失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `io.ts` の `stableStringify`（キー昇順・末尾改行）を実装する（4 分）
- [ ] `serializeQueue` / `serializeLinkHealth` のソート規則を実装する（5 分）
- [ ] `serializeBudget` の `revertHistory` 降順ソートを実装する（3 分）
- [ ] `writeIfChanged`（同一内容なら書かない）を実装する（3 分）
- [ ] `readBudget` の日付リセットと `circuitBreaker` 引き継ぎを実装する（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serializeLinkHealth, writeIfChanged, readBudget } from '../src/lib/automation/state/io';

it('内容が変わらなければ書き込まない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-'));
  const file = path.join(dir, 'x.json');
  expect(writeIfChanged(file, 'a\n')).toBe('written');
  expect(writeIfChanged(file, 'a\n')).toBe('unchanged');
});

it('日付が変わると消費値は 0 に戻り、circuitBreaker は引き継ぐ', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-'));
  fs.mkdirSync(path.join(dir, 'automation'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'automation/budget.json'), JSON.stringify({
    version: 1, date: '2026-09-01', rakutenRequests: 30, workersAiNeurons: 100,
    browserSeconds: 60, pagesDeploysThisMonth: 5,
    circuitBreaker: { state: 'open', trippedOn: '2026-09-01', reason: 'x', revertHistory: [{ sha: 'a'.repeat(40), revertedOn: '2026-09-01' }] },
  }));
  const budget = readBudget(dir, '2026-09-02');
  expect(budget.rakutenRequests).toBe(0);
  expect(budget.pagesDeploysThisMonth).toBe(5);       // 月次なので引き継ぐ
  expect(budget.circuitBreaker.state).toBe('open');   // 停止状態は引き継ぐ
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-state.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/state/io
```

### 最小実装

`JSON.stringify(value, null, 2) + '\n'`。書き出し前に配列をソートする。
`writeIfChanged` は `fs.existsSync` → `readFileSync` → 文字列比較 → 一致なら何もせず `'unchanged'`。
`readBudget` は日付が `today` と異なれば消費 3 項目を 0 にし、`pagesDeploysThisMonth` は
月が同じなら引き継ぎ、月が変われば 0 にする。`circuitBreaker` は常に引き継ぐ。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-state.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): automation 状態ファイルの安定シリアライズと読み書き

同じ状態なら同じバイト列になり、変化しなければ書き込まない。
日付が変われば日次の消費値だけを 0 に戻し、circuitBreaker は引き継ぐ。
```

---

## Task 4: 予算判定と繰越（純関数）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/budget.ts` |
| 作成 | `travel-goods-site/tests/automation-budget.test.ts` |

### Consumes / Produces

- Consumes: `BudgetFile`, `QueueFile`, `QueueEntry`
- Produces:
  - `export const DAILY_LIMITS: { rakutenRequests: 30; workersAiNeurons: 8000; browserSeconds: 480; pagesDeploysPerDay: 1 }`
  - `export type ResourceName = 'rakutenRequests' | 'workersAiNeurons' | 'browserSeconds'`
  - `export function remaining(budget: BudgetFile, resource: ResourceName): number`
  - `export function canSpend(budget: BudgetFile, resource: ResourceName, amount: number): boolean`
  - `export function spend(budget: BudgetFile, resource: ResourceName, amount: number): BudgetFile`（新しいオブジェクトを返す）
  - `export function enqueue(queue: QueueFile, entry: QueueEntry): QueueFile`（同一 `kind`+`targetId` があれば `attempts` を +1 して置換）
  - `export function dequeue(queue: QueueFile, kind: QueueKind, limit: number): { taken: QueueEntry[]; rest: QueueFile }`
  - `export function pruneQueue(queue: QueueFile, today: string, retentionDays: 60): QueueFile`

### 仕様

#### 上限は「無料枠より十分小さい値」を固定で持つ

設計書 10 節の無料枠に対し、**日次の自前上限**を置く。使い切っても翌日へ繰り越す。

| 資源 | `DAILY_LIMITS` | 無料枠 | 置き方 |
|---|---:|---|---|
| `rakutenRequests` | 30 | 1 req/sec（1日の総量制限は非公開） | 1 実行あたり最大 30 回。超えたら停止 |
| `workersAiNeurons` | 8000 | 10,000 Neurons/日 | 8 割で止め、余白を残す |
| `browserSeconds` | 480 | 600 秒/日（10 分） | 8 割で止め、余白を残す |
| `pagesDeploysPerDay` | 1 | 500 builds/月 | 1 日 1 デプロイ（月 31 回で上限の 1 割以下） |

- **上限を超えたらエラーにしない。** 未処理分を `queue.json` へ積み、終了コード 0 で終わる。
  「安全に翌日へ繰り越す」（設計書 10.4）を、例外ではなくキューで実現する。
- `spend` は**新しいオブジェクトを返す純関数**にする。呼び出し側が書き込みの成否と
  独立に予算を積めるようにするためである。
- `pagesDeploysPerDay` は `ResourceName` に含めない（`canSpend` の対象ではなく、
  workflow 側の同時実行制御で担保する。計画3 Task 6）。

#### キューは重複を作らず、古い候補を溜め込まない

- `enqueue` は同一 `kind` + `targetId` があれば **`attempts` を +1 して置換**する。
  同じ対象が毎日積まれて `queue.json` が膨らむのを防ぐ。
- `dequeue` は `queuedAt` の**古い順**に `limit` 件だけ取り、残りを `rest` として返す。
  取ったものはこの関数では消費済みにしない（書き込みが成功して初めて消える）。
- `pruneQueue` は `queuedAt` から **60 日**を超えた `kind: 'candidate'` を落とす。
  `tier-a-recheck` / `link-recheck` / `article-plan` は落とさない
  （期限切れで消えると、再確認そのものが行われなくなるため）。

### ステップ

- [ ] `remaining` が上限から消費を引いた値を返す失敗テストを書く（2 分）
- [ ] `canSpend` が残量ちょうどのとき `true`、1 超過で `false` を返す失敗テストを書く（3 分）
- [ ] `spend` が元の `BudgetFile` を変更しない（immutable）失敗テストを書く（3 分）
- [ ] `enqueue` が同一 `kind`+`targetId` で重複を作らず `attempts` を増やす失敗テストを書く（4 分）
- [ ] `dequeue` が `queuedAt` の古い順に `limit` 件だけ取り、残りを返す失敗テストを書く（4 分）
- [ ] `pruneQueue` が 60 日を超えた `candidate` を落とす失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `DAILY_LIMITS` と `canSpend` / `spend` を実装する（4 分）
- [ ] `enqueue`（同一 `kind`+`targetId` の重複を作らず `attempts` を増やす）を実装する（4 分）
- [ ] `dequeue`（`queuedAt` 昇順で `limit` 件）を実装する（3 分）
- [ ] `pruneQueue`（60 日超の `candidate` を落とす）を実装する（3 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { canSpend, spend, DAILY_LIMITS } from '../src/lib/automation/budget';

const budget = {
  version: 1 as const, date: '2026-09-02', rakutenRequests: 28, workersAiNeurons: 0,
  browserSeconds: 0, pagesDeploysThisMonth: 0,
  circuitBreaker: { state: 'closed' as const, trippedOn: null, reason: null, revertHistory: [] },
};

it('残量ちょうどは使えるが、1 超過は使えない', () => {
  expect(canSpend(budget, 'rakutenRequests', 2)).toBe(true);
  expect(canSpend(budget, 'rakutenRequests', 3)).toBe(false);
});

it('spend は元のオブジェクトを変更しない', () => {
  const next = spend(budget, 'rakutenRequests', 2);
  expect(budget.rakutenRequests).toBe(28);
  expect(next.rakutenRequests).toBe(30);
  expect(DAILY_LIMITS.rakutenRequests).toBe(30);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-budget.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/budget
```

### 最小実装

`DAILY_LIMITS` を `as const` で定義。`remaining` は `DAILY_LIMITS[resource] - budget[resource]`。
`spend` はスプレッドで新オブジェクトを返す。`enqueue` は `Map` で `${kind}:${targetId}` をキーに統合。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-budget.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 日次予算の判定と繰越キューを追加

上限到達で失敗にせず、未処理分をキューへ積む。すべて純関数。
```

---

## Task 5: variant トークンの抽出と照合

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/variant.ts` |
| 作成 | `travel-goods-site/tests/automation-variant.test.ts` |

### Consumes / Produces

- Consumes: `normalizeForMatch` from `@/lib/rakuten/match`（既存）
- Produces:
  - `export type VariantTokens = { colors: string[]; sizes: string[]; capacities: string[]; setCounts: string[] }`
  - `export function extractVariantTokens(variant: string): VariantTokens`
  - `export type VariantVerdict = { matched: boolean; missing: string[]; conflicting: string[]; matchedVariantLabel: string | null }`
  - `export function verifyVariant(variant: string, listingText: string): VariantVerdict`
  - `export const EXCLUDED_LISTING_TERMS: readonly string[]`（`中古` `訳あり` `並行輸入` `まとめ買い` `セット販売` `アウトレット`）
  - `export function hasExcludedTerm(listingText: string): boolean`

### 仕様（設計書 5.5 条件4・5、5.6、8.4 に対応）

- `matched === true` の条件: `colors`/`sizes`/`capacities`/`setCounts` の**全トークン**が
  正規化済み `listingText` に出現し、かつ `conflicting` が空。
- `conflicting`: 対象と異なる容量（`\d+L`）・サイズ（`S|M|L|XL`）・セット数（`\d+個セット`）の表記が
  `listingText` に現れたもの。
- `matchedVariantLabel`: `matched === true` のとき、抽出したトークンを
  ` / ` で結合した文字列。`false` のとき `null`（設計書 5.6：抽出できなければリンクを書かない）。

### ステップ

- [ ] `extractVariantTokens('30L / ブラック')` が `{ colors:['ブラック'], capacities:['30L'], sizes:[], setCounts:[] }` を返す失敗テストを書く（3 分）
- [ ] `verifyVariant('30L / ブラック', '旅行リュック 30L ブラック 大容量')` が `matched: true` を返す失敗テストを書く（3 分）
- [ ] `verifyVariant('30L / ブラック', '旅行リュック 30L/40L 選べる2サイズ ブラック')` が `matched: false` かつ `conflicting` に `'40L'` を含む失敗テストを書く（4 分）
- [ ] 色が出てこない場合に `missing` に色が入る失敗テストを書く（3 分）
- [ ] 「ブラックフライデー」「ホワイトニング」を色として拾わない失敗テストを書く（4 分）
- [ ] `hasExcludedTerm('【中古】スーツケース')` が `true` を返す失敗テストを書く（2 分）
- [ ] `matched: false` のとき `matchedVariantLabel` が `null` である失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] 色名辞書と `extractVariantTokens` を実装する（5 分）
- [ ] `verifyVariant`（一致・欠落・矛盾）を実装する（5 分）
- [ ] `hasExcludedTerm` と `EXCLUDED_LISTING_TERMS` を実装する（3 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { extractVariantTokens, verifyVariant, hasExcludedTerm } from '../src/lib/automation/variant';

it('variant から色と容量を取り出す', () => {
  expect(extractVariantTokens('30L / ブラック')).toEqual({
    colors: ['ブラック'], sizes: [], capacities: ['30L'], setCounts: [],
  });
});

it('別容量が併記されていたら矛盾として検出する', () => {
  const v = verifyVariant('30L / ブラック', '旅行リュック 30L/40L 選べる2サイズ ブラック');
  expect(v.matched).toBe(false);
  expect(v.conflicting).toContain('40L');
  expect(v.matchedVariantLabel).toBeNull();
});

it('中古・訳ありを検出する', () => {
  expect(hasExcludedTerm('【中古】スーツケース')).toBe(true);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-variant.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/variant
```

### 最小実装

色は既知の色名辞書（`ブラック` `ホワイト` `ネイビー` `シルバー` `ガンメタリック` `ターコイズ` `ブルーグリーン` など、
現行 23 商品の `variant` に実在する語）との照合。
**substring では拾わない。** 色名の直前・直後がカタカナ（長音符を含み、中黒は除く）なら
より長い語の一部なので色として扱わない。これで「ブラックフライデー」「ホワイトニング」
「ミッドナイトネイビー」を色指定と誤認しない。販売ページ側にも同じ規則を使う。
判定できない書き方は一致させない（false-negative 側へ倒す）。容量は `/(\d+(?:\.\d+)?)L/g`、
サイズは `/\b(S|M|L|XL|2XL)サイズ\b/g`、セット数は `/(\d+)個セット/g`。
照合は `normalizeForMatch` を通した文字列同士で行う。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-variant.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): variant トークンの抽出と販売ページ文言との照合

色・サイズ・容量・セット数を取り出し、矛盾する別表記を検出する。
抽出できなければ matchedVariantLabel を null にして、リンクを書かせない。
```

---

## Task 6: メーカーアダプター契約と registry

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/manufacturers/types.ts` |
| 作成 | `travel-goods-site/src/lib/manufacturers/registry.ts` |
| 作成 | `travel-goods-site/tests/manufacturers-registry.test.ts` |

### Consumes / Produces

- Consumes: `SizeBasis`, `MeasurementState`, `Source` from `@/lib/catalog/types`
- Produces:
  - `export const MANUFACTURER_IDS = ['ace', 'proteca', 'world-traveler', 'elecom', 'anker'] as const`
  - `export type ManufacturerId = (typeof MANUFACTURER_IDS)[number]`
  - `export type ExtractedSpec = { weightG: number | null; outerSizeMm: [number, number, number] | null; capacityL: number | null; sizeBasis: SizeBasis; measurementState: MeasurementState; specs: Record<string, string | number | boolean> }`
  - `export type ExtractionFailure = 'no-spec-table' | 'unit-unparseable' | 'required-field-missing' | 'page-shape-changed'`
  - `export type ExtractionResult = { ok: true; spec: ExtractedSpec; rangeHash: string } | { ok: false; reason: ExtractionFailure }`
  - `export type UrlResolution = { ok: true; url: string; basis: 'existing-source' | 'deterministic-rule' | 'official-search' } | { ok: false; reason: 'no-existing-source' | 'model-shape-unsupported' | 'variant-code-missing' | 'search-not-permitted' }`
  - `export type ManufacturerAdapter = { manufacturerId: ManufacturerId; allowedHosts: readonly string[]; findProductUrl(model: string, variant: string, knownSources: readonly Source[]): UrlResolution; extract(html: string): ExtractionResult; extractedRangeHash(html: string): string | null; recallTerms: readonly string[]; requiredFields: readonly ('weightG' | 'outerSizeMm' | 'capacityL')[] }`
  - `export function normalizeBrand(brand: string): ManufacturerId | null`
  - `export function adapterFor(id: ManufacturerId): ManufacturerAdapter`

### 仕様（設計書 5.2・5.3・4.3 に対応）

#### `findProductUrl(model, variant, knownSources)` — URL を推測しない

**`buildProductUrl(model)` は作らない。** 現行データで確認したとおり、公式 URL は
`model` だけからは決まらない。

| メーカー | 実際の URL 例 | `model` の実値 | `variant` の実値 | URL の決まり方 |
|---|---|---|---|---|
| ACE / PROTECA / World Traveler | `https://store.ace.jp/shop/g/g06936-01/` | `クレスタ2 06936` | `35L / 01 ブラックヘアライン` | **5 桁品番（model 内）＋ 2 桁カラーコード（variant 内）** |
| ELECOM | `https://www.elecom.co.jp/products/BM-BPTRCSEPBK.html` | `BM-BPTRCSEPBK` | `30L / ブラック` | model そのまま |
| Anker | `https://www.ankerjapan.com/products/a110d` | `A110DN11` | `10000mAh / ブラック` | **導出不可**（`A110DN11`→`a110d`、`A1335011`→`a1335`。規則が一定でない） |

したがって解決順は次のとおり。

1. **`knownSources` に、その商品の仕様出典として既に登録された URL があればそれを使う**
   （`basis: 'existing-source'`）。既存 23 商品はすべてこれで解決する。
2. 無ければ、メーカーごとの**決定的な規則**が適用できるときだけ導く（`basis: 'deterministic-rule'`）。
   - ACE 系: `model` から `/(\d{5})/` で 5 桁品番、`variant` から `/(?:^|\/\s*)(\d{2})\s/` で
     2 桁カラーコードを取り、両方取れたときだけ `https://store.ace.jp/shop/g/g{品番}-{カラー}/` を返す。
     **どちらか欠ければ `{ ok: false, reason: 'variant-code-missing' }`。**
   - ELECOM: `model` が `/^[A-Z0-9-]{6,}$/` のときだけ `https://www.elecom.co.jp/products/{model}.html`。
   - **Anker: 規則が無いため常に `{ ok: false, reason: 'model-shape-unsupported' }` を返す。**
3. 1 も 2 も成立しなければ `{ ok: false, ... }`。**公式検索は段階0 では行わない**
   （`'official-search'` は将来の拡張のために型として用意するだけで、
   初期の 5 アダプターはこの `basis` を返さない）。

#### `manufacturerId` と検証条件の分離

ACE・PROTECA・World Traveler は `store.ace.jp` を共有するが、
**`manufacturerId` は別々**にする。取得成功率の集計（設計書 13.2 `automation-adapter`）と
リコール告知の参照先がブランドごとに異なるためである。
実装は共通関数を `ace.ts` に置き、3 つのアダプターがそれを呼ぶ。

#### `normalizeBrand`

現行 7 種類の `brand` 文字列を**完全一致の対応表**で正規化する。部分一致で推測しない。

| `brand`（現行値そのまま） | `ManufacturerId` |
|---|---|
| `エース（ACE）` | `ace` |
| `エース（ace. GENE LABEL）` | `ace` |
| `エース（ace. TOKYO LABEL）` | `ace` |
| `プロテカ（PROTECA）` | `proteca` |
| `ワールドトラベラー（World Traveler）` | `world-traveler` |
| `エレコム（ELECOM）` | `elecom` |
| `アンカー・ジャパン（Anker）` | `anker` |

### ステップ

- [ ] 現行 7 種類の `brand` がすべて正しい `ManufacturerId` に落ちる失敗テストを書く（4 分）
- [ ] 未知のブランドと部分一致（`'ACE Hardware'`）が `null` を返す失敗テストを書く（3 分）
- [ ] `adapterFor('ace').allowedHosts` が `['store.ace.jp']` である失敗テストを書く（2 分）
- [ ] `ace`/`proteca`/`world-traveler` の `manufacturerId` が互いに異なる失敗テストを書く（3 分）
- [ ] `findProductUrl` が既存 `Source` を第一候補にする失敗テストを書く（4 分）
- [ ] ACE で variant にカラーコードが無いと `'variant-code-missing'` を返す失敗テストを書く（4 分）
- [ ] Anker が常に `'model-shape-unsupported'` を返す失敗テストを書く（3 分）
- [ ] どのアダプターも `basis: 'official-search'` を返さない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `types.ts` に契約の型を書く（4 分）
- [ ] `BRAND_MAP` と `normalizeBrand` を実装する（4 分）
- [ ] 5 アダプターのスタブ（`extract` は `{ ok: false, reason: 'no-spec-table' }`）と `adapterFor` を実装する（5 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/manufacturers-registry.test.ts
import { describe, expect, it } from 'vitest';
import { MANUFACTURER_IDS, adapterFor, normalizeBrand } from '../src/lib/manufacturers/registry';
import { makeSource } from './factories';

describe('brand の正規化', () => {
  it('現行 7 種類の brand をすべて正規化できる', () => {
    expect(normalizeBrand('エース（ACE）')).toBe('ace');
    expect(normalizeBrand('エース（ace. GENE LABEL）')).toBe('ace');
    expect(normalizeBrand('エース（ace. TOKYO LABEL）')).toBe('ace');
    expect(normalizeBrand('プロテカ（PROTECA）')).toBe('proteca');
    expect(normalizeBrand('ワールドトラベラー（World Traveler）')).toBe('world-traveler');
    expect(normalizeBrand('エレコム（ELECOM）')).toBe('elecom');
    expect(normalizeBrand('アンカー・ジャパン（Anker）')).toBe('anker');
  });

  it('未知のブランドは null。部分一致で解決しない', () => {
    expect(normalizeBrand('サンプルブランド')).toBeNull();
    expect(normalizeBrand('ACE Hardware')).toBeNull();
    expect(normalizeBrand('ace')).toBeNull();
  });
});

describe('アダプターの契約', () => {
  it('同じホストを共有しても manufacturerId は分離する', () => {
    expect(adapterFor('ace').allowedHosts).toEqual(['store.ace.jp']);
    expect(adapterFor('proteca').allowedHosts).toEqual(['store.ace.jp']);
    expect(adapterFor('ace').manufacturerId).toBe('ace');
    expect(adapterFor('proteca').manufacturerId).toBe('proteca');
    expect(adapterFor('world-traveler').manufacturerId).toBe('world-traveler');
  });

  it('既存 Source があればそれを第一候補にする', () => {
    const source = makeSource({ url: 'https://store.ace.jp/shop/g/g06936-01/' });
    const r = adapterFor('ace').findProductUrl('クレスタ2 06936', '35L / 01 ブラックヘアライン', [source]);
    expect(r).toEqual({ ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'existing-source' });
  });

  it('既存 Source が無くても、品番とカラーコードが揃えば決定的に導ける', () => {
    const r = adapterFor('ace').findProductUrl('クレスタ2 06936', '35L / 01 ブラックヘアライン', []);
    expect(r).toEqual({ ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'deterministic-rule' });
  });

  it('カラーコードが無ければ URL を推測しない', () => {
    const r = adapterFor('ace').findProductUrl('クレスタ2 06936', '35L / ブラック', []);
    expect(r).toEqual({ ok: false, reason: 'variant-code-missing' });
  });

  it('Anker は model から URL を導出できない', () => {
    expect(adapterFor('anker').findProductUrl('A110DN11', '10000mAh / ブラック', []))
      .toEqual({ ok: false, reason: 'model-shape-unsupported' });
    expect(adapterFor('anker').findProductUrl('A1335011', '12000mAh / ブラック', []))
      .toEqual({ ok: false, reason: 'model-shape-unsupported' });
  });

  it('段階0 では公式検索を使わない', () => {
    for (const id of MANUFACTURER_IDS) {
      const r = adapterFor(id).findProductUrl('BM-BPTRCSEPBK', '30L / ブラック', []);
      if (r.ok) expect(r.basis).not.toBe('official-search');
    }
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-registry.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/manufacturers/registry
```

### 最小実装

`const BRAND_MAP: Readonly<Record<string, ManufacturerId>>` を完全一致の対応表として持ち、
`normalizeBrand` は `BRAND_MAP[brand.trim()] ?? null` を返す。
`ace.ts` に `resolveAceUrl(model, variant, knownSources)` を置き、
`ace` / `proteca` / `world-traveler` の 3 アダプターが `manufacturerId` だけ変えて共有する。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-registry.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): メーカーアダプター契約と brand 正規化を追加

findProductUrl(model, variant, knownSources) は URL を推測しない。
既存 Source を第一候補にし、決定的な規則が適用できるときだけ導く。
Anker は model から導出できないため常に失敗を返す。
store.ace.jp を共有する 3 ブランドも manufacturerId は分離する。
```

---

## Task 7: ACE 系 3 ブランドの仕様抽出

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/manufacturers/ace.ts` |
| 作成 | `travel-goods-site/tests/fixtures/manufacturers/ace-spec-table.html` |
| 作成 | `travel-goods-site/tests/manufacturers-ace.test.ts` |
| 変更 | `travel-goods-site/src/lib/manufacturers/registry.ts`（スタブを実装へ差し替え） |

### Consumes / Produces

- Consumes: `ManufacturerAdapter`, `ExtractionResult`, `UrlResolution` from `./types`
- Produces: `export const aceAdapter`, `export const protecaAdapter`, `export const worldTravelerAdapter`, `export function resolveAceUrl(...)`

### fixture の作り方（重要）

**実サイトの HTML をコミットしない**（設計書 4.2）。
`tests/fixtures/manufacturers/ace-spec-table.html` は、
**現行データセットに登録済みの確認済み値**だけを使った、30 行程度の**合成 HTML** とする。

使う値は `datasets/production/products/suitcases.json` の
`ace-cresta2-06936-35l-black-hairline` に登録されている**実測値**である。

| 項目 | 登録済みの値 | fixture に書く表記 |
|---|---|---|
| `weightG` | **2900** | `2.9kg` |
| `outerSizeMm` | **[350, 550, 250]** | `W35×H55×D25cm` |
| `capacityL` | **35** | `35L` |
| `sizeBasis` | `with-handle-and-wheels` | 「ハンドル・キャスターを含む」 |
| 出典 | `https://store.ace.jp/shop/g/g06936-01/` | — |

> **推測値を使わない。** 以前の版にあった `3.4kg / 55×39×26cm` は
> 登録済みの値と一致しないため破棄した。fixture の値は必ず
> `datasets/production/` に登録済みの `Fact.value` と一致させる。

### ステップ

- [ ] `ace-spec-table.html` の骨格（`<table class="spec">` 1 つと見出し行）を書く（3 分）
- [ ] 同 fixture に重量・外寸・容量の 3 行を上表の値で書く（4 分）
- [ ] `aceAdapter.extract` が `weightG: 2900`、`outerSizeMm: [350, 550, 250]`、`capacityL: 35` を返す失敗テストを書く（4 分）
- [ ] 抽出結果が**登録済みの `Fact.value` と一致する**ことを本番データと突き合わせる失敗テストを書く（5 分）
- [ ] 容量の行を削ると `{ ok: false, reason: 'required-field-missing' }` を返す失敗テストを書く（3 分）
- [ ] `extractedRangeHash` がスペック表の外側を変えても同じ値を返す失敗テストを書く（4 分）
- [ ] `protecaAdapter` と `worldTravelerAdapter` が同じ抽出結果を返す失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `resolveAceUrl`（5 桁品番＋2 桁カラーコード）を実装する（5 分）
- [ ] スペック表の走査と単位換算（kg→g、cm→mm）を実装する（5 分）
- [ ] `extractedRangeHash` を実装する（3 分）
- [ ] 3 ブランドのアダプターを組み立て `registry.ts` を差し替える（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/manufacturers-ace.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aceAdapter, protecaAdapter, worldTravelerAdapter } from '../src/lib/manufacturers/ace';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, 'fixtures/manufacturers/ace-spec-table.html'), 'utf8');

type ProductRecord = {
  id: string;
  weightG: { value: number | null };
  outerSizeMm: { value: [number, number, number] | null };
  capacityL: { value: number | null };
};
const suitcases = JSON.parse(
  fs.readFileSync(path.join(here, '../datasets/production/products/suitcases.json'), 'utf8'),
) as ProductRecord[];

describe('ACE 系の仕様抽出', () => {
  it('スペック表から重量・外寸・容量を取り出す', () => {
    const result = aceAdapter.extract(html);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.weightG).toBe(2900);
    expect(result.spec.outerSizeMm).toEqual([350, 550, 250]);
    expect(result.spec.capacityL).toBe(35);
    expect(result.spec.sizeBasis).toBe('with-handle-and-wheels');
  });

  it('抽出結果が登録済みの Fact と一致する（fixture に推測値を使っていない）', () => {
    const registered = suitcases.find((p) => p.id === 'ace-cresta2-06936-35l-black-hairline');
    expect(registered).toBeDefined();
    const result = aceAdapter.extract(html);
    expect(result.ok).toBe(true);
    if (!result.ok || !registered) return;
    expect(result.spec.weightG).toBe(registered.weightG.value);
    expect(result.spec.outerSizeMm).toEqual(registered.outerSizeMm.value);
    expect(result.spec.capacityL).toBe(registered.capacityL.value);
  });

  it('必須項目が欠けたら推定せず失敗を返す', () => {
    const withoutCapacity = html.replace(/<tr>\s*<th>容量[\s\S]*?<\/tr>/, '');
    expect(aceAdapter.extract(withoutCapacity)).toEqual({ ok: false, reason: 'required-field-missing' });
  });

  it('スペック表の外側が変わってもハッシュは変わらない', () => {
    const changed = html.replace('</body>', '<p>キャンペーン中</p></body>');
    expect(aceAdapter.extractedRangeHash(changed)).toBe(aceAdapter.extractedRangeHash(html));
  });

  it('PROTECA と World Traveler は同じ抽出規則を共有する', () => {
    expect(protecaAdapter.extract(html)).toEqual(aceAdapter.extract(html));
    expect(worldTravelerAdapter.extract(html)).toEqual(aceAdapter.extract(html));
    expect(protecaAdapter.manufacturerId).toBe('proteca');
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-ace.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/manufacturers/ace
```

### 最小実装

`<table class="spec">` の `<tr>` を走査し、`<th>` のラベル（`本体重量` / `外寸` / `容量`）で分岐する。
`kg` → `g` は `Math.round(value * 1000)`、`cm` → `mm` は `Math.round(value * 10)`。
**数値は `[\d.]+` で読まない。** `.`・`1.2.3`・`0` を通してしまい、`Number()` が
`NaN` や `0` を返しても成功扱いになる。`\d+(?:\.\d+)?` に完全一致させ、
`Number.isFinite(value)` かつ `value > 0` を確かめる共通の厳密パーサを使う。
**入力の検査だけでは足りない。** `0.0001kg`（×1000 → 丸めて 0）、
`W0.01cm`（×10 → 丸めて 0）、`1e307kg`（×1000 → `Infinity`）はいずれも
入力は正の有限値なので、**換算・丸めの後の最終値にも同じ検査を通す**。
W/H/D のどれか 1 つでも不正なら**寸法全体を `null`** にし、
`mm` と `cm` が混在した表記は尺度を決められないので推定せず `null` にする。
`W35×H55×D25cm` は `/W([\d.]+)×H([\d.]+)×D([\d.]+)cm/` で取り、**登録順（幅・高さ・奥行）のまま**返す。
`extractedRangeHash` は `html.match(/<table class="spec">[\s\S]*?<\/table>/)?.[0]` に
`crypto.createHash('sha256')` を適用する。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-ace.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): ACE 系 3 ブランドの仕様抽出アダプターを追加

スペック表から重量・外寸・容量を単位換算つきで取り出す。
1 項目でも取れなければ推定せず失敗を返す。
fixture は登録済みの Fact 値（2900g / 350×550×250mm / 35L）だけを使った合成 HTML で、
実サイトの本文は含まない。抽出結果が登録済みの値と一致することをテストで固定する。
```

---

## Task 8: ELECOM と Anker のアダプター

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/manufacturers/elecom.ts` |
| 作成 | `travel-goods-site/src/lib/manufacturers/anker.ts` |
| 作成 | `travel-goods-site/tests/fixtures/manufacturers/elecom-spec-list.html` |
| 作成 | `travel-goods-site/tests/fixtures/manufacturers/anker-spec-list.html` |
| 作成 | `travel-goods-site/tests/manufacturers-others.test.ts` |
| 変更 | `travel-goods-site/src/lib/manufacturers/registry.ts` |

### Consumes / Produces

- Consumes: `ManufacturerAdapter` from `./types`
- Produces: `export const elecomAdapter`, `export const ankerAdapter`

### fixture の値（登録済みの実測値のみ）

| メーカー | 商品 | `weightG` | `outerSizeMm` | `capacityL` | `specs` |
|---|---|---:|---|---:|---|
| ELECOM | `BM-BPTRCSEPBK` | 登録値をそのまま | 登録値をそのまま | 登録値をそのまま | — |
| Anker | `A1335011` | 登録値をそのまま | 登録値をそのまま | `null` | `capacityMah` / `ratedWh` は登録値 |

**fixture を書く前に、必ず対象商品の登録値を読む。**

```bash
cd travel-goods-site && node -e "
const fs=require('fs');
for (const f of ['power-banks','backpacks','pouches']) {
  for (const p of JSON.parse(fs.readFileSync('datasets/production/products/'+f+'.json','utf8'))) {
    if (['BM-BPTRCSEPBK','A1335011'].includes(p.model))
      console.log(p.model, JSON.stringify({w:p.weightG.value,s:p.outerSizeMm.value,c:p.capacityL.value,specs:p.specs}));
  }
}"
```

この出力の値だけを fixture の表記に使う。**出力に無い値を書かない。**

### `requiredFields` をカテゴリで変える

- ELECOM のリュック・ポーチ: `['weightG', 'outerSizeMm', 'capacityL']`
- Anker のモバイルバッテリー: `['weightG', 'outerSizeMm']`（`capacityL` は存在しないため必須にしない）

### ステップ

- [ ] 上のコマンドで 2 商品の登録値を確認し、記録する（3 分）
- [ ] `elecom-spec-list.html` を登録値だけで書く（5 分）
- [ ] `anker-spec-list.html` を登録値だけで書く（5 分）
- [ ] ELECOM の抽出結果が登録済みの `Fact` と一致する失敗テストを書く（4 分）
- [ ] Anker の抽出結果が登録済みの `Fact` と一致し、`capacityL` が `null` でも `ok: true` になる失敗テストを書く（4 分）
- [ ] `ankerAdapter.requiredFields` に `capacityL` が含まれない失敗テストを書く（2 分）
- [ ] `adapterFor('elecom')` と `adapterFor('anker')` がスタブでない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `elecom.ts` の定義リスト走査を実装する（5 分）
- [ ] `anker.ts` の表走査と `capacityMah` / `ratedWh` の抽出を実装する（5 分）
- [ ] `requiredFields` をアダプターごとに定義する（3 分）
- [ ] `registry.ts` のスタブを差し替える（3 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/manufacturers-others.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { elecomAdapter } from '../src/lib/manufacturers/elecom';
import { ankerAdapter } from '../src/lib/manufacturers/anker';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p: string) => fs.readFileSync(path.join(here, p), 'utf8');

type ProductRecord = {
  model: string;
  weightG: { value: number | null };
  outerSizeMm: { value: [number, number, number] | null };
  capacityL: { value: number | null };
  specs: Record<string, { value: string | number | boolean | null }>;
};
const allProducts: ProductRecord[] = ['backpacks', 'pouches', 'power-banks', 'suitcases']
  .flatMap((f) => JSON.parse(read(`../datasets/production/products/${f}.json`)) as ProductRecord[]);

const byModel = (model: string): ProductRecord => {
  const found = allProducts.find((p) => p.model === model);
  if (!found) throw new Error(`商品が見つかりません: ${model}`);
  return found;
};

describe('ELECOM の仕様抽出', () => {
  it('登録済みの Fact と一致する', () => {
    const registered = byModel('BM-BPTRCSEPBK');
    const result = elecomAdapter.extract(read('fixtures/manufacturers/elecom-spec-list.html'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.weightG).toBe(registered.weightG.value);
    expect(result.spec.outerSizeMm).toEqual(registered.outerSizeMm.value);
    expect(result.spec.capacityL).toBe(registered.capacityL.value);
  });
});

describe('Anker の仕様抽出', () => {
  it('モバイルバッテリーは capacityL が null でも成功する', () => {
    const registered = byModel('A1335011');
    const result = ankerAdapter.extract(read('fixtures/manufacturers/anker-spec-list.html'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.capacityL).toBeNull();
    expect(result.spec.weightG).toBe(registered.weightG.value);
  });

  it('capacityL を必須にしない', () => {
    expect(ankerAdapter.requiredFields).not.toContain('capacityL');
    expect(ankerAdapter.requiredFields).toContain('weightG');
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-others.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/manufacturers/elecom
```

### 最小実装

ELECOM は定義リスト（`<dt>` / `<dd>`）、Anker は表を走査する。
`1,090g` のカンマ除去、`約W300×D160×H480mm` の接頭辞除去を行う。
`requiredFields` をアダプターごとに定数として持ち、`extract` がそれを見て
`required-field-missing` を返すか決める。

任意項目（Anker の `capacityMah` / `maxOutputW`）は次のように扱う。
**行そのものが無い**なら公表なしとして `specs` に作らない（`ratedWh` がこれ）。
**行はあるが単位を読めない**なら黙って捨てず `{ ok: false, reason: 'unit-unparseable' }`
を返す。捨てると「公表されていない」と「読めなかった」が区別できなくなる。

> **注記**: 現行 ELECOM の 4 出典は `automatedFetch: 'unverified'` である。
> アダプターは実装するが、**Global Constraints 4 により段階0 では取得対象にならない**。
> このアダプターが実際に使われるのは、出典の `automatedFetch` を `'allowed'` に
> 変更する判断（人が行う）が済んだ後である。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-others.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): ELECOM と Anker の仕様抽出アダプターを追加

各社の DOM 構造に合わせた抽出規則。必須項目はアダプターごとに変える。
モバイルバッテリーは capacityL を必須にしない。
fixture は登録済みの Fact 値だけを使った合成 HTML で、実サイトの本文は含まない。
```

---

## Task 9: S/A/B 判定（fail-closed）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/tier.ts` |
| 作成 | `travel-goods-site/tests/automation-tier.test.ts` |
| 変更 | `travel-goods-site/tests/factories/index.ts`（`makeTierInput` を追加） |

### Consumes / Produces

- Consumes: `ManufacturerId`, `ExtractionResult` from `@/lib/manufacturers/types`
- Produces:
  - `export type Tier = 'S' | 'A' | 'B'`
  - 以下の状態型（すべて**判定不能を表す値を持つ**）
  - `export type TierInput`（全フィールド必須。省略可能なフィールドを作らない）
  - `export type TierVerdict = { tier: Tier; blockers: BlockerCode[]; satisfied: string[] }`
  - `export const BLOCKER_CODES: readonly BlockerCode[]`（**17 個**）
  - `export function decideTier(input: TierInput): TierVerdict`

### 型（正確な定義）

```ts
/** 公式ページの取得結果。boolean にしない。取得できなかった理由を区別する。 */
export type OfficialFetchStatus = 'ok' | 'robots-denied' | 'http-blocked' | 'failed';

/** リコール確認。`unavailable`（確認できなかった）を必ず持つ。 */
export type RecallStatus = 'clear' | 'hit' | 'unavailable';

/** JAN の公表状態と一致状態を 1 つの型で表す。 */
export type JanState = 'published-and-matched' | 'published-but-mismatched' | 'not-published';

/** 型番の一致状態。 */
export type ModelMatchState = 'exact' | 'partial' | 'ambiguous' | 'absent';

/** variant の照合状態。`unknown` と `conflicting` を区別する。 */
export type VariantState = 'matched' | 'unknown' | 'conflicting';

/** 初期選択の根拠。6a と 6b は同格（設計書 10.5）。 */
export type InitialSelectionState = '6a-observed' | '6b-inferred' | 'none';

/** 紹介URLの状態。 */
export type AffiliateUrlState = 'valid-item-page' | 'missing' | 'invalid-host';

/** 重複の状態。 */
export type DuplicateState = 'unique' | 'duplicate';

/** 除外語（中古・訳あり・並行輸入・まとめ買い）の状態。 */
export type ExcludedTermState = 'clean' | 'hit';

/** 公式仕様と販売ページの整合。`unknown` を必ず持つ。 */
export type OfficialConsistencyState = 'consistent' | 'inconsistent' | 'unknown';

/** 24 時間後の再確認。 */
export type RecheckState = 'matched-previous-day' | 'not-yet' | 'mismatched';

export type TierInput = {
  manufacturerId: ManufacturerId | null;
  officialFetchStatus: OfficialFetchStatus;
  extraction: ExtractionResult;
  recallStatus: RecallStatus;
  jan: JanState;
  model: ModelMatchState;
  variant: VariantState;
  initialSelection: InitialSelectionState;
  affiliateUrl: AffiliateUrlState;
  duplicate: DuplicateState;
  excludedTerm: ExcludedTermState;
  officialConsistency: OfficialConsistencyState;
  recheck: RecheckState;
};

export type BlockerCode =
  | 'manufacturer-unknown'
  | 'official-robots-denied'
  | 'official-http-blocked'
  | 'official-fetch-failed'
  | 'official-extract-failed'
  | 'recall-hit'
  | 'recall-unavailable'
  | 'excluded-term'
  | 'variant-unknown'
  | 'variant-conflicting'
  | 'duplicate'
  | 'affiliate-url-missing'
  | 'affiliate-url-invalid-host'
  | 'initial-selection-unknown'
  | 'model-ambiguous'
  | 'model-absent'
  | 'official-inconsistent';
```

**`recallHit: boolean` は使わない。** `boolean` では「確認して問題なし」と
「確認できなかった」を区別できず、fail-closed にならないためである。

### 判定規則（設計書 5.5 に対応）

#### B（保留）— 次のいずれか 1 つでも成立したら B

| `BlockerCode` | 成立条件 |
|---|---|
| `manufacturer-unknown` | `manufacturerId === null` |
| `official-robots-denied` | `officialFetchStatus === 'robots-denied'` |
| `official-http-blocked` | `officialFetchStatus === 'http-blocked'` |
| `official-fetch-failed` | `officialFetchStatus === 'failed'` |
| `official-extract-failed` | `extraction.ok === false` |
| `recall-hit` | `recallStatus === 'hit'` |
| `recall-unavailable` | `recallStatus === 'unavailable'` |
| `excluded-term` | `excludedTerm === 'hit'` |
| `variant-unknown` | `variant === 'unknown'` |
| `variant-conflicting` | `variant === 'conflicting'` |
| `duplicate` | `duplicate === 'duplicate'` |
| `affiliate-url-missing` | `affiliateUrl === 'missing'` |
| `affiliate-url-invalid-host` | `affiliateUrl === 'invalid-host'` |
| `initial-selection-unknown` | `initialSelection === 'none'` |
| `model-ambiguous` | `model === 'ambiguous'` |
| `model-absent` | `model === 'absent'` |
| `official-inconsistent` | `officialConsistency === 'inconsistent'` |

**B の条件が 1 つでも立ったら、S/A の条件を満たしていても B。保留側が常に勝つ。**

#### S（即時自動公開）— B に該当せず、次の 9 条件を**すべて**満たす

| # | 設計書 5.5 の条件 | 型での表現 |
|---:|---|---|
| 1 | 許可メーカーに正規化できる | `manufacturerId !== null` |
| 2 | 公式ページを取得できた | `officialFetchStatus === 'ok'` |
| 3 | 構造化仕様を抽出できた | `extraction.ok === true` |
| 4 | 型番と JAN の**両方**が一致 | `model === 'exact'` かつ `jan === 'published-and-matched'` |
| 5 | 色・容量・サイズ・セット数が一致し矛盾がない | `variant === 'matched'` |
| 6 | 別商品の初期選択がない | `initialSelection === '6a-observed'` または `'6b-inferred'` |
| 7 | 正規の楽天紹介URLがある | `affiliateUrl === 'valid-item-page'` |
| 8 | リコール・販売停止の対象でない | `recallStatus === 'clear'` |
| 9 | 重複しない | `duplicate === 'unique'` |

#### A（24 時間後の再確認で自動公開）— B に該当せず S でなく、次の 8 条件を**すべて**満たす

| # | 設計書 5.5 の条件 | 型での表現 |
|---:|---|---|
| 1 | 許可メーカーに正規化できる | `manufacturerId !== null` |
| 2 | 公式ページを取得できた | `officialFetchStatus === 'ok'` |
| 3 | 構造化仕様を抽出できた | `extraction.ok === true` |
| 4 | **JAN が未公表** | `jan === 'not-published'` |
| 5 | 型番が**完全一致** | `model === 'exact'` |
| 6 | 色・容量・サイズ・セット数が一致 | `variant === 'matched'` |
| 7 | 別商品の初期選択がない／正規の紹介URL／リコール clear／重複なし | 6・7・8・9（S と同じ） |
| 8 | 公式と販売ページが矛盾せず、**24 時間後の再取得で同一** | `officialConsistency === 'consistent'` かつ `recheck === 'matched-previous-day'` |

上のいずれでもなければ `'B'`（`blockers` が空でも A の条件を満たさなければ B）。

**`sizeBasis: 'unspecified'` は `TierInput` に含めない。** 判定に使わないためである（設計書 5.5 決定済み事項）。

### ステップ

- [ ] `tests/factories/index.ts` に `makeTierInput`（**S を満たす既定値**）を足す（5 分）
- [ ] `BLOCKER_CODES` がちょうど 17 個である失敗テストを書く（2 分）
- [ ] `makeTierInput()` が `'S'` になる失敗テストを書く（2 分）
- [ ] `BLOCKER_CASES`（`{ code, apply }` の配列）の型と `it.each` の枠を書く（まだ 0 件）（3 分）
- [ ] 出典・取得に関する 6 ブロッカーのケースを足す（5 分）
- [ ] 抽出・照合に関する 6 ブロッカーのケースを足す（5 分）
- [ ] リコール・重複・予算に関する残り 5 ブロッカーのケースを足す（4 分）
- [ ] `BLOCKER_CASES` の件数が `BLOCKER_CODES` と一致する（取りこぼし検出）テストを書く（3 分）
- [ ] 同じ 17 個を **A の入力に加えても**すべて `'B'` になる失敗テストを書く（5 分）
- [ ] `initialSelection: '6b-inferred'` でも `'S'` になる失敗テストを書く（3 分）
- [ ] `jan: 'published-but-mismatched'` は S でも A でもなく `'B'` になる失敗テストを書く（3 分）
- [ ] `recheck: 'not-yet'` の A 候補が `'B'` になる失敗テストを書く（3 分）
- [ ] `officialConsistency: 'unknown'` の A 候補が `'B'` になる失敗テストを書く（3 分）
- [ ] S の 9 条件を 1 つずつ崩すと `'S'` にならない失敗テストを書く（5 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] 11 個の状態型と `TierInput` / `BlockerCode` を書く（5 分）
- [ ] 17 ブロッカーの評価（早期 return しない）を実装する（5 分）
- [ ] S の 9 条件を実装する（4 分）
- [ ] A の 8 条件を実装し、どちらでもなければ `'B'` にする（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-tier.test.ts
import { describe, expect, it } from 'vitest';
import {
  BLOCKER_CODES,
  decideTier,
  type BlockerCode,
  type TierInput,
} from '../src/lib/automation/tier';
import { makeTierInput } from './factories';

/** S を満たす入力に、ブロッカーを 1 つだけ立てる差分。 */
const BLOCKER_CASES: readonly { code: BlockerCode; patch: Partial<TierInput> }[] = [
  { code: 'manufacturer-unknown', patch: { manufacturerId: null } },
  { code: 'official-robots-denied', patch: { officialFetchStatus: 'robots-denied' } },
  { code: 'official-http-blocked', patch: { officialFetchStatus: 'http-blocked' } },
  { code: 'official-fetch-failed', patch: { officialFetchStatus: 'failed' } },
  { code: 'official-extract-failed', patch: { extraction: { ok: false, reason: 'no-spec-table' } } },
  { code: 'recall-hit', patch: { recallStatus: 'hit' } },
  { code: 'recall-unavailable', patch: { recallStatus: 'unavailable' } },
  { code: 'excluded-term', patch: { excludedTerm: 'hit' } },
  { code: 'variant-unknown', patch: { variant: 'unknown' } },
  { code: 'variant-conflicting', patch: { variant: 'conflicting' } },
  { code: 'duplicate', patch: { duplicate: 'duplicate' } },
  { code: 'affiliate-url-missing', patch: { affiliateUrl: 'missing' } },
  { code: 'affiliate-url-invalid-host', patch: { affiliateUrl: 'invalid-host' } },
  { code: 'initial-selection-unknown', patch: { initialSelection: 'none' } },
  { code: 'model-ambiguous', patch: { model: 'ambiguous' } },
  { code: 'model-absent', patch: { model: 'absent' } },
  { code: 'official-inconsistent', patch: { officialConsistency: 'inconsistent' } },
];

/** A を満たす入力（JAN 未公表・型番完全一致・整合・再確認済み）。 */
const aInput = (): TierInput =>
  makeTierInput({ jan: 'not-published', officialConsistency: 'consistent', recheck: 'matched-previous-day' });

describe('S/A/B 判定', () => {
  it('ブロッカーは 17 種で、テーブルが全種を網羅している', () => {
    expect(BLOCKER_CODES).toHaveLength(17);
    expect(BLOCKER_CASES.map((c) => c.code).sort()).toEqual([...BLOCKER_CODES].sort());
  });

  it('既定の入力は S', () => {
    const verdict = decideTier(makeTierInput());
    expect(verdict.blockers).toEqual([]);
    expect(verdict.tier).toBe('S');
  });

  it('A の条件を満たす入力は A', () => {
    expect(decideTier(aInput()).tier).toBe('A');
  });

  it.each(BLOCKER_CASES)('S の入力に $code を加えると B になる', ({ code, patch }) => {
    const verdict = decideTier({ ...makeTierInput(), ...patch });
    expect(verdict.tier).toBe('B');
    expect(verdict.blockers).toContain(code);
  });

  it.each(BLOCKER_CASES)('A の入力に $code を加えても B になる', ({ code, patch }) => {
    const verdict = decideTier({ ...aInput(), ...patch });
    expect(verdict.tier).toBe('B');
    expect(verdict.blockers).toContain(code);
  });

  it('6b（推定）でも S になりうる', () => {
    expect(decideTier(makeTierInput({ initialSelection: '6b-inferred' })).tier).toBe('S');
  });

  it('JAN が公表されているのに一致しないものは S にも A にもしない', () => {
    expect(decideTier(makeTierInput({ jan: 'published-but-mismatched' })).tier).toBe('B');
  });

  it('再確認が済んでいない A 候補は B のまま', () => {
    expect(decideTier({ ...aInput(), recheck: 'not-yet' }).tier).toBe('B');
    expect(decideTier({ ...aInput(), recheck: 'mismatched' }).tier).toBe('B');
  });

  it('公式との整合が確認できない A 候補は B のまま', () => {
    expect(decideTier({ ...aInput(), officialConsistency: 'unknown' }).tier).toBe('B');
  });

  it('型番が部分一致どまりなら S にならない', () => {
    expect(decideTier(makeTierInput({ model: 'partial' })).tier).toBe('B');
  });
});
```

`makeTierInput` は `tests/factories/index.ts` に次を足す。

```ts
import type { TierInput } from '../../src/lib/automation/tier';

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
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-tier.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/tier
```

### 最小実装

```ts
export function decideTier(input: TierInput): TierVerdict {
  const blockers: BlockerCode[] = [];
  if (input.manufacturerId === null) blockers.push('manufacturer-unknown');
  if (input.officialFetchStatus === 'robots-denied') blockers.push('official-robots-denied');
  // …17 個すべてを同じ形で評価する
  if (blockers.length > 0) return { tier: 'B', blockers, satisfied: [] };
  // S の 9 条件 → A の 8 条件 の順に評価し、どちらでもなければ 'B'
}
```

**ブロッカーの評価を先に全部行う**（早期 return しない）ことで、
`blockers` に立った理由がすべて残り、Issue と観測レポートで内訳を数えられる。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-tier.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 商品の S/A/B 判定を fail-closed で追加

recallHit: boolean をやめ、officialFetchStatus / recallStatus / JanState /
VariantState / InitialSelectionState などで判定不能を型として表す。
17 種のブロッカーが 1 つでも立てば B。保留側が常に勝つ。
S と A の必要条件を設計書 5.5 どおり 1 つずつ明示的に要求する。
17 種を S 入力と A 入力の両方に加える table-driven test で網羅する。
```

---

## Task 10: リンク状態機械

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/link-state.ts` |
| 作成 | `travel-goods-site/tests/automation-link-state.test.ts` |

### Consumes / Produces

- Consumes: `LinkSignals`, `LinkHealthEntry` from `./state/schema`、`MerchantLink` from `@/lib/catalog/types`、`isHumanVerifiedLink` from `@/lib/rakuten/match`
- Produces:
  - `export const LINK_THRESHOLDS: { hiddenDays: 3; replaceDays: 7; outOfStockDays: 14 }`
  - `export type LinkState = 'healthy' | 'uncertain' | 'hidden' | 'replace' | 'manual-hold'`
  - `export function nextLinkState(previous: LinkHealthEntry, signals: LinkSignals): LinkHealthEntry`
  - `export type ReplacementDecision = { action: 'replace-now' } | { action: 'replace-after-recheck' } | { action: 'pr-only'; reason: 'human-verified' } | { action: 'hold'; reason: string }`
  - `export function decideReplacement(link: MerchantLink, state: LinkState, candidateTier: Tier): ReplacementDecision`

### 仕様（設計書 8.3・8.4 に対応）

**「API が応答しなかった」と「API は答えたが商品が無い」を別の軸で持つ。**
`availability === null` だけで両方を表すと、単純に判定順を入れ替えたときに
API 障害を商品消失として数えてしまう。そこで `observationStatus` を先に見る。

| 入力 | 次の状態 | カウンタ | `lastHealthyAt` |
|---|---|---|---|
| `observationStatus === 'unavailable'`（API 障害） | 前日が `healthy` なら `uncertain`。**それ以外は前日の状態を維持**（`uncertain`/`hidden`/`replace`/`manual-hold`） | **全カウンタ据え置き** | 更新しない |
| `observationStatus === 'ok'` かつ `!itemCodeAlive` | `consecutiveFailures` を +1（`availability` が `null` でも数える） | `consecutiveOutOfStock` は 0 | 更新しない |
| 上の連続が 3 日 | `hidden` | — | 更新しない |
| 上の連続が 7 日 | `replace` | — | 更新しない |
| `observationStatus === 'ok'` かつ `itemCodeAlive && availability === 0` | 表示維持。14 日で `hidden` | `consecutiveOutOfStock` を +1、`consecutiveFailures` は 0 | 更新しない |
| `observationStatus === 'ok'` かつ `itemCodeAlive && availability === null` | **`uncertain`**（在庫の判断材料が無いので `healthy` にしない） | `consecutiveFailures` は 0（itemCode の存在は確認できた）。**`consecutiveOutOfStock` は据え置く**（在庫が戻った証拠が無いので 0 へ戻さない） | 更新しない |
| `affiliateTargetChanged === true` | **`manual-hold`**。自動交換もしない | `consecutiveFailures` を増やさない | 更新しない |
| `identifierMatch === 'weak' && !variantMatch` | `manual-hold` | — | 更新しない |
| `itemCodeAlive && availability === 1 && identifierMatch !== 'none' && variantMatch` かつ遷移先が変わっていない | `healthy` | `consecutiveFailures = 0`、`consecutiveOutOfStock = 0` | 更新する |

**観測不能日に確定済みの制限状態を解除しない。** 「観測できなかった」は
「以前確定した異常が解消した」を意味しない。`hidden` / `replace` / `manual-hold` は
API 障害が何日続いても据え置き、緩和するのは `healthy` → `uncertain` だけ。

**`healthy` にするのは `availability === 1` を確認できたときだけ。**
`availability === null`（在庫情報だけ取れなかった）は `uncertain` にする。

**`affiliateTargetChanged` は保存するだけにしない。** 紹介URLの `pc` 遷移先が
変わったリンクは別商品へ飛びうるので、他の信号が正常でも `healthy` にしない。
ただし商品が消えたわけではないので、連続失敗日数は増やさず自動交換にも進めない。

**`itemCode` の不在は `manual-hold` より優先する。** 消えたリンクは
遷移先の変化や識別子の弱さに関わらず `hidden` → `replace` へ進む。

`decideReplacement` — **状態を先に見る**:

- `state !== 'replace'` → **必ず** `{ action: 'hold', reason: ... }`
  （目視確認済みかどうかを先に見ると、正常なリンクまで PR へ出てしまう）
- `state === 'replace'` かつ `isHumanVerifiedLink(link)` → `{ action: 'pr-only', reason: 'human-verified' }`
- `state === 'replace'` かつ `candidateTier === 'S'` → `{ action: 'replace-now' }`
- `state === 'replace'` かつ `candidateTier === 'A'` → `{ action: 'replace-after-recheck' }`
- それ以外 → `{ action: 'hold', reason: ... }`

### ステップ

- [ ] `healthy` の入力で `consecutiveFailures` が 0 にリセットされる失敗テストを書く（3 分）
- [ ] `observationStatus === 'unavailable'` が 30 日続いても全カウンタが据え置かれる失敗テストを書く（4 分）
- [ ] `observationStatus === 'ok'` かつ `!itemCodeAlive` なら `availability` が `null` でも数える失敗テストを書く（4 分）
- [ ] `itemCodeAlive` かつ `availability === null` で `healthy` にせず、`consecutiveOutOfStock` を据え置く失敗テストを書く（4 分）
- [ ] `hidden` / `replace` / `manual-hold` が API 障害で解除されない失敗テストを書く（4 分）
- [ ] `!itemCodeAlive` を 3 日連続で与えると 3 日目に `hidden` になる失敗テストを書く（4 分）
- [ ] `affiliateTargetChanged` が `true` なら `healthy` にせず `manual-hold` にする失敗テストを書く（4 分）
- [ ] 遷移先が変わっても連続失敗日数を増やさず `lastHealthyAt` を更新しない失敗テストを書く（3 分）
- [ ] 7 日連続で `replace` になる失敗テストを書く（3 分）
- [ ] `availability === 0` を 13 日続けても `hidden` にならず、14 日目に `hidden` になる失敗テストを書く（4 分）
- [ ] `identifierMatch: 'weak'` かつ `variantMatch: false` で `manual-hold` になる失敗テストを書く（3 分）
- [ ] `verified`+`visual` のリンクは `replace` でも `pr-only` になる失敗テストを書く（4 分）
- [ ] `verified`+`visual` でも `replace` 以外の 4 状態はすべて `hold` になる失敗テストを書く（3 分）
- [ ] `replace` + 候補 S で `replace-now`、候補 A で `replace-after-recheck` になる失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `LINK_THRESHOLDS` と `observationStatus === 'unavailable'` の据え置きを実装する（4 分）
- [ ] `affiliateTargetChanged` を状態判定へ結線する（3 分）
- [ ] `itemCodeAlive` の連続不在日数から `hidden` / `replace` を決める（5 分）
- [ ] `consecutiveOutOfStock` と `manual-hold` を実装する（4 分）
- [ ] `decideReplacement`（状態を先に見てから目視確認済みの保護）を実装する（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-link-state.test.ts
import { describe, expect, it } from 'vitest';
import { LINK_THRESHOLDS, decideReplacement, nextLinkState } from '../src/lib/automation/link-state';
import type { LinkHealthEntry, LinkSignals } from '../src/lib/automation/state/schema';
import { makeLinkHealthEntry, makeLinkSignals, makeMerchantLink } from './factories';

const healthy: LinkSignals = makeLinkSignals();
const gone: LinkSignals = makeLinkSignals({ itemCodeAlive: false, availability: null, identifierMatch: 'none', variantMatch: false });
const outOfStock: LinkSignals = makeLinkSignals({ availability: 0 });
const apiError: LinkSignals = makeLinkSignals({ itemCodeAlive: false, availability: null, identifierMatch: 'none', variantMatch: false });

/** signals を n 日連続で与えたあとの状態を返す。 */
function advance(start: LinkHealthEntry, signals: LinkSignals, days: number): LinkHealthEntry {
  let entry = start;
  for (let i = 0; i < days; i += 1) entry = nextLinkState(entry, signals);
  return entry;
}

describe('リンク状態機械', () => {
  it('しきい値は 3 日 / 7 日 / 14 日', () => {
    expect(LINK_THRESHOLDS).toEqual({ hiddenDays: 3, replaceDays: 7, outOfStockDays: 14 });
  });

  it('正常な信号で連続失敗日数が 0 に戻る', () => {
    const prev = makeLinkHealthEntry({ consecutiveFailures: 2, state: 'hidden' });
    const next = nextLinkState(prev, healthy);
    expect(next.state).toBe('healthy');
    expect(next.consecutiveFailures).toBe(0);
  });

  it('API エラー（availability が null）では連続失敗日数を増やさない', () => {
    const prev = makeLinkHealthEntry({ consecutiveFailures: 2, state: 'uncertain' });
    const next = nextLinkState(prev, apiError);
    expect(next.state).toBe('uncertain');
    expect(next.consecutiveFailures).toBe(2);
  });

  it('itemCode 不在が 3 日続くと hidden、7 日で replace', () => {
    const start = makeLinkHealthEntry();
    expect(advance(start, gone, 2).state).not.toBe('hidden');
    expect(advance(start, gone, 3).state).toBe('hidden');
    expect(advance(start, gone, 7).state).toBe('replace');
  });

  it('在庫切れだけでは 13 日目まで表示を維持し、14 日目に hidden', () => {
    const start = makeLinkHealthEntry();
    expect(advance(start, outOfStock, 13).state).toBe('healthy');
    expect(advance(start, outOfStock, 14).state).toBe('hidden');
  });

  it('同一商品と断定できない組み合わせは manual-hold', () => {
    const next = nextLinkState(makeLinkHealthEntry(), makeLinkSignals({ identifierMatch: 'weak', variantMatch: false }));
    expect(next.state).toBe('manual-hold');
  });
});

describe('代替リンクへの交換', () => {
  it('目視確認済みリンクは replace でも自動交換しない', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'visual' });
    for (const tier of ['S', 'A', 'B'] as const) {
      expect(decideReplacement(link, 'replace', tier)).toEqual({ action: 'pr-only', reason: 'human-verified' });
    }
  });

  it('自動取得のリンクは候補 Tier で動作が変わる', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'identifier-match' });
    expect(decideReplacement(link, 'replace', 'S')).toEqual({ action: 'replace-now' });
    expect(decideReplacement(link, 'replace', 'A')).toEqual({ action: 'replace-after-recheck' });
    expect(decideReplacement(link, 'replace', 'B').action).toBe('hold');
  });

  it('replace 以外の状態では交換しない', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'identifier-match' });
    for (const state of ['healthy', 'uncertain', 'hidden', 'manual-hold'] as const) {
      expect(decideReplacement(link, state, 'S').action).toBe('hold');
    }
  });
});
```

このテストが使う factory を `tests/factories/index.ts` に足す。

```ts
import type { LinkHealthEntry, LinkSignals } from '../../src/lib/automation/state/schema';

export function makeLinkSignals(over: Partial<LinkSignals> = {}): LinkSignals {
  return {
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
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-link-state.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/link-state
```

### 最小実装

`nextLinkState` は `signals.observationStatus === 'unavailable'` を最初に判定し、
**全カウンタと `lastHealthyAt` を据え置いたまま**、前日が `healthy` のときだけ
`uncertain` へ落とす（それ以外は前日の状態をそのまま返す）。それ以外（API は正常に応答した日）は
`itemCodeAlive` の連続不在日数と `consecutiveOutOfStock` を更新してから、
しきい値と比較して状態を決める。`availability === null` だけでは
`uncertain` に落とさない（商品が消えていれば在庫情報も返らないため）。
`decideReplacement` は `state !== 'replace'` を最初に判定して `hold` を返す。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-link-state.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): リンク健全性の状態機械と交換判定を追加

itemCode 生存・availability・識別子・variant を別々の信号として扱い、
外部障害では連続失敗日数を増やさない。
目視確認済みリンクは replace に到達しても自動交換せず PR 止まりにする。
```

---

## Task 11: 既存 15 リンクでの回帰確認

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/tests/automation-regression.test.ts` |

### Consumes / Produces

- Consumes: 本番データセット（読み取りのみ）、`decideReplacement`、`isHumanVerifiedLink`
- Produces: なし（テストのみ）

### 仕様

**現在 `verified`+`visual` の 14 件が、どの状態・どの候補 Tier でも `pr-only` になることを実データで確認する。**
これは設計書 8.4 の「異常確定まで保護する」を、実際の 15 件に対して保証するテストである。

**データを変更しない。読み取りだけ。**

### ステップ

- [ ] `datasets/production/merchants/rakuten.json` を読み、15 件であることを確認する失敗テストを書く（3 分）
- [ ] `verified`+`visual` が 14 件、`unverified` が 1 件であることを確認する失敗テストを書く（3 分）
- [ ] 14 件それぞれについて、`decideReplacement(link, 'replace', 'S')` が `pr-only` を返す失敗テストを書く（4 分）
- [ ] `unverified` の 1 件（`ace-crestas-09162-60l-gunmetallic`）は保護対象でないことを確認する失敗テストを書く（3 分）
- [ ] テストを実行し、Task 10 の実装があれば成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import fs from 'node:fs';
import path from 'node:path';
import { decideReplacement } from '../src/lib/automation/link-state';
import { isHumanVerifiedLink } from '../src/lib/rakuten/match';

const links = JSON.parse(fs.readFileSync(
  path.join(__dirname, '../datasets/production/merchants/rakuten.json'), 'utf8'));

it('現行 15 件のうち 14 件が目視確認済み', () => {
  expect(links).toHaveLength(15);
  expect(links.filter(isHumanVerifiedLink)).toHaveLength(14);
});

it('目視確認済み 14 件は、どの候補 Tier でも自動交換されない', () => {
  for (const link of links.filter(isHumanVerifiedLink)) {
    for (const tier of ['S', 'A', 'B'] as const) {
      expect(decideReplacement(link, 'replace', tier).action).toBe('pr-only');
    }
  }
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-regression.test.ts
```

### 期待する失敗内容

Task 10 実装前なら `Failed to load url`。
Task 10 実装後に件数が変わっていれば `expected 15 to be 14` 等。

### 最小実装

実装は不要（Task 10 で完了している）。このテストは**保護の回帰**を固定するためのもの。

### 成功確認コマンド

```bash
cd travel-goods-site && npm test && npm run typecheck && npm run lint && npm run validate:content:all
```

### コミット

```
test(travel-goods-site): 既存 15 リンクの保護を実データで固定する

verified + visual の 14 件が、どの状態・どの候補 Tier でも
自動交換されず PR 止まりになることを確認する。データは読み取りのみ。
```

---

## Task 12: カテゴリ拡張の判定

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/category-expansion.ts` |
| 作成 | `travel-goods-site/tests/automation-category-expansion.test.ts` |

### Consumes / Produces

- Consumes: `Candidate`（`QueueEntry` の `kind: 'candidate'`。Task 1）、`ManufacturerId`（Task 6）、`CATEGORIES` from `@/lib/catalog/types`
- Produces:
  - `export const EXPANSION_THRESHOLDS: { minValidCandidates: 5; minSharedSpecs: 3; minFetchSuccessRate: 0.8; fetchWindowDays: 14 }`
  - `export type ExpansionCandidateGroup = { proposedCategory: string; candidates: { targetId: string; manufacturerId: ManufacturerId; availableSpecs: string[] }[]; fetchSuccessRate: number }`
  - `export type ExpansionVerdict = { ready: false; missing: ('candidates' | 'shared-specs' | 'fetch-stability')[] } | { ready: true; sharedSpecs: string[] }`
  - `export function evaluateCategoryExpansion(group: ExpansionCandidateGroup): ExpansionVerdict`
  - `export function isKnownCategory(name: string): boolean`

### 仕様（設計書 6.1・6.2・6.3 に対応）

- **既存 4 カテゴリ**（`suitcases` / `backpacks` / `pouches` / `power-banks`）の商品は S/A/B 判定後に公開できる。
- **新カテゴリの商品は公開しない。候補として蓄積するだけ。**
- カテゴリ追加 PR を提案してよいのは、次を**すべて**満たしたとき:
  1. 有効候補が **5 件以上**（許可メーカー、型番抽出可、公式ページ取得可）
  2. その 5 件に**共通する比較仕様が 3 項目以上**
  3. 直近 **14 日**の同一メーカー取得成功率が **80% 以上**
- `evaluateCategoryExpansion` は**判定だけ**を返す。**PR を作らない。**
  実際の提案（Draft PR / Issue）は計画3 の `automation-discover.yml` が行い、
  **このPR だけは自動マージしない**（`CATEGORIES` はコード変更のため。設計書 6.3）。

### ステップ

- [ ] `isKnownCategory('suitcases')` が `true`、`isKnownCategory('travel-pillows')` が `false` を返す失敗テストを書く（2 分）
- [ ] 候補 4 件で `{ ready: false, missing: ['candidates'] }` を返す失敗テストを書く（3 分）
- [ ] 候補 5 件だが共通仕様 2 項目で `missing: ['shared-specs']` を返す失敗テストを書く（4 分）
- [ ] 取得成功率 0.79 で `missing: ['fetch-stability']` を返す失敗テストを書く（3 分）
- [ ] 3 条件すべて欠けると `missing` が 3 件になる失敗テストを書く（3 分）
- [ ] 3 条件すべて満たすと `{ ready: true, sharedSpecs: [...] }` を返し、`sharedSpecs` が 3 件以上ある失敗テストを書く（4 分）
- [ ] `EXPANSION_THRESHOLDS` の 4 つの値が設計書どおりである失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `EXPANSION_THRESHOLDS` と入力型を書く（3 分）
- [ ] 3 条件の判定（商品数・出典数・共通 spec 数）を実装する（5 分）
- [ ] `missing` の組み立てと `sharedSpecs` の算出を実装する（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-category-expansion.test.ts
import { describe, expect, it } from 'vitest';
import {
  EXPANSION_THRESHOLDS,
  evaluateCategoryExpansion,
  isKnownCategory,
  type ExpansionCandidateGroup,
} from '../src/lib/automation/category-expansion';

function makeGroup(
  count: number,
  specs: string[],
  fetchSuccessRate = 1,
): ExpansionCandidateGroup {
  return {
    proposedCategory: 'travel-pillows',
    candidates: Array.from({ length: count }, (_, i) => ({
      targetId: `candidate-${i}`,
      manufacturerId: 'ace' as const,
      availableSpecs: specs,
    })),
    fetchSuccessRate,
  };
}

const THREE_SPECS = ['weightG', 'capacityL', 'outerSizeMm'];

describe('カテゴリ拡張の判定', () => {
  it('既存 4 カテゴリだけを既知とする', () => {
    expect(isKnownCategory('suitcases')).toBe(true);
    expect(isKnownCategory('backpacks')).toBe(true);
    expect(isKnownCategory('pouches')).toBe(true);
    expect(isKnownCategory('power-banks')).toBe(true);
    expect(isKnownCategory('travel-pillows')).toBe(false);
  });

  it('しきい値は 5 件 / 3 項目 / 80% / 14 日', () => {
    expect(EXPANSION_THRESHOLDS).toEqual({
      minValidCandidates: 5, minSharedSpecs: 3, minFetchSuccessRate: 0.8, fetchWindowDays: 14,
    });
  });

  it('候補が 4 件では提案しない', () => {
    expect(evaluateCategoryExpansion(makeGroup(4, THREE_SPECS)))
      .toEqual({ ready: false, missing: ['candidates'] });
  });

  it('共通仕様が 2 項目では提案しない', () => {
    expect(evaluateCategoryExpansion(makeGroup(5, ['weightG', 'capacityL'])))
      .toEqual({ ready: false, missing: ['shared-specs'] });
  });

  it('取得成功率が 80% 未満では提案しない', () => {
    expect(evaluateCategoryExpansion(makeGroup(5, THREE_SPECS, 0.79)))
      .toEqual({ ready: false, missing: ['fetch-stability'] });
  });

  it('3 条件すべて欠ければ missing が 3 件になる', () => {
    const v = evaluateCategoryExpansion(makeGroup(1, ['weightG'], 0.1));
    expect(v.ready).toBe(false);
    if (v.ready) return;
    expect(v.missing.sort()).toEqual(['candidates', 'fetch-stability', 'shared-specs']);
  });

  it('3 条件すべて満たせば共通仕様つきで提案できる', () => {
    const v = evaluateCategoryExpansion(makeGroup(5, THREE_SPECS));
    expect(v.ready).toBe(true);
    if (!v.ready) return;
    expect(v.sharedSpecs.sort()).toEqual([...THREE_SPECS].sort());
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-category-expansion.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/category-expansion
```

### 最小実装

`evaluateCategoryExpansion` は 3 条件を順に評価して `missing` に積み、
`missing.length === 0` のときだけ `{ ready: true, sharedSpecs }` を返す。
`sharedSpecs` は全候補の `availableSpecs` の積集合。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-category-expansion.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): カテゴリ拡張の判定を追加

有効候補 5 件以上・共通仕様 3 項目以上・取得成功率 80% 以上のときだけ
カテゴリ追加を提案できると判定する。判定だけを返し、PR は作らない。
既存 4 カテゴリ以外の商品は公開対象にしない。
```

---

## Task 13: 公式 Source の解決と安全な取得

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/sync/resolve-official.ts` |
| 作成 | `travel-goods-site/src/lib/automation/sync/fetch-official.ts` |
| 作成 | `travel-goods-site/src/lib/automation/sync/recall.ts` |
| 作成 | `travel-goods-site/tests/automation-resolve-official.test.ts` |
| 作成 | `travel-goods-site/tests/automation-recall.test.ts` |

### Consumes / Produces

- Consumes: `Product`, `Source`, `Fact` from `@/lib/catalog/types`、`adapterFor`, `normalizeBrand`, `UrlResolution` from `@/lib/manufacturers/registry`
- Produces:
  - `resolve-official.ts`
    - `export type OfficialFetchPolicy = { manufacturerId: ManufacturerId; approved: boolean; approvedNote: string | null }`
    - `export const OFFICIAL_FETCH_POLICIES: readonly OfficialFetchPolicy[]`（**段階0 は全件 `approved: false`**）
    - `export function isOfficialFetchApproved(id: ManufacturerId | null, policies?: readonly OfficialFetchPolicy[]): boolean`（`policies` の既定は `OFFICIAL_FETCH_POLICIES`）
    - `export function factSourceIds(product: Product): string[]`（**その商品の Facts が参照する `sourceId` だけ**）
    - `export type ResolveTarget = { manufacturerId: ManufacturerId | null; model: string; variant: string; factSourceIds: readonly string[] }`
    - `export function resolveOfficialUrl(target: ResolveTarget, sources: readonly Source[], policies?: readonly OfficialFetchPolicy[]): UrlResolution`（`policies` の既定は `OFFICIAL_FETCH_POLICIES`。**受け取った `policies` を `isOfficialFetchApproved` へそのまま渡す**）
    - `export function targetFromFields(fields: { manufacturerId: ManufacturerId | null; model: string | null; variant: string | null; factSourceIds?: readonly string[] }): ResolveTarget | null`（`model` か `variant` が `null` か空白のみなら `null`）
    - `export function targetFromProduct(product: Product): ResolveTarget`（内部で `normalizeBrand(product.brand)` と `factSourceIds(product)` を通して `targetFromFields` を呼ぶ）
  - `fetch-official.ts`
    - `export type OfficialFetchOutcome = { status: 'ok'; html: string } | { status: 'robots-denied' | 'http-blocked' | 'failed'; httpStatus: number | null }`
    - `export type OfficialFetcher = (url: string) => Promise<OfficialFetchOutcome>`
    - `export function createOfficialFetcher(options: { allowedHosts: readonly string[]; minIntervalMs: number; timeoutMs: number }): OfficialFetcher`
  - `recall.ts`
    - `export type RecallSource = { manufacturerId: ManufacturerId; url: string; approved: boolean }`
    - `export const RECALL_SOURCES: readonly RecallSource[]`
    - `export type RecallChecker = (manufacturerId: ManufacturerId, model: string) => Promise<RecallStatus>`
    - `export function createRecallChecker(deps: { fetchPage: OfficialFetcher; sources: readonly RecallSource[] }): RecallChecker`
    - `export const phase0RecallChecker: RecallChecker`（**常に `'unavailable'`**）
    - `export const RECALL_TERMS: readonly string[]`

> **Task 15 の型に依存しない。**
> `resolve-official.ts` は `CandidateDraft` を import しない。
> 新商品用の `targetFromDraft(draft)` は **Task 15 の `candidate.ts`** に置き、
> 内部で `targetFromFields` を呼ぶ。これで Task 13 は Task 15 より先に
> 単独で実装・テスト・コミットでき、循環 import も生じない。

### 仕様

#### メーカー別の取得ポリシー（承認を回避できないようにする）

**既存 Source が未承認でも決定的 URL へフォールバックできると、承認を回避できてしまう。**
新商品には承認済み Source が存在しないため、これは新商品の全件に効く抜け道になる。

そこで**メーカー単位の取得ポリシー**を先に置き、**ここを通らない限り 1 バイトも取得しない**。

```ts
export type OfficialFetchPolicy = {
  manufacturerId: ManufacturerId;
  /** このホストの商品ページを自動取得してよいと人が確認したか。既定 false。 */
  approved: boolean;
  /** 承認したときの根拠（規約の確認日など）。approved が false なら null。 */
  approvedNote: string | null;
};

/** 段階0 では全件 false。承認は人がコード PR で行う。 */
export const OFFICIAL_FETCH_POLICIES: readonly OfficialFetchPolicy[] = [
  { manufacturerId: 'ace',            approved: false, approvedNote: null },
  { manufacturerId: 'proteca',        approved: false, approvedNote: null },
  { manufacturerId: 'world-traveler', approved: false, approvedNote: null },
  { manufacturerId: 'elecom',         approved: false, approvedNote: null },
  { manufacturerId: 'anker',          approved: false, approvedNote: null },
];

/**
 * このメーカーの商品ページを自動取得してよいか。
 * `policies` を受け取れるようにして、テストが承認済みの状態を注入できるようにする。
 * **グローバルの `OFFICIAL_FETCH_POLICIES` を直接見ない。**
 */
export function isOfficialFetchApproved(
  id: ManufacturerId | null,
  policies: readonly OfficialFetchPolicy[] = OFFICIAL_FETCH_POLICIES,
): boolean {
  return policies.some((p) => p.manufacturerId === id && p.approved);
}
```

#### `resolveOfficialUrl` の手順

カタログ全体の `Source` から任意に選ばない。同じホストの無関係な `Source` が
先頭にあっても選ばない。**承認されていないメーカーは、既存 Source があっても無くても解決しない。**

1. `target.manufacturerId` が `null` なら `{ ok: false, reason: 'manufacturer-unknown' }`。
2. **`isOfficialFetchApproved(target.manufacturerId, policies)` が `false` なら
   `{ ok: false, reason: 'fetch-not-approved' }`。ここで打ち切る。**
   **必ず引数で受け取った `policies` を渡す**（グローバルを直接見ると、テストが
   承認済みポリシーを注入しても必ず未承認扱いになり、以降の分岐を一度も検査できない）。
3. `target.factSourceIds` を使う。`targetFromProduct` はこれを `factSourceIds(product)` で作り、
   `weightG` / `outerSizeMm` / `bodySizeMm` / `capacityL` /
   `alternateMeasurements[].sizeMm` / `alternateMeasurements[].capacityL` / `specs[*]` の
   `sourceId` を重複なく集める。新商品（`targetFromFields` の既定）は空配列。
4. その ID の `Source` だけを取り出し、**`automatedFetch === 'allowed'`** のものに絞る。
5. 残ったものの先頭（`sources` の登録順）を `{ ok: true, basis: 'existing-source' }` で返す。
6. 0 件のときだけ、`adapterFor(target.manufacturerId).findProductUrl(target.model, target.variant, [])`
   を使う（`basis: 'deterministic-rule'`）。
7. それも失敗なら `{ ok: false, reason: 'no-existing-source' }`。

```ts
export type ResolveTarget = {
  manufacturerId: ManufacturerId | null;
  model: string;
  variant: string;
  factSourceIds: readonly string[];
};

/** Product が無くても作れる。model か variant が無ければ作らない。 */
export function targetFromFields(fields: {
  manufacturerId: ManufacturerId | null;
  model: string | null;
  variant: string | null;
  factSourceIds?: readonly string[];
}): ResolveTarget | null {
  const model = (fields.model ?? '').trim();
  const variant = (fields.variant ?? '').trim();
  if (model === '' || variant === '') return null;
  return {
    manufacturerId: fields.manufacturerId,
    model,
    variant,
    factSourceIds: fields.factSourceIds ?? [],
  };
}

export function targetFromProduct(product: Product): ResolveTarget {
  const target = targetFromFields({
    manufacturerId: normalizeBrand(product.brand),
    model: product.model,
    variant: product.variant,
    factSourceIds: factSourceIds(product),
  });
  // Product は productSchema で model / variant が非空であることを保証済み。
  if (target === null) throw new Error(`Product ${product.id} に model か variant がありません`);
  return target;
}

export function resolveOfficialUrl(
  target: ResolveTarget,
  sources: readonly Source[],
  policies: readonly OfficialFetchPolicy[] = OFFICIAL_FETCH_POLICIES,
): UrlResolution {
  if (target.manufacturerId === null) return { ok: false, reason: 'manufacturer-unknown' };
  // 受け取った policies をそのまま渡す。ここでグローバルを参照しない。
  if (!isOfficialFetchApproved(target.manufacturerId, policies)) {
    return { ok: false, reason: 'fetch-not-approved' };
  }
  // 手順 3〜7
}
```

**手順 2 により、段階0 ではどのメーカーも公式 URL が解決せず、
`officialFetchStatus` は `'failed'`（分類 `fetch-not-approved`）になり、全商品が B 判定になる。**
リコール確認（常に `unavailable`）と合わせて、**二重に安全側へ倒れる。**

`UrlResolution` の `reason` に `'manufacturer-unknown' | 'fetch-not-approved'` を追加する。

#### `RecallChecker`（リコール確認）

「語検査」だけでは実装できないため、**確認先を明示的に持つ**。

```ts
export const RECALL_TERMS = [
  'リコール', '回収', '使用中止', '自主回収', '無償交換のお知らせ', '販売終了のお知らせ',
] as const;

/**
 * 確認先の網羅性。
 *   exhaustive … 対象型番が載っていれば必ずこのページから辿れる、と人が確認した
 *   partial    … 一覧の一部（最新 N 件・年別など）しか出ない
 *   unknown    … 網羅性を確認していない
 */
export type RecallCoverage = 'exhaustive' | 'partial' | 'unknown';

export type RecallSource = {
  manufacturerId: ManufacturerId;
  url: string;
  /** このURLを自動取得してよいと人が確認したか。既定 false。 */
  approved: boolean;
  coverage: RecallCoverage;
  /** 承認と網羅性の根拠。approved が false なら null。 */
  approvedNote: string | null;
};

/** 段階0 では全件 approved: false / coverage: 'unknown'。承認は人がコード PR で行う。 */
export const RECALL_SOURCES: readonly RecallSource[] = [
  { manufacturerId: 'ace',            url: 'https://www.ace.jp/information/',            approved: false, coverage: 'unknown', approvedNote: null },
  { manufacturerId: 'proteca',        url: 'https://www.ace.jp/information/',            approved: false, coverage: 'unknown', approvedNote: null },
  { manufacturerId: 'world-traveler', url: 'https://www.ace.jp/information/',            approved: false, coverage: 'unknown', approvedNote: null },
  { manufacturerId: 'elecom',         url: 'https://www.elecom.co.jp/news/important/',   approved: false, coverage: 'partial', approvedNote: null },
  { manufacturerId: 'anker',          url: 'https://www.ankerjapan.com/pages/support',   approved: false, coverage: 'unknown', approvedNote: null },
];
```

判定:

| 状況 | 返す値 |
|---|---|
| 確認先が `approved: false`、または該当メーカーの確認先が無い | **`'unavailable'`** |
| 取得が `robots-denied` / `http-blocked` / `failed` | **`'unavailable'`** |
| 取得できて、本文に `RECALL_TERMS` のいずれかと `model` の**両方**が現れる | `'hit'`（`coverage` を問わない） |
| 取得できて該当が無く、**`coverage === 'exhaustive'`** | `'clear'` |
| 取得できて該当が無いが、**`coverage` が `'partial'` または `'unknown'`** | **`'unavailable'`** |

> **「一覧に載っていない」は「対象でない」を意味しない。**
> たとえば ELECOM の「重要なお知らせ」一覧は**最新件数・年別の見出し一覧**であり、
> 過去の全対象を網羅した検索結果ではない。個別の自主回収情報は別ページに分かれている。
> このような確認先は `coverage: 'partial'` とし、**非一致を `clear` にしない。**
>
> `clear` を返してよいのは、「対象型番が載っていれば必ずこのページから辿れる」と
> **人が確認して `coverage: 'exhaustive'` にした確認先だけ**である。

**段階0 では `phase0RecallChecker` を使う。これは常に `'unavailable'` を返す。**
`decideTier` の `recall-unavailable` ブロッカーにより、**段階0 のすべての商品が B 判定になる。**
これは安全側の既定であり、確認先を承認するまで自動公開しないことを意味する。

> 段階2 で S 判定を出すには、**人が `RECALL_SOURCES` の `approved` を `true` にするコード PR** が必要。
> `automation-runbook.md`（計画4 Task 6）にこの手順を書く。

### ステップ

- [ ] `factSourceIds` が Facts の `sourceId` だけを集める失敗テストを書く（4 分）
- [ ] `OFFICIAL_FETCH_POLICIES` が段階0 で全件未承認である失敗テストを書く（3 分）
- [ ] **未承認なら既存 Source があっても決定的規則へもフォールバックしない**失敗テストを書く（5 分）
- [ ] `resolveOfficialUrl` が**無関係な同一ホストの Source を選ばない**失敗テストを書く（5 分）
- [ ] **承認済みポリシーを引数で注入すると `isOfficialFetchApproved` が `true` を返す**失敗テストを書く（3 分）
- [ ] `targetFromFields` が Product なしで作れ、`model`/`variant` が `null` か空白なら `null` を返す失敗テストを書く（4 分）
- [ ] `automatedFetch !== 'allowed'` の Source を候補にしない失敗テストを書く（4 分）
- [ ] Facts が Source を参照していないとき、アダプターの規則にフォールバックする失敗テストを書く（4 分）
- [ ] `createOfficialFetcher` が許可ホスト外の URL を取得せず `'failed'` を返す失敗テストを書く（4 分）
- [ ] `phase0RecallChecker` が常に `'unavailable'` を返す失敗テストを書く（3 分）
- [ ] **`coverage: 'partial'` の確認先では非一致でも `'clear'` にせず `'unavailable'` を返す**失敗テストを書く（5 分）
- [ ] `coverage: 'exhaustive'` のときだけ非一致で `'clear'` を返す失敗テストを書く（4 分）
- [ ] `createRecallChecker` が `approved: false` の確認先で `'unavailable'` を返す失敗テストを書く（4 分）
- [ ] 承認済みかつ取得成功かつ語＋型番一致で `'hit'`、非一致で `'clear'` を返す失敗テストを書く（5 分）
- [ ] 承認済みでも取得失敗なら `'unavailable'` を返す失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `factSourceIds` を実装する（3 分）
- [ ] `OFFICIAL_FETCH_POLICIES` と、`policies` を引数で受ける `isOfficialFetchApproved` を実装する（3 分）
- [ ] `policies` を `isOfficialFetchApproved` へ渡す `resolveOfficialUrl` と `ResolveTarget` を実装する（5 分）
- [ ] `targetFromFields` / `targetFromProduct` を実装する（3 分）
- [ ] `createOfficialFetcher`（許可ホスト検査・間隔・timeout）を実装する（5 分）
- [ ] `RECALL_SOURCES` と `RecallCoverage` を書く（3 分）
- [ ] `createRecallChecker`（coverage による `clear` / `unavailable` の分岐）を実装する（5 分）
- [ ] `phase0RecallChecker` を実装する（2 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-resolve-official.test.ts
import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_FETCH_POLICIES,
  factSourceIds,
  isOfficialFetchApproved,
  resolveOfficialUrl,
  targetFromFields,
  targetFromProduct,
} from '../src/lib/automation/sync/resolve-official';
import type { OfficialFetchPolicy } from '../src/lib/automation/sync/resolve-official';
import { createOfficialFetcher } from '../src/lib/automation/sync/fetch-official';
import { makeFact, makeProduct, makeSource } from './factories';

/**
 * 段階0 は全メーカー未承認なので、解決経路のテストでは承認済みポリシーを注入する。
 * `isOfficialFetchApproved` も `resolveOfficialUrl` も、
 * グローバルではなく**渡された `policies`** を見なければならない。
 */
const approvedAce: readonly OfficialFetchPolicy[] = [
  { manufacturerId: 'ace', approved: true, approvedNote: 'テスト用' },
];

const ownSource = makeSource({
  id: 'src-own',
  url: 'https://store.ace.jp/shop/g/g06936-01/',
  automatedFetch: 'allowed',
});
const unrelatedSameHost = makeSource({
  id: 'src-unrelated',
  url: 'https://store.ace.jp/shop/g/g99999-99/',
  automatedFetch: 'allowed',
});
const product = makeProduct({
  weightG: makeFact(2900, { sourceId: 'src-own' }),
  outerSizeMm: makeFact<[number, number, number]>([350, 550, 250], { sourceId: 'src-own' }),
  capacityL: makeFact(35, { sourceId: 'src-own' }),
});

describe('取得ポリシー', () => {
  it('段階0 は全メーカー未承認', () => {
    expect(OFFICIAL_FETCH_POLICIES).toHaveLength(5);
    expect(OFFICIAL_FETCH_POLICIES.every((p) => p.approved === false)).toBe(true);
    for (const id of ['ace', 'proteca', 'world-traveler', 'elecom', 'anker'] as const) {
      expect(isOfficialFetchApproved(id)).toBe(false);
    }
  });

  it('承認済みポリシーを注入すればそれを見る（グローバルを直接見ない）', () => {
    expect(isOfficialFetchApproved('ace', approvedAce)).toBe(true);
    expect(isOfficialFetchApproved('elecom', approvedAce)).toBe(false);
    expect(isOfficialFetchApproved(null, approvedAce)).toBe(false);
  });

  it('未承認なら既存 Source があっても解決しない（承認を回避できない）', () => {
    expect(resolveOfficialUrl(targetFromProduct(product), [ownSource], OFFICIAL_FETCH_POLICIES))
      .toEqual({ ok: false, reason: 'fetch-not-approved' });
  });

  it('未承認なら決定的規則へもフォールバックしない', () => {
    expect(resolveOfficialUrl(targetFromProduct(product), [], OFFICIAL_FETCH_POLICIES))
      .toEqual({ ok: false, reason: 'fetch-not-approved' });
  });
});

describe('公式 Source の解決（承認済みメーカー）', () => {
  it('Facts が参照する sourceId だけを集める', () => {
    expect(factSourceIds(product)).toEqual(['src-own']);
    expect(targetFromProduct(product).factSourceIds).toEqual(['src-own']);
  });

  it('無関係な同一ホストの Source が先にあっても選ばない', () => {
    const result = resolveOfficialUrl(
      targetFromProduct(product), [unrelatedSameHost, ownSource], approvedAce);
    expect(result).toEqual({
      ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'existing-source',
    });
  });

  it('automatedFetch が allowed でない Source は候補にしない', () => {
    const notAllowed = makeSource({ id: 'src-own', automatedFetch: 'unverified' });
    // 既存 Source が使えないので、アダプターの決定的規則へフォールバックする
    expect(resolveOfficialUrl(targetFromProduct(product), [notAllowed], approvedAce)).toEqual({
      ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'deterministic-rule',
    });
  });

  it('brand を正規化できなければ manufacturer-unknown', () => {
    const unknown = makeProduct({ brand: 'サンプルブランド' });
    expect(resolveOfficialUrl(targetFromProduct(unknown), [], approvedAce))
      .toEqual({ ok: false, reason: 'manufacturer-unknown' });
  });

  it('Product が無くても ResolveTarget を作れる', () => {
    const target = targetFromFields({
      manufacturerId: 'ace',
      model: '06936',
      variant: '35L / 01 ブラックヘアライン',
    });
    expect(target).not.toBeNull();
    if (target === null) return;
    expect(target.factSourceIds).toEqual([]);
    expect(resolveOfficialUrl(target, [], approvedAce)).toEqual({
      ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'deterministic-rule',
    });
  });

  it('model か variant が無ければ ResolveTarget を作らない', () => {
    expect(targetFromFields({ manufacturerId: 'ace', model: null, variant: '35L / ブラック' })).toBeNull();
    expect(targetFromFields({ manufacturerId: 'ace', model: '06936', variant: null })).toBeNull();
    expect(targetFromFields({ manufacturerId: 'ace', model: '06936', variant: '   ' })).toBeNull();
  });
});

describe('安全な取得', () => {
  it('許可ホスト外は取得しない', async () => {
    const fetcher = createOfficialFetcher({
      allowedHosts: ['store.ace.jp'], minIntervalMs: 0, timeoutMs: 1000,
    });
    const outcome = await fetcher('https://example.invalid/page');
    expect(outcome).toEqual({ status: 'failed', httpStatus: null });
  });
});
```

```ts
// tests/automation-recall.test.ts
import { describe, expect, it } from 'vitest';
import {
  RECALL_SOURCES,
  createRecallChecker,
  phase0RecallChecker,
} from '../src/lib/automation/sync/recall';
import type { OfficialFetcher } from '../src/lib/automation/sync/fetch-official';

const okPage = (html: string): OfficialFetcher => async () => ({ status: 'ok', html });
const blocked: OfficialFetcher = async () => ({ status: 'http-blocked', httpStatus: 403 });

describe('リコール確認', () => {
  it('段階0 は常に unavailable', async () => {
    expect(await phase0RecallChecker('ace', 'クレスタ2 06936')).toBe('unavailable');
  });

  it('段階0 の確認先はすべて未承認で、網羅性も保証しない', () => {
    expect(RECALL_SOURCES).toHaveLength(5);
    expect(RECALL_SOURCES.every((s) => s.approved === false)).toBe(true);
    expect(RECALL_SOURCES.every((s) => s.coverage !== 'exhaustive')).toBe(true);
  });

  it('未承認の確認先では取得せず unavailable', async () => {
    const checker = createRecallChecker({
      fetchPage: okPage('リコールのお知らせ クレスタ2 06936'),
      sources: RECALL_SOURCES,
    });
    expect(await checker('ace', 'クレスタ2 06936')).toBe('unavailable');
  });

  it('承認済み・取得成功・語と型番の両方が一致すれば hit', async () => {
    const checker = createRecallChecker({
      fetchPage: okPage('無償交換のお知らせ 対象: クレスタ2 06936'),
      sources: [{
        manufacturerId: 'ace', url: 'https://www.ace.jp/information/',
        approved: true, coverage: 'exhaustive', approvedNote: 'テスト用',
      }],
    });
    expect(await checker('ace', 'クレスタ2 06936')).toBe('hit');
  });

  it('網羅性が保証された確認先でのみ、非一致を clear にする', async () => {
    const exhaustive = createRecallChecker({
      fetchPage: okPage('新商品のお知らせ'),
      sources: [{
        manufacturerId: 'ace', url: 'https://www.ace.jp/information/',
        approved: true, coverage: 'exhaustive', approvedNote: '全件を辿れることを確認',
      }],
    });
    expect(await exhaustive('ace', 'クレスタ2 06936')).toBe('clear');
  });

  it('一覧が一部しか出ない確認先では、非一致を clear にしない', async () => {
    // 最新件数・年別の見出し一覧は、過去の全対象を網羅した検索結果ではない
    const partial = createRecallChecker({
      fetchPage: okPage('新商品のお知らせ'),
      sources: [{
        manufacturerId: 'elecom', url: 'https://www.elecom.co.jp/news/important/',
        approved: true, coverage: 'partial', approvedNote: '最新件数のみ',
      }],
    });
    expect(await partial('elecom', 'BM-BPTRCSEPBK')).toBe('unavailable');
  });

  it('網羅性が未確認の確認先でも、非一致を clear にしない', async () => {
    const unknown = createRecallChecker({
      fetchPage: okPage('新商品のお知らせ'),
      sources: [{
        manufacturerId: 'anker', url: 'https://www.ankerjapan.com/pages/support',
        approved: true, coverage: 'unknown', approvedNote: null,
      }],
    });
    expect(await unknown('anker', 'A1335011')).toBe('unavailable');
  });

  it('coverage が partial でも、語と型番が一致すれば hit', async () => {
    const partial = createRecallChecker({
      fetchPage: okPage('自主回収のお知らせ 対象: BM-BPTRCSEPBK'),
      sources: [{
        manufacturerId: 'elecom', url: 'https://www.elecom.co.jp/news/important/',
        approved: true, coverage: 'partial', approvedNote: '最新件数のみ',
      }],
    });
    expect(await partial('elecom', 'BM-BPTRCSEPBK')).toBe('hit');
  });

  it('承認済みでも取得できなければ unavailable', async () => {
    const checker = createRecallChecker({
      fetchPage: blocked,
      sources: [{
        manufacturerId: 'ace', url: 'https://www.ace.jp/information/',
        approved: true, coverage: 'exhaustive', approvedNote: 'テスト用',
      }],
    });
    expect(await checker('ace', 'クレスタ2 06936')).toBe('unavailable');
  });

  it('確認先が無いメーカーは unavailable', async () => {
    const checker = createRecallChecker({ fetchPage: okPage('x'), sources: [] });
    expect(await checker('anker', 'A1335011')).toBe('unavailable');
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-resolve-official.test.ts tests/automation-recall.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/sync/resolve-official
```

### 最小実装

`factSourceIds` は `Fact` を持つフィールドを列挙して `sourceId` を集め、`null` を除く。
`createOfficialFetcher` は `new URL(url).hostname` が `allowedHosts` に無ければ
**取得せずに** `{ status: 'failed', httpStatus: null }` を返す。
`createRecallChecker` は `sources.find((s) => s.manufacturerId === id && s.approved)` が
無ければ即 `'unavailable'`。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-resolve-official.test.ts tests/automation-recall.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 公式 Source の解決・安全な取得・リコール確認を追加

resolveOfficialUrl はその商品の Facts が参照する sourceId だけを候補にし、
無関係な同一ホストの Source を選ばない。
RecallChecker はメーカー別の承認済み確認先を持ち、未承認・取得不能は unavailable。
段階0 は常に unavailable を返すため、すべての商品が B 判定になる（安全側の既定）。
```

---

## Task 14: 既存商品の link audit と再確認

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/sync/existing.ts` |
| 作成 | `travel-goods-site/tests/automation-existing.test.ts` |
| 変更 | `travel-goods-site/tests/factories/index.ts`（`makePipelineDeps` を追加） |

### Consumes / Produces

- Consumes: `decideTier`（Task 9）、`nextLinkState` / `decideReplacement`（Task 10）、`verifyVariant` / `hasExcludedTerm`（Task 5）、`resolveOfficialUrl` / `RecallChecker`（Task 13）、`matchProduct` / `pickBestMatch` / `searchKeywordsFor` / `isHumanVerifiedLink`（既存）、`itemPageUrlFromAffiliateUrl`（既存）
- Produces:
  - `export type PipelineDeps = { search: (keyword: string) => Promise<RakutenItem[]>; fetchOfficial: OfficialFetcher; checkRecall: RecallChecker; policies: readonly OfficialFetchPolicy[]; today: string }`（`policies` は `resolveOfficialUrl` へそのまま渡す。**グローバルを直接見ない**）
  - `export type ExistingOutcome = { productId: string; tier: Tier; blockers: BlockerCode[]; signals: LinkSignals; linkState: LinkState; replacement: ReplacementDecision; matchedVariantLabel: string | null; extractedSpec: ExtractedSpec | null; officialUrl: string | null; officialRangeHash: string | null }`
  - `export async function runExistingProduct(product: Product, catalog: Catalog, deps: PipelineDeps): Promise<ExistingOutcome>`

### 仕様

- **書き込まない。** 判定結果だけを返す。書き込み計画は Task 16 が作る。
- `LinkSignals.httpStatus` は**常に `null`**（段階0 の制約）。
- `initialSelection` は `'6b-inferred'`（`verifyVariant` が `matched` かつ `conflicting` が空）か `'none'`。
  **`'6a-observed'` を返す経路を作らない。**
- 楽天API は 1 商品あたり最大 2 クエリ（JAN → 型番）。

### ステップ

- [ ] `makePipelineDeps` を factory に足す（`policies` の既定は `OFFICIAL_FETCH_POLICIES`）（4 分）
- [ ] 正常な入力で `blockers` が `recall-unavailable` だけになる失敗テストを書く（段階0 の既定）（5 分）
- [ ] `checkRecall` を `'clear'` にすると `tier: 'S'` になる失敗テストを書く（4 分）
- [ ] `fetchOfficial` が `robots-denied` を返すと `official-robots-denied` が立つ失敗テストを書く（3 分）
- [ ] `httpStatus` が常に `null` である失敗テストを書く（3 分）
- [ ] `initialSelection` が `'6a-observed'` にならない（`matchedVariantLabel` が推定由来）失敗テストを書く（4 分）
- [ ] `matchedVariantLabel` が販売ページ文言から抽出した値である失敗テストを書く（4 分）
- [ ] 目視確認済みリンクの `replacement` が `pr-only` になる失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] 楽天検索と `pickBestMatch` から `model` / `jan` の状態を作る（4 分）
- [ ] `verifyVariant` から `variant` と `initialSelection`（6b か none）を作る（4 分）
- [ ] 公式取得と抽出から `officialFetchStatus` / `extraction` / `officialConsistency` を作る（5 分）
- [ ] `TierInput` を組み立てて `decideTier` を呼ぶ（3 分）
- [ ] `LinkSignals` を作って `nextLinkState` と `decideReplacement` を呼ぶ（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-existing.test.ts
import { describe, expect, it } from 'vitest';
import { runExistingProduct } from '../src/lib/automation/sync/existing';
import type { OfficialFetchPolicy } from '../src/lib/automation/sync/resolve-official';
import { makeCatalog, makeMerchantLink, makePipelineDeps, makeProduct } from './factories';

/** 段階0 は全メーカー未承認。承認済みの経路を通すテストだけが注入する。 */
const approvedAce: readonly OfficialFetchPolicy[] = [
  { manufacturerId: 'ace', approved: true, approvedNote: 'テスト用' },
];

describe('既存商品の判定', () => {
  it('段階0 の既定ではリコール未確認で B になる', async () => {
    const outcome = await runExistingProduct(makeProduct(), makeCatalog(), makePipelineDeps());
    expect(outcome.tier).toBe('B');
    expect(outcome.blockers).toEqual(['recall-unavailable']);
  });

  it('リコールが clear で取得も承認済みなら S になる', async () => {
    const deps = makePipelineDeps({ checkRecall: async () => 'clear', policies: approvedAce });
    const outcome = await runExistingProduct(makeProduct({ jan: '4549550317535' }), makeCatalog(), deps);
    expect(outcome.blockers).toEqual([]);
    expect(outcome.tier).toBe('S');
  });

  it('取得が未承認なら、リコールが clear でも B のまま', async () => {
    const deps = makePipelineDeps({ checkRecall: async () => 'clear' });
    const outcome = await runExistingProduct(makeProduct({ jan: '4549550317535' }), makeCatalog(), deps);
    expect(outcome.tier).toBe('B');
    expect(outcome.blockers).toContain('official-fetch-failed');
  });

  it('robots 拒否は official-robots-denied として立つ', async () => {
    const deps = makePipelineDeps({
      checkRecall: async () => 'clear',
      policies: approvedAce,
      fetchOfficial: async () => ({ status: 'robots-denied', httpStatus: null }),
    });
    const outcome = await runExistingProduct(makeProduct(), makeCatalog(), deps);
    expect(outcome.tier).toBe('B');
    expect(outcome.blockers).toContain('official-robots-denied');
  });

  it('段階0 では httpStatus を取らない', async () => {
    const outcome = await runExistingProduct(makeProduct(), makeCatalog(), makePipelineDeps());
    expect(outcome.signals.httpStatus).toBeNull();
  });

  it('matchedVariant は販売ページ文言から抽出した値', async () => {
    const deps = makePipelineDeps({ checkRecall: async () => 'clear', policies: approvedAce });
    const outcome = await runExistingProduct(makeProduct(), makeCatalog(), deps);
    expect(outcome.matchedVariantLabel).not.toBeNull();
    expect(outcome.matchedVariantLabel).toContain('35L');
    expect(outcome.matchedVariantLabel).toContain('ブラックヘアライン');
  });

  it('目視確認済みリンクは交換候補にしない', async () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'visual' });
    const catalog = makeCatalog({ merchantLinks: [link] });
    const deps = makePipelineDeps({
      checkRecall: async () => 'clear',
      policies: approvedAce,
      search: async () => [],
    });
    const outcome = await runExistingProduct(makeProduct(), catalog, deps);
    expect(outcome.replacement.action === 'pr-only' || outcome.replacement.action === 'hold').toBe(true);
  });
});
```

`makePipelineDeps` を `tests/factories/index.ts` に足す。

```ts
import type { PipelineDeps } from '../../src/lib/automation/sync/existing';
import { OFFICIAL_FETCH_POLICIES } from '../../src/lib/automation/sync/resolve-official';

export const OFFICIAL_HTML_FIXTURE = `<table class="spec">
<tr><th>本体重量</th><td>2.9kg</td></tr>
<tr><th>外寸</th><td>W35×H55×D25cm（ハンドル・キャスターを含む）</td></tr>
<tr><th>容量</th><td>35L</td></tr>
</table>`;

export function makePipelineDeps(over: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    search: async () => [makeRakutenItem()],
    fetchOfficial: async () => ({ status: 'ok', html: OFFICIAL_HTML_FIXTURE }),
    checkRecall: async () => 'unavailable',
    // 既定は段階0 の全件未承認。承認済みの経路を通すテストだけが明示的に注入する。
    policies: OFFICIAL_FETCH_POLICIES,
    today: '2026-09-02',
    ...over,
  };
}
```

> `makePipelineDeps` は `OFFICIAL_FETCH_POLICIES`（Task 13）を import する。
> **既定を承認済みにしない。** 既定を承認済みにすると、承認の抜け道テスト
> （Task 13 の「未承認なら既存 Source があっても解決しない」）と食い違う。

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-existing.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/sync/existing
```

### 最小実装

`runExistingProduct` は `TierInput` を組み立てて `decideTier` に渡し、
並行して `LinkSignals` を作って `nextLinkState` と `decideReplacement` に渡す。
`fs` を触らない。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-existing.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 既存商品の判定とリンク audit を追加

TierInput と LinkSignals を組み立てて判定するだけで、書き込みは行わない。
段階0 では httpStatus を取らず、初期選択の根拠は 6b だけを使う。
リコールが確認できない既定では B になる。
```

---

## Task 15: 楽天検索結果から新規候補を作る

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/sync/constants.ts` |
| 作成 | `travel-goods-site/src/lib/automation/sync/candidate.ts` |
| 作成 | `travel-goods-site/tests/automation-candidate.test.ts` |
| 変更 | `travel-goods-site/tests/factories/index.ts`（`makePipelineDeps` に `policies` を追加） |

### Consumes / Produces

- Consumes: `RakutenItem`、`normalizeBrand` / `adapterFor`、`verifyVariant` / `extractVariantTokens` / `hasExcludedTerm`、`resolveOfficialUrl` / `targetFromFields` / `isOfficialFetchApproved` / `ResolveTarget`（Task 13）、`RecallChecker`（Task 13）、`decideTier`（Task 9）、`CATEGORIES`

> **`resolveOfficialUrl` は `Product` ではなく `ResolveTarget` を取る**（Task 13）。
> 新商品にはまだ `Product` が無いため、`targetFromDraft(draft)` で
> `{ manufacturerId, model, variant, factSourceIds: [] }` を作って渡す。
> **`targetFromDraft` はこの Task 15 の `candidate.ts` に置く。**
> Task 13 は `CandidateDraft` を知らないままでよく、依存は `candidate.ts` → `resolve-official.ts` の
> 一方向だけになる。
> `model` か `variantLabel` が `null` なら `targetFromDraft` は `null` を返し、
> `evaluateCandidate` は `officialFetchStatus: 'failed'` として扱う。
- Produces:
  - `constants.ts`（**値の依存を持たない葉モジュール**。Task 15 と Task 16 の両方が import する）
    - `export const AUTO_REGISTERED_MARKER = 'automation:product-discovery'`
    - `export function autoRegisteredUsageNote(detail: string): string`（`` `${AUTO_REGISTERED_MARKER} ${detail}` ``）
    - `export const MANUFACTURER_PUBLISHERS: Record<ManufacturerId, string>`
  - `export type CandidateDraft = { itemCode: string; manufacturerId: ManufacturerId | null; model: string | null; variantLabel: string | null; category: Category | null; janFromListing: string | null; affiliateItemPageUrl: string | null; excludedTerm: ExcludedTermState }`
  - `export function buildCandidateFromRakutenItem(item: RakutenItem, known: readonly Product[]): CandidateDraft`
  - `export function targetFromDraft(draft: CandidateDraft): ResolveTarget | null`（**Task 13 の `targetFromFields` を呼ぶだけ**。`model` か `variantLabel` が `null` なら `null`）
  - `export type CandidateEvaluation = { draft: CandidateDraft; tier: Tier; blockers: BlockerCode[]; spec: ExtractedSpec | null; officialUrl: string | null; officialRangeHash: string | null }`
  - `export async function evaluateCandidate(draft: CandidateDraft, catalog: Catalog, deps: PipelineDeps): Promise<CandidateEvaluation>`
    （内部で `targetFromDraft(draft)` を作って `resolveOfficialUrl(target, catalog.sources)` を呼ぶ。**Product を先に作らない**）
  - `export function candidateKey(manufacturerId: ManufacturerId, model: string, variantLabel: string): string`
  - `export function candidateKeyOfProduct(product: Product): string | null`
  - `export function productIdHash(manufacturerId: ManufacturerId, model: string, variantLabel: string): string`
  - `export const PRODUCT_ID_HASH_LENGTH = 8`
  - `export type PromotedProduct = { product: Product; source: Source }`
  - `export function promoteCandidate(evaluation: CandidateEvaluation, today: string): PromotedProduct | null`
    （**返す `Source.usageNote` は必ず `autoRegisteredUsageNote(...)` で作る**）
  - `export function buildProductId(manufacturerId: ManufacturerId, model: string, variantLabel: string): string`

### 仕様（新商品探索の入力から公開・queue まで）

```
RakutenItem
  │  buildCandidateFromRakutenItem(item, knownProducts)
  ▼
CandidateDraft            … brand / model / variant / category / JAN / 紹介URL を抽出
  │  evaluateCandidate(draft, catalog, deps)
  ▼                        … targetFromDraft(draft)（= targetFromFields）
                             → resolveOfficialUrl(target, sources)
                             → 取得 → 抽出 → リコール確認 → decideTier
                             **Product は作らない。ResolveTarget を渡す**
CandidateEvaluation
  │  promoteCandidate(evaluation, today)
  ▼
PromotedProduct | null    … null なら Product を作らず queue に残す
```

#### `buildCandidateFromRakutenItem` — 捏造しない

| フィールド | 決め方 | 決まらなければ |
|---|---|---|
| `manufacturerId` | `itemName` から**既知のブランド表記を完全一致で探す**（`BRAND_LISTING_TOKENS`）。**該当が 2 つ以上の `manufacturerId` にまたがったら `null`**（複数ブランドの併記・比較商品を誤登録しない）。部分一致で推測しない | `null` |
| `model` | メーカーごとの型番パターン（ACE 系は `/(\d{5})/`、ELECOM は `/\b[A-Z]{2,3}-[A-Z0-9-]{4,}\b/`、Anker は `/\bA\d{6,7}\b/`）で `itemName`＋`itemCaption` から抽出。**2 つ以上見つかったら `null`**（曖昧） | `null` |
| `variantLabel` | `extractVariantTokens` で色・容量・サイズ・セット数を取り、` / ` で結合。**1 つも取れなければ `null`** | `null` |
| `category` | `CATEGORY_LISTING_KEYWORDS`（カテゴリ → 必須語）に**ちょうど 1 つ**該当すれば決定。0 個または 2 個以上なら `null` | `null` |
| `janFromListing` | `/(?<!\d)(\d{13})(?!\d)/` で 13 桁を 1 つだけ見つけたとき | `null` |
| `affiliateItemPageUrl` | `itemPageUrlFromAffiliateUrl(item.affiliateUrl)` | `null` |

```ts
/** itemName に完全一致で現れたら、そのメーカーとみなす表記。部分一致では使わない。 */
export const BRAND_LISTING_TOKENS: readonly { token: string; manufacturerId: ManufacturerId }[] = [
  { token: 'エース', manufacturerId: 'ace' },
  { token: 'ace.', manufacturerId: 'ace' },
  { token: 'プロテカ', manufacturerId: 'proteca' },
  { token: 'PROTECA', manufacturerId: 'proteca' },
  { token: 'ワールドトラベラー', manufacturerId: 'world-traveler' },
  { token: 'エレコム', manufacturerId: 'elecom' },
  { token: 'ELECOM', manufacturerId: 'elecom' },
  { token: 'Anker', manufacturerId: 'anker' },
];

/** カテゴリ判定。ちょうど 1 カテゴリだけ該当したときに採用する。 */
export const CATEGORY_LISTING_KEYWORDS: Readonly<Record<Category, readonly string[]>> = {
  suitcases: ['スーツケース', 'キャリーケース'],
  backpacks: ['リュック', 'バックパック'],
  pouches: ['ポーチ', 'オーガナイザー'],
  'power-banks': ['モバイルバッテリー'],
};
```

#### `buildProductId` — 衝突しない決定的な ID

素朴な slug では**日本語が落ちて衝突する**。
`'35L / ブラック'` と `'35L / ネイビー'` はどちらも `35l` になり、
`ace-06936-35l` が 2 商品に割り当たってしまう。

そこで **NFKC 正規化した元文字列の短い SHA-256 を末尾に付ける。**

```ts
import { createHash } from 'node:crypto';

/** ID の末尾に付けるハッシュの長さ（16 進 8 文字）。 */
export const PRODUCT_ID_HASH_LENGTH = 8;

function slug(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** 衝突を避けるための短いハッシュ。正規化した元文字列から作る。 */
export function productIdHash(manufacturerId: ManufacturerId, model: string, variantLabel: string): string {
  const canonical = [manufacturerId, model, variantLabel]
    .map((v) => v.normalize('NFKC').trim())
    .join('\u0000');
  return createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, PRODUCT_ID_HASH_LENGTH);
}

export function buildProductId(manufacturerId: ManufacturerId, model: string, variantLabel: string): string {
  const readable = [manufacturerId, slug(model), slug(variantLabel)].filter((p) => p.length > 0).join('-');
  return `${readable}-${productIdHash(manufacturerId, model, variantLabel)}`;
}
```

性質:

- **同じ入力なら常に同じ ID**（決定的）。
- **色違いなど、slug が同じでも元文字列が違えば ID が異なる。**
- **Unicode の表記違い**（`３５Ｌ` と `35L`、`ﾌﾞﾗｯｸ` と `ブラック`）は
  NFKC 正規化で同じ ID になる（同じ商品を二重登録しない）。
- 読める部分が `manufacturerId` だけになっても、ハッシュが付くので衝突しない。
  ただし `promoteCandidate` は `model` と `variantLabel` が非 `null` であることを要求するため、
  実際にはそこまで縮まない。

#### `targetFromDraft` — Task 13 の `targetFromFields` に委譲する

```ts
import { targetFromFields, type ResolveTarget } from './resolve-official';

/** 候補から公式URL解決の入力を作る。Product を先に作らない。 */
export function targetFromDraft(draft: CandidateDraft): ResolveTarget | null {
  return targetFromFields({
    manufacturerId: draft.manufacturerId,
    model: draft.model,
    variant: draft.variantLabel,
    // 新商品にはまだ Fact が無いので参照 Source も無い
  });
}
```

`resolve-official.ts` は `candidate.ts` を import しない。**依存は一方向だけ。**

#### 新商品の重複判定キー

**一意キーは `manufacturerId + model + 正規化 variant` とする。**

```ts
/** 重複判定に使う一意キー。ID とは別に、既存商品との突き合わせに使う。 */
export function candidateKey(manufacturerId: ManufacturerId, model: string, variantLabel: string): string {
  return [manufacturerId, model, variantLabel]
    .map((v) => v.normalize('NFKC').trim().toLowerCase())
    .join('|');
}

/** 既存商品からキーを作る。brand は normalizeBrand を通す。 */
export function candidateKeyOfProduct(product: Product): string | null {
  const id = normalizeBrand(product.brand);
  return id === null ? null : candidateKey(id, product.model, product.variant);
}
```

`buildCandidateFromRakutenItem` は `known` の各商品から `candidateKeyOfProduct` を作り、
候補のキーと一致するものがあれば **`duplicate` 状態**として扱う（`decideTier` の `duplicate` ブロッカー）。
**`buildProductId` の一致では判定しない**（ハッシュを含むため、比較の意図が読み取りにくい）。

#### `promoteCandidate` — Product を捏造しない

次を**すべて**満たすときだけ `PromotedProduct` を返す。1 つでも欠ければ **`null`**。

1. `evaluation.tier` が `'S'` または `'A'`
2. `draft.manufacturerId` / `draft.model` / `draft.variantLabel` / `draft.category` がすべて非 `null`
3. `evaluation.officialUrl` と `evaluation.officialRangeHash` が非 `null`
4. `evaluation.spec` の**必須 Facts**（アダプターの `requiredFields`）がすべて非 `null`
5. `buildProductId(...)` が `manufacturerId` 以外の要素を含む

`null` のときは呼び出し側（Task 16）が `queue.json` に `kind: 'candidate'` として残す。

作る `Product` は `status: 'review'` で、**`Fact` の `sourceId` は同時に作る `Source` の ID**、
`checkedAt` は `today`。**取得できなかった項目は `null` のまま**にする。

#### 自動登録の印を `Source.usageNote` に必ず入れる

Task 16 の `registeredProductsThisWeek` は、**商品の Facts が参照する `Source` の
`usageNote` に `AUTO_REGISTERED_MARKER` があるか**だけで自動登録商品を数える。
`promoteCandidate` が印を付けなければ、自動登録した商品が 1 件も数えられず、
**週 3 件の上限が効かなくなる**。したがって印付けは `promoteCandidate` の契約である。

印の文字列は `src/lib/automation/sync/constants.ts` に 1 箇所だけ置く。

```ts
// src/lib/automation/sync/constants.ts
// 依存を持たない葉モジュール。candidate.ts と write-plan.ts の両方が import する。
// ここに置くことで、candidate.ts <-> write-plan.ts の循環 import を作らない。

/** 自動探索で登録した商品の Source に必ず入れる印。週次件数の判別に使う。 */
export const AUTO_REGISTERED_MARKER = 'automation:product-discovery';

/** 自動登録 Source の usageNote を作る。印を必ず先頭に置く。 */
export function autoRegisteredUsageNote(detail: string): string {
  return `${AUTO_REGISTERED_MARKER} ${detail}`;
}

/** Source.publisher に入れる発行者名。現行 datasets/production/sources.json の表記に合わせる。 */
export const MANUFACTURER_PUBLISHERS: Record<ManufacturerId, string> = {
  ace: 'エース株式会社（エース公式通販）',
  proteca: 'エース株式会社（プロテカ）',
  'world-traveler': 'エース株式会社（ワールドトラベラー）',
  elecom: 'エレコム株式会社',
  anker: 'アンカー・ジャパン株式会社',
};
```

`constants.ts` が import するのは `ManufacturerId` の型だけで、値の import は持たない。

`promoteCandidate` が作る `Source` は次の形にする。

```ts
const source: Source = {
  id: `src-${productId}`,
  url: evaluation.officialUrl,          // 条件3 で非 null が保証されている
  publisher: MANUFACTURER_PUBLISHERS[draft.manufacturerId],
  checkedAt: today,
  provenance: 'direct-fetch',
  importedFrom: null,
  locator: 'メーカー公式の商品ページの仕様表',
  editorialUse: 'verified',
  automatedFetch: 'allowed',            // 取得ポリシーが approved のときだけここへ来る
  llmInput: 'unverified',
  // 印はここでだけ付ける。文字列を直書きしない。
  usageNote: autoRegisteredUsageNote('自動探索で登録。仕様表から抽出した公表値のみ'),
};
```

- **印を付けるのは `promoteCandidate` だけ。** 人が登録した `Source` に自動で付けない。
  Task 13 の `resolveOfficialUrl` も、Task 14 の `runExistingProduct` も `Source` を作らない。
- `usageNote` は `sourceSchema` で 1〜400 文字なので、印を足しても収まる。
- **`isAutoRegistered`（Task 16）は `includes` で判定する**ため、印の後ろに説明文を足してよい。

#### `evaluateCandidate` は取得ポリシーを `deps` から受け取る

段階0 の `OFFICIAL_FETCH_POLICIES` は全件 `approved: false` なので、
既定のままでは `resolveOfficialUrl` が必ず `fetch-not-approved` を返し、
**S 判定になるテストが 1 つも書けない**。

そこで `PipelineDeps`（Task 14）に `policies: readonly OfficialFetchPolicy[]` を持たせ、
`evaluateCandidate` は `resolveOfficialUrl(target, catalog.sources, deps.policies)` と渡す。
`makePipelineDeps` の既定は `OFFICIAL_FETCH_POLICIES`（＝段階0 の未承認）とし、
**承認済みの経路を通すテストだけが明示的に注入する**。

```ts
/** 承認済みメーカーを注入するときに使う。段階0 の既定は未承認のまま。 */
const approvedAce: readonly OfficialFetchPolicy[] = [
  { manufacturerId: 'ace', approved: true, approvedNote: 'テスト用' },
];
```

### ステップ

- [ ] `buildCandidateFromRakutenItem` がブランドを完全一致で判定する失敗テストを書く（4 分）
- [ ] 型番が 2 つ見つかったら `model` が `null` になる失敗テストを書く（4 分）
- [ ] カテゴリ語が 2 つ該当したら `category` が `null` になる失敗テストを書く（4 分）
- [ ] `variantLabel` が 1 つも取れなければ `null` になる失敗テストを書く（3 分）
- [ ] ブランド表記が複数の `manufacturerId` にまたがったら `null` になる失敗テストを書く（4 分）
- [ ] 同じブランドの別表記が 2 つあっても解決する失敗テストを書く（3 分）
- [ ] `buildProductId` が同じ入力で同じ ID を返す失敗テストを書く（2 分）
- [ ] **色違いで ID が衝突しない**失敗テストを書く（4 分）
- [ ] 日本語だけの variant でも衝突しない失敗テストを書く（3 分）
- [ ] Unicode の表記違い（`３５Ｌ` / `ﾌﾞﾗｯｸ`）が同じ ID になる失敗テストを書く（4 分）
- [ ] `targetFromDraft` が draft から `ResolveTarget` を作り、`model`/`variantLabel` が `null` なら `null` を返す失敗テストを書く（4 分）
- [ ] `candidateKey` が正規化して一致し、色違いでは一致しない失敗テストを書く（4 分）
- [ ] `candidateKeyOfProduct` が既存商品から同じキーを作る失敗テストを書く（3 分）
- [ ] `promoteCandidate` が B 判定で `null` を返す失敗テストを書く（3 分）
- [ ] `promoteCandidate` が `model === null` で `null` を返す失敗テストを書く（3 分）
- [ ] `promoteCandidate` が必須 Facts の欠落で `null` を返す失敗テストを書く（4 分）
- [ ] `promoteCandidate` が成功したとき `status: 'review'` の Product と Source を返す失敗テストを書く（5 分）
- [ ] **`promoteCandidate` が返す `Source.usageNote` に `AUTO_REGISTERED_MARKER` が含まれる**失敗テストを書く（3 分）
- [ ] **作った Product の全 Facts が、その印付き Source を参照している**失敗テストを書く（4 分）
- [ ] **人が登録した通常の Source には印が付かない**失敗テストを書く（3 分）
- [ ] 作られた Product が `productSchema` を通る失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `BRAND_LISTING_TOKENS` と、複数 `manufacturerId` にまたがる場合の `null` を実装する（5 分）
- [ ] 型番抽出（該当 1 つのときだけ採用）を実装する（4 分）
- [ ] `CATEGORY_LISTING_KEYWORDS` とカテゴリ判定を実装する（4 分）
- [ ] `variantLabel` と `janFromListing` の抽出を実装する（4 分）
- [ ] `constants.ts` に `AUTO_REGISTERED_MARKER` / `autoRegisteredUsageNote` / `MANUFACTURER_PUBLISHERS` を書く（4 分）
- [ ] `makePipelineDeps` に `policies`（既定は `OFFICIAL_FETCH_POLICIES`）を足す（3 分）
- [ ] `targetFromDraft`（`targetFromFields` への委譲）を実装する（2 分）
- [ ] `productIdHash` / `buildProductId` / `candidateKey` / `candidateKeyOfProduct` を実装する（5 分）
- [ ] `evaluateCandidate`（`targetFromDraft` → `resolveOfficialUrl` → 取得 → 抽出 → `decideTier`）を実装する（5 分）
- [ ] `promoteCandidate` の 5 条件を実装する（5 分）
- [ ] `promoteCandidate` の Source 生成（`autoRegisteredUsageNote` と `MANUFACTURER_PUBLISHERS`）を実装する（4 分）
- [ ] `promoteCandidate` の Facts の `sourceId` をその Source の ID へ揃える実装を書く（3 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-candidate.test.ts
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_ID_HASH_LENGTH,
  buildCandidateFromRakutenItem,
  buildProductId,
  candidateKey,
  candidateKeyOfProduct,
  evaluateCandidate,
  productIdHash,
  promoteCandidate,
  targetFromDraft,
} from '../src/lib/automation/sync/candidate';
import type { CandidateDraft } from '../src/lib/automation/sync/candidate';
import type { RakutenItem } from '../src/lib/rakuten/types';
import {
  AUTO_REGISTERED_MARKER,
  MANUFACTURER_PUBLISHERS,
  autoRegisteredUsageNote,
} from '../src/lib/automation/sync/constants';
import type { OfficialFetchPolicy } from '../src/lib/automation/sync/resolve-official';
import { productSchema } from '../src/lib/catalog/schema';
import {
  makeCandidatePair,
  makeCatalog,
  makePipelineDeps,
  makeProduct,
  makeRakutenItem,
  makeSource,
} from './factories';

/** 段階0 は全メーカー未承認。S 判定の経路を通すテストだけが承認済みを注入する。 */
const approvedAce: readonly OfficialFetchPolicy[] = [
  { manufacturerId: 'ace', approved: true, approvedNote: 'テスト用' },
];

describe('楽天検索結果から候補を作る', () => {
  it('ブランドを完全一致で判定する', () => {
    const draft = buildCandidateFromRakutenItem(makeRakutenItem(), []);
    expect(draft.manufacturerId).toBe('ace');
    expect(draft.model).toBe('06936');
    expect(draft.category).toBe('suitcases');
  });

  it('既知のブランド表記が無ければ manufacturerId は null', () => {
    const item = makeRakutenItem({ itemName: 'ノーブランド スーツケース 35L ブラック' });
    expect(buildCandidateFromRakutenItem(item, []).manufacturerId).toBeNull();
  });

  it('型番が 2 つ見つかったら曖昧として null', () => {
    const item = makeRakutenItem({ itemName: 'エース 06936 と 06937 の 2 点セット スーツケース 35L ブラックヘアライン' });
    expect(buildCandidateFromRakutenItem(item, []).model).toBeNull();
  });

  it('カテゴリ語が 2 つ該当したら null', () => {
    const item = makeRakutenItem({ itemName: 'エース 06936 スーツケース＆リュック 35L ブラックヘアライン' });
    expect(buildCandidateFromRakutenItem(item, []).category).toBeNull();
  });

  it('variant のトークンが 1 つも取れなければ null', () => {
    const item = makeRakutenItem({ itemName: 'エース 06936 スーツケース', itemCaption: '詳細は商品ページをご覧ください' });
    expect(buildCandidateFromRakutenItem(item, []).variantLabel).toBeNull();
  });

  it('ブランド表記が複数の manufacturerId にまたがったら null', () => {
    const item = makeRakutenItem({ itemName: 'エース と Anker の比較セット スーツケース 35L ブラック' });
    expect(buildCandidateFromRakutenItem(item, []).manufacturerId).toBeNull();
  });

  it('同じブランドの別表記が 2 つあっても解決する', () => {
    const item = makeRakutenItem({ itemName: 'エース ace. 06936 スーツケース 35L ブラックヘアライン' });
    expect(buildCandidateFromRakutenItem(item, []).manufacturerId).toBe('ace');
  });
});

describe('商品 ID と重複キー', () => {
  it('ID は決定的', () => {
    expect(buildProductId('ace', '06936', '35L / ブラックヘアライン'))
      .toBe(buildProductId('ace', '06936', '35L / ブラックヘアライン'));
    expect(buildProductId('ace', '06936', '35L / ブラックヘアライン')).toMatch(/^ace-06936-35l/);
  });

  it('色違いで ID が衝突しない', () => {
    const black = buildProductId('ace', '06936', '35L / ブラック');
    const navy = buildProductId('ace', '06936', '35L / ネイビー');
    expect(black).not.toBe(navy);
    // 読める部分は同じでも、末尾のハッシュが違う
    expect(black.slice(0, -PRODUCT_ID_HASH_LENGTH)).toBe(navy.slice(0, -PRODUCT_ID_HASH_LENGTH));
  });

  it('日本語だけの variant でも衝突しない', () => {
    expect(buildProductId('ace', '06936', 'ブラック'))
      .not.toBe(buildProductId('ace', '06936', 'ネイビー'));
  });

  it('Unicode の表記違いは同じ ID になる', () => {
    expect(buildProductId('ace', '06936', '３５Ｌ / ﾌﾞﾗｯｸ'))
      .toBe(buildProductId('ace', '06936', '35L / ブラック'));
  });

  it('ID の末尾は 16 進 8 文字のハッシュ', () => {
    expect(productIdHash('ace', '06936', '35L / ブラック')).toMatch(/^[0-9a-f]{8}$/);
    expect(PRODUCT_ID_HASH_LENGTH).toBe(8);
  });

  it('重複キーは manufacturerId + model + 正規化 variant', () => {
    expect(candidateKey('ace', '06936', '35L / ブラック'))
      .toBe(candidateKey('ace', '06936', '３５Ｌ / ﾌﾞﾗｯｸ'));
    expect(candidateKey('ace', '06936', '35L / ブラック'))
      .not.toBe(candidateKey('ace', '06936', '35L / ネイビー'));
  });

  it('既存商品から同じキーを作れる', () => {
    const product = makeProduct({ brand: 'エース（ACE）', model: '06936', variant: '35L / ブラック' });
    expect(candidateKeyOfProduct(product)).toBe(candidateKey('ace', '06936', '35L / ブラック'));
  });

  it('brand を正規化できない商品はキーを作らない', () => {
    expect(candidateKeyOfProduct(makeProduct({ brand: 'サンプルブランド' }))).toBeNull();
  });
});

describe('候補から ResolveTarget を作る', () => {
  const draft: CandidateDraft = {
    itemCode: 'testshop:test-item-001',
    manufacturerId: 'ace',
    model: '06936',
    variantLabel: '35L / 01 ブラックヘアライン',
    category: 'suitcases',
    janFromListing: null,
    affiliateItemPageUrl: null,
    excludedTerm: 'clean',
  };

  it('Product を作らずに ResolveTarget を作れる', () => {
    const target = targetFromDraft(draft);
    expect(target).toEqual({
      manufacturerId: 'ace',
      model: '06936',
      variant: '35L / 01 ブラックヘアライン',
      factSourceIds: [],
    });
  });

  it('model か variantLabel が null なら作らない', () => {
    expect(targetFromDraft({ ...draft, model: null })).toBeNull();
    expect(targetFromDraft({ ...draft, variantLabel: null })).toBeNull();
  });
});

/**
 * S 判定まで通る候補を昇格させる。段階0 の既定では取得未承認で B になるため、
 * 承認済みポリシーとリコール clear を明示的に注入する。
 */
async function promoteFixture(over: Partial<RakutenItem> = {}, today = '2026-09-02') {
  const item = makeRakutenItem({
    itemCaption: '本体重量2.9kg。外寸 幅35×高さ55×奥行25cm。容量35L。JAN 4549550317535',
    ...over,
  });
  const draft = buildCandidateFromRakutenItem(item, []);
  const evaluation = await evaluateCandidate(
    draft,
    makeCatalog(),
    makePipelineDeps({ checkRecall: async () => 'clear', policies: approvedAce, today }),
  );
  expect(evaluation.tier).toBe('S');
  return promoteCandidate(evaluation, today);
}

describe('候補の昇格', () => {
  it('段階0 は取得未承認とリコール未確認で必ず B。Product を作らない', async () => {
    const draft = buildCandidateFromRakutenItem(makeRakutenItem(), []);
    const evaluation = await evaluateCandidate(draft, makeCatalog(), makePipelineDeps());
    expect(evaluation.tier).toBe('B');
    expect(evaluation.blockers).toContain('recall-unavailable');
    expect(promoteCandidate(evaluation, '2026-09-02')).toBeNull();
  });

  it('取得ポリシーが未承認なら、リコールが clear でも B のまま', async () => {
    const draft = buildCandidateFromRakutenItem(
      makeRakutenItem({ itemCaption: '本体重量2.9kg。外寸 幅35×高さ55×奥行25cm。容量35L。JAN 4549550317535' }), []);
    // policies を注入しない = 段階0 の全件未承認
    const evaluation = await evaluateCandidate(
      draft, makeCatalog(), makePipelineDeps({ checkRecall: async () => 'clear' }));
    expect(evaluation.tier).toBe('B');
    expect(promoteCandidate(evaluation, '2026-09-02')).toBeNull();
  });

  it('model が決まらなければ Product を作らない', async () => {
    const item = makeRakutenItem({ itemName: 'エース スーツケース 35L ブラックヘアライン' });
    const draft = buildCandidateFromRakutenItem(item, []);
    expect(draft.model).toBeNull();
    const evaluation = await evaluateCandidate(
      draft, makeCatalog(),
      makePipelineDeps({ checkRecall: async () => 'clear', policies: approvedAce }));
    expect(promoteCandidate(evaluation, '2026-09-02')).toBeNull();
  });

  it('必須 Facts が欠けたら Product を作らない', async () => {
    const draft = buildCandidateFromRakutenItem(makeRakutenItem(), []);
    const deps = makePipelineDeps({
      checkRecall: async () => 'clear',
      policies: approvedAce,
      fetchOfficial: async () => ({ status: 'ok', html: '<table class="spec"><tr><th>本体重量</th><td>2.9kg</td></tr></table>' }),
    });
    const evaluation = await evaluateCandidate(draft, makeCatalog(), deps);
    expect(promoteCandidate(evaluation, '2026-09-02')).toBeNull();
  });

  it('すべて揃えば review の Product と Source を作る', async () => {
    const promoted = await promoteFixture();
    expect(promoted).not.toBeNull();
    if (promoted === null) return;
    expect(promoted.product.status).toBe('review');
    expect(promoted.product.weightG.sourceId).toBe(promoted.source.id);
    expect(promoted.source.provenance).toBe('direct-fetch');
    expect(promoted.source.checkedAt).toBe('2026-09-02');
    expect(promoted.source.publisher).toBe(MANUFACTURER_PUBLISHERS.ace);
    expect(productSchema.safeParse(promoted.product).success).toBe(true);
  });
});

describe('自動登録の印', () => {
  it('promoteCandidate が返す Source.usageNote に印が入る', async () => {
    const promoted = await promoteFixture();
    expect(promoted).not.toBeNull();
    if (promoted === null) return;
    expect(promoted.source.usageNote).toContain(AUTO_REGISTERED_MARKER);
    // 週次件数の判別はこの印だけで行う（Task 16 の isAutoRegistered）
    expect(promoted.source.usageNote.startsWith(AUTO_REGISTERED_MARKER)).toBe(true);
    expect(promoted.source.usageNote.length).toBeLessThanOrEqual(400);
  });

  it('作った Product の全 Facts が印付き Source を参照する', async () => {
    const promoted = await promoteFixture();
    expect(promoted).not.toBeNull();
    if (promoted === null) return;
    const { product, source } = promoted;
    const factSourceIds = [
      product.weightG.sourceId,
      product.outerSizeMm.sourceId,
      product.capacityL.sourceId,
      ...(product.bodySizeMm ? [product.bodySizeMm.sourceId] : []),
      ...Object.values(product.specs).map((fact) => fact.sourceId),
    ].filter((id): id is string => id !== null);
    expect(factSourceIds.length).toBeGreaterThan(0);
    for (const id of factSourceIds) expect(id).toBe(source.id);
    expect(source.usageNote).toContain(AUTO_REGISTERED_MARKER);
  });

  it('人が登録した通常の Source には印を自動付与しない', () => {
    expect(makeSource().usageNote).not.toContain(AUTO_REGISTERED_MARKER);
    expect(makeCandidatePair('human-1').source.usageNote).not.toContain(AUTO_REGISTERED_MARKER);
  });

  it('印の文字列は constants.ts の 1 箇所だけで作る', () => {
    expect(autoRegisteredUsageNote('説明')).toBe(`${AUTO_REGISTERED_MARKER} 説明`);
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-candidate.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/sync/candidate
```

### 最小実装

`buildCandidateFromRakutenItem` は `itemName`＋`itemCaption` を正規化した文字列に対して
上表のパターンを当て、**該当が 1 つのときだけ**値を入れる。
`promoteCandidate` は 5 条件を順に見て、1 つでも欠ければ `null` を返す。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-candidate.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 楽天検索結果から新規候補を作る処理を追加

buildCandidateFromRakutenItem → evaluateCandidate → promoteCandidate の 3 段。
ブランドは完全一致、型番とカテゴリは該当が 1 つのときだけ採用する。
model・variant・公式URL・必須 Facts のどれかが決まらなければ
Product を作らず null を返す。呼び出し側が queue に残す。
作る Source の usageNote には自動登録の印を必ず入れる。
印の文字列は constants.ts に 1 箇所だけ置き、週次件数の判別と共有する。
```

---

## Task 16: 書き込み計画を作る純関数（停止スイッチと週上限の結線）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/sync/write-plan.ts` |
| 作成 | `travel-goods-site/tests/automation-write-plan.test.ts` |

### Consumes / Produces

- Consumes: `Switches` / `allowsTier`（計画3 Task 1）、`Tier`、`ExistingOutcome`、`CandidateEvaluation`、`PromotedProduct`、`Product`、`AUTO_REGISTERED_MARKER`（Task 15 の `constants.ts`）
- Produces:
  - `export const PRODUCTS_PER_WEEK = 3`
  - `export function jstWeekStart(isoDate: string): string`
  - **`AUTO_REGISTERED_MARKER` はここで定義しない。** `src/lib/automation/sync/constants.ts`（Task 15）から import する
  - `export function isAutoRegistered(product: Product, sources: readonly Source[]): boolean`
  - `export function registeredProductsThisWeek(products: readonly Product[], sources: readonly Source[], today: string): number`
  - `export function remainingProductsThisWeek(products: readonly Product[], sources: readonly Source[], today: string): number`
  - `export type WritePlan = { publishProduct: boolean; writeProductAsReview: boolean; productStatus: 'published' | 'review' | null; writeSource: boolean; writeMerchantLink: boolean; replaceMerchantLink: boolean; updateLinkHealth: boolean; queue: QueueEntry[] }`
  - `export function productStatusOf(plan: Pick<WritePlan, 'publishProduct' | 'writeProductAsReview'>): 'published' | 'review' | null`
  - `export function buildWritePlan(input: WritePlanInput): WritePlan`
  - `export type WritePlanInput = { switches: Switches; tier: Tier; recheck: RecheckState; replacement: ReplacementDecision; isNewProduct: boolean; remainingThisWeek: number; today: string; targetId: string }`

### 仕様

#### 商品の週 3 件上限（JST 月曜始まり）

月曜と木曜に各 `--limit 3` では最大 6 件になる。**週単位で数える。**

**シグネチャは `(products, sources, today)` の 3 引数で統一する。**
自動登録の判別に `Source.usageNote` を見るため、`sources` が必要である。

```ts
// 印の文字列は constants.ts の 1 箇所だけ。write-plan.ts でも tests でも再定義しない。
import { AUTO_REGISTERED_MARKER } from './constants';

export const PRODUCTS_PER_WEEK = 3;

/** その商品の Facts が参照する Source の usageNote にマーカーがあるか。 */
export function isAutoRegistered(product: Product, sources: readonly Source[]): boolean {
  const ids = new Set(factSourceIds(product));
  return sources.some((s) => ids.has(s.id) && s.usageNote.includes(AUTO_REGISTERED_MARKER));
}

/** その週に自動登録された商品の数。 */
export function registeredProductsThisWeek(
  products: readonly Product[],
  sources: readonly Source[],
  today: string,
): number {
  const weekStart = jstWeekStart(today);
  return products.filter((p) => {
    const registeredAt = p.weightG.checkedAt ?? p.capacityL.checkedAt;
    return isAutoRegistered(p, sources)
      && registeredAt !== null
      && jstWeekStart(registeredAt) === weekStart;
  }).length;
}

export function remainingProductsThisWeek(
  products: readonly Product[],
  sources: readonly Source[],
  today: string,
): number {
  return Math.max(0, PRODUCTS_PER_WEEK - registeredProductsThisWeek(products, sources, today));
}
```

- **人が登録した商品は数えない**（`usageNote` にマーカーが無い）。
- **マーカーを付けるのは `promoteCandidate`（Task 15）だけ。**
  `promoteCandidate` が `autoRegisteredUsageNote(...)` で作った `Source` を
  `applyWritePlans`（Task 17）がそのまま保存するので、
  保存後に `registeredProductsThisWeek` が同じ商品を数えられる。
  この往復は Task 17 の統合テスト（`automation-apply-status.test.ts`）で固定する。
- テストでも `makeAutoRegisteredProduct` と `makeAutoRegisteredSource` を**対で渡す**。
- **数えるのは公開・保留を問わず「自動登録した商品」**であり、
  `status` が `published` か `review` かは問わない。
  ただし **B 判定（Product を作らなかったもの）は数えない**（Product が存在しないため）。
- 超過分は `queue.json` に `kind: 'candidate'` として残す。

#### 停止スイッチの結線（計画3 Task 1 の動作表を実装する）

```ts
export function buildWritePlan(input: WritePlanInput): WritePlan {
  const { switches: sw, tier, recheck, replacement, isNewProduct, remainingThisWeek } = input;
  const empty: WritePlan = {
    publishProduct: false, writeProductAsReview: false, productStatus: null, writeSource: false,
    writeMerchantLink: false, replaceMerchantLink: false, updateLinkHealth: false, queue: [],
  };
  if (!sw.automationEnabled) return empty;
  // 以降、スイッチごとに許可を積み上げる
}
```

| 条件 | `WritePlan` の値 |
|---|---|
| `automationEnabled === false` | すべて `false`、`productStatus: null`、`queue` も空 |
| `isNewProduct && !sw.autoDiscoverProducts` | すべて `false`、`productStatus: null`、`queue` も空（探索自体を行わない） |
| `tier === 'B'` | 書き込みなし。`productStatus: null`。`queue` に `kind: 'candidate'` |
| `tier === 'A'` かつ `recheck !== 'matched-previous-day'` | 書き込みなし。`productStatus: null`。`queue` に `kind: 'tier-a-recheck'` |
| `isNewProduct && remainingThisWeek <= 0` | 書き込みなし。`productStatus: null`。`queue` に `kind: 'candidate'` |
| `allowsTier(sw.autoPublishProducts, tier) === false` | `publishProduct: false`, **`writeProductAsReview: true`, `productStatus: 'review'`, `writeSource: true`**, `writeMerchantLink: false`。`queue` に `kind: 'candidate'` |
| 上記をすべて通過 | `publishProduct: true`, **`productStatus: 'published'`**, `writeSource: true`, `writeMerchantLink: true` |
| `sw.autoAuditLinks === false` | `updateLinkHealth: false` |
| `sw.autoReplaceLinks === false` | `replaceMerchantLink: false`（`replacement` の結果は `queue` に記録） |

**週上限の判定を `allowsTier` より先に置く。** 上限を超えた新商品は
`review` でも保存しない（週 3 件は「自動登録の件数」の上限であり、公開件数の上限ではない）。

#### 保存する `status` を計画に持たせる

**`promoteCandidate` が返す `Product` は必ず `status: 'review'` である**（Task 15）。
`publishProduct: true` を返すだけでは、保存されるデータは `review` のままになる。
そこで `WritePlan` に**保存時の `status` そのもの**を持たせ、
`applyWritePlans`（Task 17）が**その値で上書きしてから書く**。

```ts
/** publishProduct / writeProductAsReview から保存時の status を決める。両立しない。 */
export function productStatusOf(
  plan: Pick<WritePlan, 'publishProduct' | 'writeProductAsReview'>,
): 'published' | 'review' | null {
  if (plan.publishProduct) return 'published';
  if (plan.writeProductAsReview) return 'review';
  return null;
}
```

不変条件（テストで検査する）:

- `publishProduct` と `writeProductAsReview` が**同時に `true` にならない**。
- `productStatus === 'published'` ⟺ `publishProduct === true`。
- `productStatus === 'review'` ⟺ `writeProductAsReview === true`。
- `productStatus === null` のとき、**Product ファイルを一切書かない**。
- `productStatus !== null` のとき、必ず `writeSource: true`
  （Fact の `sourceId` が参照する Source を同時に書かないと `inspectCatalog` が落ちる）。

| Tier と公開スイッチ | `publishProduct` | `writeProductAsReview` | `productStatus` | 最終保存 |
|---|---|---|---|---|
| S、`AUTO_PUBLISH_PRODUCTS=S` または `S,A` | `true` | `false` | `'published'` | `status: 'published'` |
| A（再確認済み）、`AUTO_PUBLISH_PRODUCTS=S,A` | `true` | `false` | `'published'` | `status: 'published'` |
| S または再確認済み A だが**公開対象外**（`off`、`S` の下の A） | `false` | **`true`** | `'review'` | `status: 'review'`（人が公開する） |
| A（再確認前） | `false` | `false` | `null` | 保存しない（`queue` の `tier-a-recheck`） |
| B | `false` | `false` | `null` | 保存しない（`promoteCandidate` が `null`） |
| `AUTOMATION_ENABLED=false` / `AUTO_DISCOVER_PRODUCTS=false` / 週上限超過 | `false` | `false` | `null` | 保存しない |

> **`off` は「商品データの作成停止」ではなく「自動公開停止」。**
> `off` は「根拠は揃っているが、公開を人が握っている」状態なので
> `review` で保存して人が公開できるようにする（記事側の `articleStatusFor` と同じ考え方）。
> B は「根拠が足りない」状態で、そもそも `promoteCandidate` が `Product` を返さないため
> 保存する対象が存在しない。**根拠不足のものを `review` でデータへ入れない。**
>
> **この契約は計画3 Task 1 の「`AUTO_PUBLISH_PRODUCTS` は「自動公開」だけを止める」節と同一。**
> 片方だけを変えない。`review` 保存時も Source を必ず同時に書き、`MerchantLink` は書かない。

### ステップ

- [ ] `jstWeekStart` の週境界テストを書く（月・水・日・翌月曜）（4 分）
- [ ] `registeredProductsThisWeek` が**人が登録した商品を数えない**失敗テストを書く（4 分）
- [ ] Source が対で無ければ自動登録とみなさない失敗テストを書く（3 分）
- [ ] `makeAutoRegisteredSource` の印が本番の `AUTO_REGISTERED_MARKER` と同一である失敗テストを書く（2 分）
- [ ] 月曜に 3 件登録したら木曜の残りが 0 になる失敗テストを書く（4 分）
- [ ] 同日再実行でも残りが増えない失敗テストを書く（3 分）
- [ ] 週が変われば残りが 3 に戻る失敗テストを書く（3 分）
- [ ] **B/A 候補（Product を作らなかったもの）を公開件数に数えない**失敗テストを書く（4 分）
- [ ] `automationEnabled === false` ですべて `false` になる失敗テストを書く（3 分）
- [ ] `SWITCH_CASES` の型と `it.each` の枠を書く（まだ 0 件）（3 分）
- [ ] `AUTO_DISCOVER_PRODUCTS=false` のケースを足す（3 分）
- [ ] `AUTO_PUBLISH_PRODUCTS=off` のケース（`review` 保存になることまで検査）を足す（4 分）
- [ ] `AUTO_AUDIT_LINKS=false` と `AUTO_REPLACE_LINKS=false` のケースを足す（4 分）
- [ ] `AUTO_PUBLISH_PRODUCTS=S` で A が `productStatus: 'review'` になる失敗テストを書く（4 分）
- [ ] `AUTO_PUBLISH_PRODUCTS=off` で S も `productStatus: 'review'` になる失敗テストを書く（3 分）
- [ ] `publishProduct` と `writeProductAsReview` が同時に `true` にならない不変条件テストを書く（3 分）
- [ ] `AUTO_PUBLISH_PRODUCTS=S,A` でも**再確認前の A** は公開しない失敗テストを書く（4 分）
- [ ] 週上限を超えた新商品が `queue` に残る失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `jstWeekStart` と `isAutoRegistered`（`constants.ts` から印を import）を実装する（4 分）
- [ ] `registeredProductsThisWeek` / `remainingProductsThisWeek`（3 引数）を実装する（4 分）
- [ ] `buildWritePlan` の `automationEnabled` と `isNewProduct` の分岐を実装する（4 分）
- [ ] Tier と `recheck` と `allowsTier` の分岐、および `productStatusOf` を実装する（5 分）
- [ ] 週上限と `autoAuditLinks` / `autoReplaceLinks` の分岐を実装する（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-write-plan.test.ts
import { describe, expect, it } from 'vitest';
import {
  PRODUCTS_PER_WEEK,
  buildWritePlan,
  jstWeekStart,
  productStatusOf,
  registeredProductsThisWeek,
  remainingProductsThisWeek,
  type WritePlanInput,
} from '../src/lib/automation/sync/write-plan';
import { readSwitches, type Switches } from '../src/lib/automation/switches';
import {
  makeAutoRegisteredProduct,
  makeAutoRegisteredSource,
  makeProduct,
  makeSource,
} from './factories';

const allOn: Switches = readSwitches({
  AUTOMATION_ENABLED: 'true',
  AUTO_DISCOVER_PRODUCTS: 'true',
  AUTO_PUBLISH_PRODUCTS: 'S,A',
  AUTO_GENERATE_ARTICLES: 'true',
  AUTO_PUBLISH_ARTICLES: 'true',
  AUTO_AUDIT_LINKS: 'true',
  AUTO_REPLACE_LINKS: 'true',
});

function planInput(over: Partial<WritePlanInput> = {}): WritePlanInput {
  return {
    switches: allOn,
    tier: 'S',
    recheck: 'matched-previous-day',
    replacement: { action: 'replace-now' },
    isNewProduct: false,
    remainingThisWeek: PRODUCTS_PER_WEEK,
    today: '2026-09-02',
    targetId: 'fixture-ace-06936',
    ...over,
  };
}

/** 自動登録された商品と、その Source を対で作る。 */
function autoPair(ids: readonly string[], checkedAt: string) {
  return {
    products: ids.map((id) => makeAutoRegisteredProduct(id, checkedAt)),
    sources: ids.map((id) => makeAutoRegisteredSource(id, checkedAt)),
  };
}

describe('週 3 件の上限（JST 月曜始まり）', () => {
  it('週の始まりは JST 月曜', () => {
    expect(jstWeekStart('2026-08-31')).toBe('2026-08-31'); // 月
    expect(jstWeekStart('2026-09-02')).toBe('2026-08-31'); // 水
    expect(jstWeekStart('2026-09-06')).toBe('2026-08-31'); // 日
    expect(jstWeekStart('2026-09-07')).toBe('2026-09-07'); // 翌月
  });

  it('人が登録した商品は数えない', () => {
    const products = [makeProduct({ id: 'human-1' }), makeProduct({ id: 'human-2' })];
    const sources = [makeSource()];
    expect(registeredProductsThisWeek(products, sources, '2026-09-02')).toBe(0);
    expect(remainingProductsThisWeek(products, sources, '2026-09-02')).toBe(PRODUCTS_PER_WEEK);
  });

  it('月曜に 3 件登録したら木曜は 0 件', () => {
    const { products, sources } = autoPair(['auto-0', 'auto-1', 'auto-2'], '2026-08-31');
    expect(registeredProductsThisWeek(products, sources, '2026-09-03')).toBe(3); // 木
    expect(remainingProductsThisWeek(products, sources, '2026-09-03')).toBe(0);
  });

  it('月曜に 1 件なら木曜は 2 件まで', () => {
    const { products, sources } = autoPair(['auto-0'], '2026-08-31');
    expect(remainingProductsThisWeek(products, sources, '2026-09-03')).toBe(2);
  });

  it('同日再実行でも残りが増えない', () => {
    const { products, sources } = autoPair(['auto-0', 'auto-1', 'auto-2'], '2026-09-03');
    expect(remainingProductsThisWeek(products, sources, '2026-09-03')).toBe(0);
    expect(remainingProductsThisWeek(products, sources, '2026-09-03')).toBe(0);
  });

  it('週が変われば上限が戻る', () => {
    const { products, sources } = autoPair(['auto-0', 'auto-1', 'auto-2'], '2026-09-03');
    expect(remainingProductsThisWeek(products, sources, '2026-09-07')).toBe(PRODUCTS_PER_WEEK);
  });

  it('Source が対で無ければ自動登録とみなさない', () => {
    const { products } = autoPair(['auto-0'], '2026-08-31');
    expect(registeredProductsThisWeek(products, [makeSource()], '2026-09-02')).toBe(0);
  });

  it('Product を作らなかった B/A 候補は件数に入らない', () => {
    // queue にしか存在しない候補は products に無いので数に入らない
    const { products, sources } = autoPair(['auto-0'], '2026-08-31');
    expect(registeredProductsThisWeek(products, sources, '2026-09-02')).toBe(1);
  });
});

describe('停止スイッチの結線', () => {
  it('AUTOMATION_ENABLED=false ではすべて書かない', () => {
    const plan = buildWritePlan(planInput({ switches: readSwitches({}) }));
    expect(plan).toEqual({
      publishProduct: false, writeProductAsReview: false, productStatus: null, writeSource: false,
      writeMerchantLink: false, replaceMerchantLink: false, updateLinkHealth: false, queue: [],
    });
  });

  const SWITCH_CASES: readonly {
    name: string; env: NodeJS.ProcessEnv; over: Partial<WritePlanInput>;
    check: (plan: ReturnType<typeof buildWritePlan>) => void;
  }[] = [
    {
      name: 'AUTO_DISCOVER_PRODUCTS=false は新商品を扱わない',
      env: { AUTOMATION_ENABLED: 'true', AUTO_PUBLISH_PRODUCTS: 'S,A', AUTO_DISCOVER_PRODUCTS: 'false' },
      over: { isNewProduct: true },
      check: (p) => {
        expect(p.publishProduct).toBe(false);
        expect(p.writeSource).toBe(false);
        expect(p.queue).toEqual([]);
      },
    },
    {
      name: 'AUTO_PUBLISH_PRODUCTS=off は S も A も公開せず review で保存する',
      env: { AUTOMATION_ENABLED: 'true', AUTO_DISCOVER_PRODUCTS: 'true', AUTO_PUBLISH_PRODUCTS: 'off' },
      over: {},
      check: (p) => {
        expect(p.publishProduct).toBe(false);
        expect(p.writeProductAsReview).toBe(true);
        expect(p.productStatus).toBe('review');
        expect(p.writeSource).toBe(true);
        expect(p.queue.map((q) => q.kind)).toContain('candidate');
      },
    },
    {
      name: 'AUTO_AUDIT_LINKS=false は link-health を書かない',
      env: { AUTOMATION_ENABLED: 'true', AUTO_PUBLISH_PRODUCTS: 'S,A', AUTO_AUDIT_LINKS: 'false' },
      over: {},
      check: (p) => expect(p.updateLinkHealth).toBe(false),
    },
    {
      name: 'AUTO_REPLACE_LINKS=false はリンクを交換しない',
      env: { AUTOMATION_ENABLED: 'true', AUTO_PUBLISH_PRODUCTS: 'S,A', AUTO_REPLACE_LINKS: 'false' },
      over: {},
      check: (p) => expect(p.replaceMerchantLink).toBe(false),
    },
  ];

  it.each(SWITCH_CASES)('$name', ({ env, over, check }) => {
    check(buildWritePlan(planInput({ switches: readSwitches(env), ...over })));
  });

  it('AUTO_PUBLISH_PRODUCTS=S では A を公開せず review で保存する', () => {
    const sw = readSwitches({
      AUTOMATION_ENABLED: 'true', AUTO_DISCOVER_PRODUCTS: 'true', AUTO_PUBLISH_PRODUCTS: 'S',
    });
    const plan = buildWritePlan(planInput({ switches: sw, tier: 'A' }));
    expect(plan.publishProduct).toBe(false);
    expect(plan.productStatus).toBe('review');
    expect(plan.queue.map((q) => q.kind)).toContain('candidate');
  });

  it('AUTO_PUBLISH_PRODUCTS=S,A でも再確認前の A は公開も保存もしない', () => {
    const plan = buildWritePlan(planInput({ tier: 'A', recheck: 'not-yet' }));
    expect(plan.publishProduct).toBe(false);
    expect(plan.writeProductAsReview).toBe(false);
    expect(plan.productStatus).toBeNull();
    expect(plan.queue.map((q) => q.kind)).toContain('tier-a-recheck');
  });

  it('S 判定かつ公開許可なら productStatus は published', () => {
    const plan = buildWritePlan(planInput({ tier: 'S' }));
    expect(plan.publishProduct).toBe(true);
    expect(plan.writeProductAsReview).toBe(false);
    expect(plan.productStatus).toBe('published');
    expect(plan.writeSource).toBe(true);
  });

  it('B 判定は候補キューに残すだけで保存しない', () => {
    const plan = buildWritePlan(planInput({ tier: 'B' }));
    expect(plan.publishProduct).toBe(false);
    expect(plan.writeProductAsReview).toBe(false);
    expect(plan.productStatus).toBeNull();
    expect(plan.queue.map((q) => q.kind)).toEqual(['candidate']);
  });

  it('週上限を超えた新商品は review でも保存しない', () => {
    const plan = buildWritePlan(planInput({ isNewProduct: true, remainingThisWeek: 0 }));
    expect(plan.publishProduct).toBe(false);
    expect(plan.writeProductAsReview).toBe(false);
    expect(plan.productStatus).toBeNull();
    expect(plan.queue.map((q) => q.kind)).toContain('candidate');
  });

  it('publishProduct と writeProductAsReview は同時に true にならない', () => {
    const combos: WritePlanInput[] = [
      planInput({ tier: 'S' }),
      planInput({ tier: 'A' }),
      planInput({ tier: 'A', recheck: 'not-yet' }),
      planInput({ tier: 'B' }),
      planInput({
        switches: readSwitches({
          AUTOMATION_ENABLED: 'true', AUTO_DISCOVER_PRODUCTS: 'true', AUTO_PUBLISH_PRODUCTS: 'off',
        }),
      }),
      planInput({
        switches: readSwitches({
          AUTOMATION_ENABLED: 'true', AUTO_DISCOVER_PRODUCTS: 'true', AUTO_PUBLISH_PRODUCTS: 'S',
        }),
        tier: 'A',
      }),
      planInput({ isNewProduct: true, remainingThisWeek: 0 }),
    ];
    for (const input of combos) {
      const plan = buildWritePlan(input);
      expect(plan.publishProduct && plan.writeProductAsReview).toBe(false);
      expect(plan.productStatus).toBe(productStatusOf(plan));
      if (plan.productStatus !== null) expect(plan.writeSource).toBe(true);
    }
  });
});
```

`makeAutoRegisteredProduct` を `tests/factories/index.ts` に足す。

```ts
// テスト側でも文字列を再定義しない。本番の定数をそのまま import する。
import { AUTO_REGISTERED_MARKER } from '../../src/lib/automation/sync/constants';

/**
 * 自動登録された商品（Source の usageNote にマーカーを持つ）。
 * Fact の sourceId を揃える規則は makeCandidatePair に一本化する（Task 1）。
 */
export function makeAutoRegisteredProduct(id: string, checkedAt: string): Product {
  return makeCandidatePair(id, 'published', checkedAt).product;
}

export function makeAutoRegisteredSource(id: string, checkedAt: string): Source {
  return makeSource({ id: `src-${id}`, checkedAt, usageNote: AUTO_REGISTERED_MARKER });
}
```

`makeAutoRegisteredProduct(id, checkedAt)` は `sourceId: 'src-<id>'` の Facts を持ち、
`makeAutoRegisteredSource(id, checkedAt)` は `id: 'src-<id>'` と
`usageNote: AUTO_REGISTERED_MARKER` を持つ。**必ず対で渡す。**
`makeCandidatePair` が返す Source には `usageNote` のマーカーが無いため、
自動登録の判別に使うのは `makeAutoRegisteredSource` のほうである。

**`AUTO_REGISTERED_MARKER` を `tests/factories/index.ts` で再定義しない。**
本番の `src/lib/automation/sync/constants.ts` から import する。
テスト側に文字列を複製すると、本番の印を変えたときにテストだけが通り続ける。

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-write-plan.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/sync/write-plan
```

### 最小実装

`buildWritePlan` は上表の条件を**上から順に**評価し、
最初に該当したところで `WritePlan` を返す（早期 return）。
`queue` は該当した理由ごとに 1 件だけ積む。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-write-plan.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 書き込み計画を作る純関数を追加

7 つの停止スイッチと週 3 件の上限を、書き込み計画そのものに結線する。
「書いてから消す」のではなく、計画の段階で false にする。
保存時の status を productStatus として計画に持たせ、公開の決定箇所を 1 つにする。
週の件数は JST 月曜始まりで自動登録済みの商品から数え、
人が登録した商品と、Product を作らなかった B/A 候補は数えない。
```

---

## Task 17: dry-run / apply の CLI と状態ファイル更新

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/sync/gate.ts` |
| 作成 | `travel-goods-site/src/lib/automation/sync/apply.ts` |
| 作成 | `travel-goods-site/scripts/automation-sync.ts` |
| 変更 | `travel-goods-site/package.json`（`automation:sync` を追加） |
| 作成 | `travel-goods-site/tests/automation-sync-gate.test.ts` |
| 作成 | `travel-goods-site/tests/automation-sync-cli.test.ts` |
| 作成 | `travel-goods-site/tests/automation-apply-status.test.ts` |

### Consumes / Produces

- Consumes: Task 13〜16 のすべて、`readBudget` / `readQueue` / `readLinkHealth` / `writeIfChanged` / `serialize*`（Task 2・3）、`canSpend` / `spend` / `enqueue` / `dequeue`（Task 4）、`readSwitches`（計画3 Task 1）、`inspectCatalog`（既存）、`seedMinimalDataset` / `readSeededDataset` / `makeCandidatePair` / `makePipelineDeps`（Task 1・Task 14・統合テスト用）、`registeredProductsThisWeek` / `remainingProductsThisWeek`（Task 16）、`AUTO_REGISTERED_MARKER`（Task 15 の `constants.ts`）
- Produces:
  - `apply.ts`:
    - `export type AppliedChange = { plan: WritePlan; product: Product | null; source: Source | null; merchantLink: MerchantLink | null; linkHealth: LinkHealthEntry | null }`
    - `export function applyWritePlans(datasetDir: string, plans: readonly AppliedChange[]): { written: string[]; skipped: string[] }`
  - `gate.ts`: `export type ModeGate`、`export function gateMode(mode: SyncMode, sw: Switches): ModeGate`
  - `export type SyncMode = 'links' | 'discover' | 'recheck'`
  - `export type SyncRunner = { search: (keyword: string) => Promise<RakutenItem[]>; fetchOfficial: OfficialFetcher }`
  - `export type SyncOptions = { apply: boolean; limit: number; maxRequests: number; today: string; datasetDir?: string }`
  - `export type SyncResult = { skippedReason: string | null; changes: AppliedChange[]; requests: number }`
  - `export async function runSync(mode: SyncMode, sw: Switches, runner: SyncRunner, options: SyncOptions): Promise<SyncResult>`（**runner を注入する。テストが呼び出し回数を数えられるようにする**）
  - CLI: `npm run automation:sync -- --mode links|discover|recheck [--apply] [--limit N] [--max-requests N] [--offline]`

### 既存 CLI を拡張するか、新規に作るか

**新規 CLI `scripts/automation-sync.ts` を作る。`scripts/rakuten-sync.ts` は変更しない。**

| 観点 | 理由 |
|---|---|
| 書き込み範囲が違う | 既存は `datasets/production/candidates/` に書く。自動運用は**許可パス外**なので書けない（設計書 12.2） |
| 判定が違う | 既存は `strong`/`weak` だけ。自動運用は 17 ブロッカーの fail-closed 判定を使う |
| 既存の手動運用を壊さない | `rakuten-sync.ts` は動作が確立しており、人が手で使い続ける |

両者は `RakutenClient`・`matchProduct`・`isHumanVerifiedLink` を共有する。

### 停止スイッチは**楽天APIを呼ぶ前**に効かせる

`buildWritePlan`（Task 16）は**書き込みだけ**を止める。
`AUTO_DISCOVER_PRODUCTS` と `AUTO_AUDIT_LINKS` は
**外部通信そのものを止める必要がある**（無料枠と規約の両方の理由）。
そのため CLI は、**`RakutenClient` を生成する前**に次を判定して終了する。

```ts
/** 楽天APIを呼ぶ前に、この mode を実行してよいかを決める。 */
export type ModeGate = { run: true } | { run: false; reason: string };

export function gateMode(mode: 'links' | 'discover' | 'recheck', sw: Switches): ModeGate {
  if (!sw.automationEnabled) return { run: false, reason: 'automation-disabled' };
  if (mode === 'discover' && !sw.autoDiscoverProducts) return { run: false, reason: 'discover-disabled' };
  if (mode === 'links' && !sw.autoAuditLinks) return { run: false, reason: 'audit-disabled' };
  if (mode === 'recheck' && !sw.autoAuditLinks) return { run: false, reason: 'audit-disabled' };
  return { run: true };
}
```

| mode | 止めるスイッチ | 動作 |
|---|---|---|
| `discover` | `AUTO_DISCOVER_PRODUCTS=false` | **楽天API を 1 回も呼ばずに終了コード 0** |
| `links` | `AUTO_AUDIT_LINKS=false` | 同上 |
| `recheck` | `AUTO_AUDIT_LINKS=false` | 同上 |
| すべて | `AUTOMATION_ENABLED` が `'true'` でない | 同上 |

`gateMode` が `{ run: false }` を返したら、**`RakutenClient` を new しない・
`createOfficialFetcher` を作らない・`fs` を読まない**。理由を 1 行出力して終わる。

`AUTO_REPLACE_LINKS` と `AUTO_PUBLISH_PRODUCTS` は**取得の要否を変えない**ため
`gateMode` には含めず、`buildWritePlan` で書き込みだけを止める。

### CLI の引数

| 引数 | 既定 | 意味 |
|---|---|---|
| `--mode links` | ● | 既存商品の判定とリンク健全性（Task 14） |
| `--mode discover` | | 新商品候補の作成と昇格（Task 15） |
| `--mode recheck` | | 前日の `tier-a-recheck` を再取得して突き合わせる |
| `--apply` | なし（**dry-run**） | 書き込む。無ければ 1 バイトも書かない |
| `--limit N` | `3` | 1 回で扱う対象の上限。実際は `Math.min(limit, remainingProductsThisWeek(...))` |
| `--max-requests N` | `30` | 楽天API の上限 |
| `--offline` | なし | 楽天API とメーカー公式へ接続せず、ループバックのモックと fixture で通す |

### workflow からの呼び出し（計画3 Task 6 が使う）

```bash
# automation-links.yml（毎日 JST 06:00）
npm run automation:sync -- --mode links --apply --limit 15 --max-requests 20
npm run automation:sync -- --mode recheck --apply --limit 5 --max-requests 5

# automation-discover.yml（月・木 JST 06:30）
npm run automation:sync -- --mode discover --apply --limit 3 --max-requests 8
```

**`--limit 3` を月・木の両方に渡しても、週の合計は 3 件を超えない**（Task 16 の週上限）。

### 書き込み先（`--apply` のときだけ）

| ファイル | 条件 |
|---|---|
| `datasets/production/products/<category>.json` | **`plan.productStatus !== null`**（保存する `status` は `plan.productStatus`） |
| `datasets/production/sources.json` | `plan.writeSource` |
| `datasets/production/merchants/rakuten.json` | `plan.writeMerchantLink` または `plan.replaceMerchantLink` |
| `automation/queue.json` | 常に（`plan.queue` をマージ） |
| `automation/link-health.json` | `plan.updateLinkHealth` |
| `automation/budget.json` | 消費があった日だけ |

**`datasets/production/candidates/` には書かない。**
書き込み前に `inspectCatalog` を通し、`ok: false` なら**中止して終了コード 1**。

### 保存する `status` は `applyWritePlans` が一度だけ決める

`promoteCandidate`（Task 15）が返す `Product` は**必ず `status: 'review'`** である。
`buildWritePlan`（Task 16）が `publishProduct: true` を返しても、
その `Product` をそのまま書けば保存されるのは `review` のままになる。

そこで `applyWritePlans` が、**書き込む直前に `status` を `plan.productStatus` で上書きする**。

```ts
for (const change of plans) {
  const { plan, product } = change;
  // productStatus が null なら Product ファイルには一切触れない
  if (plan.productStatus === null || product === null) continue;
  const toWrite: Product = { ...product, status: plan.productStatus };
  upsertProduct(datasetDir, toWrite); // writeIfChanged 経由
}
```

- **公開を決める箇所はここ 1 つだけ。** `promoteCandidate` は公開状態を判断しない。
- `plan.productStatus === null` のときは `products/<category>.json` を**読み書きしない**
  （`writeIfChanged` にも渡さない）。
- `plan.productStatus !== null` なら `plan.writeSource` も必ず `true` なので、
  Fact が参照する `Source` を同じ呼び出しで書く。順序は **Source → Product → MerchantLink**。
- 書いたあとに `inspectCatalog` を通す。`review` の商品は配信物に出ないため、
  `status: 'review'` で保存しても公開サイトの内容は変わらない。

**統合テストは fixture だけで終わらせない。** `promoteCandidate`（Task 15）が
`Source.usageNote` に `AUTO_REGISTERED_MARKER` を付け、`applyWritePlans` がそれを保存し、
`registeredProductsThisWeek`（Task 16）が保存後のデータからその商品を数える——
この往復が繋がっていないと**週 3 件の上限が黙って効かなくなる**。
そのため統合テストには、fixture ではなく**実際に `promoteCandidate` を通した
Product と Source を保存し、読み戻して件数を数えるケース**を置く。

**統合テストは実データセットを触らない。** `seedMinimalDataset(tmpdir)`（Task 1）で
`datasets/production/` と同じ構造を tmpdir に作り、そこへ書く。
保存する `Product` と `Source` は `makeCandidatePair(productId, 'review')` で作るため、
**Fact の `sourceId` が対の Source の ID と必ず一致し**、`inspectCatalog` が
Source 参照不整合で落ちない。`makeProduct({ id })` だけを差し替えると
既定の `'src-fixture-ace-06936'` が残るため、統合テストでは使わない。

### ステップ

- [ ] `gateMode` の 4 ケースを table-driven で検査する失敗テストを書く（5 分）
- [ ] **止まっている mode で `search` と `fetchOfficial` の呼び出しが 0 回**である注入テストを書く（5 分）
- [ ] 有効なときは `search` が呼ばれる（ゲートが常時 false でない）失敗テストを書く（3 分）
- [ ] CLI が `AUTO_DISCOVER_PRODUCTS=false` で理由を出して正常終了する失敗テストを書く（4 分）
- [ ] CLI が `AUTO_AUDIT_LINKS=false` で理由を出して正常終了する失敗テストを書く（3 分）
- [ ] `--apply` なしで 1 バイトも書かない失敗テストを書く（5 分）
- [ ] `candidates/` を作らない失敗テストを書く（3 分）
- [ ] 不正な `--mode` が終了コード 2 になる失敗テストを書く（3 分）
- [ ] `AUTOMATION_ENABLED` 未設定で `--apply` を付けても書かない失敗テストを書く（4 分）
- [ ] 予算超過で終了コード 0（正常終了）になり、未処理分がキューに積まれる失敗テストを書く（5 分）
- [ ] `applyWritePlans` が同じ内容なら書き込みを飛ばす失敗テストを書く（4 分）
- [ ] `automation-apply-status.test.ts` の枠（`seedMinimalDataset` の `beforeEach` と `savedStatus` / `expectCatalogOk` の補助関数）を書く（5 分）
- [ ] `STATUS_CASES` に **1. S ＋ `S,A`** と **2. 再確認済み A ＋ `S,A`**（ともに `published`）を足す（4 分）
- [ ] `STATUS_CASES` に **3. S ＋ `off`** と **4. 再確認済み A ＋ `S`**（ともに `review`・Source も保存）を足す（4 分）
- [ ] `STATUS_CASES` に **5. B** / **6. 再確認前 A** / **7. 週上限超過**（いずれも products ファイル無変更）を足す（5 分）
- [ ] 各ケースの末尾で `inspectCatalog(readSeededDataset(...)).ok === true` を検査する行を足す（3 分）
- [ ] **8. `productStatus === null` なら products ファイルへ一切触れない**失敗テストを書く（4 分）
- [ ] **9. `promoteCandidate` の初期 `review` が公開許可時だけ `published` へ上書きされる**失敗テストを書く（4 分）
- [ ] `review` 保存では `MerchantLink` を書かない失敗テストを書く（3 分）
- [ ] 実際に `promoteCandidate` を通す `promoteReal` と、読み戻す `savedCatalog` の補助関数を書く（5 分）
- [ ] **1 件 promote → 保存 → 読み戻しで `registeredProductsThisWeek === 1` / `remainingProductsThisWeek === 2`** の失敗テストを書く（5 分）
- [ ] **同じ週に 3 件 promote → 保存で `remainingProductsThisWeek === 0`**（ID が衝突しないことも）の失敗テストを書く（5 分）
- [ ] 翌週の日付では残りが 3 に戻る失敗テストを書く（3 分）
- [ ] 人が登録した商品（印なし）は週次件数に数えない失敗テストを書く（4 分）
- [ ] `inspectCatalog` が失敗する内容では書き込みを中止する失敗テストを書く（5 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `gate.ts`（`gateMode`）を実装する（4 分）
- [ ] `apply.ts` の JSON 読み書きと `writeIfChanged` の呼び出しを実装する（5 分）
- [ ] `apply.ts` で `plan.productStatus` による `status` 上書きを実装する（4 分）
- [ ] `apply.ts` で `productStatus === null` のとき products ファイルを読み書きしない分岐を実装する（3 分）
- [ ] `apply.ts` の `inspectCatalog` 検査と中止処理を実装する（4 分）
- [ ] `runSync` の runner 注入とゲート判定を実装する（5 分）
- [ ] `runSync` の mode 別ループと予算消費を実装する（5 分）
- [ ] `automation-sync.ts` の引数解析とロックファイルを実装する（4 分）
- [ ] `automation-sync.ts` の `--offline` 分岐と出力を実装する（4 分）
- [ ] `package.json` に `automation:sync` を足す（2 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-sync-gate.test.ts
import { describe, expect, it, vi } from 'vitest';
import { gateMode, runSync, type SyncMode, type SyncRunner } from '../src/lib/automation/sync/gate';
import { readSwitches, type Switches } from '../src/lib/automation/switches';
import { makeRakutenItem } from './factories';

const allOn: Switches = readSwitches({
  AUTOMATION_ENABLED: 'true',
  AUTO_DISCOVER_PRODUCTS: 'true',
  AUTO_PUBLISH_PRODUCTS: 'S,A',
  AUTO_AUDIT_LINKS: 'true',
  AUTO_REPLACE_LINKS: 'true',
  AUTO_GENERATE_ARTICLES: 'true',
  AUTO_PUBLISH_ARTICLES: 'true',
});

/** 呼び出し回数を数えられる runner。 */
function countingRunner() {
  const search = vi.fn(async () => [makeRakutenItem()]);
  const fetchOfficial = vi.fn(async () => ({ status: 'ok' as const, html: '<table class="spec"></table>' }));
  return { runner: { search, fetchOfficial } satisfies SyncRunner, search, fetchOfficial };
}

const GATE_CASES: readonly { name: string; mode: SyncMode; env: NodeJS.ProcessEnv; reason: string }[] = [
  {
    name: 'AUTOMATION_ENABLED が未設定なら全 mode を止める',
    mode: 'links', env: {}, reason: 'automation-disabled',
  },
  {
    name: 'AUTO_DISCOVER_PRODUCTS=false なら discover を止める',
    mode: 'discover',
    env: { AUTOMATION_ENABLED: 'true', AUTO_DISCOVER_PRODUCTS: 'false', AUTO_AUDIT_LINKS: 'true' },
    reason: 'discover-disabled',
  },
  {
    name: 'AUTO_AUDIT_LINKS=false なら links を止める',
    mode: 'links',
    env: { AUTOMATION_ENABLED: 'true', AUTO_DISCOVER_PRODUCTS: 'true', AUTO_AUDIT_LINKS: 'false' },
    reason: 'audit-disabled',
  },
  {
    name: 'AUTO_AUDIT_LINKS=false なら recheck も止める',
    mode: 'recheck',
    env: { AUTOMATION_ENABLED: 'true', AUTO_AUDIT_LINKS: 'false' },
    reason: 'audit-disabled',
  },
];

describe('mode ゲート', () => {
  it.each(GATE_CASES)('$name', ({ mode, env, reason }) => {
    expect(gateMode(mode, readSwitches(env))).toEqual({ run: false, reason });
  });

  it('すべて有効なら実行する', () => {
    for (const mode of ['links', 'discover', 'recheck'] as const) {
      expect(gateMode(mode, allOn)).toEqual({ run: true });
    }
  });
});

describe('止まっている mode は外部通信を 1 回も行わない', () => {
  it.each(GATE_CASES)('$name — 楽天API と公式取得の呼び出しが 0 回', async ({ mode, env }) => {
    const { runner, search, fetchOfficial } = countingRunner();
    const result = await runSync(mode, readSwitches(env), runner, {
      apply: false, limit: 3, maxRequests: 30, today: '2026-09-02',
    });
    expect(search).toHaveBeenCalledTimes(0);
    expect(fetchOfficial).toHaveBeenCalledTimes(0);
    expect(result.skippedReason).not.toBeNull();
  });

  it('有効なら楽天API を呼ぶ（ゲートが常時 false ではないことの確認）', async () => {
    const { runner, search } = countingRunner();
    await runSync('links', allOn, runner, { apply: false, limit: 3, maxRequests: 30, today: '2026-09-02' });
    expect(search.mock.calls.length).toBeGreaterThan(0);
  });
});
```

```ts
// tests/automation-sync-cli.test.ts
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const siteDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(args: string[], env: NodeJS.ProcessEnv = {}) {
  return execFileSync('npx', ['tsx', 'scripts/automation-sync.ts', ...args], {
    cwd: siteDir,
    encoding: 'utf8',
    env: { ...process.env, CATALOG_DATASET: 'production', ...env },
  });
}

function gitStatus() {
  return execFileSync('git', ['status', '--short', 'datasets', 'automation'], {
    cwd: siteDir, encoding: 'utf8',
  }).trim();
}

describe('automation:sync CLI', () => {
  it('--apply が無ければ 1 バイトも書かない', () => {
    run(['--mode', 'links', '--offline']);
    expect(gitStatus()).toBe('');
  });

  it('candidates/ を作らない', () => {
    run(['--mode', 'discover', '--offline']);
    expect(fs.existsSync(path.join(siteDir, 'datasets/production/candidates'))).toBe(false);
  });

  it('AUTOMATION_ENABLED が未設定なら --apply でも書かない', () => {
    run(['--mode', 'links', '--offline', '--apply'], { AUTOMATION_ENABLED: '' });
    expect(gitStatus()).toBe('');
  });

  it('不正な mode は終了コード 2 で止まる', () => {
    expect(() => run(['--mode', 'unknown', '--offline'])).toThrow();
  });

  it('AUTO_DISCOVER_PRODUCTS=false では discover が理由を出して正常終了する', () => {
    const out = run(['--mode', 'discover', '--offline'], {
      AUTOMATION_ENABLED: 'true', AUTO_DISCOVER_PRODUCTS: 'false',
    });
    expect(out).toContain('discover-disabled');
    expect(gitStatus()).toBe('');
  });

  it('AUTO_AUDIT_LINKS=false では links が理由を出して正常終了する', () => {
    const out = run(['--mode', 'links', '--offline'], {
      AUTOMATION_ENABLED: 'true', AUTO_AUDIT_LINKS: 'false',
    });
    expect(out).toContain('audit-disabled');
    expect(gitStatus()).toBe('');
  });
});
```


```ts
// tests/automation-apply-status.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyWritePlans, type AppliedChange } from '../src/lib/automation/sync/apply';
import {
  PRODUCTS_PER_WEEK,
  buildWritePlan,
  type WritePlanInput,
} from '../src/lib/automation/sync/write-plan';
import {
  registeredProductsThisWeek,
  remainingProductsThisWeek,
} from '../src/lib/automation/sync/write-plan';
import {
  buildCandidateFromRakutenItem,
  evaluateCandidate,
  promoteCandidate,
} from '../src/lib/automation/sync/candidate';
import { AUTO_REGISTERED_MARKER } from '../src/lib/automation/sync/constants';
import type { OfficialFetchPolicy } from '../src/lib/automation/sync/resolve-official';
import { readSwitches, type Switches } from '../src/lib/automation/switches';
import { inspectCatalog } from '../src/lib/catalog/validate';
import type { Product, Source } from '../src/lib/catalog/types';
import {
  makeCandidatePair,
  makeCatalog,
  makePipelineDeps,
  makeRakutenItem,
  readSeededDataset,
  seedMinimalDataset,
} from './factories';

/** 承認済みメーカーを注入する。段階0 の既定は未承認のまま。 */
const approvedAce: readonly OfficialFetchPolicy[] = [
  { manufacturerId: 'ace', approved: true, approvedNote: 'テスト用' },
];

const PRODUCT_ID = 'ace-06936-35l-4ea43263';
const SOURCE_ID = `src-${PRODUCT_ID}`;
const PRODUCT_FILE = 'products/suitcases.json';

/** 公開許可の 3 値ごとにスイッチを作る。探索と audit は有効。 */
function switchesFor(publish: 'off' | 'S' | 'S,A'): Switches {
  return readSwitches({
    AUTOMATION_ENABLED: 'true',
    AUTO_DISCOVER_PRODUCTS: 'true',
    AUTO_PUBLISH_PRODUCTS: publish,
    AUTO_AUDIT_LINKS: 'true',
    AUTO_REPLACE_LINKS: 'true',
  });
}

let datasetDir: string;

beforeEach(() => {
  datasetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'automation-apply-'));
  seedMinimalDataset(datasetDir);
});

afterEach(() => {
  fs.rmSync(datasetDir, { recursive: true, force: true });
});

function planInput(over: Partial<WritePlanInput> = {}): WritePlanInput {
  return {
    switches: switchesFor('S,A'),
    tier: 'S',
    recheck: 'matched-previous-day',
    replacement: { action: 'replace-now' },
    isNewProduct: true,
    remainingThisWeek: PRODUCTS_PER_WEEK,
    today: '2026-09-02',
    targetId: PRODUCT_ID,
    ...over,
  };
}

/**
 * promoteCandidate が返すのは必ず status: 'review' の Product。
 * Fact の sourceId は対の Source（SOURCE_ID）へ揃っている。
 */
function change(plan: ReturnType<typeof buildWritePlan>, hasProduct = true): AppliedChange {
  if (!hasProduct) {
    return { plan, product: null, source: null, merchantLink: null, linkHealth: null };
  }
  const pair = makeCandidatePair(PRODUCT_ID, 'review');
  return { plan, product: pair.product, source: pair.source, merchantLink: null, linkHealth: null };
}

function readProductFile(): { id: string; status: string }[] {
  const raw = fs.readFileSync(path.join(datasetDir, PRODUCT_FILE), 'utf8');
  return JSON.parse(raw) as { id: string; status: string }[];
}

/** 保存された status。保存されていなければ null。 */
function savedStatus(): string | null {
  return readProductFile().find((row) => row.id === PRODUCT_ID)?.status ?? null;
}

function savedSourceIds(): string[] {
  const raw = fs.readFileSync(path.join(datasetDir, 'sources.json'), 'utf8');
  return (JSON.parse(raw) as { id: string }[]).map((row) => row.id);
}

/** 保存後のデータセット全体が検証を通ること。 */
function expectCatalogOk(): void {
  const result = inspectCatalog(readSeededDataset(datasetDir));
  expect(result.issues.map((issue) => issue.message)).toEqual([]);
  expect(result.ok).toBe(true);
}

const STATUS_CASES: readonly {
  name: string;
  input: Partial<WritePlanInput>;
  /** B は promoteCandidate が null を返すので Product 自体が無い。 */
  hasProduct: boolean;
  expectedStatus: 'published' | 'review' | null;
  expectsSource: boolean;
}[] = [
  {
    name: '1. S ＋ S,A',
    input: { tier: 'S' },
    hasProduct: true,
    expectedStatus: 'published',
    expectsSource: true,
  },
  {
    name: '2. 再確認済み A ＋ S,A',
    input: { tier: 'A', recheck: 'matched-previous-day' },
    hasProduct: true,
    expectedStatus: 'published',
    expectsSource: true,
  },
  {
    name: '3. S ＋ off',
    input: { tier: 'S', switches: switchesFor('off') },
    hasProduct: true,
    expectedStatus: 'review',
    expectsSource: true,
  },
  {
    name: '4. 再確認済み A ＋ S',
    input: { tier: 'A', recheck: 'matched-previous-day', switches: switchesFor('S') },
    hasProduct: true,
    expectedStatus: 'review',
    expectsSource: true,
  },
  {
    name: '5. B',
    input: { tier: 'B' },
    hasProduct: false,
    expectedStatus: null,
    expectsSource: false,
  },
  {
    name: '6. 再確認前 A',
    input: { tier: 'A', recheck: 'not-yet' },
    hasProduct: true,
    expectedStatus: null,
    expectsSource: false,
  },
  {
    name: '7. 週上限超過',
    input: { tier: 'S', isNewProduct: true, remainingThisWeek: 0 },
    hasProduct: true,
    expectedStatus: null,
    expectsSource: false,
  },
];

describe('最終保存データの status', () => {
  it.each(STATUS_CASES)('$name → $expectedStatus', ({ input, hasProduct, expectedStatus, expectsSource }) => {
    const before = fs.readFileSync(path.join(datasetDir, PRODUCT_FILE), 'utf8');
    const plan = buildWritePlan(planInput(input));
    expect(plan.productStatus).toBe(expectedStatus);

    applyWritePlans(datasetDir, [change(plan, hasProduct)]);

    expect(savedStatus()).toBe(expectedStatus);
    if (expectedStatus === null) {
      // 8. productStatus が null なら products ファイルへ一切触れない
      expect(fs.readFileSync(path.join(datasetDir, PRODUCT_FILE), 'utf8')).toBe(before);
    }
    expect(savedSourceIds().includes(SOURCE_ID)).toBe(expectsSource);
    // 10. どのケースでも保存後のデータセットは検証を通る
    expectCatalogOk();
  });

  it('9. promoteCandidate の review は、公開許可のときだけ published へ上書きされる', () => {
    const pair = makeCandidatePair(PRODUCT_ID, 'review');
    expect(pair.product.status).toBe('review');

    const publishPlan = buildWritePlan(planInput({ tier: 'S' }));
    applyWritePlans(datasetDir, [{
      plan: publishPlan,
      product: pair.product,
      source: pair.source,
      merchantLink: null,
      linkHealth: null,
    }]);
    expect(savedStatus()).toBe('published');
    // 元の Product オブジェクトは変更されない（上書きは書き込み時のコピーで行う）
    expect(pair.product.status).toBe('review');
    expectCatalogOk();
  });

  it('9b. 公開が許可されないときは review のまま保存される', () => {
    const pair = makeCandidatePair(PRODUCT_ID, 'review');
    const reviewPlan = buildWritePlan(planInput({ tier: 'S', switches: switchesFor('off') }));
    applyWritePlans(datasetDir, [{
      plan: reviewPlan,
      product: pair.product,
      source: pair.source,
      merchantLink: null,
      linkHealth: null,
    }]);
    expect(savedStatus()).toBe('review');
    expect(savedSourceIds()).toContain(SOURCE_ID);
    expectCatalogOk();
  });

  it('8. productStatus が null なら written に products を含めない', () => {
    const plan = buildWritePlan(planInput({ tier: 'A', recheck: 'not-yet' }));
    expect(plan.productStatus).toBeNull();
    const result = applyWritePlans(datasetDir, [change(plan)]);
    expect(result.written).not.toContain(PRODUCT_FILE);
    expect(readProductFile()).toEqual([]);
    expectCatalogOk();
  });

  it('review 保存では MerchantLink を書かない（未公開商品に CTA を出さない）', () => {
    const plan = buildWritePlan(planInput({ tier: 'S', switches: switchesFor('off') }));
    expect(plan.writeMerchantLink).toBe(false);
    applyWritePlans(datasetDir, [change(plan)]);
    const raw = fs.readFileSync(path.join(datasetDir, 'merchants/rakuten.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual([]);
    expectCatalogOk();
  });
});

/**
 * fixture ではなく、実際に promoteCandidate() を通したものを保存する。
 * promoteCandidate が Source に印を付けなければ、保存後の
 * registeredProductsThisWeek が 0 のままになり、週 3 件の上限が効かない。
 * その往復をここで固定する。
 */
describe('promoteCandidate から週次件数までの往復', () => {
  const TODAY = '2026-09-02'; // 水曜。週の始まりは 2026-08-31（月）

  /** 実際に S 判定まで通して昇格させる。 */
  async function promoteReal(model: string, colorCode: string, colorName: string) {
    const item = makeRakutenItem({
      itemCode: `testshop:${model}-${colorCode}`,
      itemName: `エース クレスタ2 ${model} スーツケース 35L ${colorCode} ${colorName}`,
      itemUrl: `https://item.rakuten.co.jp/testshop/${model}-${colorCode}/`,
      itemCaption: '本体重量2.9kg。外寸 幅35×高さ55×奥行25cm。容量35L。JAN 4549550317535',
    });
    const draft = buildCandidateFromRakutenItem(item, []);
    const evaluation = await evaluateCandidate(
      draft,
      makeCatalog(),
      makePipelineDeps({ checkRecall: async () => 'clear', policies: approvedAce, today: TODAY }),
    );
    expect(evaluation.tier).toBe('S');
    const promoted = promoteCandidate(evaluation, TODAY);
    expect(promoted).not.toBeNull();
    if (promoted === null) throw new Error('promoteCandidate が null を返した');
    return promoted;
  }

  /** 保存後のデータセットを読み戻して商品と出典を取り出す。 */
  function savedCatalog(): { products: Product[]; sources: Source[] } {
    const input = readSeededDataset(datasetDir);
    const result = inspectCatalog(input);
    expect(result.issues.map((issue) => issue.message)).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('inspectCatalog が失敗した');
    return { products: result.catalog.products, sources: result.catalog.sources };
  }

  it('1 件 promote して保存すると、その週の件数が 1 になり残りが 2 になる', async () => {
    const promoted = await promoteReal('06936', '01', 'ブラックヘアライン');
    // 印が付いていることを保存前に確かめる（付いていなければ以降が全て 0 になる）
    expect(promoted.source.usageNote).toContain(AUTO_REGISTERED_MARKER);

    const plan = buildWritePlan(planInput({ tier: 'S', today: TODAY, targetId: promoted.product.id }));
    expect(plan.productStatus).toBe('published');
    applyWritePlans(datasetDir, [{
      plan,
      product: promoted.product,
      source: promoted.source,
      merchantLink: null,
      linkHealth: null,
    }]);

    const { products, sources } = savedCatalog();
    expect(products).toHaveLength(1);
    expect(products[0].status).toBe('published');
    expect(registeredProductsThisWeek(products, sources, TODAY)).toBe(1);
    expect(remainingProductsThisWeek(products, sources, TODAY)).toBe(2);
  });

  it('同じ週に 3 件 promote して保存すると残りが 0 になる', async () => {
    const colors = [['06936', '01', 'ブラックヘアライン'], ['06937', '02', 'ネイビー'], ['06938', '03', 'シルバー']];
    for (const [model, code, name] of colors) {
      const promoted = await promoteReal(model, code, name);
      const plan = buildWritePlan(planInput({ tier: 'S', today: TODAY, targetId: promoted.product.id }));
      applyWritePlans(datasetDir, [{
        plan,
        product: promoted.product,
        source: promoted.source,
        merchantLink: null,
        linkHealth: null,
      }]);
    }

    const { products, sources } = savedCatalog();
    expect(products).toHaveLength(3);
    expect(new Set(products.map((row) => row.id)).size).toBe(3); // ID が衝突していない
    expect(registeredProductsThisWeek(products, sources, TODAY)).toBe(3);
    expect(remainingProductsThisWeek(products, sources, TODAY)).toBe(0);
  });

  it('翌週になれば残りが 3 に戻る', async () => {
    const promoted = await promoteReal('06936', '01', 'ブラックヘアライン');
    const plan = buildWritePlan(planInput({ tier: 'S', today: TODAY, targetId: promoted.product.id }));
    applyWritePlans(datasetDir, [{
      plan,
      product: promoted.product,
      source: promoted.source,
      merchantLink: null,
      linkHealth: null,
    }]);

    const { products, sources } = savedCatalog();
    expect(remainingProductsThisWeek(products, sources, '2026-09-07')).toBe(PRODUCTS_PER_WEEK);
  });

  it('人が登録した商品は週次件数に数えない', async () => {
    const human = makeCandidatePair('human-registered-1', 'published');
    fs.writeFileSync(
      path.join(datasetDir, PRODUCT_FILE),
      `${JSON.stringify([human.product], null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(datasetDir, 'sources.json'),
      `${JSON.stringify([human.source], null, 2)}\n`,
    );

    const { products, sources } = savedCatalog();
    expect(products).toHaveLength(1);
    expect(registeredProductsThisWeek(products, sources, TODAY)).toBe(0);
    expect(remainingProductsThisWeek(products, sources, TODAY)).toBe(PRODUCTS_PER_WEEK);
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run \
  tests/automation-sync-gate.test.ts \
  tests/automation-sync-cli.test.ts \
  tests/automation-apply-status.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/sync/gate
```

### 最小実装

CLI は `flag()` / `has()` を既存 `scripts/rakuten-sync.ts` と同じ書き方で実装し、
`.preview/automation-sync.lock` で重複実行を防ぐ。
`--apply` が無い場合は `applyWritePlans` を**呼ばない**（引数で分岐せず、呼び出し自体を行わない）。

### 成功確認コマンド

```bash
cd travel-goods-site \
  && npx vitest run tests/automation-sync-cli.test.ts tests/automation-apply-status.test.ts \
  && CATALOG_DATASET=production npm run automation:sync -- --mode links --offline \
  && git -C .. status --short
```

### コミット

```
feat(travel-goods-site): 自動運用の CLI と状態ファイル更新を追加

Task 13〜16 の部品を結ぶ薄い CLI。既定は dry-run で 1 バイトも書かない。
datasets/production/candidates/ には書かず、候補は automation/queue.json に持つ。
保存する status は plan.productStatus で決め、書き込み直前に一度だけ上書きする。
promoteCandidate が付けた自動登録の印が保存後も残り、週 3 件の上限が
実際に効くことを、promote から件数までの往復として統合テストで固定する。
書き込み前に inspectCatalog を通し、失敗したら中止する。
月・木に --limit 3 を渡しても週の合計は 3 件を超えない。
```

---

## 完了時の確認

```bash
cd travel-goods-site
npm run typecheck && npm run lint && npm test && npm run validate:content:all
git -C .. diff --name-only main
```

期待: すべて成功。差分は `src/lib/automation/**`、`src/lib/manufacturers/**`、
`tests/automation-*.test.ts`、`tests/manufacturers-*.test.ts`、`tests/fixtures/manufacturers/**` のみ。
`datasets/`、`.github/`、`scripts/`、`src/app/`、`src/components/` に差分がないこと。

---

## 付録: 設計書 coverage 表（4 計画共通）

設計書 `docs/superpowers/specs/2026-09-02-travel-goods-automation-design.md` の
全 18 節＋付録 2 を、どの計画のどの Task が担当するかの対応表。

計画の略記: **F**＝foundation（本計画・**Task 17**）／ **A**＝article-automation（Task 7）／
**W**＝workflows（Task 9）／ **S**＝shadow-rollout（Task 7）。**合計 40 Task。**

| 節 | 内容 | 担当 |
|---|---|---|
| 1.1 | 目的 | 各計画の Goal（実装対象なし） |
| 1.2 | 採用する基本案 | 各計画の Architecture（実装対象なし） |
| 1.3 | **Workers AI の位置づけ** | **S Task 4**（型と無効実装のみ） |
| 1.4 | 非目的 | 各計画の「非対象」（実装対象なし） |
| 2.1 | すでに存在するもの | 全計画が Consumes として参照（実装対象なし） |
| 2.2 | 現行データの実測 | **F Task 1**（factory）／**F Task 6**（brand 7 種）／**F Task 7・8**（登録済み Fact との一致）／**F Task 12**（リンク 15 件）／**A Task 1・4**（記事 10 本） |
| 2.3 | 拡張が必要なもの | **F Task 10**（audit の欠陥）／**F Task 5**（`matchedVariant`）／**A Task 1**（`articleMetaSchema`） |
| 2.4 | 新規実装が必要なもの | F・A・W・S の全 Task |
| 2.5 | 設計を左右する外部事実 | **W Task 5**（`GITHUB_TOKEN`）／**W Task 9**（Pages の check run） |
| 3.1 | 役割分担 | **W Task 6・7**／**S Task 4** |
| 3.2 | データの流れ | **F Task 13〜17**（統合の 5 単位）／**S Task 2** |
| 3.3 | 縮退運転 | **F Task 14**（6b のみ）／**S Task 2・4** |
| 4.1 | 信頼境界 | **W Task 2**／**S Task 1** |
| 4.2 | 外部入力の扱い | **F Task 6・7・8**（本文全体を返さない）／**F Task 2**（`payload` 制限）／**S Task 1** |
| 4.3 | ブロックを迂回しない | **F Task 6**（`allowedHosts`）／**F Task 13**（許可ホスト外は取得しない・403/429 の分類）／**S Task 2** |
| 4.4 | `llmInput` と AI 利用の整合 | **S Task 4** |
| 5.1 | 全体の流れ | **F Task 13〜17** |
| 5.2 | 対象メーカーとブランド正規化 | **F Task 6**（`normalizeBrand`）／**F Task 15**（`BRAND_LISTING_TOKENS`） |
| 5.3 | メーカー取得アダプター | **F Task 6・7・8**／**F Task 13**（`resolveOfficialUrl`・`createOfficialFetcher`） |
| 5.4 | 判定に使う信号 | **F Task 9**（`TierInput` 13 フィールド） |
| 5.5 | **S / A / B 判定** | **F Task 9**（17 ブロッカー・table-driven test）／**F Task 13**（`RecallChecker`） |
| 5.6 | `matchedVariant` の扱い | **F Task 5**／**F Task 14** |
| 6.1 | カテゴリ拡張の方針 | **F Task 12**（`isKnownCategory`）／**F Task 15**（`CATEGORY_LISTING_KEYWORDS`） |
| 6.2 | カテゴリ追加 PR の条件 | **F Task 12** |
| 6.3 | カテゴリ追加 PR の扱い | **F Task 12**／**W Task 6** |
| 7.1 | 記事の方針 | **A Task 3・6**（JST 週 2 本） |
| 7.2 | 商品数と形式の対応 | **A Task 3**（形式ごとの選択アルゴリズム・必要な事実・生成不可条件・重複許容軸） |
| 7.3 | 記事構成プラグイン | **A Task 2・3** |
| 7.4 | 初期に有効化する形式 | **A Task 3** |
| 7.5 | `intentKey` と重複判定 | **A Task 4** |
| 7.6 | 生成 | **A Task 6** |
| 7.7 | **記事の自動検査（決定的 14）** | **A Task 5** |
| 7.8 | 再検査と自動非公開 | **A Task 7**（legacy は対象外） |
| 7.9 | 旅行先別記事（将来） | **A Task 3** |
| 7.10 | 測定条件に依存する比較軸 | **A Task 2・3** |
| 8.1 | リンク監視の現行の欠陥 | **F Task 10** |
| 8.2 | 6 つの信号 | **F Task 2**／**F Task 10**／**F Task 14**（`httpStatus` は常に null） |
| 8.3 | 状態機械 | **F Task 10** |
| 8.4 | 代替リンクへの交換 | **F Task 10・12・14** |
| 9.1 | 状態ファイルの配置 | **F Task 2** |
| 9.2 | 内容と制約 | **F Task 2・3**／**F Task 17**（変化しなければ書かない） |
| 9.3 | 監査と復元 | **W Task 7**／**S Task 6** |
| 10.1 | 公式に確認した上限 | 出典の記録（実装対象なし） |
| 10.2 | この設計の予算 | **F Task 4**（`DAILY_LIMITS`） |
| 10.3 | 楽天 30 req/日 の処理能力 | **F Task 4・17**／**S Task 2** |
| 10.4 | 現実的な処理規模 | **F Task 16**（週 3 商品）／**A Task 6**（週 2 記事）／**S Task 3** |
| 10.5 | 補助が使えないときの扱い | **F Task 9**（6a/6b 同格）／**S Task 4** |
| 11.1 | workflow 構成 | **W Task 6・7・8**／**S Task 5** |
| 11.2 | スケジュール | **W Task 6** |
| 11.3 | 1 日の流れ | **W Task 6・7**／**F Task 17**（呼び出しコマンド） |
| 11.4 | 上限と繰越 | **F Task 4・16・17**／**W Task 6** |
| 11.5 | 日次 workflow の競合対策 | **W Task 6・8** |
| 12.1 | 自動反映の流れ | **W Task 7** |
| 12.2 | 変更パス検査 | **W Task 2**／**F Task 17**（`candidates/` に書かない） |
| 12.3 | CI が起動しない問題 | **W Task 5**（`contents: read` を保つ） |
| 12.4 | 公開後検査と自動 revert | **W Task 9**（bounded polling・別 SHA 誤認防止・タイムアウト） |
| 12.5 | 自動 revert の手順 | **W Task 4**／**W Task 8**（`revert` job） |
| 12.6 | circuit breaker と 2 つの例外 | **W Task 3**（`RevertRecord[]`）／**W Task 8**／**W Task 2** |
| 13.1 | **停止スイッチ** | **W Task 1**（7 スイッチの動作表と `AUTO_PUBLISH_PRODUCTS` の契約表・table-driven test）／**F Task 16**（`buildWritePlan` と `productStatus` への結線）／**F Task 17**（最終保存 `status` の統合テスト） |
| 13.2 | 通知 | **W Task 9** |
| 14.1 | テストの原則 | **F Task 1**（fixture factory）／全 Task |
| 14.2 | 追加する単体テスト | F・A・W の全 Task |
| 14.3 | **E2E** | **S Task 7** |
| 14.4 | dry-run | **F Task 17**（既定 dry-run）／**S Task 2** |
| 15 段階0 | 実装とテスト | F・A・W・S のすべて |
| 15 段階1 | 7 日間の観察運転 | **S Task 2・3・5**／**S Task 6**（公開が起きないことの統合テスト） |
| 15 段階2 | S 判定のみ自動公開 | **計画外**（有効化操作。`RECALL_SOURCES` の承認も含む） |
| 15 段階3 | A 判定・記事・交換 | **計画外**（Workers AI の実通信もここ） |
| 15 段階4 | 本番公開 | **計画外** |
| 16 | 人間に残る作業 | **S Task 6**（runbook） |
| 17.0 | 決定済み事項 | **A Task 1**（自動レビュー契約・legacy）／**F Task 9**（`sizeBasis`）／**S Task 4** |
| 17.1 | 未解決事項 | **計画外**（人の判断待ち） |
| 17.2 | 段階1 で測定する項目 | **S Task 1・2・3** |
| 18.1 | 3 段階のロールバック | **S Task 6** |
| 18.2 | ロールバックが成立する前提 | **W Task 2・7** |
| 18.3 | ロールバック後の再開 | **S Task 6** |
| 18.4 | Cloudflare Pages 側のロールバック | **S Task 6** |
| 付録A GitHub | Secrets / Variables / 権限 / ブランチ保護 | **W Task 1・5・9** |
| 付録A Cloudflare | Worker・KV・D1・Cron 不要 | **S Task 4**／**W Task 9** |
| 付録A 新規ファイル | 実装時のファイル一覧 | F・A・W・S の Architecture |
| 付録B | 参照した外部情報 | 出典の記録（実装対象なし） |

### coverage の結果

| 区分 | 件数 |
|---|---:|
| 設計書の節（小節・段階・付録を含む） | **77** |
| いずれかの Task が担当 | **65** |
| 実装対象なし（Goal・出典・方針の記述） | **8** |
| **計画外（意図的に除外）** | **4**（段階2 / 段階3 / 段階4 / 17.1 未解決事項） |

**未対応の節は 0 件。**

### 今回の改訂（6 回目）で反映した指摘

| 指摘 | 反映先 |
|---|---|
| `promoteCandidate` が自動登録の印を付けず、週 3 件の上限が効かない | **F Task 15**（`src/lib/automation/sync/constants.ts` を新設し、`AUTO_REGISTERED_MARKER` / `autoRegisteredUsageNote` / `MANUFACTURER_PUBLISHERS` を 1 箇所に置く。`promoteCandidate` が作る `Source` の形を仕様・Produces・実装ステップへ明記し、印・Facts の参照先・人の Source に印を付けないことの 4 テストを追加）／**F Task 16**（`write-plan.ts` と `tests/factories/index.ts` の重複定義を削除し、`constants.ts` から import）／**F Task 17**（fixture ではなく実際に `promoteCandidate` を通す統合ケース 4 本。1 件で `registeredProductsThisWeek === 1` / `remainingProductsThisWeek === 2`、同週 3 件で残り 0、翌週で 3 に戻る、人の登録は数えない） |
| 併せて: 段階0 の未承認ポリシーでは S 判定のテストが 1 つも成立しない | **F Task 14**（`PipelineDeps` に `policies` を追加。`makePipelineDeps` の既定は `OFFICIAL_FETCH_POLICIES`＝未承認のまま）／**F Task 14・15**（S を期待するテストだけが `approvedAce` を注入。未承認なら B のままであるテストも追加） |

### 今回の改訂（5 回目）で反映した指摘

| 指摘 | 反映先 |
|---|---|
| 1. `AUTO_PUBLISH_PRODUCTS=off` の契約を全計画で統一 | **W Task 1**（動作表の `off` / `S` 行を `review` 保存へ直し、9 行の契約表と「`off` は自動公開停止であって作成停止ではない」節を追加。`SWITCH_CASES` の説明とテスト名も統一）／**F Task 16**（同じ契約であることを相互参照）／**F 付録 coverage 13.1**（担当 Task を追記）。計画2・計画4 に旧契約なし（記事側は `articleStatusFor`、段階0/1 は `AUTOMATION_ENABLED=false` で全書き込みが止まるため） |
| 2. `automation-apply-status.test.ts` の fixture を検証可能に | **F Task 1**（`makeCandidatePair(productId, status, checkedAt)` が全 Fact の `sourceId` を対の Source へ揃える。`seedMinimalDataset(rootDir)` が `dataset.json`／4 カテゴリの `products/`／`sources.json`／`merchants/` 2 本／`articles/` を作る。`readSeededDataset(rootDir)` で読み戻す）／**F Task 16**（`makeAutoRegisteredProduct` を `makeCandidatePair` へ委譲）／**F Task 17**（10 ケースの統合テストへ全面改訂。毎ケース `inspectCatalog(...).ok === true` を検査） |
| 3. 全ステップを 2〜5 分へ分割 | **F Task 2・3・4・7・9・12・16・17**／**W Task 1・7・8・9**／**A Task 2**／**S Task 2・4**（**6 分以上のステップを 0 件**にした） |

### 今回の改訂（4 回目）で反映した指摘

| 指摘 | 反映先 |
|---|---|
| 1. 取得ポリシーの引数が矛盾 | **F Task 13**（`isOfficialFetchApproved(id, policies = OFFICIAL_FETCH_POLICIES)` に統一。`resolveOfficialUrl` は受け取った `policies` をそのまま渡し、グローバルを直接参照しない。注入したポリシーを見ることを確かめるテストを追加） |
| 2. Task 13 が未来の型に依存 | **F Task 13**（`ResolveTarget` と `targetFromFields` だけを持ち、`CandidateDraft` を import しない）／**F Task 15**（`targetFromDraft` を `candidate.ts` へ移し、内部で `targetFromFields` を呼ぶ。依存は `candidate.ts` → `resolve-official.ts` の一方向） |
| 3. 商品が公開状態にならない | **F Task 16**（`WritePlan.productStatus: 'published' \| 'review' \| null` と `productStatusOf`。`off` と `S` 下の A は `review` で保存、B と再確認前 A は保存しない）／**F Task 17**（`applyWritePlans` が書き込み直前に `status` を `plan.productStatus` で上書きし、`null` なら products ファイルに触れない。S / 再確認済み A / B / 公開 off の 4 ケースを最終保存データの `status` まで検査する統合テスト `tests/automation-apply-status.test.ts`。**5 回目の改訂で 10 ケースへ拡張**） |

### 今回の改訂（3 回目）で反映した指摘

| 指摘 | 反映先 |
|---|---|
| 1. 停止スイッチが外部通信を止めていない | **F Task 17**（`gateMode` が `RakutenClient` 生成前に終了。`search`/`fetchOfficial` 呼び出し 0 回の注入テスト）／**A Task 6**（`gateArticleGeneration`・`articleStatusFor`） |
| 2. 公式ページ取得の承認を回避できる | **F Task 13**（`OFFICIAL_FETCH_POLICIES`・既定 `approved: false`。未承認なら既存 Source があっても決定的規則へもフォールバックしない） |
| 3. リコールの `clear` が危険 | **F Task 13**（`RecallCoverage`。`clear` は `exhaustive` のみ、`partial`/`unknown` の非一致は `unavailable`） |
| 4. 週 3 商品の関数仕様が矛盾 | **F Task 16**（`(products, sources, today)` の 3 引数に統一。テストも Product と Source を対で渡す） |
| 5. 商品 ID が衝突 | **F Task 15**（`productIdHash` を末尾に付与。色違い・日本語のみ・NFKC 表記違いのテスト） |
| 6. コード例がそのまま実装できない | **F Task 13・15**（`ResolveTarget` / `targetFromFields` / `targetFromDraft`・`candidateKey` の明文化）／**A Task 6**（import と fixture を自己完結に） |
| 追加: ブランド複数一致 | **F Task 15**（複数 `manufacturerId` にまたがったら `null`） |
| 追加: 重複キーの明文化 | **F Task 15**（`candidateKey` = `manufacturerId + model + 正規化 variant`） |
| 追加: 実装ステップの分割 | 全 40 Task。**10 分以上のステップを 0 件**にした |

### 今回の改訂（2 回目）で反映した指摘

| 指摘 | 反映先 |
|---|---|
| 1. 7 つの停止スイッチを実処理へ結線 | **W Task 1**（動作表・table-driven test・段階1 構成のテスト）／**F Task 16**（`buildWritePlan` が計画そのものを空にする） |
| 2. 新商品探索経路の具体化 | **F Task 15**（`buildCandidateFromRakutenItem` → `evaluateCandidate` → `promoteCandidate` → `buildProductId`）／**F Task 14**（`runExistingProduct` に分離） |
| 3. 新商品の週 3 件上限 | **F Task 16**（`remainingProductsThisWeek`。月曜 3 件で木曜 0 件・同日再実行・週跨ぎ・人の登録を数えない・B/A 候補を数えない） |
| 4. 旧仕様の残存除去 | **F Task 2**（`revertHistory`）／**A Task 6**（8 本で `true`）／**S Task 6**（workflow 6 本）／**W Task 5・8**（`automation-revert.yml` を作らない） |
| 5. 偽陽性テストと未定義参照 | **F Task 14**（早期 return を廃止し `expect(tier).toBe('A')`）／**A Task 3・4・5・6・7**（import と fixture を各 Task 内に明記） |
| 6. polling 時間の一致 | **W Task 9**（要素数 23・合計 1,200,000 ms・`POLL_TIMEOUT_MS`・`EXIT_CODE_TIMEOUT`） |
| 7. リコール確認と Source 関連付け | **F Task 13**（`RecallChecker`・`RECALL_SOURCES`・段階0 は常に `unavailable`／`factSourceIds` で商品の Facts が参照する Source だけを候補にする） |
| 8. Task 13 の分割 | **F Task 13〜17**（公式解決と取得／既存商品／新規候補／書き込み計画／CLI の 5 単位） |
