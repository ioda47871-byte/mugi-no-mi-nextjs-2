# 実装計画 1/4: 自動運用の土台（状態・判定・アダプター）

## Goal

`travel-goods-site` の自動運用に必要な**純粋な判定ロジックと状態スキーマ**を実装する。
外部通信・workflow・自動公開はこの計画に含まれない。この計画が終わった時点で、
「与えられた入力に対して S/A/B がどう決まるか」「リンクがどの状態になるか」
「予算がどう消費され何が繰り越されるか」がすべて単体テストで確認できる状態になる。

## Architecture

```
travel-goods-site/src/lib/automation/
  state/
    schema.ts        … queue / budget / link-health の Zod スキーマと型
    io.ts            … 読み書き。安定シリアライズと「変化しなければ書かない」
  budget.ts          … 予算の消費判定と繰越（純関数）
  tier.ts            … S/A/B 判定（純関数）
  link-state.ts      … リンク状態機械（純関数）
  variant.ts         … variant トークン抽出と照合（純関数）

travel-goods-site/src/lib/manufacturers/
  types.ts           … アダプター契約
  registry.ts        … brand 文字列 → 正規化キー → アダプター
  ace.ts elecom.ts anker.ts … 各社アダプター（抽出のみ。取得は行わない）
```

**すべて純関数**である。`fetch` も `fs` も呼ばない（`state/io.ts` を除く）。
HTTP 取得は計画3（workflow）で薄いアダプター実行層として足す。

## Tech Stack

- TypeScript 5.9（`strict`）
- Zod 3（既存 `src/lib/catalog/schema.ts` と同じ書き方。`.strict()` を使う）
- Vitest 3（`tests/*.test.ts`。外部通信なし）
- Node.js 22

## Spec へのパス

`docs/superpowers/specs/2026-09-02-travel-goods-automation-design.md`

対応節: 2.2 / 2.3 / 2.4 / 4.2 / 5.2 / 5.3 / 5.4 / 5.5 / 5.6 / 8.2 / 8.3 / 8.4 / 9.1 / 9.2 / 9.3 / 10.2 / 10.5 / 11.4 / 14.1 / 14.2

## 他の計画書との依存順

| 順 | 計画 | この計画との関係 |
|---:|---|---|
| **1** | **本計画（foundation）** | 最初。他の 3 計画がここの型と関数を使う |
| 2 | `2026-09-02-travel-goods-article-automation.md` | `ArticleFormatPlugin` が本計画の `VariantTokens` と `Fact` を使う |
| 3 | `2026-09-02-travel-goods-workflows.md` | 変更パス検査が本計画の `AUTOMATION_STATE_FILES` を使う。予算の読み書きに `state/io.ts` を使う |
| 4 | `2026-09-02-travel-goods-shadow-rollout.md` | 段階0 の統合検証。1〜3 のすべてを前提とする |

**本計画は他の 3 計画のどれにも依存しない。単独で着手・完了できる。**

## Global Constraints

1. **実装コード以外を変更しない。** `datasets/` `.github/` `docs/` は触らない。
2. **外部通信を書かない。** この計画のコードは `fetch` を呼ばない。
3. **既存ファイルの変更は本計画で明示したものだけ。** 本計画では既存ファイルを 1 つも変更しない（すべて新規追加）。
4. **`AUTOMATION_ENABLED` などの停止スイッチは読まない。** 純関数は環境変数を見ない。呼び出し側（計画3）が判断する。
5. 各 Task は**失敗するテストを先に書く**。テストが失敗することを確認してから実装する。
6. コミットは Task 単位。1 Task = 1 コミット。
7. `npm run typecheck && npm run lint && npm test` が各 Task 終了時に成功すること。

## 完了条件

- [ ] `npm run typecheck` 成功
- [ ] `npm run lint` 成功
- [ ] `npm test` 成功。テスト件数が **147 → 246 件以上**
- [ ] `npm run validate:content:all` 成功（データに触れていないので変化なし）
- [ ] `git diff --name-only main` の結果が `travel-goods-site/src/lib/automation/**`、`travel-goods-site/src/lib/manufacturers/**`、`travel-goods-site/tests/automation-*.test.ts`、`travel-goods-site/tests/manufacturers-*.test.ts` だけ

## 非対象

- HTTP 取得（楽天 API 呼び出し、メーカーページ取得）
- workflow ファイル
- 記事生成
- 自動公開・自動 PR・自動 revert
- 段階1 以降の運転

---

## Task 1: automation 状態ファイルのスキーマ

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/state/schema.ts` |
| 作成 | `travel-goods-site/tests/automation-state.test.ts` |

### Consumes / Produces

- Consumes: なし（Zod のみ）
- Produces:
  - `export const AUTOMATION_STATE_FILES: readonly ['automation/queue.json', 'automation/budget.json', 'automation/link-health.json']`
  - `export const queueFileSchema: z.ZodType<QueueFile>`
  - `export const budgetFileSchema: z.ZodType<BudgetFile>`
  - `export const linkHealthFileSchema: z.ZodType<LinkHealthFile>`
  - `export type QueueFile`, `QueueEntry`, `QueueKind`, `BudgetFile`, `CircuitBreaker`, `LinkHealthFile`, `LinkHealthEntry`, `LinkSignals`

### 型（正確な定義）

```ts
export type QueueKind = 'candidate' | 'tier-a-recheck' | 'link-recheck' | 'article-plan';

export type QueueEntry = {
  kind: QueueKind;
  targetId: string;          // 商品ID / itemCode / 記事slug
  queuedAt: string;          // YYYY-MM-DD
  attempts: number;          // 0 以上
  lastReason: string;        // 分類コード。外部本文を入れない
  payload: Record<string, string>; // ハッシュ・分類コードのみ。原文禁止
};
export type QueueFile = { version: 1; entries: QueueEntry[] };

export type CircuitBreaker = {
  state: 'closed' | 'open';
  trippedOn: string | null;   // YYYY-MM-DD
  reason: string | null;
  revertedShas: string[];
};
export type BudgetFile = {
  version: 1;
  date: string;               // YYYY-MM-DD
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
  httpStatus: number | null;       // 段階2 では常に null
  identifierMatch: 'strong' | 'weak' | 'none';
  variantMatch: boolean;
};
export type LinkHealthEntry = {
  productId: string;
  merchant: 'rakuten';
  externalProductId: string;
  signals: LinkSignals;
  consecutiveFailures: number;
  consecutiveOutOfStock: number;
  lastHealthyAt: string | null;    // YYYY-MM-DD
  state: 'healthy' | 'uncertain' | 'hidden' | 'replace' | 'manual-hold';
};
export type LinkHealthFile = { version: 1; entries: LinkHealthEntry[] };
```

### ステップ

- [ ] `tests/automation-state.test.ts` を作り、`AUTOMATION_STATE_FILES` が 3 要素であることを検査する失敗テストを書く（2 分）
- [ ] `queueFileSchema` が `payload` に 200 文字超の値を拒否する失敗テストを書く（3 分）
- [ ] `budgetFileSchema` が `circuitBreaker.state` に `'closed' | 'open'` 以外を拒否する失敗テストを書く（3 分）
- [ ] `linkHealthFileSchema` が `state` に未知の値を拒否する失敗テストを書く（3 分）
- [ ] テストを実行し、`Cannot find module '../src/lib/automation/state/schema'` で失敗することを確認する（1 分）
- [ ] `schema.ts` に上記の型と Zod スキーマを `.strict()` で書く（5 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-state.test.ts
import { describe, expect, it } from 'vitest';
import { AUTOMATION_STATE_FILES, budgetFileSchema } from '../src/lib/automation/state/schema';

describe('automation 状態ファイルのスキーマ', () => {
  it('状態ファイルは queue / budget / link-health の 3 つ', () => {
    expect(AUTOMATION_STATE_FILES).toEqual([
      'automation/queue.json',
      'automation/budget.json',
      'automation/link-health.json',
    ]);
  });

  it('circuitBreaker.state は closed / open だけを受ける', () => {
    const base = {
      version: 1, date: '2026-09-02', rakutenRequests: 0, workersAiNeurons: 0,
      browserSeconds: 0, pagesDeploysThisMonth: 0,
      circuitBreaker: { state: 'half-open', trippedOn: null, reason: null, revertedShas: [] },
    };
    expect(budgetFileSchema.safeParse(base).success).toBe(false);
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

`schema.ts` に上記の型と、それぞれに対応する `z.object({...}).strict()` を定義する。
`payload` は `z.record(z.string().max(200))`、`targetId` は `z.string().min(1).max(200)`、
日付は `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-state.test.ts && npm run typecheck
```

### コミット

```
feat(travel-goods-site): automation 状態ファイルのスキーマを追加

queue / budget / link-health の 3 ファイルの型と Zod スキーマ。
payload には分類コードとハッシュだけを入れ、外部本文は保存しない。
```

---

## Task 2: 状態ファイルの読み書き（安定シリアライズ）

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

## Task 3: 予算判定と繰越（純関数）

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

## Task 4: variant トークンの抽出と照合

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

## Task 5: メーカーアダプター契約と registry

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/manufacturers/types.ts` |
| 作成 | `travel-goods-site/src/lib/manufacturers/registry.ts` |
| 作成 | `travel-goods-site/tests/manufacturers-registry.test.ts` |

### Consumes / Produces

- Consumes: なし
- Produces:
  - `export type ManufacturerId = 'ace' | 'proteca' | 'world-traveler' | 'elecom' | 'anker'`
  - `export type ExtractedSpec = { weightG: number | null; outerSizeMm: [number, number, number] | null; capacityL: number | null; sizeBasis: SizeBasis; measurementState: MeasurementState; specs: Record<string, string | number | boolean> }`
  - `export type ExtractionResult = { ok: true; spec: ExtractedSpec; rangeHash: string } | { ok: false; reason: ExtractionFailure }`
  - `export type ExtractionFailure = 'no-spec-table' | 'unit-unparseable' | 'required-field-missing' | 'page-shape-changed'`
  - `export type ManufacturerAdapter = { manufacturerId: ManufacturerId; allowedHosts: readonly string[]; buildProductUrl(model: string): string | null; extract(html: string): ExtractionResult; extractedRangeHash(html: string): string | null; recallTerms: readonly string[] }`
  - `export function normalizeBrand(brand: string): ManufacturerId | null`
  - `export function adapterFor(id: ManufacturerId): ManufacturerAdapter`
  - `export const RECALL_TERMS: readonly string[]`（`リコール` `回収` `使用中止` `自主回収` `販売終了のお知らせ`）

### 仕様（設計書 5.2・5.3・4.2 に対応）

`normalizeBrand` は**明示的な対応表**で行う。部分一致による推測はしない。
現行 23 商品の `brand` 文字列 7 種類をすべて網羅する。

| `brand`（現行値そのまま） | `ManufacturerId` |
|---|---|
| `エース（ACE）` | `ace` |
| `エース（ace. GENE LABEL）` | `ace` |
| `エース（ace. TOKYO LABEL）` | `ace` |
| `プロテカ（PROTECA）` | `proteca` |
| `ワールドトラベラー（World Traveler）` | `world-traveler` |
| `エレコム（ELECOM）` | `elecom` |
| `アンカー・ジャパン（Anker）` | `anker` |

`allowedHosts`: `ace`/`proteca`/`world-traveler` は `['store.ace.jp']`、
`elecom` は `['www.elecom.co.jp']`、`anker` は `['www.ankerjapan.com']`。

`extract` は**メーカーサイト本文全体を返さない**。返すのは構造化仕様と内容ハッシュだけ。

### ステップ

- [ ] 現行 7 種類の `brand` 文字列がすべて正しい `ManufacturerId` に落ちる失敗テストを書く（4 分）
- [ ] 未知のブランド（`'サンプルブランド'`）が `null` を返す失敗テストを書く（2 分）
- [ ] 部分一致で誤って解決しない失敗テストを書く（`'ACE Hardware'` → `null`）（3 分）
- [ ] `adapterFor('ace').allowedHosts` が `['store.ace.jp']` である失敗テストを書く（2 分）
- [ ] `ExtractionResult` が `ok: false` のとき `spec` を持たないことを型で保証する（`@ts-expect-error` で確認）失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `types.ts` と `registry.ts` を実装する。各アダプターは `extract` が常に `{ ok: false, reason: 'no-spec-table' }` を返すスタブでよい（Task 6 で実装）（8 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { normalizeBrand, adapterFor } from '../src/lib/manufacturers/registry';

it('現行の brand 文字列をすべて正規化できる', () => {
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
});

it('許可ホストが固定されている', () => {
  expect(adapterFor('ace').allowedHosts).toEqual(['store.ace.jp']);
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

`const BRAND_MAP: Record<string, ManufacturerId>` を完全一致の対応表として持ち、
`normalizeBrand` は `BRAND_MAP[brand.trim()] ?? null` を返す。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-registry.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): メーカーアダプター契約と brand 正規化を追加

現行 7 種類の brand 文字列を完全一致の対応表で正規化する。
部分一致による推測はしない。未知のブランドは null。
```

---

## Task 6: ACE アダプターの仕様抽出

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/manufacturers/ace.ts` |
| 作成 | `travel-goods-site/tests/fixtures/manufacturers/ace-cresta2-06936.html` |
| 作成 | `travel-goods-site/tests/manufacturers-ace.test.ts` |

### Consumes / Produces

- Consumes: `ManufacturerAdapter`, `ExtractionResult` from `types.ts`
- Produces: `export const aceAdapter: ManufacturerAdapter`

### 仕様

- `extract(html)` は「スペックとサイズ」欄のテーブルから
  本体重量（kg → g へ換算）、外寸（cm → mm へ換算）、容量（L）を取り出す。
- **1 項目でも取れなければ `{ ok: false, reason: 'required-field-missing' }` を返す。推定で埋めない。**
- `extractedRangeHash(html)` は**スペック表の範囲だけ**の SHA-256 を返す。ページ全体のハッシュではない。
- `buildProductUrl(model)` は `https://store.ace.jp/shop/g/g<model>-01/` を返す。`model` が `/^\d{5}$/` でなければ `null`。

### fixture について

`tests/fixtures/manufacturers/ace-cresta2-06936.html` は、**手で書いた最小の HTML** とする。
実サイトの HTML をそのままコミットしない（設計書 4.2：外部レスポンス本文を保存しない）。
スペック表の構造だけを再現した 30 行程度のファイルにする。

### ステップ

- [ ] fixture HTML を手で書く（スペック表 1 つ、本体重量 `3.4kg`、外寸 `55×39×26cm`、容量 `35L`）（5 分）
- [ ] `aceAdapter.extract(fixture)` が `weightG: 3400`、`outerSizeMm: [550, 390, 260]`、`capacityL: 35` を返す失敗テストを書く（4 分）
- [ ] 容量の行を削った fixture で `{ ok: false, reason: 'required-field-missing' }` を返す失敗テストを書く（3 分）
- [ ] `extractedRangeHash` がスペック表の外側を変えても同じ値を返す失敗テストを書く（4 分）
- [ ] `buildProductUrl('06936')` が正しい URL、`buildProductUrl('abc')` が `null` を返す失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `ace.ts` を実装する（10 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import fs from 'node:fs';
import path from 'node:path';
import { aceAdapter } from '../src/lib/manufacturers/ace';

const html = fs.readFileSync(
  path.join(__dirname, 'fixtures/manufacturers/ace-cresta2-06936.html'), 'utf8');

it('スペック表から重量・外寸・容量を取り出す', () => {
  const result = aceAdapter.extract(html);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.spec.weightG).toBe(3400);
  expect(result.spec.outerSizeMm).toEqual([550, 390, 260]);
  expect(result.spec.capacityL).toBe(35);
});

it('必須項目が欠けたら推定せず失敗を返す', () => {
  const withoutCapacity = html.replace(/<tr>\s*<th>容量[\s\S]*?<\/tr>/, '');
  const result = aceAdapter.extract(withoutCapacity);
  expect(result).toEqual({ ok: false, reason: 'required-field-missing' });
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

正規表現でスペック表の `<tr>` を走査し、`<th>` のラベルで分岐する。
`kg` → `g` は `Math.round(value * 1000)`、`cm` → `mm` は `Math.round(value * 10)`。
`extractedRangeHash` は `html.match(/<table class="spec">[\s\S]*?<\/table>/)?.[0]` に対して
`crypto.createHash('sha256')`。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-ace.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): ACE の仕様抽出アダプターを追加

スペック表から重量・外寸・容量を単位換算つきで取り出す。
1 項目でも取れなければ推定せず失敗を返す。
fixture は実サイトの HTML ではなく、構造だけを再現した最小 HTML。
```

---

## Task 7: ELECOM と Anker のアダプター

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/manufacturers/elecom.ts` |
| 作成 | `travel-goods-site/src/lib/manufacturers/anker.ts` |
| 作成 | `travel-goods-site/tests/fixtures/manufacturers/elecom-bm-bptrcsepbk.html` |
| 作成 | `travel-goods-site/tests/fixtures/manufacturers/anker-a1335011.html` |
| 作成 | `travel-goods-site/tests/manufacturers-others.test.ts` |
| 変更 | `travel-goods-site/src/lib/manufacturers/registry.ts`（スタブを実装に差し替え） |

### Consumes / Produces

- Consumes: `ManufacturerAdapter` from `types.ts`
- Produces: `export const elecomAdapter: ManufacturerAdapter`, `export const ankerAdapter: ManufacturerAdapter`

### 仕様

Task 6 と同じ契約。抽出ルールだけが各社固有。
Anker はモバイルバッテリーのため `specs` に `capacityMah`（数値）と `ratedWh`（数値）を入れる。

> **注記**: `www.elecom.co.jp` は過去に取得が HTTP 403 で拒否された実績がある（`docs/status.md`）。
> アダプターは実装するが、**取得できるかどうかは計画3 の実行層の問題**であり、
> この Task では fixture に対する抽出だけを扱う。

### ステップ

- [ ] ELECOM の fixture HTML を手で書く（定義リスト形式、`本体重量 1,090g`、`外形寸法 約W300×D160×H480mm`、`容量 30L`）（5 分）
- [ ] Anker の fixture HTML を手で書く（`重さ 約215g`、`サイズ 約104×52×26mm`、`容量 10000mAh`、`定格容量 37Wh`）（5 分）
- [ ] `elecomAdapter.extract` が `weightG: 1090`、`outerSizeMm: [300, 160, 480]`、`capacityL: 30` を返す失敗テストを書く（4 分）
- [ ] `ankerAdapter.extract` が `weightG: 215`、`specs.capacityMah: 10000`、`specs.ratedWh: 37` を返す失敗テストを書く（4 分）
- [ ] Anker は `capacityL` が `null` でも `ok: true` になる失敗テストを書く（モバイルバッテリーに容量 L は無い）（3 分）
- [ ] `adapterFor('elecom')` がスタブでなく実装を返す失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `elecom.ts` と `anker.ts` を実装し、`registry.ts` の対応表を差し替える（12 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { elecomAdapter } from '../src/lib/manufacturers/elecom';
import { ankerAdapter } from '../src/lib/manufacturers/anker';

it('ELECOM の定義リストから仕様を取り出す', () => {
  const r = elecomAdapter.extract(elecomHtml);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.spec.weightG).toBe(1090);
  expect(r.spec.outerSizeMm).toEqual([300, 160, 480]);
});

it('モバイルバッテリーは capacityL が null でも成功する', () => {
  const r = ankerAdapter.extract(ankerHtml);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.spec.capacityL).toBeNull();
  expect(r.spec.specs.capacityMah).toBe(10000);
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

各社の DOM 構造に合わせた正規表現。`1,090g` のカンマ除去、`約W300×D160×H480mm` の接頭辞除去。
`REQUIRED_FIELDS` をカテゴリ別に持ち、モバイルバッテリーでは `capacityL` を必須にしない。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/manufacturers-others.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): ELECOM と Anker の仕様抽出アダプターを追加

各社の DOM 構造に合わせた抽出ルール。必須項目はカテゴリごとに変える。
モバイルバッテリーは capacityL を必須にせず、mAh と Wh を specs に入れる。
```

---

## Task 8: S/A/B 判定

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/tier.ts` |
| 作成 | `travel-goods-site/tests/automation-tier.test.ts` |

### Consumes / Produces

- Consumes: `MatchResult` from `@/lib/rakuten/match`、`VariantVerdict` from `./variant`、`ExtractionResult` from `@/lib/manufacturers/types`、`ManufacturerId`
- Produces:
  - `export type Tier = 'S' | 'A' | 'B'`
  - `export type InitialSelectionEvidence = { kind: '6a'; observedVariant: string } | { kind: '6b' } | { kind: 'none' }`
  - `export type TierInput = { manufacturerId: ManufacturerId | null; extraction: ExtractionResult; match: MatchResult; variant: VariantVerdict; initialSelection: InitialSelectionEvidence; affiliateItemPageUrl: string | null; hasExcludedTerm: boolean; recallHit: boolean; duplicateOfProductId: string | null; janPresent: boolean; modelExactMatch: boolean; officialAndListingConsistent: boolean; recheckMatchedPreviousDay: boolean }`
  - `export type TierVerdict = { tier: Tier; reasons: string[]; blockers: string[] }`
  - `export function decideTier(input: TierInput): TierVerdict`
  - `export const B_BLOCKER_CODES: readonly string[]`（7 個。設計書 5.5 の B 条件 1〜7）

### 仕様（設計書 5.5 に対応）

**B の条件に 1 つでも該当したら、S/A の条件を満たしていても B。保留側が常に勝つ。**

B 条件（7 個。`AI とルールの不一致`は**存在しない**）:

| コード | 条件 |
|---|---|
| `variant-unknown` | `variant.matched === false` かつ `variant.missing.length > 0` |
| `initial-selection-unknown` | `initialSelection.kind === 'none'` |
| `official-unavailable` | `manufacturerId === null` または `extraction.ok === false` |
| `spec-conflict` | `officialAndListingConsistent === false` または `variant.conflicting.length > 0` |
| `recall-unverifiable` | `recallHit` の判定自体ができなかった（`recallHit` が判定不能を表す場合。実装では `null` を受けない設計とし、呼び出し側が `official-unavailable` に含める） |
| `model-ambiguous` | `match.blockers` に「型番が短く自動照合に使えない」が含まれる |
| `page-fetch-denied` | 呼び出し側が 403 / robots 拒否のときに設定する（`extraction.ok === false && extraction.reason === 'page-shape-changed'` とは別） |

S 条件: B に該当せず、`match.confidence === 'strong'`、`variant.matched`、
`affiliateItemPageUrl !== null`、`initialSelection.kind !== 'none'`、
`extraction.ok`、`recallHit === false`、`duplicateOfProductId === null`。

A 条件: B に該当せず S でなく、`janPresent === false`（JAN 未公表）、
`modelExactMatch === true`、`officialAndListingConsistent === true`、
`recheckMatchedPreviousDay === true`。

**`sizeBasis: 'unspecified'` は S/A/B のブロッカーにしない**（設計書 5.5 決定済み事項）。

**`initialSelection` は `6a` と `6b` を同格に扱う**（どちらでも条件6 を満たす。設計書 10.5）。

### ステップ

- [ ] B 条件 7 つそれぞれについて、単独で立つと `tier: 'B'` になる失敗テストを 7 件書く（8 分）
- [ ] S の全条件を満たす入力が `tier: 'S'` になる失敗テストを書く（3 分）
- [ ] S の入力に B 条件を 1 つ足すと `'B'` になる（保留側が勝つ）失敗テストを書く（3 分）
- [ ] `initialSelection.kind === '6b'` でも `'S'` になりうる失敗テストを書く（3 分）
- [ ] `initialSelection.kind === 'none'` なら `'S'` にも `'A'` にもならない失敗テストを書く（3 分）
- [ ] JAN 未公表＋型番完全一致＋再確認一致で `'A'` になる失敗テストを書く（3 分）
- [ ] 再確認が未実施（`recheckMatchedPreviousDay: false`）なら `'A'` にならない失敗テストを書く（3 分）
- [ ] `sizeBasis: 'unspecified'` を含む入力でも `'S'` になりうる失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `tier.ts` を実装する（12 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { decideTier, type TierInput } from '../src/lib/automation/tier';

const sInput: TierInput = { /* S の全条件を満たす値 */ } as TierInput;

it('S の全条件を満たせば S', () => {
  expect(decideTier(sInput).tier).toBe('S');
});

it('B 条件が 1 つでも立てば B（保留側が勝つ）', () => {
  const v = decideTier({ ...sInput, initialSelection: { kind: 'none' } });
  expect(v.tier).toBe('B');
  expect(v.blockers).toContain('initial-selection-unknown');
});

it('6b（推定）でも条件6 を満たし S になりうる', () => {
  expect(decideTier({ ...sInput, initialSelection: { kind: '6b' } }).tier).toBe('S');
});
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

`decideTier` はまず B 条件を全部評価して `blockers` を集め、
`blockers.length > 0` なら即 `{ tier: 'B', ... }` を返す。
その後 S 条件、A 条件の順に評価する。どちらも満たさなければ `'B'`。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-tier.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 商品の S/A/B 判定を追加

B の条件が 1 つでも立てば S/A の条件を満たしていても B。保留側が常に勝つ。
初期選択の根拠は 6a（実ブラウザ観測）と 6b（販売ページ文言による決定的な推定）を同格に扱う。
sizeBasis: unspecified はブロッカーにしない。AI の所見は入力に含まれない。
```

---

## Task 9: リンク状態機械

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
import { nextLinkState, decideReplacement, LINK_THRESHOLDS } from '../src/lib/automation/link-state';

it('API エラーでは連続失敗日数を増やさない', () => {
  const prev = { /* consecutiveFailures: 2, state: 'uncertain' */ } as LinkHealthEntry;
  const next = nextLinkState(prev, {
    itemCodeAlive: false, availability: null, affiliateTargetChanged: false,
    httpStatus: null, identifierMatch: 'none', variantMatch: false,
  });
  expect(next.state).toBe('uncertain');
  expect(next.consecutiveFailures).toBe(2);  // 増えない
});

it('目視確認済みリンクは replace でも自動交換しない', () => {
  const link = { status: 'verified', verificationMethod: 'visual' } as MerchantLink;
  expect(decideReplacement(link, 'replace', 'S')).toEqual({ action: 'pr-only', reason: 'human-verified' });
});
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

## Task 10: 既存 15 リンクでの回帰確認

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
- [ ] テストを実行し、Task 9 の実装があれば成功することを確認する（1 分）

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

Task 9 実装前なら `Failed to load url`。
Task 9 実装後に件数が変わっていれば `expected 15 to be 14` 等。

### 最小実装

実装は不要（Task 9 で完了している）。このテストは**保護の回帰**を固定するためのもの。

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

## Task 11: カテゴリ拡張の判定

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/category-expansion.ts` |
| 作成 | `travel-goods-site/tests/automation-category-expansion.test.ts` |

### Consumes / Produces

- Consumes: `Candidate`（`QueueEntry` の `kind: 'candidate'`。Task 1）、`ManufacturerId`（Task 5）、`CATEGORIES` from `@/lib/catalog/types`
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
import { evaluateCategoryExpansion, isKnownCategory, EXPANSION_THRESHOLDS }
  from '../src/lib/automation/category-expansion';

it('既存 4 カテゴリだけを既知とする', () => {
  expect(isKnownCategory('suitcases')).toBe(true);
  expect(isKnownCategory('travel-pillows')).toBe(false);
});

it('しきい値は 5 件 / 3 項目 / 80% / 14 日', () => {
  expect(EXPANSION_THRESHOLDS).toEqual({
    minValidCandidates: 5, minSharedSpecs: 3, minFetchSuccessRate: 0.8, fetchWindowDays: 14,
  });
});

it('候補が 4 件では提案しない', () => {
  const v = evaluateCategoryExpansion({
    proposedCategory: 'travel-pillows',
    candidates: makeCandidates(4, ['weightG', 'capacityL', 'outerSizeMm']),
    fetchSuccessRate: 1,
  });
  expect(v).toEqual({ ready: false, missing: ['candidates'] });
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
| 1.3 | **Workers AI の位置づけ** | **S Task 4**（`advisory.ts`。所見から公開可否を導く関数を export しない） |
| 1.4 | 非目的 | 各計画の「非対象」（実装対象なし） |
| 2.1 | すでに存在するもの | 全計画が Consumes として参照（実装対象なし） |
| 2.2 | 現行データの実測 | **F Task 5**（brand 7 種）／**F Task 10**（リンク 15 件）／**A Task 4**（記事 10 本） |
| 2.3 | 拡張が必要なもの | **F Task 9**（audit の欠陥）／**F Task 4**（`matchedVariant`）／**A Task 1**（`articleMetaSchema`） |
| 2.4 | 新規実装が必要なもの | F・A・W・S の全 Task |
| 2.5 | 設計を左右する外部事実 | **W Task 5**（`GITHUB_TOKEN` の制約）／各計画の Tech Stack |
| 3.1 | 役割分担 | **W Task 6・7**（Actions が主系）／**S Task 4**（補助） |
| 3.2 | データの流れ | **S Task 2**（通しの dry-run） |
| 3.3 | 縮退運転 | **S Task 2・4**（Browser Run は B へ、Workers AI は判定不変） |
| 4.1 | 信頼境界 | **W Task 2**（変更パス検査）／**S Task 1**（伏せ字検査） |
| 4.2 | 外部入力の扱い | **F Task 5・6**（本文全体を返さない契約）／**S Task 1**（レポートの伏せ字） |
| 4.3 | ブロックを迂回しない | **F Task 5**（`allowedHosts`）／**S Task 2**（403/429 を分類だけ記録） |
| 4.4 | `llmInput` と AI 利用の整合 | **S Task 4**（`input` 型がメーカー本文を受け取れない） |
| 5.1 | 全体の流れ | **S Task 2** |
| 5.2 | 対象メーカーとブランド正規化 | **F Task 5** |
| 5.3 | メーカー取得アダプター | **F Task 5・6・7** |
| 5.4 | 判定に使う信号 | **F Task 8**（`TierInput`） |
| 5.5 | **S / A / B 判定** | **F Task 8** |
| 5.6 | `matchedVariant` の扱い | **F Task 4** |
| 6.1 | カテゴリ拡張の方針 | **F Task 11**（`isKnownCategory`） |
| 6.2 | カテゴリ追加 PR の自動作成条件 | **F Task 11**（`evaluateCategoryExpansion`） |
| 6.3 | カテゴリ追加 PR の扱い | **F Task 11**（判定だけ返し PR を作らない）／**W Task 6**（discover が Draft PR を出す） |
| 7.1 | 記事の方針 | **A Task 3・6** |
| 7.2 | 商品数と形式の対応 | **A Task 3** |
| 7.3 | 記事構成プラグイン | **A Task 2・3** |
| 7.4 | 初期に有効化する形式 | **A Task 3** |
| 7.5 | `intentKey` と重複判定 | **A Task 4** |
| 7.6 | 生成 | **A Task 6** |
| 7.7 | **記事の自動検査（決定的 14）** | **A Task 5** |
| 7.8 | 再検査と自動非公開 | **A Task 7** |
| 7.9 | 旅行先別記事（将来） | **A Task 3**（`destination` の `eligibility` を常に false） |
| 7.10 | 測定条件に依存する比較軸 | **A Task 2・3** |
| 8.1 | リンク監視の現行の欠陥 | **F Task 9** |
| 8.2 | 6 つの信号 | **F Task 1**（`LinkSignals`）／**F Task 9** |
| 8.3 | 状態機械 | **F Task 9** |
| 8.4 | 代替リンクへの交換 | **F Task 9・10** |
| 9.1 | 状態ファイルの配置 | **F Task 1** |
| 9.2 | 内容と制約 | **F Task 1・2** |
| 9.3 | 監査と復元 | **W Task 7**（1 日 1 コミット）／**S Task 6**（runbook） |
| 10.1 | 公式に確認した上限 | 出典の記録（実装対象なし） |
| 10.2 | この設計の予算 | **F Task 3**（`DAILY_LIMITS`） |
| 10.3 | 楽天 30 req/日 の処理能力 | **F Task 3**／**S Task 2**（実測） |
| 10.4 | 現実的な処理規模 | **S Task 3**（集計で確認） |
| 10.5 | 補助が使えないときの扱い | **F Task 8**（6a/6b）／**S Task 4**（AI は判定不変） |
| 11.1 | workflow 構成 | **W Task 6・7・8**／**S Task 5** |
| 11.2 | スケジュール | **W Task 6** |
| 11.3 | 1 日の流れ | **W Task 6・7** |
| 11.4 | 上限と繰越 | **F Task 3**／**W Task 6** |
| 11.5 | 日次 workflow の競合対策 | **W Task 6**（concurrency・作業ブランチ・push 規則） |
| 12.1 | 自動反映の流れ | **W Task 7** |
| 12.2 | 変更パス検査 | **W Task 2** |
| 12.3 | CI が起動しない問題 | **W Task 5** |
| 12.4 | 公開後検査と自動 revert | **W Task 9** |
| 12.5 | 自動 revert の手順 | **W Task 4**（対象の妥当性）／**W Task 8**（revert workflow） |
| 12.6 | circuit breaker と 2 つの例外 | **W Task 3**（判定）／**W Task 8**（reset workflow）／**W Task 2**（reset 専用検査） |
| 13.1 | 停止スイッチ | **W Task 1** |
| 13.2 | 通知 | **W Task 9** |
| 14.1 | テストの原則 | 全 Task（失敗するテストを先に書く） |
| 14.2 | 追加する単体テスト | F・A・W の全 Task |
| 14.3 | **E2E** | **S Task 7** |
| 14.4 | dry-run | **S Task 2** |
| 15 段階0 | 実装とテスト | F・A・W・S のすべて |
| 15 段階1 | 7 日間の観察運転 | **S Task 2・3・5**（受け皿のみ。開始は人が別 PR で行う） |
| 15 段階2 | S 判定のみ自動公開 | **計画外**（有効化操作。`S Task 6` の runbook に手順だけ記載） |
| 15 段階3 | A 判定・記事・交換 | **計画外**（同上） |
| 15 段階4 | 本番公開 | **計画外**（同上） |
| 16 | 人間に残る作業 | **S Task 6**（runbook） |
| 17.0 | 決定済み事項 | **A Task 1**（自動レビュー契約）／**F Task 8**（`sizeBasis`）／**S Task 4**（AI） |
| 17.1 | 未解決事項 | **計画外**（人の判断待ち。`S Task 6` の runbook に一覧） |
| 17.2 | 段階1 で測定する項目 | **S Task 1・2・3**（`ObservationReport` の各フィールド） |
| 18.1 | 3 段階のロールバック | **S Task 6**（runbook） |
| 18.2 | ロールバックが成立する前提 | **W Task 2・7**（許可パスと 1 日 1 コミット） |
| 18.3 | ロールバック後の再開 | **S Task 6**（runbook） |
| 18.4 | Cloudflare Pages 側のロールバック | **S Task 6**（自動化しない方針を runbook に記載） |
| 付録A GitHub | Secrets / Variables / 権限 / ブランチ保護 | **W Task 1・5**／**W の「人が行う設定」** |
| 付録A Cloudflare | Worker・KV・D1・Cron 不要 | **S Task 4**（REST のみ。binding を作らない） |
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
段階0 の計画に混ぜてはならないものである（手順だけ `S Task 6` の runbook に書く）。
