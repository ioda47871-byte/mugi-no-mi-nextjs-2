# 実装計画 2/4: 記事の自動生成と検査

## Goal

検証済みの `Fact` だけから比較記事を**決定的に組み立て**、
**14 項目の決定的検査**を通ったものだけを自動公開できる状態にする。
記事構成は後から追加できるプラグイン方式にし、構成の追加はコード PR でのみ行えるようにする。

この計画が終わった時点で、`npm run article:generate -- --dry-run` が
「今日生成できる記事の候補と、それぞれが 14 検査を通るか」を外部通信なしで出力できる。

## Architecture

```
travel-goods-site/src/lib/article-formats/
  types.ts           … ArticleFormatPlugin 契約
  registry.ts        … formatId → プラグイン。eligibility の一括評価
  selections.ts      … ○選
  comparison.ts      … 2商品以上の比較・条件別比較
  purpose-guide.ts   … 目的別・選び方ガイド
  trip-duration.ts   … 旅行日数別
  spec-explainer.ts  … 1商品の仕様解説
  destination.ts     … 旅行先別（登録するが eligibility は常に false）

travel-goods-site/src/lib/automation/
  article-checks.ts  … 決定的 14 検査
  article-build.ts   … 本文の組み立て（テンプレート）
  intent.ts          … intentKey の組み立てと重複判定

travel-goods-site/scripts/
  article-generate.ts … CLI。既定は dry-run
```

## Tech Stack

- TypeScript 5.9（`strict`）
- Zod 3（`articleMetaSchema` の拡張）
- Vitest 3
- `tsx`（CLI 実行。既存の `scripts/*.ts` と同じ）

## Spec へのパス

`docs/superpowers/specs/2026-09-02-travel-goods-automation-design.md`

対応節: 2.3（`articleMetaSchema`）/ 7.1 / 7.2 / 7.3 / 7.4 / 7.5 / 7.6 / 7.7 / 7.8 / 7.9 / 7.10 / 12.2（許可パス）/ 14.2 / 17.0

## 他の計画書との依存順

| 順 | 計画 | この計画との関係 |
|---:|---|---|
| 1 | `2026-09-02-travel-goods-automation-foundation.md` | **前提。** 本計画の Task 6 が `readQueue` / `enqueue` を使う |
| **2** | **本計画（article-automation）** | — |
| 3 | `2026-09-02-travel-goods-workflows.md` | `automation-articles.yml` が本計画の CLI を呼ぶ |
| 4 | `2026-09-02-travel-goods-shadow-rollout.md` | 段階0 の統合検証 |

**計画1 の Task 1〜3（状態スキーマ・IO・予算）が完了してから着手する。**
計画1 の Task 4〜10 とは並行して進められる。

## Global Constraints

1. **記事データを変更しない。** `datasets/production/articles/` の既存 10 ファイルに触らない。
   CLI は既定 dry-run とし、`--apply` を付けたときだけ新規ファイルを作る。
2. **AI を判定に使わない。** 本計画のコードは Workers AI を呼ばない。
   参考所見の生成は計画3 の workflow 側で行い、その結果は本計画の関数へ渡さない（設計書 1.3）。
3. **`articleMetaSchema` の拡張は 1 Task に閉じる。**（Task 1）
4. **新しい記事形式の追加はコード PR。** 自動処理がプラグインを追加できてはならない。
5. 各 Task は失敗するテストを先に書く。
6. コミットは Task 単位。
7. `npm run typecheck && npm run lint && npm test && npm run validate:content:all` が各 Task 終了時に成功すること。

## 完了条件

- [ ] `npm run typecheck` 成功
- [ ] `npm run lint` 成功
- [ ] `npm test` 成功。テスト件数が計画1 完了時点から **+62 件以上**
- [ ] `npm run validate:content:all` 成功（既存 10 記事が新スキーマでも通る）
- [ ] `CATALOG_DATASET=production npx tsx scripts/article-generate.ts --dry-run` が終了コード 0 で候補一覧を出力する
- [ ] `datasets/` に差分がない

## 非対象

- 記事の実際の自動公開（workflow は計画3）
- Workers AI による参考所見の生成（計画3）
- 旅行先別記事の有効化（`destination.ts` は登録のみ。`eligibility` は常に `false`）
- 記事の再検査の定期実行（計画3 の `automation-articles.yml`）

---

## Task 1: 記事メタの拡張（formatId / formatVersion / reviewMethod）

### 対象ファイル

| 種別 | パス |
|---|---|
| 変更 | `travel-goods-site/src/lib/catalog/types.ts` |
| 変更 | `travel-goods-site/src/lib/catalog/schema.ts` |
| 変更 | `travel-goods-site/src/lib/content/publication.ts` |
| 変更 | `travel-goods-site/tests/publication.test.ts` |
| 作成 | `travel-goods-site/tests/article-meta.test.ts` |

### Consumes / Produces

- Consumes: 既存 `ArticleMeta`, `articleMetaSchema`, `evaluatePublication`
- Produces:
  - `export const ARTICLE_FORMAT_IDS = ['selections', 'comparison', 'purpose-guide', 'trip-duration', 'spec-explainer', 'destination'] as const`
  - `export type ArticleFormatId = (typeof ARTICLE_FORMAT_IDS)[number]`
  - `export const REVIEW_METHODS = ['human', 'derived-from-verified-facts'] as const`
  - `export type ReviewMethod = (typeof REVIEW_METHODS)[number]`
  - `ArticleMeta` に追加: `formatId: ArticleFormatId | null`, `formatVersion: number | null`, `reviewMethod: ReviewMethod | null`
  - `evaluatePublication` が `reviewMethod: 'derived-from-verified-facts'` のとき `reviewer` に `automation:<formatId>@<formatVersion>` 形式を要求する

### 仕様（設計書 7.3・17.0 に対応）

- **既存 10 記事は 3 フィールドすべて `null`（未指定）でも検証を通る。** 後方互換を壊さない。
- `reviewMethod === 'derived-from-verified-facts'` のときだけ、
  `reviewer` が `/^automation:(selections|comparison|purpose-guide|trip-duration|spec-explainer|destination)@\d+$/` に一致することを要求する。
- `reviewMethod === 'human'` または `null` のときは従来どおり `reviewer` は任意の文字列でよい。
- `formatId` が非 `null` なら `formatVersion` も非 `null`（両方揃うか両方 `null`）。

### ステップ

- [ ] 既存 10 記事が新スキーマで通ることを確認する失敗テストを書く（`validate:content:all` 相当を vitest から）（4 分）
- [ ] `formatId` だけ指定して `formatVersion` を省くとスキーマが拒否する失敗テストを書く（3 分）
- [ ] `reviewMethod: 'derived-from-verified-facts'` かつ `reviewer: '編集部'` が `evaluatePublication` で不合格になる失敗テストを書く（4 分）
- [ ] `reviewMethod: 'derived-from-verified-facts'` かつ `reviewer: 'automation:comparison@1'` が合格する失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `types.ts` に定数と型を追加する（3 分）
- [ ] `schema.ts` の `articleMetaSchema` に 3 フィールドを `.nullable().default(null)` で追加し、`.superRefine` で組み合わせを検査する（5 分）
- [ ] `publication.ts` の `evaluatePublication` に `reviewer` 形式の検査を足す（4 分）
- [ ] `npm run validate:content:all` が通ることを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/article-meta.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { articleMetaSchema } from '../src/lib/catalog/schema';
import { evaluatePublication } from '../src/lib/content/publication';
import { makeArticle, makeCatalog } from './factories';

const here = path.dirname(fileURLToPath(import.meta.url));

/** ArticleMeta の最小形（body を除いたもの）。 */
function metaFixture(over: Record<string, unknown> = {}) {
  const { body: _body, ...meta } = makeArticle();
  return { ...meta, formatId: null, formatVersion: null, reviewMethod: null, ...over };
}

describe('記事メタの拡張', () => {
  it('3 フィールドすべて null なら通る（既存 10 記事の後方互換）', () => {
    expect(articleMetaSchema.safeParse(metaFixture()).success).toBe(true);
  });

  it('formatId だけ指定して formatVersion を省けない', () => {
    expect(articleMetaSchema.safeParse(metaFixture({ formatId: 'comparison', formatVersion: null })).success)
      .toBe(false);
    expect(articleMetaSchema.safeParse(metaFixture({ formatId: null, formatVersion: 1 })).success)
      .toBe(false);
    expect(articleMetaSchema.safeParse(metaFixture({ formatId: 'comparison', formatVersion: 1 })).success)
      .toBe(true);
  });

  it('既存 10 記事のファイルが新スキーマを通る', () => {
    const dir = path.join(here, '../datasets/production/articles');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    expect(files).toHaveLength(10);
  });
});

describe('自動レビューの reviewer 形式', () => {
  const catalog = makeCatalog();

  it('derived-from-verified-facts では automation:<formatId>@<version> を要求する', () => {
    const article = makeArticle({
      reviewMethod: 'derived-from-verified-facts',
      reviewer: '編集部',
      formatId: 'comparison',
      formatVersion: 1,
    });
    const verdict = evaluatePublication(article, catalog);
    expect(verdict.ok).toBe(false);
    expect(verdict.reasons.join(' ')).toContain('automation:');
  });

  it('正しい形式なら通る', () => {
    const article = makeArticle({
      reviewMethod: 'derived-from-verified-facts',
      reviewer: 'automation:comparison@1',
      formatId: 'comparison',
      formatVersion: 1,
    });
    expect(evaluatePublication(article, catalog).ok).toBe(true);
  });

  it('人のレビュー（reviewMethod: null）は従来どおり任意の文字列でよい', () => {
    expect(evaluatePublication(makeArticle({ reviewer: '編集部' }), catalog).ok).toBe(true);
  });
});
```

### 既存 10 記事の移行方針（legacy 経路）

**既存記事のファイルを書き換えない。** 3 フィールドは `null` のままにする。

| slug | `formatId` | `formatVersion` | `reviewMethod` | 扱い |
|---|---|---|---|---|
| `suitcase-under-3kg` | `null` | `null` | `null` | legacy |
| `suitcase-capacity-weight` | `null` | `null` | `null` | legacy |
| `suitcase-stopper` | `null` | `null` | `null` | legacy |
| `backpack-lightweight-specs` | `null` | `null` | `null` | legacy |
| `backpack-2n3d-choose` | `null` | `null` | `null` | legacy（下書き） |
| `pouch-size-weight-compartments` | `null` | `null` | `null` | legacy |
| `toiletry-pouch-choose` | `null` | `null` | `null` | legacy（下書き） |
| `power-bank-specs` | `null` | `null` | `null` | legacy |
| `charging-kit-lighter` | `null` | `null` | `null` | legacy |
| `packing-list-2n3d` | `null` | `null` | `null` | legacy（下書き） |

**legacy 経路の定義**:

- `reviewMethod !== 'derived-from-verified-facts'` の記事は **legacy** とする。
- legacy には `evaluatePublication` の従来の検査だけを適用する。
- **legacy は自動非公開の対象にしない**（Task 7）。
- **新規の自動生成記事の 14 検査は 1 つも弱めない。** legacy 経路は
  「既存記事を壊さないための後方互換」であって、自動生成記事の逃げ道ではない。
- 将来 legacy を移行する場合は、**人がコード PR で `formatId` を付ける**。
  自動処理が既存記事に `formatId` を書き込むことは禁止する。

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/article-meta.test.ts tests/publication.test.ts
```

### 期待する失敗内容

```
AssertionError: expected true to be false   // formatVersion なしが通ってしまう
```

### 最小実装

`articleMetaSchema` に
`formatId: z.enum(ARTICLE_FORMAT_IDS).nullable().default(null)`、
`formatVersion: z.number().int().min(1).nullable().default(null)`、
`reviewMethod: z.enum(REVIEW_METHODS).nullable().default(null)` を追加し、
`.superRefine((v, ctx) => { if ((v.formatId === null) !== (v.formatVersion === null)) ctx.addIssue(...) })`。

### 成功確認コマンド

```bash
cd travel-goods-site && npm run validate:content:all && npx vitest run tests/article-meta.test.ts && npm run typecheck
```

### コミット

```
feat(travel-goods-site): 記事メタに formatId / formatVersion / reviewMethod を追加

自動生成記事を別種のレビューとして記録できるようにする。
既存 10 記事は 3 フィールドすべて null のまま検証を通る。
derived-from-verified-facts のときだけ reviewer の形式を要求する。
```

---

## Task 2: 記事構成プラグインの契約と registry

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/article-formats/types.ts` |
| 作成 | `travel-goods-site/src/lib/article-formats/registry.ts` |
| 作成 | `travel-goods-site/tests/article-formats-registry.test.ts` |

### Consumes / Produces

- Consumes: `Product`, `Catalog`, `ArticleFormatId` from `@/lib/catalog/types`
- Produces:
  - `export type ComparisonAxis = 'weight' | 'capacity' | 'outer-size' | 'carry-on' | 'features'`
  - `export const MEASUREMENT_DEPENDENT_AXES: readonly ComparisonAxis[]`（`outer-size`, `carry-on`）
  - `export type ArticleContext = { category: Category | 'packing'; axis: ComparisonAxis; tripNights: number | null; domestic: boolean | null; transport: 'air' | 'rail' | null; purpose: string | null }`
  - `export type ArticleFormatPlugin = { formatId: ArticleFormatId; formatVersion: number; minProducts: number; maxProducts: number; requiredSpecs: readonly ('weightG'|'capacityL'|'outerSizeMm')[]; forbiddenExpressions: readonly string[]; eligibility(catalog: Catalog, ctx: ArticleContext): boolean; selectProducts(catalog: Catalog, ctx: ArticleContext): Product[]; buildTitle(ctx: ArticleContext, products: Product[]): string; outline(ctx: ArticleContext, products: Product[]): string[]; validate(body: string, products: Product[], ctx: ArticleContext): string[] }`
  - `export function getPlugin(id: ArticleFormatId): ArticleFormatPlugin`
  - `export function eligiblePlugins(catalog: Catalog, ctx: ArticleContext): ArticleFormatPlugin[]`
  - `export const FORMAT_REGISTRY: Readonly<Record<ArticleFormatId, ArticleFormatPlugin>>`

### 仕様（設計書 7.3・7.10 に対応）

- `selectProducts` は **`axis` が `MEASUREMENT_DEPENDENT_AXES` に含まれるとき、
  `sizeBasis === 'unspecified'` の商品を除外する。**
- 除外の結果 `minProducts` を下回ったら `eligibility` が `false` を返す。
- `forbiddenExpressions` は全プラグイン共通の基本セット
  （`おすすめ` `最強` `一番` `必ず` `人気` `ベスト` `決定版`）＋形式固有。

### ステップ

- [ ] `FORMAT_REGISTRY` が 6 形式すべてを持つ失敗テストを書く（2 分）
- [ ] `MEASUREMENT_DEPENDENT_AXES` が `['outer-size','carry-on']` である失敗テストを書く（2 分）
- [ ] `getPlugin('comparison').formatVersion` が `1` である失敗テストを書く（2 分）
- [ ] `eligiblePlugins` が `destination` を返さない失敗テストを書く（3 分）
- [ ] すべてのプラグインの `forbiddenExpressions` が共通セットを含む失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `types.ts` と `registry.ts` を実装する。各プラグインは Task 3 で実装するのでスタブでよい（`eligibility` は `false` を返す）（8 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { FORMAT_REGISTRY, getPlugin, MEASUREMENT_DEPENDENT_AXES } from '../src/lib/article-formats/registry';

it('6 形式すべてが登録されている', () => {
  expect(Object.keys(FORMAT_REGISTRY).sort()).toEqual([
    'comparison', 'destination', 'purpose-guide', 'selections', 'spec-explainer', 'trip-duration',
  ]);
});

it('測定条件に依存する比較軸は外寸と機内持込', () => {
  expect(MEASUREMENT_DEPENDENT_AXES).toEqual(['outer-size', 'carry-on']);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/article-formats-registry.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/article-formats/registry
```

### 最小実装

`types.ts` に型だけ。`registry.ts` に 6 つのスタブプラグインと `FORMAT_REGISTRY`。
`COMMON_FORBIDDEN` を定数として切り出し、各プラグインが展開する。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/article-formats-registry.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 記事構成プラグインの契約と registry を追加

formatId ごとに必要商品数・必須仕様・禁止表現・商品選定・専用検証を持たせる。
測定条件に依存する比較軸（外寸・機内持込）を定数として定義する。
```

---

## Task 3: 初期 5 形式の実装

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/article-formats/comparison.ts` |
| 作成 | `travel-goods-site/src/lib/article-formats/selections.ts` |
| 作成 | `travel-goods-site/src/lib/article-formats/trip-duration.ts` |
| 作成 | `travel-goods-site/src/lib/article-formats/purpose-guide.ts` |
| 作成 | `travel-goods-site/src/lib/article-formats/spec-explainer.ts` |
| 作成 | `travel-goods-site/src/lib/article-formats/destination.ts` |
| 変更 | `travel-goods-site/src/lib/article-formats/registry.ts`（スタブを差し替え） |
| 作成 | `travel-goods-site/tests/article-formats-plugins.test.ts` |

### Consumes / Produces

- Consumes: `ArticleFormatPlugin` from `./types`
- Produces: `comparisonPlugin`, `selectionsPlugin`, `tripDurationPlugin`, `purposeGuidePlugin`, `specExplainerPlugin`, `destinationPlugin`

### 仕様（設計書 7.2・7.4・7.9・7.10 に対応）

| プラグイン | `minProducts` | `maxProducts` | `formatVersion` |
|---|---:|---:|---:|
| `spec-explainer` | 1 | 1 | 1 |
| `comparison` | 2 | 12 | 1 |
| `selections` | 3 | 5 | 1 |
| `trip-duration` | 2 | 8 | 1 |
| `purpose-guide` | 2 | 8 | 1 |
| `destination` | 2 | 8 | 1 |

- `destinationPlugin.eligibility` は**常に `false` を返す**（設計書 7.9）。
- `selectProducts` は**順位を付けない**。役割（軽さ・容量・拡張性）でグループ分けし、
  各グループから 1 件ずつ選ぶ。同点なら `product.id` の昇順で決定的に選ぶ。
- **無理に件数を合わせるための商品追加はしない。** 対象が `minProducts` に満たなければ空配列を返す。

### ステップ

- [ ] `destinationPlugin.eligibility` が常に `false` を返す失敗テストを書く（2 分）
- [ ] `comparisonPlugin` が `axis: 'outer-size'` のとき `sizeBasis: 'unspecified'` の商品を除外する失敗テストを書く（5 分）
- [ ] `comparisonPlugin` が `axis: 'weight'` のときは `unspecified` を除外しない失敗テストを書く（4 分）
- [ ] 除外の結果 2 件未満になったら `eligibility` が `false` を返す失敗テストを書く（4 分）
- [ ] `selectProducts` が同じ入力で常に同じ順序を返す（決定的）失敗テストを書く（3 分）
- [ ] `selectionsPlugin` が 3〜5 件のときだけ `eligibility: true` を返す失敗テストを書く（4 分）
- [ ] `specExplainerPlugin` が 1 件で `eligibility: true` を返す失敗テストを書く（3 分）
- [ ] `buildTitle` が禁止表現を含まない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] 6 ファイルを実装し、`registry.ts` を差し替える（18 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/article-formats-plugins.test.ts
import { describe, expect, it } from 'vitest';
import { comparisonPlugin } from '../src/lib/article-formats/comparison';
import { destinationPlugin } from '../src/lib/article-formats/destination';
import { selectionsPlugin } from '../src/lib/article-formats/selections';
import { specExplainerPlugin } from '../src/lib/article-formats/spec-explainer';
import type { ArticleContext } from '../src/lib/article-formats/types';
import { makeCatalog, makeProduct } from './factories';

const ctx: ArticleContext = {
  category: 'suitcases', axis: 'weight',
  tripNights: null, domestic: null, transport: null, purpose: null,
};

/** sizeBasis を指定した商品を n 件作る。 */
function suitcases(specified: number, unspecified: number) {
  const products = [
    ...Array.from({ length: specified }, (_, i) =>
      makeProduct({ id: `spec-${i}`, sizeBasis: 'with-handle-and-wheels' })),
    ...Array.from({ length: unspecified }, (_, i) =>
      makeProduct({ id: `unspec-${i}`, sizeBasis: 'unspecified' })),
  ];
  return makeCatalog({ products, articles: [], merchantLinks: [] });
}

describe('記事構成プラグイン', () => {
  it('旅行先別は初期は常に無効', () => {
    expect(destinationPlugin.eligibility(suitcases(4, 0), ctx)).toBe(false);
  });

  it('外寸を比較軸にするとき sizeBasis: unspecified を除外する', () => {
    const picked = comparisonPlugin.selectProducts(suitcases(2, 3), { ...ctx, axis: 'outer-size' });
    expect(picked).toHaveLength(2);
    expect(picked.every((p) => p.sizeBasis !== 'unspecified')).toBe(true);
  });

  it('重量を比較軸にするときは除外しない', () => {
    const picked = comparisonPlugin.selectProducts(suitcases(2, 3), { ...ctx, axis: 'weight' });
    expect(picked).toHaveLength(5);
  });

  it('除外の結果 2 件未満になれば生成しない', () => {
    expect(comparisonPlugin.eligibility(suitcases(1, 4), { ...ctx, axis: 'outer-size' })).toBe(false);
    expect(comparisonPlugin.eligibility(suitcases(2, 4), { ...ctx, axis: 'outer-size' })).toBe(true);
  });

  it('商品選定は同じ入力で常に同じ順序を返す', () => {
    const catalog = suitcases(5, 0);
    const first = comparisonPlugin.selectProducts(catalog, ctx).map((p) => p.id);
    const second = comparisonPlugin.selectProducts(catalog, ctx).map((p) => p.id);
    expect(second).toEqual(first);
  });

  it('○選は 3〜5 件のときだけ成立する', () => {
    expect(selectionsPlugin.eligibility(suitcases(2, 0), ctx)).toBe(false);
    expect(selectionsPlugin.eligibility(suitcases(3, 0), ctx)).toBe(true);
    expect(selectionsPlugin.eligibility(suitcases(5, 0), ctx)).toBe(true);
  });

  it('仕様解説は 1 件で成立する', () => {
    expect(specExplainerPlugin.eligibility(suitcases(1, 0), ctx)).toBe(true);
    expect(specExplainerPlugin.minProducts).toBe(1);
  });

  it('タイトルに禁止表現を含めない', () => {
    const catalog = suitcases(4, 0);
    const title = comparisonPlugin.buildTitle(ctx, comparisonPlugin.selectProducts(catalog, ctx));
    for (const term of comparisonPlugin.forbiddenExpressions) {
      expect(title).not.toContain(term);
    }
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/article-formats-plugins.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/article-formats/comparison
```

### 最小実装

各プラグインは `eligibility` → `selectProducts` の結果件数を見るだけの薄い実装。
`selectProducts` は
`catalog.products.filter(p => p.status === 'published' && p.category === ctx.category)`
→ 必須仕様が非 `null` で絞る
→ `MEASUREMENT_DEPENDENT_AXES.includes(ctx.axis)` なら `sizeBasis !== 'unspecified'` で絞る
→ `id` 昇順にソート → `maxProducts` で切る。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/article-formats-plugins.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 記事構成プラグイン 6 形式を実装

測定条件に依存する比較軸では sizeBasis: unspecified の商品を対象外にする。
商品選定は順位を付けず役割で分け、同じ入力で常に同じ順序を返す。
旅行先別は登録するが eligibility が常に false を返す。
```

---

## Task 4: intentKey の組み立てと重複判定

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/intent.ts` |
| 作成 | `travel-goods-site/tests/automation-intent.test.ts` |

### Consumes / Produces

- Consumes: `ArticleContext` from `@/lib/article-formats/types`、`Article` from `@/lib/catalog/types`
- Produces:
  - `export function buildIntentKey(ctx: ArticleContext): string`
  - `export function triGramJaccard(a: string, b: string): number`
  - `export const SIMILARITY_THRESHOLD: 0.6`
  - `export type DuplicateVerdict = { duplicate: false } | { duplicate: true; reason: 'intent-key' | 'body-similarity' | 'same-products-and-axis'; against: string }`
  - `export function checkDuplicate(candidate: { intentKey: string; body: string; productIds: string[]; axis: ComparisonAxis }, existing: Article[]): DuplicateVerdict`

### 仕様（設計書 7.5 に対応）

`buildIntentKey` は `{カテゴリ}-{比較軸}-{旅行日数}-{国内海外}-{移動手段}-{目的}` を
`-` で連結し、該当しない軸は省略する。すべて小文字英数とハイフンのみ
（`articleMetaSchema` の `intentKey` 正規表現 `/^[a-z0-9][a-z0-9-]{1,63}$/` を満たす）。

重複判定は 3 つ:

1. `intentKey` が既存記事のいずれかと一致 → `'intent-key'`
2. 本文の 3-gram Jaccard 係数が **0.60 以上** → `'body-similarity'`
3. 「対象商品 ID 集合 × 比較軸集合」が既存記事と完全一致 → `'same-products-and-axis'`

**同じ商品でも、旅行先・日数・移動手段・目的・カテゴリ・比較軸が異なれば別記事としてよい。**

### ステップ

- [ ] `buildIntentKey({category:'suitcases', axis:'weight', tripNights:null, ...})` が `'suitcases-weight'` を返す失敗テストを書く（3 分）
- [ ] 旅行日数と移動手段を含む場合に `'suitcases-capacity-2n3d-domestic-air'` を返す失敗テストを書く（3 分）
- [ ] 生成した `intentKey` が `articleMetaSchema` の正規表現を満たす失敗テストを書く（3 分）
- [ ] 同一文字列の `triGramJaccard` が `1` を返す失敗テストを書く（2 分）
- [ ] 既存 10 記事の相互 Jaccard がすべて 0.60 未満である失敗テストを書く（実データで閾値の妥当性を固定）（5 分）
- [ ] `intentKey` 一致で `'intent-key'` を返す失敗テストを書く（3 分）
- [ ] 商品集合と比較軸が同一で `'same-products-and-axis'` を返す失敗テストを書く（4 分）
- [ ] 商品が同じでも比較軸が違えば重複でない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `intent.ts` を実装する（10 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { buildIntentKey, triGramJaccard, checkDuplicate, SIMILARITY_THRESHOLD } from '../src/lib/automation/intent';

it('該当しない軸は省略する', () => {
  expect(buildIntentKey({
    category: 'suitcases', axis: 'weight', tripNights: null,
    domestic: null, transport: null, purpose: null,
  })).toBe('suitcases-weight');
});

it('既存 10 記事は相互に閾値未満（誤検出しない）', () => {
  for (const a of articles) for (const b of articles) {
    if (a.slug === b.slug) continue;
    expect(triGramJaccard(a.body, b.body)).toBeLessThan(SIMILARITY_THRESHOLD);
  }
});

it('商品が同じでも比較軸が違えば重複でない', () => {
  const v = checkDuplicate({ intentKey: 'suitcases-capacity', body: '…', productIds: ids, axis: 'capacity' }, existing);
  expect(v.duplicate).toBe(false);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-intent.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/intent
```

### 最小実装

3-gram は `new Set([...body].map((_, i) => body.slice(i, i + 3)).filter(g => g.length === 3))` で作り、
`|A∩B| / |A∪B|` を計算する。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-intent.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): intentKey の組み立てと 3 種の重複判定を追加

検索意図・本文類似度・商品集合×比較軸の 3 つで重複を判定する。
既存 10 記事が閾値 0.60 で誤検出されないことを実データで固定する。
```

---

## Task 5: 決定的 14 検査

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/article-checks.ts` |
| 作成 | `travel-goods-site/tests/automation-article-checks.test.ts` |

### Consumes / Produces

- Consumes: `Article`, `Catalog` from `@/lib/catalog/types`、`evaluatePublication`、`checkDuplicate`、`getPlugin`
- Produces:
  - `export const ARTICLE_CHECK_IDS = ['numbers-exist', 'identifiers-match', 'source-per-number', 'no-filled-nulls', 'no-experience-claims', 'no-superlatives', 'table-body-consistent', 'intent-key-unique', 'body-not-similar', 'products-published', 'min-two-products', 'no-placeholders', 'publication-verdict', 'plugin-validate'] as const`（**14 個**）
  - `export type ArticleCheckId = (typeof ARTICLE_CHECK_IDS)[number]`
  - `export type ArticleCheckResult = { id: ArticleCheckId; ok: boolean; detail: string }`
  - `export function runArticleChecks(article: Article, catalog: Catalog, existing: Article[]): ArticleCheckResult[]`
  - `export function isPublishable(results: ArticleCheckResult[]): boolean`（**全 14 件が `ok` のときだけ `true`**）
  - `export const EXPERIENCE_TERMS: readonly string[]`（`使ってみた` `持ち歩いた` `試した` `実際に使う` `愛用`）
  - `export const SUPERLATIVE_TERMS: readonly string[]`（`最強` `一番` `必ず` `おすすめ` `人気` `ベスト` `決定版`）

### 仕様（設計書 7.7 に対応）

**`runArticleChecks` は Workers AI を呼ばない。引数にも AI の出力を取らない。**
公開判定は 14 項目の決定的検査だけで決まる。

| # | `id` | 内容 |
|---:|---|---|
| 1 | `numbers-exist` | 本文中の全数値が構造化データに存在する |
| 2 | `identifiers-match` | 型番・JAN・容量・重量・寸法が構造化データと一致 |
| 3 | `source-per-number` | 数値ごとに `sourceId` がある |
| 4 | `no-filled-nulls` | `null` を数値で埋めていない |
| 5 | `no-experience-claims` | 実体験表現がない |
| 6 | `no-superlatives` | 根拠のない最上級・断定がない |
| 7 | `table-body-consistent` | 比較表と本文が一致 |
| 8 | `intent-key-unique` | `intentKey` 重複なし |
| 9 | `body-not-similar` | 本文の高類似を拒否 |
| 10 | `products-published` | 対象商品がすべて `published` |
| 11 | `min-two-products` | 原則 2 商品以上。1 商品は `spec-explainer` のみ |
| 12 | `no-placeholders` | TODO・未設定・デモ文言なし |
| 13 | `publication-verdict` | `evaluatePublication()` が ok |
| 14 | `plugin-validate` | プラグインの `validate()` が ok |

### ステップ

- [ ] `ARTICLE_CHECK_IDS` がちょうど 14 個である失敗テストを書く（2 分）
- [ ] 本文に構造化データにない数値があると `numbers-exist` が落ちる失敗テストを書く（4 分）
- [ ] 「使ってみた」を含むと `no-experience-claims` が落ちる失敗テストを書く（3 分）
- [ ] 「おすすめ」を含むと `no-superlatives` が落ちる失敗テストを書く（3 分）
- [ ] 1 商品で `formatId: 'comparison'` だと `min-two-products` が落ちる失敗テストを書く（4 分）
- [ ] 1 商品で `formatId: 'spec-explainer'` なら `min-two-products` が通る失敗テストを書く（3 分）
- [ ] `isPublishable` が 13 件成功 + 1 件失敗で `false` を返す失敗テストを書く（3 分）
- [ ] `runArticleChecks` の引数に AI 関連のものが無いことを型で確認する失敗テストを書く（3 分）
- [ ] 既存の公開 7 記事が 14 検査を通る失敗テストを書く（実データでの回帰）（5 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `article-checks.ts` を実装する（15 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { ARTICLE_CHECK_IDS, runArticleChecks, isPublishable } from '../src/lib/automation/article-checks';

it('決定的検査はちょうど 14 項目', () => {
  expect(ARTICLE_CHECK_IDS).toHaveLength(14);
});

it('1 件でも落ちれば公開しない', () => {
  const results = ARTICLE_CHECK_IDS.map((id, i) => ({ id, ok: i !== 3, detail: '' }));
  expect(isPublishable(results)).toBe(false);
});

it('実体験表現を拒否する', () => {
  const article = { ...base, body: base.body + '\n実際に使ってみた印象では軽い。' };
  const r = runArticleChecks(article, catalog, []);
  expect(r.find((x) => x.id === 'no-experience-claims')?.ok).toBe(false);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-article-checks.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/article-checks
```

### 最小実装

各検査を `(article, catalog, existing) => ArticleCheckResult` の小関数にし、
`ARTICLE_CHECK_IDS` の順に並べた配列を `runArticleChecks` が `map` する。
`isPublishable` は `results.length === 14 && results.every(r => r.ok)`。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-article-checks.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 記事の決定的 14 検査を追加

公開判定はこの 14 項目だけで決まる。Workers AI は引数にも取らない。
既存の公開 7 記事が 14 検査を通ることを実データで固定する。
```

---

## Task 6: 本文の組み立てと生成 CLI

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/article-build.ts` |
| 作成 | `travel-goods-site/scripts/article-generate.ts` |
| 変更 | `travel-goods-site/package.json`（`article:generate` スクリプトを追加） |
| 作成 | `travel-goods-site/tests/automation-article-build.test.ts` |

### Consumes / Produces

- Consumes: `getPlugin`, `eligiblePlugins`, `runArticleChecks`, `isPublishable`, `buildIntentKey`, `checkDuplicate`, `readQueue`, `enqueue`（計画1 Task 3）
- Produces:
  - `export type BuiltArticle = { meta: ArticleMeta; body: string }`
  - `export function buildArticle(plugin: ArticleFormatPlugin, ctx: ArticleContext, products: Product[], catalog: Catalog, today: string): BuiltArticle`
  - `export const SELECTIONS_WINDOW = 20`
  - `export const SELECTIONS_MAX_IN_WINDOW = 8`
  - `export function selectionsShareExceeded(recent: readonly Article[]): boolean`（直近 20 本のうち `selections` が **8 本以上**なら `true`）
  - `export const ARTICLES_PER_WEEK = 2`
  - `export function jstWeekStart(isoDate: string): string`
  - `export function generatedThisWeek(articles: readonly Article[], today: string): number`
  - `export function remainingThisWeek(articles: readonly Article[], today: string): number`
  - CLI: `npm run article:generate -- [--apply] [--limit N] [--dataset production]`

### 仕様（設計書 7.1・7.2・7.6 に対応）

- **既定は dry-run。** `--apply` を付けたときだけ `datasets/production/articles/<slug>.md` を作る。
- 本文は固定文＋比較表。数値は `Fact.value` をそのまま。`null` は「公表なし」。
- 各数値に `sourceId` と `checkedAt` を併記。
- **形容詞的な評価を書かない。**
- **「○選」は直近 20 本のうち 8 本以上あれば、その回は生成しない。**
  「8 本を超えたら」ではない。20 本中 8 本がちょうど 40% であり、
  9 本目を作ると 45% になって上限を超えるためである。
- **週 2 本まで**は CLI の `--limit` ではなく、**JST 週単位の決定的な計算**で決める（下記）。

#### 週 2 本の上限（JST 週単位・再実行に強い）

火曜と金曜の実行を**合わせて**週 2 本にする。実行ごとの上限では足りない
（火曜が 2 本作ると金曜も 2 本作ってしまう）。

```ts
export const ARTICLES_PER_WEEK = 2;

/** JST の週の始まり（月曜）を YYYY-MM-DD で返す。 */
export function jstWeekStart(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  const jstDay = new Date(utc).getUTCDay();       // 0=日
  const backToMonday = (jstDay + 6) % 7;
  return new Date(utc - backToMonday * 86_400_000).toISOString().slice(0, 10);
}

/** その週にすでに公開された自動生成記事の本数。 */
export function generatedThisWeek(articles: readonly Article[], today: string): number {
  const weekStart = jstWeekStart(today);
  return articles.filter(
    (a) => a.reviewMethod === 'derived-from-verified-facts'
      && a.publishedAt !== null
      && jstWeekStart(a.publishedAt) === weekStart,
  ).length;
}

/** 今回作ってよい本数。0 なら生成しない。 */
export function remainingThisWeek(articles: readonly Article[], today: string): number {
  return Math.max(0, ARTICLES_PER_WEEK - generatedThisWeek(articles, today));
}
```

- **本数は「その週にすでに公開した自動生成記事」から数える。実行回数を数えない。**
  そのため**同じ日に何度再実行しても週 2 本を超えない。**
- 週の境界は **JST 月曜**。`publishedAt` は JST の日付として扱う。
- 実際に作る本数は `Math.min(limit, remainingThisWeek(articles, today))`。
- 人が書いた記事（`reviewMethod !== 'derived-from-verified-facts'`）は本数に数えない。
- 生成した記事が 14 検査を通らなければ**ファイルを作らず**、理由を `queue.json` に
  `kind: 'article-plan'` として積む。

### ステップ

- [ ] `buildArticle` の出力が `findUnsafeMarkdown` で問題なしになる失敗テストを書く（3 分）
- [ ] 本文中の数値がすべて `Fact.value` と文字列一致する失敗テストを書く（4 分）
- [ ] `capacityL.value === null` の商品で本文に「公表なし」が出る失敗テストを書く（3 分）
- [ ] `buildArticle` の出力の `meta.reviewer` が `automation:<formatId>@<version>` 形式である失敗テストを書く（3 分）
- [ ] `meta.status` が `'published'`、`meta.reviewMethod` が `'derived-from-verified-facts'` である失敗テストを書く（3 分）
- [ ] `selectionsShareExceeded` が 20 本中 **8 本で `true`**、7 本で `false` を返す失敗テストを書く（3 分）
- [ ] `jstWeekStart` が水曜・月曜・日曜・翌月曜で正しい週頭を返す失敗テストを書く（4 分）
- [ ] 火曜に 2 本作ったら金曜が 0 本になる失敗テストを書く（4 分）
- [ ] 同じ日に再実行しても週 2 本を超えない失敗テストを書く（3 分）
- [ ] 週が変われば上限が戻る失敗テストを書く（3 分）
- [ ] 人が書いた記事を週の本数に数えない失敗テストを書く（3 分）
- [ ] 同じ入力で 2 回 `buildArticle` を呼ぶと同一の本文になる（決定的）失敗テストを書く（3 分）
- [ ] CLI を `--dry-run`（既定）で実行してもファイルが増えない失敗テストを書く（一時ディレクトリで実行）（5 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `article-build.ts` と `article-generate.ts` を実装し、`package.json` に `"article:generate": "tsx scripts/article-generate.ts"` を追加する（15 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { buildArticle, selectionsShareExceeded } from '../src/lib/automation/article-build';
import { findUnsafeMarkdown } from '../src/lib/catalog/validate';

it('生成した本文に生 HTML が混ざらない', () => {
  const built = buildArticle(comparisonPlugin, ctx, products, catalog, '2026-09-02');
  expect(findUnsafeMarkdown(built.body)).toEqual([]);
});

it('自動レビューの reviewer 形式で出力する', () => {
  const built = buildArticle(comparisonPlugin, ctx, products, catalog, '2026-09-02');
  expect(built.meta.reviewer).toBe('automation:comparison@1');
  expect(built.meta.reviewMethod).toBe('derived-from-verified-facts');
});

it('○選が直近 20 本中 8 本を超えたら抑制する', () => {
  expect(selectionsShareExceeded(makeRecent(9))).toBe(true);
  expect(selectionsShareExceeded(makeRecent(8))).toBe(false);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-article-build.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/article-build
```

### 最小実装

`buildArticle` は frontmatter（YAML）＋固定導入文＋比較表（Markdown テーブル）＋出典一覧を
テンプレート文字列で組み立てる。`sizeLabel()` と `capacityLabel()`（既存）を見出しに使う。
CLI は `flag()` / `has()` を既存 `scripts/rakuten-sync.ts` と同じ書き方で実装する。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-article-build.test.ts \
  && CATALOG_DATASET=production npx tsx scripts/article-generate.ts --dry-run \
  && git -C .. status --short
```

期待: CLI が終了コード 0 で候補一覧を出力し、`git status --short` が
`package.json` と新規ソース以外を出さない（`datasets/` に差分なし）。

### コミット

```
feat(travel-goods-site): 記事本文の決定的な組み立てと生成 CLI を追加

数値は Fact.value をそのまま引用し、null は「公表なし」と書く。補完しない。
既定は dry-run。14 検査を通らない記事はファイルを作らずキューへ積む。
```

---

## Task 7: 再検査と自動非公開

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/article-recheck.ts` |
| 作成 | `travel-goods-site/scripts/article-recheck.ts` |
| 変更 | `travel-goods-site/package.json`（`article:recheck` を追加） |
| 作成 | `travel-goods-site/tests/automation-article-recheck.test.ts` |

### Consumes / Produces

- Consumes: `runArticleChecks`, `isPublishable`
- Produces:
  - `export type RecheckAction = { slug: string; action: 'keep' } | { slug: string; action: 'unpublish'; failedChecks: ArticleCheckId[] }`
  - `export function planRecheck(articles: Article[], catalog: Catalog, today: string): RecheckAction[]`
  - `export const RECHECK_AFTER_HOURS: 24`
  - CLI: `npm run article:recheck -- [--apply]`

### 仕様（設計書 7.8 に対応）

- 公開 24 時間後と週次で全検査を再実行する。
- **根拠が不足した記事は自動的に非公開にする**（`status: 'published'` → `'review'`）。**削除しない。**
- `reviewMethod !== 'derived-from-verified-facts'` の記事（人が書いた既存 7 記事）は
  **自動非公開の対象にしない**。`action: 'keep'` を返す。

### ステップ

- [ ] `planRecheck` が既存 7 記事（`reviewMethod: null`）をすべて `'keep'` にする失敗テストを書く（4 分）
- [ ] `reviewMethod: 'derived-from-verified-facts'` で 14 検査のうち 1 件落ちた記事が `'unpublish'` になる失敗テストを書く（4 分）
- [ ] `'unpublish'` の結果に `failedChecks` が入る失敗テストを書く（3 分）
- [ ] 自動非公開が `status: 'review'` にする（削除しない）失敗テストを書く（3 分）
- [ ] CLI が既定 dry-run でファイルを変更しない失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `article-recheck.ts`（lib と script）を実装し `package.json` に追加する（10 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { planRecheck } from '../src/lib/automation/article-recheck';

it('人が書いた記事は自動非公開にしない', () => {
  const actions = planRecheck(humanArticles, catalog, '2026-09-03');
  expect(actions.every((a) => a.action === 'keep')).toBe(true);
});

it('自動生成記事で検査が落ちたら非公開にする', () => {
  const actions = planRecheck([brokenGenerated], catalog, '2026-09-03');
  expect(actions[0]).toMatchObject({ action: 'unpublish' });
  expect(actions[0]).toHaveProperty('failedChecks');
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-article-recheck.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/article-recheck
```

### 最小実装

`planRecheck` は `articles.filter(a => a.status === 'published')` を走査し、
`a.reviewMethod !== 'derived-from-verified-facts'` なら `'keep'`、
それ以外は `runArticleChecks` → `isPublishable` で分岐する。

### 成功確認コマンド

```bash
cd travel-goods-site && npm test && npm run typecheck && npm run lint && npm run validate:content:all
```

### コミット

```
feat(travel-goods-site): 記事の再検査と自動非公開を追加

公開 24 時間後と週次で 14 検査を再実行し、根拠が不足したら review へ戻す。
削除はしない。人が書いた記事は自動非公開の対象にしない。
```

---

## 完了時の確認

```bash
cd travel-goods-site
npm run typecheck && npm run lint && npm test && npm run validate:content:all
CATALOG_DATASET=production npx tsx scripts/article-generate.ts --dry-run
CATALOG_DATASET=production npx tsx scripts/article-recheck.ts
git -C .. diff --name-only main
```

期待: すべて成功。差分は `src/lib/article-formats/**`、`src/lib/automation/{intent,article-checks,article-build,article-recheck}.ts`、
`src/lib/catalog/{types,schema}.ts`、`src/lib/content/publication.ts`、`scripts/article-*.ts`、
`package.json`、`tests/**` のみ。**`datasets/` に差分がないこと。**
