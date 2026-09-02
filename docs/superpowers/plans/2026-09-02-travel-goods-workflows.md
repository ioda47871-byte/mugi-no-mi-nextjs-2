# 実装計画 3/4: workflow・自動 PR・revert・停止

## Goal

日次の自動処理を GitHub Actions に載せ、
**ブランチ保護を回避せずに**自動 PR → 検証 → auto-merge → デプロイ → 公開後検査 → 自動 revert
までを成立させる。停止スイッチと circuit breaker、Issue 通知もここで実装する。

この計画が終わった時点で、`AUTOMATION_ENABLED=false`（既定）のまま
すべての workflow が「即座に正常終了する」ことを手動実行で確認できる。

## Architecture

```
.github/workflows/
  travel-goods-ci.yml        … 変更: 最後に automation/verify status を付ける
  automation-links.yml       … 新規。毎日 JST 06:00
  automation-discover.yml    … 新規。月・木 JST 06:30
  automation-articles.yml    … 新規。火・金 JST 06:30
  automation-commit.yml      … 新規。毎日 JST 07:30。
                                 job: verify-and-merge → wait-for-deploy →
                                      post-deploy-check → revert（失敗時のみ）
  automation-reset.yml       … 新規。workflow_dispatch のみ。breaker 解除

  ※ revert は automation-commit.yml の後続 job にする。
    同一 concurrency group 内で reusable workflow（workflow_call）の完了を待つと
    デッドロックするため、automation-revert.yml は作らない。

travel-goods-site/src/lib/automation/
  changed-paths.ts   … 変更パス検査（純関数）
  breaker.ts         … circuit breaker の判定と遷移（純関数）
  switches.ts        … 停止スイッチの読み取りと正規化
  revert-target.ts   … revert 対象の妥当性検証（純関数）
  deploy-gate.ts     … マージ確認とデプロイ確認（純関数）
  notify.ts          … Issue 通知の条件（純関数）

travel-goods-site/scripts/
  check-changed-paths.ts  … CLI。git diff の結果を検査
  check-breaker.ts        … CLI。budget.json を読んで停止判定
  post-verify-status.ts   … CLI。automation/verify status を付ける
  plan-revert.ts          … CLI。revert 対象の妥当性を検証
  wait-for-deploy.ts      … CLI。マージとデプロイの bounded polling
  post-deploy-check.ts    … CLI。公開後検査
```

## Tech Stack

- GitHub Actions（`ubuntu-latest`、public リポジトリの標準ランナー）
- `actions/checkout@v4`、`actions/setup-node@v4`、`actions/github-script@v7`、`actions/upload-artifact@v4`
- TypeScript 5.9 / `tsx`（CLI）
- Vitest 3（純関数の単体テスト）
- GitHub REST API（status 付与、PR 作成、auto-merge、Issue 開閉）

## Spec へのパス

`docs/superpowers/specs/2026-09-02-travel-goods-automation-design.md`

対応節: 10.2 / 10.5 / 11.1 / 11.2 / 11.3 / 11.4 / 11.5 / 12.1 / 12.2 / 12.3 / 12.4 / 12.5 / 12.6 / 13.1 / 13.2 / 14.2 / 18.1 / 18.2 / 18.3 / 付録A

## 他の計画書との依存順

| 順 | 計画 | この計画との関係 |
|---:|---|---|
| 1 | `2026-09-02-travel-goods-automation-foundation.md` | **前提。** `AUTOMATION_STATE_FILES`、`readBudget`、`writeIfChanged`、`decideTier`、`nextLinkState` を使う |
| 2 | `2026-09-02-travel-goods-article-automation.md` | **前提。** `automation-articles.yml` が `article:generate` / `article:recheck` を呼ぶ |
| **3** | **本計画（workflows）** | — |
| 4 | `2026-09-02-travel-goods-shadow-rollout.md` | 段階0 の統合検証 |

**計画1 と計画2 の両方が完了してから着手する。**

### 複数計画が触れる共有ファイル

| ファイル | 触る計画 | 競合しない理由 |
|---|---|---|
| `travel-goods-site/package.json` | 1・2・3・4 | **追加する npm script 名がすべて異なる**（計画1: `automation:sync` ／ 計画2: `article:generate` `article:recheck` ／ 計画3: `check:changed-paths` `check:breaker` `plan:revert` `post:verify-status` `wait:deploy` `check:post-deploy` ／ 計画4: `automation:dry-run` `automation:summarize`）。依存順に実行すれば同じ行を書き換えない |
| `travel-goods-site/tests/workflow-yaml.test.ts` | 3（作成）・4（describe を追加） | 計画4 は末尾に `describe` ブロックを足すだけ。既存の describe を変更しない |

**同じファイルを 2 つの計画が「作成」することはない。**

## Global Constraints

1. **すべての停止スイッチを既定 `false`（`AUTO_PUBLISH_PRODUCTS` は `off`）で導入する。**
   この計画の完了時点で、自動公開も自動マージも起きない。
2. **`main` へ直接 push しない。** 自動 revert も PR 経由。
3. **force push しない。** すべて通常 push。
4. **automation PR の auto-merge は merge commit に固定。** squash / rebase を使わない。
5. **GitHub Variables を workflow から変更しない。** 停止状態は `budget.json` に持つ。
6. **この計画では Actions を実行しない。** workflow ファイルの追加とローカルの単体テストまで。
   実行は計画4（段階0 の統合検証）で行う。
7. コミットは Task 単位。

## 完了条件

- [ ] `npm run typecheck` 成功
- [ ] `npm run lint` 成功
- [ ] `npm test` 成功。計画2 完了時点から **+38 件以上**
- [ ] `.github/workflows/` に**新規 5 本**（links / discover / articles / commit / reset）が存在し、YAML として妥当
- [ ] `automation-revert.yml` という別ファイルが**存在しない**（revert は commit の job）
- [ ] `.github/workflows/travel-goods-ci.yml` が `automation/verify` status を付けるよう**変更**されている
- [ ] すべての `automation-*.yml` が同一 concurrency group `travel-goods-automation` と `cancel-in-progress: false` を持つ
- [ ] `datasets/` に差分がない

## 非対象

- Actions の実行（計画4）
- GitHub Variables の設定（人が行う。値は本計画で定義するだけ）
- ブランチ保護の設定変更（人が行う。必要な設定は本計画に記載）
- Cloudflare の設定変更
- Workers AI / Browser Run の呼び出し実装（計画4 で参考所見として追加）

---

## Task 1: 停止スイッチの読み取り

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/switches.ts` |
| 作成 | `travel-goods-site/tests/automation-switches.test.ts` |

### Consumes / Produces

- Consumes: `process.env`
- Produces:
  - `export const SWITCH_NAMES = ['AUTOMATION_ENABLED', 'AUTO_DISCOVER_PRODUCTS', 'AUTO_PUBLISH_PRODUCTS', 'AUTO_GENERATE_ARTICLES', 'AUTO_PUBLISH_ARTICLES', 'AUTO_AUDIT_LINKS', 'AUTO_REPLACE_LINKS'] as const`（**7 個**）
  - `export type PublishTier = 'off' | 'S' | 'S,A'`
  - `export type Switches = { automationEnabled: boolean; autoDiscoverProducts: boolean; autoPublishProducts: PublishTier; autoGenerateArticles: boolean; autoPublishArticles: boolean; autoAuditLinks: boolean; autoReplaceLinks: boolean }`
  - `export function readSwitches(env: NodeJS.ProcessEnv): Switches`
  - `export function allowsTier(publish: PublishTier, tier: 'S' | 'A'): boolean`

### 仕様（設計書 13.1 に対応）

- **スイッチはちょうど 7 個。** 8 個目を作らない。
- `AUTO_PUBLISH_PRODUCTS` だけが 3 値 `'off' | 'S' | 'S,A'`。真偽値ではない。
- **未設定・空文字・未知の値はすべて安全側**（真偽値は `false`、`AUTO_PUBLISH_PRODUCTS` は `'off'`）。
- `allowsTier('S', 'A')` は `false`、`allowsTier('S,A', 'A')` は `true`、`allowsTier('off', 'S')` は `false`。

### ステップ

- [ ] `SWITCH_NAMES` がちょうど 7 個である失敗テストを書く（2 分）
- [ ] すべて未設定のとき安全側の既定値になる失敗テストを書く（3 分）
- [ ] `AUTO_PUBLISH_PRODUCTS='true'` が `'off'` として扱われる（真偽値は無効）失敗テストを書く（3 分）
- [ ] `AUTO_PUBLISH_PRODUCTS='S,A'` が正しく読める失敗テストを書く（2 分）
- [ ] `allowsTier` の 6 通り（3 値 × 2 Tier）を検査する失敗テストを書く（4 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `switches.ts` を実装する（6 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { SWITCH_NAMES, readSwitches, allowsTier } from '../src/lib/automation/switches';

it('停止スイッチはちょうど 7 個', () => {
  expect(SWITCH_NAMES).toHaveLength(7);
});

it('AUTO_PUBLISH_PRODUCTS に true を入れても off として扱う', () => {
  expect(readSwitches({ AUTO_PUBLISH_PRODUCTS: 'true' }).autoPublishProducts).toBe('off');
});

it('S は A を許可しない', () => {
  expect(allowsTier('S', 'A')).toBe(false);
  expect(allowsTier('S,A', 'A')).toBe(true);
  expect(allowsTier('off', 'S')).toBe(false);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-switches.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/switches
```

### 最小実装

`const PUBLISH_TIERS = ['off', 'S', 'S,A'] as const` に対する `includes` 判定。
真偽値は `env[name] === 'true'` だけを `true` とする。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-switches.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 停止スイッチ 7 種の読み取りを追加

AUTO_PUBLISH_PRODUCTS だけが off / S / S,A の 3 値。
未設定・未知の値はすべて安全側に倒す。
```

---

## Task 2: 変更パス検査

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/changed-paths.ts` |
| 作成 | `travel-goods-site/scripts/check-changed-paths.ts` |
| 変更 | `travel-goods-site/package.json`（`check:changed-paths` を追加） |
| 作成 | `travel-goods-site/tests/automation-changed-paths.test.ts` |

### Consumes / Produces

- Consumes: `AUTOMATION_STATE_FILES` from `@/lib/automation/state/schema`（計画1 Task 1）
- Produces:
  - `export const ALLOWED_AUTOMATION_PATHS: readonly string[]`（**7 個**。設計書 12.2）
  - `export type PathVerdict = { ok: true } | { ok: false; offenders: string[] }`
  - `export function checkChangedPaths(changed: string[]): PathVerdict`
  - `export type ResetPathVerdict = { ok: true } | { ok: false; reason: 'not-single-file' | 'non-breaker-field-changed' | 'wrong-transition' }`
  - `export function checkResetPaths(changed: string[], before: BudgetFile, after: BudgetFile): ResetPathVerdict`
  - `export function forbidsClosedTransition(before: BudgetFile, after: BudgetFile): boolean`
  - CLI: `npm run check:changed-paths -- --mode normal|reset --base <sha> --head <sha>`

### 仕様（設計書 12.2 に対応）

許可パス（7 個。この 7 個だけ）:

```
travel-goods-site/datasets/production/products/
travel-goods-site/datasets/production/articles/
travel-goods-site/datasets/production/merchants/
travel-goods-site/datasets/production/sources.json
travel-goods-site/automation/queue.json
travel-goods-site/automation/budget.json
travel-goods-site/automation/link-health.json
```

- `datasets/production/candidates/` は**含まれない**。
- `checkResetPaths` は reset PR 専用の 3 条件を検査する:
  1. 変更ファイルが `travel-goods-site/automation/budget.json` の 1 件だけ
  2. 差分が `circuitBreaker` フィールドの中だけに閉じている
  3. `circuitBreaker.state` の遷移が `open` → `closed`
- `forbidsClosedTransition` は `before.circuitBreaker.state === 'open' && after.circuitBreaker.state === 'closed'` で `true`。
  **reset 以外の workflow がこれを含む差分を作ったら中止する。**

### ステップ

- [ ] `ALLOWED_AUTOMATION_PATHS` がちょうど 7 個である失敗テストを書く（2 分）
- [ ] `src/lib/foo.ts` の変更が `offenders` に入る失敗テストを書く（3 分）
- [ ] `.github/workflows/x.yml` の変更が `offenders` に入る失敗テストを書く（2 分）
- [ ] `datasets/production/candidates/rakuten.json` が `offenders` に入る失敗テストを書く（3 分）
- [ ] 許可パス 7 つすべてが `ok: true` になる失敗テストを書く（3 分）
- [ ] `checkResetPaths` が 2 ファイル変更で `'not-single-file'` を返す失敗テストを書く（3 分）
- [ ] `checkResetPaths` が `rakutenRequests` も変わっていると `'non-breaker-field-changed'` を返す失敗テストを書く（4 分）
- [ ] `checkResetPaths` が `closed` → `closed` で `'wrong-transition'` を返す失敗テストを書く（3 分）
- [ ] `forbidsClosedTransition` が `open` → `closed` で `true`、`closed` → `open` で `false` を返す失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `changed-paths.ts` と CLI を実装し `package.json` に追加する（10 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { ALLOWED_AUTOMATION_PATHS, checkChangedPaths, forbidsClosedTransition } from '../src/lib/automation/changed-paths';

it('許可パスはちょうど 7 個。candidates は含まない', () => {
  expect(ALLOWED_AUTOMATION_PATHS).toHaveLength(7);
  expect(ALLOWED_AUTOMATION_PATHS).not.toContain('travel-goods-site/datasets/production/candidates/');
});

it('コードと workflow の変更を拒否する', () => {
  const v = checkChangedPaths(['travel-goods-site/src/lib/foo.ts', '.github/workflows/x.yml']);
  expect(v.ok).toBe(false);
  if (v.ok) return;
  expect(v.offenders).toHaveLength(2);
});

it('reset 以外は open→closed の遷移を作れない', () => {
  expect(forbidsClosedTransition(openBudget, closedBudget)).toBe(true);
  expect(forbidsClosedTransition(closedBudget, openBudget)).toBe(false);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-changed-paths.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/changed-paths
```

### 最小実装

`checkChangedPaths` は各パスが `ALLOWED_AUTOMATION_PATHS` のいずれかで
`startsWith`（ディレクトリ）または完全一致（ファイル）するかを見る。
CLI は `execFileSync('git', ['diff', '--name-only', base, head])` の出力を渡す。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-changed-paths.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 変更パス検査と reset 専用検査を追加

自動処理が触れるのは許可した 7 パスだけ。コード・workflow・設定は拒否する。
reset PR は budget.json の circuitBreaker だけを open→closed に変えられる。
reset 以外の workflow が closed への遷移を作ったら中止する。
```

---

## Task 3: circuit breaker の判定と 2 つの例外

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/breaker.ts` |
| 作成 | `travel-goods-site/scripts/check-breaker.ts` |
| 変更 | `travel-goods-site/package.json`（`check:breaker` を追加） |
| 作成 | `travel-goods-site/tests/automation-breaker.test.ts` |

### Consumes / Produces

- Consumes: `BudgetFile`, `CircuitBreaker` from `@/lib/automation/state/schema`
- Produces:
  - `export const REVERT_WINDOW_DAYS: 3`
  - `export type PrKind = 'content' | 'revert-tripping' | 'revert-normal' | 'reset'`
  - `export type MergeGate = { allowVerifyStatus: boolean; allowAutoMerge: boolean; reason: string }`
  - `export function evaluateMergeGate(breaker: CircuitBreaker, prKind: PrKind, transition: { before: CircuitBreaker['state']; after: CircuitBreaker['state'] }): MergeGate`
  - `export function recentReverts(breaker: CircuitBreaker, today: string): RevertRecord[]`
  - `export function shouldTrip(breaker: CircuitBreaker, newRevertSha: string, today: string): boolean`
  - `export function isKnownRevertSha(breaker: CircuitBreaker, sha: string): boolean`（reset の入力検証に使う）
  - `export function trip(breaker: CircuitBreaker, sha: string, today: string): CircuitBreaker`

### 仕様（設計書 12.6 に対応）

`evaluateMergeGate` の真理値表:

| `breaker.state` | `prKind` | `transition` | `allowVerifyStatus` / `allowAutoMerge` |
|---|---|---|---|
| `closed` | 任意 | 任意 | `true` / `true` |
| `open` | `content` | 任意 | **`false` / `false`** |
| `open` | `revert-normal` | 任意 | **`false` / `false`** |
| `open` | `revert-tripping` | `closed` → `open` | **`true` / `true`**（例外1） |
| `open` | `revert-tripping` | それ以外 | `false` / `false` |
| `open` | `reset` | `open` → `closed` | **`true` / `true`**（例外2） |
| `open` | `reset` | それ以外 | `false` / `false` |

**`prKind: 'revert-tripping'` は、その PR 自身が `closed` → `open` を含むときだけ有効。**
`open` → `open` や `open` → `closed` は例外1 に当たらない。

`shouldTrip` は次のときに `true`。

- `recentReverts(breaker, today)` が **1 件以上**あり、
- その中に `newRevertSha` と**同じ SHA が無い**（同じ commit の再 revert を 2 回目と数えない）。

`revertHistory` は `{ sha, revertedOn }[]`（計画1 Task 2）。
**`revertedShas: string[]` では日付が無く 3 日窓を計算できないため使わない。**

**3 日窓の境界**: `revertedOn` が `today`・`today - 1`・`today - 2` のものを「3 日以内」とする。
`today - 3` は窓の外。

`trip` は `revertHistory` の**先頭**に `{ sha, revertedOn: today }` を足し、
`REVERT_HISTORY_LIMIT`（20）件で切る。

### ステップ

- [ ] `closed` のときはすべての `prKind` で許可される失敗テストを書く（3 分）
- [ ] `open` + `content` が拒否される失敗テストを書く（2 分）
- [ ] `open` + `revert-normal` が拒否される失敗テストを書く（2 分）
- [ ] `open` + `revert-tripping` + `closed→open` が**許可される**失敗テストを書く（例外1）（4 分）
- [ ] `open` + `revert-tripping` + `open→open` が拒否される失敗テストを書く（3 分）
- [ ] `open` + `reset` + `open→closed` が**許可される**失敗テストを書く（例外2）（4 分）
- [ ] `open` + `reset` + `closed→closed` が拒否される失敗テストを書く（3 分）
- [ ] `recentReverts` が 3 日窓の内外を分ける失敗テストを書く（`today`／`-1`／`-2` は内、`-3` は外）（5 分）
- [ ] `shouldTrip` が 3 日以内 2 回目で `true` を返す失敗テストを書く（3 分）
- [ ] `shouldTrip` が 4 日空けば `false` を返す失敗テストを書く（3 分）
- [ ] `shouldTrip` が**同じ SHA の再 revert**では `false` を返す失敗テストを書く（4 分）
- [ ] `trip` が `state`・`trippedOn`・`reason`・`revertHistory` をすべて設定する失敗テストを書く（3 分）
- [ ] `trip` を 25 回呼んでも履歴が 20 件で切られる失敗テストを書く（4 分）
- [ ] `isKnownRevertSha` が履歴に無い SHA を拒否する失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `breaker.ts` と CLI を実装する（12 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-breaker.test.ts
import { describe, expect, it } from 'vitest';
import {
  REVERT_WINDOW_DAYS,
  evaluateMergeGate,
  isKnownRevertSha,
  recentReverts,
  shouldTrip,
  trip,
} from '../src/lib/automation/breaker';
import { REVERT_HISTORY_LIMIT, type CircuitBreaker } from '../src/lib/automation/state/schema';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

const closed: CircuitBreaker = { state: 'closed', trippedOn: null, reason: null, revertHistory: [] };

function openBreaker(history: { sha: string; revertedOn: string }[]): CircuitBreaker {
  return { state: 'open', trippedOn: '2026-09-20', reason: '3日以内に2回の自動revert', revertHistory: history };
}

describe('マージ可否の判定', () => {
  it('closed ではすべての PR 種別を許可する', () => {
    for (const kind of ['content', 'revert-normal', 'revert-tripping', 'reset'] as const) {
      const gate = evaluateMergeGate(closed, kind, { before: 'closed', after: 'closed' });
      expect(gate.allowVerifyStatus).toBe(true);
      expect(gate.allowAutoMerge).toBe(true);
    }
  });

  it('open では通常の自動 PR を止める', () => {
    const gate = evaluateMergeGate(openBreaker([]), 'content', { before: 'open', after: 'open' });
    expect(gate.allowVerifyStatus).toBe(false);
    expect(gate.allowAutoMerge).toBe(false);
  });

  it('open では通常の revert PR も止める', () => {
    expect(evaluateMergeGate(openBreaker([]), 'revert-normal', { before: 'open', after: 'open' }).allowAutoMerge)
      .toBe(false);
  });

  it('例外1: breaker を作動させる当の revert PR は通す', () => {
    const gate = evaluateMergeGate(openBreaker([]), 'revert-tripping', { before: 'closed', after: 'open' });
    expect(gate.allowVerifyStatus).toBe(true);
    expect(gate.allowAutoMerge).toBe(true);
  });

  it('例外1 は closed→open の遷移を含むときだけ', () => {
    expect(evaluateMergeGate(openBreaker([]), 'revert-tripping', { before: 'open', after: 'open' }).allowAutoMerge)
      .toBe(false);
    expect(evaluateMergeGate(openBreaker([]), 'revert-tripping', { before: 'open', after: 'closed' }).allowAutoMerge)
      .toBe(false);
  });

  it('例外2: reset PR は open→closed のときだけ通す', () => {
    expect(evaluateMergeGate(openBreaker([]), 'reset', { before: 'open', after: 'closed' }).allowAutoMerge)
      .toBe(true);
    expect(evaluateMergeGate(openBreaker([]), 'reset', { before: 'closed', after: 'closed' }).allowAutoMerge)
      .toBe(false);
  });
});

describe('3 日窓と revert 履歴', () => {
  it('窓は 3 日', () => {
    expect(REVERT_WINDOW_DAYS).toBe(3);
  });

  it('today / -1 / -2 は窓の内、-3 は外', () => {
    const breaker = openBreaker([
      { sha: SHA_A, revertedOn: '2026-09-20' },
      { sha: SHA_B, revertedOn: '2026-09-18' },
      { sha: SHA_C, revertedOn: '2026-09-17' },
    ]);
    const recent = recentReverts(breaker, '2026-09-20').map((r) => r.sha);
    expect(recent).toContain(SHA_A);
    expect(recent).toContain(SHA_B);
    expect(recent).not.toContain(SHA_C);
  });

  it('3 日以内の 2 回目で作動する', () => {
    const breaker = openBreaker([{ sha: SHA_A, revertedOn: '2026-09-19' }]);
    expect(shouldTrip(breaker, SHA_B, '2026-09-20')).toBe(true);
  });

  it('4 日空けば作動しない', () => {
    const breaker = openBreaker([{ sha: SHA_A, revertedOn: '2026-09-16' }]);
    expect(shouldTrip(breaker, SHA_B, '2026-09-20')).toBe(false);
  });

  it('同じ SHA の再 revert は 2 回目と数えない', () => {
    const breaker = openBreaker([{ sha: SHA_A, revertedOn: '2026-09-19' }]);
    expect(shouldTrip(breaker, SHA_A, '2026-09-20')).toBe(false);
  });

  it('trip はすべてのフィールドを設定する', () => {
    const next = trip(closed, SHA_A, '2026-09-20');
    expect(next.state).toBe('open');
    expect(next.trippedOn).toBe('2026-09-20');
    expect(next.reason).not.toBeNull();
    expect(next.revertHistory[0]).toEqual({ sha: SHA_A, revertedOn: '2026-09-20' });
  });

  it('履歴は保持上限で切られる', () => {
    let breaker = closed;
    for (let i = 0; i < REVERT_HISTORY_LIMIT + 5; i += 1) {
      breaker = trip(breaker, String(i).padStart(40, '0'), '2026-09-20');
    }
    expect(breaker.revertHistory).toHaveLength(REVERT_HISTORY_LIMIT);
  });

  it('reset の入力 SHA は履歴にあるものだけ受け付ける', () => {
    const breaker = openBreaker([{ sha: SHA_A, revertedOn: '2026-09-20' }]);
    expect(isKnownRevertSha(breaker, SHA_A)).toBe(true);
    expect(isKnownRevertSha(breaker, SHA_B)).toBe(false);
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-breaker.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/breaker
```

### 最小実装

`evaluateMergeGate` は `breaker.state === 'closed'` なら即許可。
`open` のときは `prKind` と `transition` の組み合わせを上の表どおりに分岐する。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-breaker.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): circuit breaker の判定と 2 つの例外を追加

open では通常の自動 PR と自動 revert PR を止める。
例外1: closed→open の遷移を含む 2 回目の revert PR は通す（循環を避ける）。
例外2: automation-reset の PR は open→closed のときだけ通す。
```

---

## Task 4: revert 対象の妥当性検証

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/revert-target.ts` |
| 作成 | `travel-goods-site/scripts/plan-revert.ts` |
| 変更 | `travel-goods-site/package.json`（`plan:revert` を追加） |
| 作成 | `travel-goods-site/tests/automation-revert-target.test.ts` |

### Consumes / Produces

- Consumes: なし（git の出力を引数で受ける純関数）
- Produces:
  - `export type CommitShape = { sha: string; parents: string[]; subject: string; firstParentOnMain: boolean }`
  - `export type RevertVerdict = { ok: true } | { ok: false; reason: 'sha-mismatch' | 'not-merge-commit' | 'first-parent-not-main' | 'human-or-reset-pr' | 'already-auto-revert' }`
  - `export function validateRevertTarget(target: CommitShape, expectedSha: string, options: { resetPrNumbers: number[] }): RevertVerdict`
  - `export function isAutoRevertCommit(subject: string): boolean`（`[auto-revert]` を含むか）
  - `export const AUTO_REVERT_MARKER: '[auto-revert]'`
  - CLI: `npm run plan:revert -- --sha <sha> --expected <sha>`

### 仕様（設計書 12.5 手順1 に対応）

4 条件をすべて満たすときだけ `{ ok: true }`:

- **(a)** `target.sha === expectedSha`
- **(b)** `target.parents.length === 2`（ちょうど 2 親の merge commit）
- **(c)** `target.firstParentOnMain === true`（第1親が `main` 系統）
- **(d)** `subject` から取り出した PR 番号が `options.resetPrNumbers` に含まれず、
  かつ `subject` が人の PR のマージを示さない

加えて `isAutoRevertCommit(target.subject)` が `true` なら `'already-auto-revert'`
（**revert の revert を作らない**）。

### ステップ

- [ ] SHA 不一致で `'sha-mismatch'` を返す失敗テストを書く（2 分）
- [ ] 親が 1 つ（通常コミット）で `'not-merge-commit'` を返す失敗テストを書く（3 分）
- [ ] 親が 3 つ（オクトパスマージ）でも `'not-merge-commit'` を返す失敗テストを書く（2 分）
- [ ] `firstParentOnMain: false` で `'first-parent-not-main'` を返す失敗テストを書く（3 分）
- [ ] reset PR 番号を含む subject で `'human-or-reset-pr'` を返す失敗テストを書く（3 分）
- [ ] `[auto-revert]` を含む subject で `'already-auto-revert'` を返す失敗テストを書く（3 分）
- [ ] 4 条件すべて満たすと `{ ok: true }` を返す失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `revert-target.ts` と CLI を実装する（10 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { validateRevertTarget, isAutoRevertCommit } from '../src/lib/automation/revert-target';

it('merge commit でなければ revert しない', () => {
  const v = validateRevertTarget(
    { sha: 'a1', parents: ['p1'], subject: 'chore: x', firstParentOnMain: true },
    'a1', { resetPrNumbers: [] });
  expect(v).toEqual({ ok: false, reason: 'not-merge-commit' });
});

it('第1親が main 系統でなければ revert しない', () => {
  const v = validateRevertTarget(
    { sha: 'a1', parents: ['p1', 'p2'], subject: 'Merge pull request #10', firstParentOnMain: false },
    'a1', { resetPrNumbers: [] });
  expect(v).toEqual({ ok: false, reason: 'first-parent-not-main' });
});

it('revert の revert を作らない', () => {
  expect(isAutoRevertCommit('Revert "x" [auto-revert]')).toBe(true);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-revert-target.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/revert-target
```

### 最小実装

CLI が `git rev-list --parents -n 1 <sha>` と
`git merge-base --is-ancestor <sha>^1 origin/main` を実行して `CommitShape` を組み立て、
純関数 `validateRevertTarget` に渡す。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-revert-target.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): revert 対象の妥当性検証を追加

ちょうど 2 親の merge commit で、第1親が main 系統であることを検証する。
reset PR と人の PR、および既存の auto-revert コミットは対象にしない。
```

---

## Task 5: automation/verify status の付与 CLI

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/scripts/post-verify-status.ts` |
| 変更 | `travel-goods-site/package.json`（`post:verify-status` を追加） |
| 変更 | `.github/workflows/travel-goods-ci.yml` |
| 作成 | `travel-goods-site/tests/post-verify-status.test.ts` |

### Consumes / Produces

- Consumes: `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, 引数 `--sha`, `--state`
- Produces:
  - CLI: `npm run post:verify-status -- --sha <sha> --state success|failure [--dry-run]`
  - `export const VERIFY_CONTEXT = 'automation/verify'`（`src/lib/automation/verify-context.ts` に置く）

### 仕様（設計書 12.3 に対応）

- `POST /repos/{owner}/{repo}/statuses/{sha}` に
  `{ state, context: 'automation/verify', description }` を送る。
- **人の PR** では `travel-goods-ci.yml` の `verify` ジョブが最後にこれを呼ぶ。
- **自動 PR** では `automation-commit.yml` / `automation-revert.yml` / `automation-reset.yml` が呼ぶ。
- `--dry-run` では HTTP を送らず、送る内容を標準出力に出す（テスト用）。
- `main` のブランチ保護は必須チェックを **`automation/verify` の 1 つだけ**にする（人が設定する）。

### `travel-goods-ci.yml` への変更（この Task で行う唯一の workflow 変更）

- `permissions` を**追加ではなく明示**する。`permissions:` を書くと**書いていない権限が none になる**ため、
  `actions/checkout` に必要な `contents: read` を必ず残す。

```yaml
permissions:
  contents: read      # checkout に必要。statuses を足すときに落とさない
  statuses: write     # automation/verify を付けるために追加
```
- `verify` ジョブの最後に次のステップを足す。

```yaml
      - name: automation/verify status を付ける
        if: ${{ always() }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          npm run post:verify-status -- \
            --sha "${{ github.event.pull_request.head.sha || github.sha }}" \
            --state "${{ job.status == 'success' && 'success' || 'failure' }}"
```

### ステップ

- [ ] `VERIFY_CONTEXT` が `'automation/verify'` である失敗テストを書く（2 分）
- [ ] `--dry-run` で送信内容に `context: automation/verify` が含まれる失敗テストを書く（4 分）
- [ ] `--state` が `success` / `failure` 以外なら終了コード 2 で止まる失敗テストを書く（3 分）
- [ ] `--sha` が 40 桁の 16 進でなければ終了コード 2 で止まる失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `post-verify-status.ts` を実装する（8 分）
- [ ] `travel-goods-ci.yml` に `statuses: write` とステップを追加する（4 分）
- [ ] YAML が妥当であることを確認する（`node -e "require('yaml')"` 相当、または目視）（2 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { execFileSync } from 'node:child_process';

it('dry-run で送信内容に context が含まれる', () => {
  const out = execFileSync('npx', ['tsx', 'scripts/post-verify-status.ts',
    '--sha', 'a'.repeat(40), '--state', 'success', '--dry-run'], { encoding: 'utf8' });
  expect(out).toContain('automation/verify');
});

it('不正な state は終了コード 2', () => {
  expect(() => execFileSync('npx', ['tsx', 'scripts/post-verify-status.ts',
    '--sha', 'a'.repeat(40), '--state', 'maybe', '--dry-run'])).toThrow();
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/post-verify-status.test.ts
```

### 期待する失敗内容

```
Error: Cannot find module 'scripts/post-verify-status.ts'
```

### 最小実装

`fetch` で GitHub REST を叩く。`--dry-run` なら `console.log(JSON.stringify(payload))` で終える。
トークンは `process.env.GITHUB_TOKEN`。**値をログに出さない。**

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/post-verify-status.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): automation/verify status を付ける CLI を追加

人の PR は travel-goods-ci、自動 PR は automation-* が同じ context を付ける。
main の必須チェックを 1 つに統一し、両経路が同じ条件で通るようにする。
```

---

## Task 6: 日次 3 本の workflow（links / discover / articles）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `.github/workflows/automation-links.yml` |
| 作成 | `.github/workflows/automation-discover.yml` |
| 作成 | `.github/workflows/automation-articles.yml` |
| 作成 | `travel-goods-site/scripts/ensure-daily-branch.sh` |
| 作成 | `travel-goods-site/tests/workflow-yaml.test.ts` |

### Consumes / Produces

- Consumes: `switches.ts`, `breaker.ts`, `budget.ts`, 計画1・2 の CLI
- Produces: workflow 3 本と共通の作業ブランチ取得スクリプト

### 仕様（設計書 11.1・11.2・11.5 に対応）

**共通ヘッダ（3 本すべてに同じものを書く）**:

```yaml
concurrency:
  group: travel-goods-automation
  cancel-in-progress: false

permissions:
  contents: write
  issues: write

defaults:
  run:
    working-directory: travel-goods-site
```

**スケジュール（cron は UTC。JST の前日曜日を指す）**:

| workflow | cron | JST |
|---|---|---|
| `automation-links` | `0 21 * * *` | 毎日 06:00 |
| `automation-discover` | `30 21 * * 0,3` | 月・木 06:30 |
| `automation-articles` | `30 21 * * 1,4` | 火・金 06:30 |

**作業ブランチの取得規則**（`ensure-daily-branch.sh`）:

1. `origin/automation/daily-YYYY-MM-DD`（JST の当日）が存在すれば取得してその先端で作業する。
2. 存在しなければ、実行開始時点の `origin/main` から作る。
3. push は**通常 push のみ**。`--force` / `--force-with-lease` を使わない。
4. 非 fast-forward で拒否されたら、ブランチを取り直して処理をやり直す。それでも失敗したら中止して Issue。

**各 workflow の最初のステップ**:

- `AUTOMATION_ENABLED !== 'true'` なら**即座に正常終了**する。
- `check:breaker` が `open` を返したら、**新しい PR を作らず、当日ブランチへの追加書き込みもせず、
  Issue 更新だけを行って正常終了**する（設計書 12.6）。

### ステップ

- [ ] `tests/workflow-yaml.test.ts` に、3 本すべてが同一 concurrency group を持つ失敗テストを書く（4 分）
- [ ] `cancel-in-progress: false` である失敗テストを書く（2 分）
- [ ] 3 本すべてが `workflow_dispatch` を持つ失敗テストを書く（2 分）
- [ ] cron が仕様どおりである失敗テストを書く（3 分）
- [ ] どの workflow も `--force` を含まない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `ensure-daily-branch.sh` を書く（8 分）
- [ ] `automation-links.yml` を書く（10 分）
- [ ] `automation-discover.yml` を書く（8 分）
- [ ] `automation-articles.yml` を書く（8 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(__dirname, '../../.github/workflows');
const automationFiles = fs.readdirSync(dir).filter((f) => f.startsWith('automation-'));

it('すべての automation workflow が同一 concurrency group を使う', () => {
  expect(automationFiles.length).toBeGreaterThanOrEqual(3);
  for (const f of automationFiles) {
    const y = fs.readFileSync(path.join(dir, f), 'utf8');
    expect(y).toContain('group: travel-goods-automation');
    expect(y).toContain('cancel-in-progress: false');
  }
});

it('force push を書かない', () => {
  for (const f of automationFiles) {
    const y = fs.readFileSync(path.join(dir, f), 'utf8');
    expect(y).not.toMatch(/--force(-with-lease)?\b/);
  }
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts
```

### 期待する失敗内容

```
AssertionError: expected 0 to be greater than or equal to 3
```

### 最小実装

既存の `.github/workflows/travel-goods-rakuten-sync.yml` を雛形にする。
入力値はシェルへ直接展開せず、`env:` に入れてから `"$VAR"` で参照する
（既存 workflow と同じ書き方。コマンドインジェクション対策）。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts && npm run lint
```

### コミット

```
feat: 日次自動処理の workflow 3 本を追加

links（毎日）/ discover（月・木）/ articles（火・金）。
共通の concurrency group で同時実行を防ぎ、cancel-in-progress は false。
当日ブランチがあれば取得、無ければ実行開始時点の main から作る。force push はしない。
AUTOMATION_ENABLED が true でなければ即座に正常終了する。
```

---

## Task 7: automation-commit.yml（検証・PR・auto-merge）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `.github/workflows/automation-commit.yml` |
| 変更 | `travel-goods-site/tests/workflow-yaml.test.ts` |

### Consumes / Produces

- Consumes: `check:changed-paths`, `check:breaker`, `post:verify-status`, 全検証コマンド
- Produces: 自動 PR と auto-merge

### 仕様（設計書 12.1・12.2・12.3 に対応）

スケジュール: `30 22 * * *`（JST 07:30）。`workflow_dispatch` も持つ。

手順:

1. 当日ブランチが**存在しなければ何もせず正常終了**する（空の PR を作らない）。
2. `check:breaker` が `open` なら Issue 更新だけして正常終了。
3. `npm run check:changed-paths -- --mode normal --base origin/main --head HEAD`。
   許可パス外があれば **PR を作らず Issue を上げて終了**。
4. 全検証: `typecheck` → `lint` → `test` → `validate:content:all` → `build:only` →
   `check:release -- --out out` → 必要な E2E。
5. PR を作成する（base `main`、head 当日ブランチ）。
6. **auto-merge を merge commit 方式で有効にする**（`gh pr merge --merge --auto` 相当を REST で）。
7. 検証が成功したときだけ `post:verify-status --state success` を PR head SHA に付ける。

### ステップ

- [ ] `automation-commit.yml` が `merge` 方式を指定している失敗テストを書く（`squash`/`rebase` を含まない）（3 分）
- [ ] 同一 concurrency group を持つ失敗テストを書く（2 分）
- [ ] `permissions` に `statuses: write` がある失敗テストを書く（2 分）
- [ ] 全 6 検証コマンドが含まれる失敗テストを書く（4 分）
- [ ] `--force` を含まない失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `automation-commit.yml` を書く（15 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
it('automation-commit は merge commit 方式で auto-merge する', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-commit.yml'), 'utf8');
  expect(y).toMatch(/merge_method['"]?\s*:\s*['"]merge['"]|--merge\b/);
  expect(y).not.toMatch(/--squash|--rebase|merge_method['"]?\s*:\s*['"](squash|rebase)['"]/);
});

it('全 6 検証を実行する', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-commit.yml'), 'utf8');
  for (const cmd of ['typecheck', 'lint', 'test', 'validate:content:all', 'build:only', 'check:release']) {
    expect(y).toContain(cmd);
  }
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts
```

### 期待する失敗内容

```
Error: ENOENT: no such file or directory, open '.../automation-commit.yml'
```

### 最小実装

`actions/github-script@v7` で PR 作成と auto-merge を行う。
auto-merge は `graphql` の `enablePullRequestAutoMerge`（`mergeMethod: MERGE`）を使う。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts && npm run lint
```

### コミット

```
feat: automation-commit.yml を追加

その日の変更を 1 つの PR にまとめ、変更パス検査と全検証を通してから
merge commit 方式で auto-merge する。squash / rebase は使わない。
検証成功時だけ automation/verify status を付ける。
```

---

## Task 8: revert job と automation-reset.yml

### 対象ファイル

| 種別 | パス |
|---|---|
| 変更 | `.github/workflows/automation-commit.yml`（`revert` job を追加） |
| 作成 | `.github/workflows/automation-reset.yml` |
| 変更 | `travel-goods-site/tests/workflow-yaml.test.ts` |

### Consumes / Produces

- Consumes: `plan:revert`, `check:breaker`, `check:changed-paths --mode reset`, `post:verify-status`
- Produces: `revert` job と reset PR

### revert を別 workflow にしない理由

すべての `automation-*` workflow が同じ concurrency group
`travel-goods-automation`（`cancel-in-progress: false`）を使う。
このとき、**親 workflow が同じ group の reusable workflow（`workflow_call`）の完了を待つと、
親が group を占有したまま子が起動できずデッドロックする。**

したがって revert は **`automation-commit.yml` の後続 job** として実装する。
同一 workflow 内の `needs:` による job 依存であれば、concurrency group は 1 つの run として扱われる。

```yaml
jobs:
  verify-and-merge:
  wait-for-deploy:      # needs: verify-and-merge
  post-deploy-check:    # needs: wait-for-deploy
  revert:               # needs: post-deploy-check
    if: ${{ always() && needs.post-deploy-check.result == 'failure' }}
```

**手動で revert したい場合**は `automation-commit.yml` を
`workflow_dispatch`（入力 `revert_sha`）で起動し、`verify-and-merge` を
`if: ${{ inputs.revert_sha == '' }}` で飛ばす。**別 run として安全に起動できる。**

### `revert` job の手順

1. `plan:revert` で対象 SHA の 4 条件（2 親の merge commit／第1親が `main` 系統／
   reset PR・人の PR でない／`[auto-revert]` を含まない）を検証。落ちたら Issue を上げて終了。
2. `automation/revert-YYYY-MM-DD` を現在の `main` から作り、`git revert -m 1 <SHA>` して**通常 push**。
3. `shouldTrip` が `true` なら、**同じブランチに `budget.json` の
   `circuitBreaker.state = "open"` と `revertHistory` への追記を同梱**する（12.6 節 例外1）。
4. revert PR を作る（タイトルに `[auto-revert]`）。
5. **この job 自身が** `verify-and-merge` と同等の全検証を実行する。
6. 成功時のみ revert PR の head SHA に `automation/verify` を付け、auto-merge を有効にする。
7. 必ず Issue を上げる。**1 日 1 回まで。**

### `automation-reset.yml`

- `on: workflow_dispatch` のみ。**`schedule` も他のイベントも持たない。**
- 必須入力 3 つ:

| 入力 | 検証 |
|---|---|
| `reason` | `required: true`。空文字なら終了コード 2 |
| `revert_sha` | `required: true`。`budget.json` の `revertHistory` に含まれる `sha` であること |
| `confirm` | `required: true`。**`RESET` と完全一致**しなければ終了コード 2 |

- `budget.json` の `circuitBreaker` だけを `open` → `closed` に変える PR を作る。
- `check:changed-paths -- --mode reset` に成功したときだけ `automation/verify` を付けて auto-merge。

### ステップ

- [ ] `automation-commit.yml` に `revert` job があり `needs: post-deploy-check` を持つ失敗テストを書く（3 分）
- [ ] `automation-revert.yml` という**別ファイルが存在しない**失敗テストを書く（2 分）
- [ ] どの workflow も `uses:` で同一リポジトリの reusable workflow を呼ばない失敗テストを書く（4 分）
- [ ] `automation-reset.yml` が `schedule` を持たない失敗テストを書く（3 分）
- [ ] `automation-reset.yml` が 3 つの必須入力を持ち `RESET` の完全一致を要求する失敗テストを書く（4 分）
- [ ] `revert` job が `main` への直接 push を含まない失敗テストを書く（3 分）
- [ ] `revert` job が `git revert -m 1` を含む失敗テストを書く（2 分）
- [ ] `--force` を含まない失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `automation-commit.yml` に `revert` job を足す（14 分）
- [ ] `automation-reset.yml` を書く（12 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/workflow-yaml.test.ts（describe を追加）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workflowDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '../../.github/workflows');
const read = (name: string) => fs.readFileSync(path.join(workflowDir, name), 'utf8');
const automationFiles = () =>
  fs.readdirSync(workflowDir).filter((f) => f.startsWith('automation-'));

describe('revert の構成', () => {
  it('revert は automation-commit の後続 job で、別 workflow にしない', () => {
    const commit = read('automation-commit.yml');
    expect(commit).toMatch(/^\s{2}revert:/m);
    expect(commit).toMatch(/needs:\s*post-deploy-check/);
    expect(fs.existsSync(path.join(workflowDir, 'automation-revert.yml'))).toBe(false);
  });

  it('同一 concurrency group 内で reusable workflow を呼ばない', () => {
    for (const file of automationFiles()) {
      const y = read(file);
      expect(y).not.toMatch(/uses:\s*\.\/\.github\/workflows\//);
      expect(y).not.toMatch(/uses:\s*ioda47871-byte\/mugi-no-mi-nextjs-2\/\.github\/workflows\//);
    }
  });

  it('main へ直接 push しない。force push もしない', () => {
    for (const file of automationFiles()) {
      const y = read(file);
      expect(y).not.toMatch(/git push[^\n]*HEAD:main|git push origin main\b/);
      expect(y).not.toMatch(/--force(-with-lease)?\b/);
    }
  });

  it('revert は 2 親の merge commit だけを対象にする', () => {
    expect(read('automation-commit.yml')).toContain('git revert -m 1');
    expect(read('automation-commit.yml')).toContain('plan:revert');
  });
});

describe('automation-reset.yml', () => {
  it('workflow_dispatch だけで起動する', () => {
    const y = read('automation-reset.yml');
    expect(y).toContain('workflow_dispatch:');
    expect(y).not.toMatch(/^\s*schedule:/m);
    expect(y).not.toMatch(/^\s*(push|pull_request|workflow_run):/m);
  });

  it('理由・revert SHA・確認文字列を必須にする', () => {
    const y = read('automation-reset.yml');
    for (const name of ['reason', 'revert_sha', 'confirm']) {
      expect(y).toContain(`${name}:`);
    }
    expect((y.match(/required:\s*true/g) ?? [])).toHaveLength(3);
  });

  it('確認文字列は RESET の完全一致', () => {
    expect(read('automation-reset.yml')).toContain('"$CONFIRM" = "RESET"');
  });

  it('reset 専用の変更パス検査を通す', () => {
    expect(read('automation-reset.yml')).toContain('--mode reset');
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts
```

### 期待する失敗内容

```
Error: ENOENT: no such file or directory, open '.../automation-reset.yml'
```

### 最小実装

`revert` job は `if: ${{ always() && needs.post-deploy-check.result == 'failure' }}`。
`automation-reset.yml` の最初のステップは
`[ "$CONFIRM" = "RESET" ] || { echo '確認文字列が一致しません'; exit 2; }`
（入力は `env:` に入れてからシェル変数として参照する。直接展開しない）。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts && npm test && npm run lint
```

### コミット

```
feat: revert job と automation-reset.yml を追加

revert は automation-commit の後続 job にする。
同一 concurrency group 内で reusable workflow を待つとデッドロックするため、
別 workflow にはしない。手動 revert は workflow_dispatch で別 run として起動する。
main へ直接 push せず、revert ブランチと PR を経由する。
reset は workflow_dispatch のみ。理由・revert SHA・確認文字列 RESET を必須にする。
```

---

## Task 9: マージ確認・デプロイ確認・公開後検査・Issue 通知

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/deploy-gate.ts` |
| 作成 | `travel-goods-site/scripts/wait-for-deploy.ts` |
| 作成 | `travel-goods-site/scripts/post-deploy-check.ts` |
| 作成 | `travel-goods-site/src/lib/automation/notify.ts` |
| 変更 | `travel-goods-site/package.json`（`wait:deploy` と `check:post-deploy` を追加） |
| 変更 | `.github/workflows/automation-commit.yml`（`wait-for-deploy` と `post-deploy-check` job） |
| 作成 | `travel-goods-site/tests/automation-deploy-gate.test.ts` |
| 作成 | `travel-goods-site/tests/automation-notify.test.ts` |

### Consumes / Produces

- Consumes: `runArticleChecks`（計画2）、`resolveMerchantLinks`（既存）
- Produces:
  - `export const DEPLOY_CHECK_NAME_PATTERN: RegExp`（Cloudflare Pages の check run 名に一致）
  - `export type MergeState = { merged: false } | { merged: true; mergeCommitSha: string }`
  - `export type DeployState = { status: 'success' | 'pending' | 'failure' | 'absent'; forSha: string | null }`
  - `export function readMergeState(pr: { merged: boolean; merge_commit_sha: string | null }): MergeState`
  - `export function readDeployState(checkRuns: readonly CheckRunLike[], expectedSha: string): DeployState`
  - `export type CheckRunLike = { name: string; head_sha: string; status: string; conclusion: string | null }`
  - `export const POLL_INTERVALS_MS: readonly number[]`（bounded。合計 20 分）
  - `export const ISSUE_LABELS`（7 個）と `decideNotifications`（従来どおり）

### 固定待機をやめる（設計書 12.4 の実装方法）

**「10 分待ってから検査」は行わない。** 次を順に確認する。

| # | 確認 | 手段 | 失敗時 |
|---:|---|---|---|
| 1 | PR が**実際に merged になった** | `GET /repos/{o}/{r}/pulls/{n}` の `merged === true` | タイムアウトまで再確認 |
| 2 | **merge commit SHA を取得** | 同じ応答の `merge_commit_sha` | `null` なら 1 に戻る |
| 3 | **その SHA に対応する Cloudflare Pages のデプロイが成功** | `GET /repos/{o}/{r}/commits/{merge_commit_sha}/check-runs` から Pages の check run を探し、`status: 'completed'` かつ `conclusion: 'success'` | タイムアウトまで再確認 |
| 4 | 公開後検査を実行 | `check:post-deploy` | `revert` job へ |

**別 SHA の成功デプロイを success と誤認しない。**
`readDeployState` は `head_sha === expectedSha` の check run だけを見る。
`/commits/{sha}/check-runs` は指定 SHA の check run だけを返すが、
**呼び出し側の SHA 取り違えを防ぐため、関数側でも `head_sha` を照合する。**

Cloudflare Pages は GitHub 連携で**check run**としてビルド結果を返す
（[Cloudflare Docs](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)、2026-09-02 確認）。
**Cloudflare の API トークンは不要**で、`GITHUB_TOKEN` の `checks: read` だけで足りる。

### bounded polling とタイムアウト

```ts
/** 合計 20 分。最初は短く、あとは 60 秒間隔。 */
export const POLL_INTERVALS_MS: readonly number[] = [
  15_000, 15_000, 30_000, 30_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000,
  60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000, 60_000,
];
```

| 状況 | 扱い |
|---|---|
| 20 分以内に merged にならない | **revert しない。** `automation-blocked` の Issue を上げて job を失敗させる。翌日の実行が同じ PR を見つけて続きから進める |
| merged したがデプロイ check run が 20 分以内に完了しない | **revert しない。** `automation-failure` の Issue を上げて job を失敗させる。デプロイが遅いだけの可能性があるため、勝手に戻さない |
| デプロイ check run が `conclusion: 'failure'` | **revert しない。** Pages 側のビルド失敗であり、直前の公開版が残る。`automation-failure` の Issue を上げる |
| デプロイ成功後の公開後検査が失敗 | **`revert` job を動かす**（Task 8） |

> **タイムアウトでは revert しない。** 「まだ終わっていない」と「壊れている」を区別する。
> revert するのは**公開後検査が実際に失敗したときだけ**である。

### ステップ

- [ ] `readMergeState` が `merged: false` と `merge_commit_sha: null` を区別する失敗テストを書く（3 分）
- [ ] `readDeployState` が期待 SHA と異なる check run を無視する失敗テストを書く（5 分）
- [ ] `readDeployState` が Pages 以外の check run（`verify` など）を無視する失敗テストを書く（4 分）
- [ ] `readDeployState` が `pending` / `failure` / `absent` を区別する失敗テストを書く（4 分）
- [ ] `POLL_INTERVALS_MS` の合計が 20 分ちょうどである失敗テストを書く（3 分）
- [ ] `ISSUE_LABELS` が 7 個で、何も起きていなければ通知が空になる失敗テストを書く（4 分）
- [ ] 6 日連続失敗では通知せず 7 日で通知する失敗テストを書く（4 分）
- [ ] 保留 9 件で通知せず 10 件で通知する失敗テストを書く（3 分）
- [ ] `decideNotifications` の入力に AI 関連のフィールドが無いことを型で確認する失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `deploy-gate.ts` / `notify.ts` / CLI 2 本を実装する（16 分）
- [ ] `automation-commit.yml` に `wait-for-deploy` と `post-deploy-check` の 2 job を足す（8 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-deploy-gate.test.ts
import { describe, expect, it } from 'vitest';
import {
  POLL_INTERVALS_MS,
  readDeployState,
  readMergeState,
  type CheckRunLike,
} from '../src/lib/automation/deploy-gate';

const MERGE_SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);

function checkRun(over: Partial<CheckRunLike> = {}): CheckRunLike {
  return {
    name: 'Cloudflare Pages: travel-goods-site',
    head_sha: MERGE_SHA,
    status: 'completed',
    conclusion: 'success',
    ...over,
  };
}

describe('マージ確認', () => {
  it('merged でなければ merge commit を返さない', () => {
    expect(readMergeState({ merged: false, merge_commit_sha: null })).toEqual({ merged: false });
  });

  it('merged でも SHA が無ければ未完了として扱う', () => {
    expect(readMergeState({ merged: true, merge_commit_sha: null })).toEqual({ merged: false });
  });

  it('merged かつ SHA があれば取得できる', () => {
    expect(readMergeState({ merged: true, merge_commit_sha: MERGE_SHA }))
      .toEqual({ merged: true, mergeCommitSha: MERGE_SHA });
  });
});

describe('デプロイ確認', () => {
  it('期待した SHA のデプロイ成功だけを success とする', () => {
    expect(readDeployState([checkRun()], MERGE_SHA))
      .toEqual({ status: 'success', forSha: MERGE_SHA });
  });

  it('別 SHA の成功デプロイを success と誤認しない', () => {
    expect(readDeployState([checkRun({ head_sha: OTHER_SHA })], MERGE_SHA))
      .toEqual({ status: 'absent', forSha: null });
  });

  it('Pages 以外の check run は見ない', () => {
    const runs = [checkRun({ name: 'verify' }), checkRun({ name: 'automation/verify' })];
    expect(readDeployState(runs, MERGE_SHA)).toEqual({ status: 'absent', forSha: null });
  });

  it('完了していないデプロイは pending', () => {
    expect(readDeployState([checkRun({ status: 'in_progress', conclusion: null })], MERGE_SHA).status)
      .toBe('pending');
  });

  it('ビルド失敗は failure', () => {
    expect(readDeployState([checkRun({ conclusion: 'failure' })], MERGE_SHA).status).toBe('failure');
  });

  it('check run が 1 つも無ければ absent', () => {
    expect(readDeployState([], MERGE_SHA)).toEqual({ status: 'absent', forSha: null });
  });
});

describe('bounded polling', () => {
  it('待ち時間の合計は 20 分', () => {
    const total = POLL_INTERVALS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBe(20 * 60 * 1000);
  });

  it('無限に待たない', () => {
    expect(POLL_INTERVALS_MS.length).toBeLessThanOrEqual(30);
  });
});
```

```ts
// tests/automation-notify.test.ts
import { describe, expect, it } from 'vitest';
import { ISSUE_LABELS, decideNotifications, type NotifyInput } from '../src/lib/automation/notify';

function notifyInput(over: Partial<NotifyInput> = {}): NotifyInput {
  return {
    consecutiveFailureDays: 0,
    revertHappened: false,
    recallDetected: [],
    mergeBlocked: false,
    adapterFailures: { ace: 0, proteca: 0, 'world-traveler': 0, elecom: 0, anker: 0 },
    heldCount: 0,
    budgetShortDays: 0,
    ...over,
  };
}

describe('Issue 通知の条件', () => {
  it('通知条件はちょうど 7 種', () => {
    expect(ISSUE_LABELS).toHaveLength(7);
  });

  it('通常の成功では通知しない', () => {
    expect(decideNotifications(notifyInput({ heldCount: 3 }))).toEqual([]);
  });

  it('7 日連続で初めて通知する', () => {
    expect(decideNotifications(notifyInput({ consecutiveFailureDays: 6 }))).toEqual([]);
    expect(decideNotifications(notifyInput({ consecutiveFailureDays: 7 }))).toHaveLength(1);
  });

  it('自動 revert は必ず通知する', () => {
    const notes = decideNotifications(notifyInput({ revertHappened: true }));
    expect(notes.map((n) => n.label)).toContain('automation-revert');
  });

  it('保留は 10 件で初めて通知する', () => {
    expect(decideNotifications(notifyInput({ heldCount: 9 }))).toEqual([]);
    expect(decideNotifications(notifyInput({ heldCount: 10 })).map((n) => n.label))
      .toContain('automation-backlog');
  });

  it('複数条件が同時に立てば複数返す', () => {
    const notes = decideNotifications(notifyInput({
      revertHappened: true, heldCount: 12, budgetShortDays: 7,
    }));
    expect(notes.length).toBeGreaterThanOrEqual(3);
  });

  it('AI の所見は通知条件に含まれない', () => {
    const keys = Object.keys(notifyInput());
    expect(keys.some((k) => /advisory|ai|workersAi/i.test(k))).toBe(false);
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-deploy-gate.test.ts tests/automation-notify.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/deploy-gate
```

### 最小実装

```ts
export const DEPLOY_CHECK_NAME_PATTERN = /cloudflare\s*pages/i;

export function readDeployState(runs: readonly CheckRunLike[], expectedSha: string): DeployState {
  const mine = runs.filter((r) => r.head_sha === expectedSha && DEPLOY_CHECK_NAME_PATTERN.test(r.name));
  if (mine.length === 0) return { status: 'absent', forSha: null };
  if (mine.some((r) => r.status !== 'completed')) return { status: 'pending', forSha: expectedSha };
  if (mine.every((r) => r.conclusion === 'success')) return { status: 'success', forSha: expectedSha };
  return { status: 'failure', forSha: expectedSha };
}
```

`wait-for-deploy.ts` は `POLL_INTERVALS_MS` を順に消化し、
`success` を得たら終了コード 0、使い切ったら終了コード 3（タイムアウト）で終わる。
**タイムアウトの終了コードは公開後検査の失敗（終了コード 1）と分ける。**
`revert` job は `post-deploy-check` の失敗にだけ反応する。

### 成功確認コマンド

```bash
cd travel-goods-site && npm test && npm run typecheck && npm run lint && npx vitest run tests/workflow-yaml.test.ts
```

### コミット

```
feat(travel-goods-site): マージ確認・デプロイ確認・公開後検査・Issue 通知を追加

固定待機をやめ、PR が merged になるまで bounded polling し、
merge commit SHA を取得してから、その SHA の Cloudflare Pages check run の
成功を確認して公開後検査へ進む。別 SHA の成功を誤認しない。
タイムアウトでは revert せず Issue を上げる。revert は公開後検査の失敗だけに反応する。
Cloudflare の API トークンは使わず、GITHUB_TOKEN の checks: read だけで確認する。
```

---

## 完了時の確認

```bash
cd travel-goods-site
npm run typecheck && npm run lint && npm test && npm run validate:content:all
npx vitest run tests/workflow-yaml.test.ts
git -C .. diff --name-only main
```

期待: すべて成功。差分は `.github/workflows/**`、
`src/lib/automation/{switches,changed-paths,breaker,revert-target,notify,verify-context}.ts`、
`scripts/{check-changed-paths,check-breaker,post-verify-status,plan-revert,post-deploy-check}.ts`、
`package.json`、`tests/**` のみ。**`datasets/` に差分がないこと。**

**この計画の完了時点で、停止スイッチはすべて既定値（`false` / `off`）のままである。
Actions は 1 度も実行していない。**

### 人が行う設定（この計画では実施しない）

| 項目 | 値 |
|---|---|
| GitHub Variables | 停止スイッチ 7 種をすべて既定値で作成（`AUTOMATION_ENABLED=false` ほか、`AUTO_PUBLISH_PRODUCTS=off`） |
| ブランチ保護 | `main` の必須チェックを **`automation/verify` の 1 つだけ**にする |
| Secrets | 追加なし（`GITHUB_TOKEN` のみ。Cloudflare トークンは計画4 で必要になった場合のみ） |
