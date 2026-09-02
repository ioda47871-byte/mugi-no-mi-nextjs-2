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

### 仕様

- **すべての factory が、引数なしで呼んで `validate:content` を通る値を返す。**
- `over` で任意のフィールドだけを差し替えられる。
- **実在の紹介ID・資格情報を含めない。** `AFFILIATE_URL_FIXTURE` の ID 部は `0000test0.00000000.0000test1.00000000` とする。
- 商品の既定値は、現行データセットに実在する形（`model: 'クレスタ2 06936'`、`variant: '35L / 01 ブラックヘアライン'`）に合わせる。

### ステップ

- [ ] `makeProduct()` が `productSchema` を通る失敗テストを書く（4 分）
- [ ] `makeSource()` が `sourceSchema` を通る失敗テストを書く（3 分）
- [ ] `makeCatalog()` が `inspectCatalog` を `ok: true` で通る失敗テストを書く（5 分）
- [ ] `over` で差し替えたフィールドだけが変わる失敗テストを書く（3 分）
- [ ] `AFFILIATE_URL_FIXTURE` が `itemPageUrlFromAffiliateUrl` で `https://item.rakuten.co.jp/` を返す失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `tests/factories/index.ts` を実装する（12 分）
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
```

> `makeArticle().body` は `evaluatePublication` の 400 文字下限を満たすため 40 回繰り返す。
> `makeProduct().jan` は `null`（現行 23 件中 20 件が JAN を持たないため、既定を実態に合わせる）。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/factories.test.ts && npm run typecheck && npm run lint
```

### コミット

```
test(travel-goods-site): テスト用 fixture factory を追加

引数なしで検証を通る Product / Source / MerchantLink / Article / Catalog / RakutenItem を返す。
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
  itemCodeAlive: boolean;
  availability: 0 | 1 | null;      // null = 取得できなかった
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
- [ ] `schema.ts` を実装する（8 分）
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

### ステップ

- [ ] 同じ内容を 2 回書いたとき 2 回目が `'unchanged'` を返す失敗テストを書く（3 分）
- [ ] `entries` の順序が入れ替わっても `serializeLinkHealth` の出力が同一になる失敗テストを書く（`productId` 昇順ソート）（3 分）
- [ ] `serializeQueue` が `queuedAt` 昇順、同日は `targetId` 昇順でソートする失敗テストを書く（3 分）
- [ ] `readBudget` が前日の `budget.json` を渡されたとき、消費値を 0 にリセットし `circuitBreaker` は**引き継ぐ**失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `io.ts` を実装する（8 分）
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
    circuitBreaker: { state: 'open', trippedOn: '2026-09-01', reason: 'x', revertedShas: ['a'] },
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

### ステップ

- [ ] `remaining` が上限から消費を引いた値を返す失敗テストを書く（2 分）
- [ ] `canSpend` が残量ちょうどのとき `true`、1 超過で `false` を返す失敗テストを書く（3 分）
- [ ] `spend` が元の `BudgetFile` を変更しない（immutable）失敗テストを書く（3 分）
- [ ] `enqueue` が同一 `kind`+`targetId` で重複を作らず `attempts` を増やす失敗テストを書く（4 分）
- [ ] `dequeue` が `queuedAt` の古い順に `limit` 件だけ取り、残りを返す失敗テストを書く（4 分）
- [ ] `pruneQueue` が 60 日を超えた `candidate` を落とす失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `budget.ts` を実装する（8 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { canSpend, spend, DAILY_LIMITS } from '../src/lib/automation/budget';

const budget = {
  version: 1 as const, date: '2026-09-02', rakutenRequests: 28, workersAiNeurons: 0,
  browserSeconds: 0, pagesDeploysThisMonth: 0,
  circuitBreaker: { state: 'closed' as const, trippedOn: null, reason: null, revertedShas: [] },
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
- [ ] `hasExcludedTerm('【中古】スーツケース')` が `true` を返す失敗テストを書く（2 分）
- [ ] `matched: false` のとき `matchedVariantLabel` が `null` である失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `variant.ts` を実装する（10 分）
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
現行 23 商品の `variant` に実在する語）との照合。容量は `/(\d+(?:\.\d+)?)L/g`、
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
- [ ] `types.ts` と `registry.ts` を実装する。各アダプターの `extract` は Task 7・8 で実装するため、
      この Task では `{ ok: false, reason: 'no-spec-table' }` を返す（10 分）
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

- [ ] `ace-spec-table.html` を手で書く（上表の値。`<table class="spec">` を 1 つ持つ）（6 分）
- [ ] `aceAdapter.extract` が `weightG: 2900`、`outerSizeMm: [350, 550, 250]`、`capacityL: 35` を返す失敗テストを書く（4 分）
- [ ] 抽出結果が**登録済みの `Fact.value` と一致する**ことを本番データと突き合わせる失敗テストを書く（5 分）
- [ ] 容量の行を削ると `{ ok: false, reason: 'required-field-missing' }` を返す失敗テストを書く（3 分）
- [ ] `extractedRangeHash` がスペック表の外側を変えても同じ値を返す失敗テストを書く（4 分）
- [ ] `protecaAdapter` と `worldTravelerAdapter` が同じ抽出結果を返す失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `ace.ts` を実装し `registry.ts` を差し替える（12 分）
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
- [ ] `elecom.ts` と `anker.ts` を実装し `registry.ts` を差し替える（14 分）
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
- [ ] **17 個のブロッカーを table-driven で 1 つずつ反転**し、すべて `'B'` になる失敗テストを書く（8 分）
- [ ] 同じ 17 個を **A の入力に加えても**すべて `'B'` になる失敗テストを書く（5 分）
- [ ] `initialSelection: '6b-inferred'` でも `'S'` になる失敗テストを書く（3 分）
- [ ] `jan: 'published-but-mismatched'` は S でも A でもなく `'B'` になる失敗テストを書く（3 分）
- [ ] `recheck: 'not-yet'` の A 候補が `'B'` になる失敗テストを書く（3 分）
- [ ] `officialConsistency: 'unknown'` の A 候補が `'B'` になる失敗テストを書く（3 分）
- [ ] S の 9 条件を 1 つずつ崩すと `'S'` にならない失敗テストを書く（5 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `tier.ts` を実装する（14 分）
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

| 入力 | 次の状態 |
|---|---|
| `itemCodeAlive && availability === 1 && identifierMatch !== 'none' && variantMatch` | `healthy`。`consecutiveFailures = 0` |
| `availability === null`（API エラー・判定材料不足） | `uncertain`。**`consecutiveFailures` を増やさない** |
| `itemCodeAlive && availability === 0` | 表示維持。`consecutiveOutOfStock` を +1。14 日で `hidden` |
| `!itemCodeAlive` が 3 日連続 | `hidden` |
| `!itemCodeAlive` が 7 日連続 | `replace` |
| `identifierMatch === 'weak' && !variantMatch` | `manual-hold` |

`decideReplacement`:

- `isHumanVerifiedLink(link)` が `true` → `state === 'replace'` でも `{ action: 'pr-only', reason: 'human-verified' }`
- `state === 'replace'` かつ `candidateTier === 'S'` → `{ action: 'replace-now' }`
- `state === 'replace'` かつ `candidateTier === 'A'` → `{ action: 'replace-after-recheck' }`
- それ以外 → `{ action: 'hold', reason: ... }`

### ステップ

- [ ] `healthy` の入力で `consecutiveFailures` が 0 にリセットされる失敗テストを書く（3 分）
- [ ] `availability === null` のとき `uncertain` になり `consecutiveFailures` が**増えない**失敗テストを書く（4 分）
- [ ] `!itemCodeAlive` を 3 日連続で与えると 3 日目に `hidden` になる失敗テストを書く（4 分）
- [ ] 7 日連続で `replace` になる失敗テストを書く（3 分）
- [ ] `availability === 0` を 13 日続けても `hidden` にならず、14 日目に `hidden` になる失敗テストを書く（4 分）
- [ ] `identifierMatch: 'weak'` かつ `variantMatch: false` で `manual-hold` になる失敗テストを書く（3 分）
- [ ] `verified`+`visual` のリンクは `replace` でも `pr-only` になる失敗テストを書く（4 分）
- [ ] `replace` + 候補 S で `replace-now`、候補 A で `replace-after-recheck` になる失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `link-state.ts` を実装する（12 分）
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

`nextLinkState` は `signals.availability === null` を最初に判定して `uncertain` を返し、
`consecutiveFailures` を据え置く。それ以外は `itemCodeAlive` の連続不在日数と
`consecutiveOutOfStock` を更新してから、しきい値と比較して状態を決める。

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
- [ ] `category-expansion.ts` を実装する（8 分）
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

## Task 13: 統合 CLI（探索から書き込みまでを結ぶ）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/sync/resolve-official.ts` |
| 作成 | `travel-goods-site/src/lib/automation/sync/fetch-official.ts` |
| 作成 | `travel-goods-site/src/lib/automation/sync/pipeline.ts` |
| 作成 | `travel-goods-site/scripts/automation-sync.ts` |
| 変更 | `travel-goods-site/package.json`（`automation:sync` を追加） |
| 作成 | `travel-goods-site/tests/automation-pipeline.test.ts` |
| 作成 | `travel-goods-site/tests/automation-sync-cli.test.ts` |

### 既存 CLI を拡張するか、新規に作るか

**新規 CLI `scripts/automation-sync.ts` を作る。`scripts/rakuten-sync.ts` は変更しない。**

| 観点 | 理由 |
|---|---|
| 書き込み範囲が違う | 既存は `merchants/` と `datasets/production/candidates/` に書く。自動運用は **`candidates/` に書いてはいけない**（設計書 12.2 の許可パス外） |
| 判定が違う | 既存は `strong`/`weak` だけで判定する。自動運用は 17 ブロッカーの fail-closed 判定を使う |
| 既存の手動運用を壊さない | `rakuten-sync.ts` は目視確認リンクの保護など動作が確立しており、人が手で使い続ける |

両者は `RakutenClient`・`matchProduct`・`isHumanVerifiedLink` を共有する。

### Consumes / Produces

- Consumes: `RakutenClient`（既存）、`matchProduct` / `pickBestMatch` / `searchKeywordsFor` / `isHumanVerifiedLink`（既存）、`itemPageUrlFromAffiliateUrl`（既存）、`inspectCatalog`（既存）、`normalizeBrand` / `adapterFor`（Task 6〜8）、`verifyVariant` / `hasExcludedTerm`（Task 5）、`decideTier`（Task 9）、`nextLinkState` / `decideReplacement`（Task 10）、`readBudget` / `readQueue` / `readLinkHealth` / `writeIfChanged` / `serialize*`（Task 2・3）、`canSpend` / `spend` / `enqueue` / `dequeue`（Task 4）
- Produces:
  - `resolve-official.ts`: `export function resolveOfficialUrl(product: Product, sources: readonly Source[]): UrlResolution`
  - `fetch-official.ts`:
    - `export type OfficialFetcher = (url: string) => Promise<OfficialFetchOutcome>`
    - `export type OfficialFetchOutcome = { status: 'ok'; html: string } | { status: 'robots-denied' | 'http-blocked' | 'failed'; httpStatus: number | null }`
    - `export function createOfficialFetcher(options: { allowedHosts: readonly string[]; minIntervalMs: number; timeoutMs: number }): OfficialFetcher`
  - `pipeline.ts`:
    - `export type PipelineDeps = { search: (keyword: string) => Promise<RakutenItem[]>; fetchOfficial: OfficialFetcher; today: string }`
    - `export type ProductOutcome = { productId: string; tier: Tier; blockers: BlockerCode[]; link: MerchantLink | null; source: Source | null; spec: ExtractedSpec | null; queue: QueueEntry[] }`
    - `export async function runProduct(product: Product, catalog: Catalog, deps: PipelineDeps): Promise<ProductOutcome>`
  - CLI: `npm run automation:sync -- --mode links|discover|recheck [--apply] [--limit N] [--max-requests N] [--offline]`

### CLI の引数と動作

| 引数 | 既定 | 意味 |
|---|---|---|
| `--mode links` | ● | 登録済み商品の紹介URL取得とリンク健全性の更新 |
| `--mode discover` | | 楽天APIで新商品候補を集め、S/A/B 判定まで行う |
| `--mode recheck` | | 前日に `tier-a-recheck` へ積まれた候補を再取得して突き合わせる |
| `--apply` | なし（**dry-run**） | 書き込む。`--apply` が無ければ 1 バイトも書かない |
| `--limit N` | `3` | 1 回で扱う商品の上限（設計書 10.4 の「新商品は週 3 件まで」） |
| `--max-requests N` | `30` | 楽天APIの上限（設計書 10.2） |
| `--offline` | なし | 楽天APIとメーカー公式へ接続せず、ループバックのモックと fixture で通す |

### 書き込み先（`--apply` のときだけ）

| ファイル | 何を書くか |
|---|---|
| `datasets/production/products/<category>.json` | S は `status: 'published'`、A は `status: 'review'` で追記／更新 |
| `datasets/production/sources.json` | 公式ページの `Source`（`provenance: 'direct-fetch'`、`checkedAt`、`locator`） |
| `datasets/production/merchants/rakuten.json` | `MerchantLink`。`matchedVariant` は**販売ページ文言から抽出した値**（Task 5） |
| `automation/queue.json` | B 判定は `kind: 'candidate'`、A 判定は `kind: 'tier-a-recheck'` |
| `automation/link-health.json` | 6 信号と状態 |

**`datasets/production/candidates/` には書かない。**

書き込み前に必ず `inspectCatalog` を通し、`ok: false` なら**書き込みを中止して終了コード 1**。

### 段階0 の制約（Global Constraints 3・4 の反映）

- **楽天商品ページへの HTTP 取得を行わない。** `LinkSignals.httpStatus` は常に `null`。
- **Browser Rendering を使わない。** `initialSelection` は `'6b-inferred'` か `'none'` のどちらかで、
  `'6a-observed'` を返す経路を段階0 では作らない。
- メーカー公式の取得は、**その商品の出典の `automatedFetch === 'allowed'`** のときだけ行う。
  `'unverified'` / `'not-allowed'` は `officialFetchStatus: 'robots-denied'` ではなく
  **取得自体を行わず** `'failed'`（分類コード `source-not-permitted`）として扱う。
- `robots.txt` を取得し、対象 URL が `Disallow` に該当すれば `'robots-denied'`。
- 403 / 429 は `'http-blocked'`。**再試行の間隔を短くしない。User-Agent を変えない。**

### workflow からの呼び出し（計画3 が使う）

```bash
# automation-links.yml（毎日 JST 06:00）
npm run automation:sync -- --mode links --apply --limit 15 --max-requests 20

# automation-discover.yml（月・木 JST 06:30）
npm run automation:sync -- --mode discover --apply --limit 3 --max-requests 8

# automation-links.yml の後段（毎日）
npm run automation:sync -- --mode recheck --apply --limit 5 --max-requests 5
```

### ステップ

- [ ] `resolveOfficialUrl` が既存 `Source` を優先し、無ければアダプターの規則を使う失敗テストを書く（4 分）
- [ ] `automatedFetch !== 'allowed'` の出典しか無い商品で、**取得を試みない**失敗テストを書く（4 分）
- [ ] `createOfficialFetcher` が許可ホスト外の URL を拒否する失敗テストを書く（4 分）
- [ ] `runProduct` が `deps.fetchOfficial` の戻り値を `TierInput.officialFetchStatus` に写す失敗テストを書く（5 分）
- [ ] `runProduct` が段階0 では `initialSelection` に `'6a-observed'` を返さない失敗テストを書く（3 分）
- [ ] S 判定の商品で `link.matchedVariant` が**販売ページ文言から抽出した値**になる失敗テストを書く（5 分）
- [ ] B 判定の商品が `queue` に `kind: 'candidate'` を積み、`link` が `null` になる失敗テストを書く（4 分）
- [ ] A 判定の商品が `queue` に `kind: 'tier-a-recheck'` を積む失敗テストを書く（3 分）
- [ ] CLI が `--apply` なしで 1 バイトも書かない失敗テストを書く（5 分）
- [ ] CLI が `datasets/production/candidates/` を作らない失敗テストを書く（3 分）
- [ ] CLI が予算超過で終了コード 0（正常終了）になり、未処理分をキューに積む失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `resolve-official.ts` / `fetch-official.ts` / `pipeline.ts` / `automation-sync.ts` を実装する（25 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-pipeline.test.ts
import { describe, expect, it } from 'vitest';
import { runProduct, type PipelineDeps } from '../src/lib/automation/sync/pipeline';
import { resolveOfficialUrl } from '../src/lib/automation/sync/resolve-official';
import { makeCatalog, makeProduct, makeRakutenItem, makeSource } from './factories';

const okHtml = `<table class="spec">
<tr><th>本体重量</th><td>2.9kg</td></tr>
<tr><th>外寸</th><td>W35×H55×D25cm（ハンドル・キャスターを含む）</td></tr>
<tr><th>容量</th><td>35L</td></tr>
</table>`;

const deps = (over: Partial<PipelineDeps> = {}): PipelineDeps => ({
  search: async () => [makeRakutenItem()],
  fetchOfficial: async () => ({ status: 'ok', html: okHtml }),
  today: '2026-09-02',
  ...over,
});

describe('公式URLの解決', () => {
  it('既存 Source を優先する', () => {
    const product = makeProduct();
    const source = makeSource({ url: 'https://store.ace.jp/shop/g/g06936-01/' });
    expect(resolveOfficialUrl(product, [source]))
      .toEqual({ ok: true, url: 'https://store.ace.jp/shop/g/g06936-01/', basis: 'existing-source' });
  });

  it('automatedFetch が allowed でない出典は使わない', () => {
    const product = makeProduct();
    const source = makeSource({ automatedFetch: 'unverified' });
    expect(resolveOfficialUrl(product, [source])).toEqual({ ok: false, reason: 'no-existing-source' });
  });
});

describe('1 商品ぶんのパイプライン', () => {
  it('段階0 では 6a（実ブラウザ観測）を返さない', async () => {
    const outcome = await runProduct(makeProduct(), makeCatalog(), deps());
    expect(outcome.blockers).not.toContain('initial-selection-unknown');
    expect(outcome.tier === 'S' || outcome.tier === 'A').toBe(true);
  });

  it('公式が robots で拒否されたら B になる', async () => {
    const outcome = await runProduct(
      makeProduct(),
      makeCatalog(),
      deps({ fetchOfficial: async () => ({ status: 'robots-denied', httpStatus: null }) }),
    );
    expect(outcome.tier).toBe('B');
    expect(outcome.blockers).toContain('official-robots-denied');
    expect(outcome.link).toBeNull();
    expect(outcome.queue.map((q) => q.kind)).toContain('candidate');
  });

  it('403 は http-blocked として B になる', async () => {
    const outcome = await runProduct(
      makeProduct(),
      makeCatalog(),
      deps({ fetchOfficial: async () => ({ status: 'http-blocked', httpStatus: 403 }) }),
    );
    expect(outcome.blockers).toContain('official-http-blocked');
  });

  it('matchedVariant は販売ページ文言から抽出した値を使う', async () => {
    const outcome = await runProduct(makeProduct(), makeCatalog(), deps());
    if (outcome.link === null) throw new Error('リンクが作られていません');
    expect(outcome.link.matchedVariant).toContain('35L');
    expect(outcome.link.matchedVariant).toContain('ブラックヘアライン');
  });

  it('A 判定は再確認キューへ積む', async () => {
    const outcome = await runProduct(
      makeProduct({ jan: null }),
      makeCatalog(),
      deps(),
    );
    if (outcome.tier !== 'A') return;
    expect(outcome.queue.map((q) => q.kind)).toContain('tier-a-recheck');
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

const run = (args: string[]) =>
  execFileSync('npx', ['tsx', 'scripts/automation-sync.ts', ...args], {
    cwd: siteDir,
    encoding: 'utf8',
    env: { ...process.env, CATALOG_DATASET: 'production' },
  });

describe('automation:sync CLI', () => {
  it('--apply が無ければ 1 バイトも書かない', () => {
    run(['--mode', 'links', '--offline']);
    const status = execFileSync('git', ['status', '--short', 'datasets', 'automation'],
      { cwd: siteDir, encoding: 'utf8' });
    expect(status.trim()).toBe('');
  });

  it('candidates/ を作らない', () => {
    run(['--mode', 'discover', '--offline']);
    expect(fs.existsSync(path.join(siteDir, 'datasets/production/candidates'))).toBe(false);
  });

  it('不正な mode は終了コード 2 で止まる', () => {
    expect(() => run(['--mode', 'unknown', '--offline'])).toThrow();
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-pipeline.test.ts tests/automation-sync-cli.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/sync/pipeline
```

### 最小実装

`runProduct` は次の順で `TierInput` を組み立てて `decideTier` に渡す。

1. `normalizeBrand(product.brand)` → `manufacturerId`
2. `resolveOfficialUrl(product, catalog.sources)` → 失敗なら `officialFetchStatus: 'failed'`
3. `deps.fetchOfficial(url)` → `officialFetchStatus`
4. `adapterFor(id).extract(html)` → `extraction`
5. リコール告知ページの語検査 → `recallStatus`（取得できなければ `'unavailable'`）
6. `deps.search(keyword)` → `pickBestMatch` → `model` / `jan`
7. `verifyVariant(product.variant, itemName + itemCaption)` → `variant` と `matchedVariant`
8. `hasExcludedTerm(...)` → `excludedTerm`
9. `itemPageUrlFromAffiliateUrl(...)` → `affiliateUrl`
10. `variant.matched && conflicting.length === 0` → `initialSelection: '6b-inferred'`、それ以外は `'none'`
11. 既存商品との `brand`+`model`+`variant` 照合 → `duplicate`
12. 抽出仕様と販売ページ文言の突き合わせ → `officialConsistency`
13. `queue.json` の `tier-a-recheck` と突き合わせ → `recheck`

CLI は `flag()` / `has()` を既存 `scripts/rakuten-sync.ts` と同じ書き方で実装し、
ロックファイル（`.preview/automation-sync.lock`）で重複実行を防ぐ。

### 成功確認コマンド

```bash
cd travel-goods-site \
  && npx vitest run tests/automation-pipeline.test.ts tests/automation-sync-cli.test.ts \
  && CATALOG_DATASET=production npm run automation:sync -- --mode links --offline \
  && git -C .. status --short
```

期待: 終了コード 0。`git status --short` が `datasets/` と `automation/` に差分を出さない。

### コミット

```
feat(travel-goods-site): 探索から書き込みまでを結ぶ統合 CLI を追加

楽天API検索 → brand 正規化 → 公式URL解決 → robots 確認つきの取得 → 仕様抽出 →
variant 検査 → S/A/B 判定 → 24時間再確認 → 商品・出典・販売先リンク・キュー・
リンク健全性の更新までを 1 本で通す。既定は dry-run。

datasets/production/candidates/ には書かず、候補は automation/queue.json に持つ。
楽天商品ページの HTTP 取得と Browser Rendering は行わないため、
initialSelection は 6b か none のどちらかになる。
外部通信は注入する関数に閉じ込め、判定は純関数のままにする。
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
**この表は 4 計画に共通のもので、便宜上ここに置く。**

計画の略記: **F**＝foundation（本計画）／ **A**＝article-automation ／ **W**＝workflows ／ **S**＝shadow-rollout

| 節 | 内容 | 担当 |
|---|---|---|
| 1.1 | 目的 | 各計画の Goal（実装対象なし） |
| 1.2 | 採用する基本案 | 各計画の Architecture（実装対象なし） |
| 1.3 | **Workers AI の位置づけ** | **S Task 5**（`advisory.ts`。所見から公開可否を導く関数を export しない） |
| 1.4 | 非目的 | 各計画の「非対象」（実装対象なし） |
| 2.1 | すでに存在するもの | 全計画が Consumes として参照（実装対象なし） |
| 2.2 | 現行データの実測 | **F Task 6**（brand 7 種）／**F Task 11**（リンク 15 件）／**A Task 5**（記事 10 本） |
| 2.3 | 拡張が必要なもの | **F Task 10**（audit の欠陥）／**F Task 5**（`matchedVariant`）／**A Task 1**（`articleMetaSchema`） |
| 2.4 | 新規実装が必要なもの | F・A・W・S の全 Task |
| 2.5 | 設計を左右する外部事実 | **W Task 6**（`GITHUB_TOKEN` の制約）／各計画の Tech Stack |
| 3.1 | 役割分担 | **W Task 7・7**（Actions が主系）／**S Task 5**（補助） |
| 3.2 | データの流れ | **S Task 3**（通しの dry-run） |
| 3.3 | 縮退運転 | **S Task 3・4**（Browser Run は B へ、Workers AI は判定不変） |
| 4.1 | 信頼境界 | **W Task 3**（変更パス検査）／**S Task 1**（伏せ字検査） |
| 4.2 | 外部入力の扱い | **F Task 6・6**（本文全体を返さない契約）／**S Task 1**（レポートの伏せ字） |
| 4.3 | ブロックを迂回しない | **F Task 6**（`allowedHosts`）／**S Task 3**（403/429 を分類だけ記録） |
| 4.4 | `llmInput` と AI 利用の整合 | **S Task 5**（`input` 型がメーカー本文を受け取れない） |
| 5.1 | 全体の流れ | **S Task 3** |
| 5.2 | 対象メーカーとブランド正規化 | **F Task 6** |
| 5.3 | メーカー取得アダプター | **F Task 6・6・7** |
| 5.4 | 判定に使う信号 | **F Task 9**（`TierInput`） |
| 5.5 | **S / A / B 判定** | **F Task 9** |
| 5.6 | `matchedVariant` の扱い | **F Task 5** |
| 6.1 | カテゴリ拡張の方針 | **F Task 12**（`isKnownCategory`） |
| 6.2 | カテゴリ追加 PR の自動作成条件 | **F Task 12**（`evaluateCategoryExpansion`） |
| 6.3 | カテゴリ追加 PR の扱い | **F Task 12**（判定だけ返し PR を作らない）／**W Task 7**（discover が Draft PR を出す） |
| 7.1 | 記事の方針 | **A Task 4・6** |
| 7.2 | 商品数と形式の対応 | **A Task 4** |
| 7.3 | 記事構成プラグイン | **A Task 3・3** |
| 7.4 | 初期に有効化する形式 | **A Task 4** |
| 7.5 | `intentKey` と重複判定 | **A Task 5** |
| 7.6 | 生成 | **A Task 7** |
| 7.7 | **記事の自動検査（決定的 14）** | **A Task 6** |
| 7.8 | 再検査と自動非公開 | **A Task 8** |
| 7.9 | 旅行先別記事（将来） | **A Task 4**（`destination` の `eligibility` を常に false） |
| 7.10 | 測定条件に依存する比較軸 | **A Task 3・3** |
| 8.1 | リンク監視の現行の欠陥 | **F Task 10** |
| 8.2 | 6 つの信号 | **F Task 1**（`LinkSignals`）／**F Task 10** |
| 8.3 | 状態機械 | **F Task 10** |
| 8.4 | 代替リンクへの交換 | **F Task 10・10** |
| 9.1 | 状態ファイルの配置 | **F Task 1** |
| 9.2 | 内容と制約 | **F Task 1・2** |
| 9.3 | 監査と復元 | **W Task 8**（1 日 1 コミット）／**S Task 7**（runbook） |
| 10.1 | 公式に確認した上限 | 出典の記録（実装対象なし） |
| 10.2 | この設計の予算 | **F Task 4**（`DAILY_LIMITS`） |
| 10.3 | 楽天 30 req/日 の処理能力 | **F Task 4**／**S Task 3**（実測） |
| 10.4 | 現実的な処理規模 | **S Task 4**（集計で確認） |
| 10.5 | 補助が使えないときの扱い | **F Task 9**（6a/6b）／**S Task 5**（AI は判定不変） |
| 11.1 | workflow 構成 | **W Task 7・7・8**／**S Task 6** |
| 11.2 | スケジュール | **W Task 7** |
| 11.3 | 1 日の流れ | **W Task 7・7** |
| 11.4 | 上限と繰越 | **F Task 4**／**W Task 7** |
| 11.5 | 日次 workflow の競合対策 | **W Task 7**（concurrency・作業ブランチ・push 規則） |
| 12.1 | 自動反映の流れ | **W Task 8** |
| 12.2 | 変更パス検査 | **W Task 3** |
| 12.3 | CI が起動しない問題 | **W Task 6** |
| 12.4 | 公開後検査と自動 revert | **W Task 10** |
| 12.5 | 自動 revert の手順 | **W Task 5**（対象の妥当性）／**W Task 9**（revert workflow） |
| 12.6 | circuit breaker と 2 つの例外 | **W Task 4**（判定）／**W Task 9**（reset workflow）／**W Task 3**（reset 専用検査） |
| 13.1 | 停止スイッチ | **W Task 1** |
| 13.2 | 通知 | **W Task 10** |
| 14.1 | テストの原則 | 全 Task（失敗するテストを先に書く） |
| 14.2 | 追加する単体テスト | F・A・W の全 Task |
| 14.3 | **E2E** | **S Task 8** |
| 14.4 | dry-run | **S Task 3** |
| 15 段階0 | 実装とテスト | F・A・W・S のすべて |
| 15 段階1 | 7 日間の観察運転 | **S Task 3・3・5**（受け皿のみ。開始は人が別 PR で行う） |
| 15 段階2 | S 判定のみ自動公開 | **計画外**（有効化操作。`S Task 7` の runbook に手順だけ記載） |
| 15 段階3 | A 判定・記事・交換 | **計画外**（同上） |
| 15 段階4 | 本番公開 | **計画外**（同上） |
| 16 | 人間に残る作業 | **S Task 7**（runbook） |
| 17.0 | 決定済み事項 | **A Task 1**（自動レビュー契約）／**F Task 9**（`sizeBasis`）／**S Task 5**（AI） |
| 17.1 | 未解決事項 | **計画外**（人の判断待ち。`S Task 7` の runbook に一覧） |
| 17.2 | 段階1 で測定する項目 | **S Task 1・2・3**（`ObservationReport` の各フィールド） |
| 18.1 | 3 段階のロールバック | **S Task 7**（runbook） |
| 18.2 | ロールバックが成立する前提 | **W Task 3・7**（許可パスと 1 日 1 コミット） |
| 18.3 | ロールバック後の再開 | **S Task 7**（runbook） |
| 18.4 | Cloudflare Pages 側のロールバック | **S Task 7**（自動化しない方針を runbook に記載） |
| 付録A GitHub | Secrets / Variables / 権限 / ブランチ保護 | **W Task 1・5**／**W の「人が行う設定」** |
| 付録A Cloudflare | Worker・KV・D1・Cron 不要 | **S Task 5**（REST のみ。binding を作らない） |
| 付録A 新規ファイル | 実装時のファイル一覧 | F・A・W・S の Architecture |
| 付録B | 参照した外部情報 | 出典の記録（実装対象なし） |

### coverage の結果

| 区分 | 件数 |
|---|---:|
| 設計書の節（小節・段階・付録を含む） | **77** |
| いずれかの Task が担当 | **65** |
| 実装対象なし（Goal・出典・方針の記述） | **8**（1.1 / 1.2 / 1.4 / 2.1 / 10.1 / 14.1 / 付録B / 付録A 新規ファイル一覧） |
| **計画外（意図的に除外）** | **4**（段階2 / 段階3 / 段階4 / 17.1 未解決事項） |

**未対応の節は 0 件。**
「計画外」の 4 件は、いずれも**段階2 以降の有効化操作**と**人の判断待ち**であり、
段階0 の計画に混ぜてはならないものである（手順だけ `S Task 7` の runbook に書く）。
