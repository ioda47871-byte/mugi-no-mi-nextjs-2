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
  automation-commit.yml      … 新規。毎日 JST 07:30。検証・PR・auto-merge
  automation-revert.yml      … 新規。公開後検査の失敗時
  automation-reset.yml       … 新規。workflow_dispatch のみ。breaker 解除

travel-goods-site/src/lib/automation/
  changed-paths.ts   … 変更パス検査（純関数）
  breaker.ts         … circuit breaker の判定と遷移（純関数）
  switches.ts        … 停止スイッチの読み取りと正規化

travel-goods-site/scripts/
  check-changed-paths.ts  … CLI。git diff の結果を検査
  check-breaker.ts        … CLI。budget.json を読んで停止判定
  post-verify-status.ts   … CLI。automation/verify status を付ける
  plan-revert.ts          … CLI。revert 対象の妥当性を検証
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
| `travel-goods-site/package.json` | 2・3・4 | **追加する npm script 名がすべて異なる**（計画2: `article:generate` `article:recheck` ／ 計画3: `check:changed-paths` `check:breaker` `plan:revert` `post:verify-status` `check:post-deploy` ／ 計画4: `automation:dry-run` `automation:summarize`）。依存順に実行すれば同じ行を書き換えない |
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
- [ ] `.github/workflows/` に**新規 6 本**（links / discover / articles / commit / revert / reset）が存在し、YAML として妥当
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
  - `export function shouldTrip(breaker: CircuitBreaker, newRevertSha: string, today: string): boolean`
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

`shouldTrip` は `breaker.revertedShas` に **3 日以内の revert が既に 1 件**あり、
`newRevertSha` がそれと異なるときに `true`。

### ステップ

- [ ] `closed` のときはすべての `prKind` で許可される失敗テストを書く（3 分）
- [ ] `open` + `content` が拒否される失敗テストを書く（2 分）
- [ ] `open` + `revert-normal` が拒否される失敗テストを書く（2 分）
- [ ] `open` + `revert-tripping` + `closed→open` が**許可される**失敗テストを書く（例外1）（4 分）
- [ ] `open` + `revert-tripping` + `open→open` が拒否される失敗テストを書く（3 分）
- [ ] `open` + `reset` + `open→closed` が**許可される**失敗テストを書く（例外2）（4 分）
- [ ] `open` + `reset` + `closed→closed` が拒否される失敗テストを書く（3 分）
- [ ] `shouldTrip` が 3 日以内 2 回目で `true`、4 日空けば `false` を返す失敗テストを書く（4 分）
- [ ] `trip` が `state`・`trippedOn`・`reason`・`revertedShas` をすべて設定する失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `breaker.ts` と CLI を実装する（12 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { evaluateMergeGate, shouldTrip } from '../src/lib/automation/breaker';

const open = { state: 'open' as const, trippedOn: '2026-09-20', reason: 'x', revertedShas: ['a', 'b'] };

it('例外1: breaker を作動させる当の revert PR は通す', () => {
  const gate = evaluateMergeGate(open, 'revert-tripping', { before: 'closed', after: 'open' });
  expect(gate.allowVerifyStatus).toBe(true);
  expect(gate.allowAutoMerge).toBe(true);
});

it('例外2: reset PR は open 状態でも通す', () => {
  const gate = evaluateMergeGate(open, 'reset', { before: 'open', after: 'closed' });
  expect(gate.allowAutoMerge).toBe(true);
});

it('open 状態の通常の自動 PR は通さない', () => {
  expect(evaluateMergeGate(open, 'content', { before: 'open', after: 'open' }).allowAutoMerge).toBe(false);
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

- `permissions: { statuses: write }` を追加する。
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

## Task 8: automation-revert.yml と automation-reset.yml

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `.github/workflows/automation-revert.yml` |
| 作成 | `.github/workflows/automation-reset.yml` |
| 変更 | `travel-goods-site/tests/workflow-yaml.test.ts` |

### Consumes / Produces

- Consumes: `plan:revert`, `check:breaker`, `check:changed-paths --mode reset`, `post:verify-status`
- Produces: revert PR と reset PR

### 仕様（設計書 12.5・12.6 に対応）

**`automation-revert.yml`**:

1. `plan:revert` で対象 SHA の 4 条件を検証。落ちたら Issue を上げて終了。
2. `automation/revert-YYYY-MM-DD` を現在の `main` から作る。
3. `git revert -m 1 <対象SHA>` → **通常 push**。
4. revert PR を作る（タイトルに `[auto-revert]`）。
5. **この workflow 自身が** `automation-commit` と同等の全検証を実行する。
6. 成功時のみ revert PR の head SHA に `automation/verify` を付け、auto-merge を有効にする。
7. `shouldTrip` が `true` なら、**同じ PR に `circuitBreaker.state = "open"` の変更を同梱する**（例外1）。
8. 必ず Issue を上げる。**1 日 1 回まで。**

**`automation-reset.yml`**:

- `on: workflow_dispatch` のみ。**`schedule` も他のイベントも持たない。**
- 必須入力 3 つ:
  - `reason`（`required: true`）
  - `revert_sha`（`required: true`。`budget.json` の `revertedShas` に含まれることを検証）
  - `confirm`（`required: true`。**`RESET` と完全一致**しなければ終了コード 2 で中止）
- `budget.json` の `circuitBreaker` だけを `open` → `closed` に変える PR を作る。
- `check:changed-paths -- --mode reset` に成功したときだけ `automation/verify` を付けて auto-merge。

### ステップ

- [ ] `automation-reset.yml` が `schedule` を持たない失敗テストを書く（3 分）
- [ ] `automation-reset.yml` が 3 つの必須入力を持つ失敗テストを書く（4 分）
- [ ] `confirm` の検査で `RESET` の完全一致を要求する失敗テストを書く（3 分）
- [ ] `automation-revert.yml` が `git revert -m 1` を含む失敗テストを書く（2 分）
- [ ] `automation-revert.yml` が `main` への直接 push を含まない失敗テストを書く（`git push origin HEAD:main` が無い）（3 分）
- [ ] 両方が全 6 検証を自前で実行する失敗テストを書く（4 分）
- [ ] `--force` を含まない失敗テストを書く（2 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `automation-revert.yml` を書く（15 分）
- [ ] `automation-reset.yml` を書く（12 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
it('reset は workflow_dispatch だけで起動する', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-reset.yml'), 'utf8');
  expect(y).toContain('workflow_dispatch:');
  expect(y).not.toMatch(/^\s*schedule:/m);
});

it('reset は confirm に RESET の完全一致を要求する', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-reset.yml'), 'utf8');
  expect(y).toContain('confirm');
  expect(y).toMatch(/!=\s*"RESET"|"\$CONFIRM"\s*!=\s*'RESET'|CONFIRM.*RESET/);
});

it('revert は main へ直接 push しない', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-revert.yml'), 'utf8');
  expect(y).not.toMatch(/git push[^\n]*HEAD:main|git push origin main/);
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

`automation-revert.yml` は `workflow_dispatch`（入力 `target_sha`）と、
`automation-commit` からの `workflow_call` の両方で起動できるようにする。
`automation-reset.yml` は最初のステップで
`[ "$CONFIRM" = "RESET" ] || { echo '確認文字列が一致しません'; exit 2; }`。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts && npm test && npm run lint
```

### コミット

```
feat: automation-revert.yml と automation-reset.yml を追加

revert は main へ直接 push せず、revert ブランチと PR を経由する。
GITHUB_TOKEN の PR では別 workflow が起動しないため、自身が検証と status 付与を行う。
breaker を作動させる revert PR は state: open を同梱して自身は通す。
reset は workflow_dispatch のみ。理由・revert SHA・確認文字列 RESET を必須にする。
```

---

## Task 9: 公開後検査と Issue 通知

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/scripts/post-deploy-check.ts` |
| 作成 | `travel-goods-site/src/lib/automation/notify.ts` |
| 変更 | `travel-goods-site/package.json`（`check:post-deploy` を追加） |
| 変更 | `.github/workflows/automation-commit.yml`（公開後検査ジョブを追加） |
| 作成 | `travel-goods-site/tests/automation-notify.test.ts` |

### Consumes / Produces

- Consumes: `runArticleChecks`（計画2 Task 5）、`resolveMerchantLinks`（既存）
- Produces:
  - `export const ISSUE_LABELS = ['automation-failure', 'automation-revert', 'automation-safety', 'automation-blocked', 'automation-adapter', 'automation-backlog', 'automation-budget'] as const`（**7 個**）
  - `export type NotifyCondition = { label: (typeof ISSUE_LABELS)[number]; title: string; body: string }`
  - `export function decideNotifications(input: NotifyInput): NotifyCondition[]`
  - `export type NotifyInput = { consecutiveFailureDays: number; revertHappened: boolean; recallDetected: string[]; mergeBlocked: boolean; adapterFailures: Record<ManufacturerId, number>; heldCount: number; budgetShortDays: number }`
  - CLI: `npm run check:post-deploy -- --site-url <url>`

### 仕様（設計書 12.4・13.2 に対応）

通知するのは 7 条件だけ:

| 条件 | ラベル |
|---|---|
| 同一の失敗が 7 日連続 | `automation-failure` |
| 自動 revert が発生 | `automation-revert` |
| リコール・安全情報を検出 | `automation-safety` |
| 自動マージ不能 | `automation-blocked` |
| メーカー単位の取得故障（5 件連続または 7 日連続成功率 0%） | `automation-adapter` |
| 保留が 10 件以上 | `automation-backlog` |
| 無料枠不足が 7 日継続 | `automation-budget` |

- **通常の成功は通知しない。**
- **Workers AI の参考所見は、それ自体では通知しない**（設計書 1.3・13.2）。
- ラベルごとに**開いている Issue は最大 1 件**。既存があれば本文を更新。条件が解消したら自動で閉じる。

公開後検査（`main` マージから 10 分後）:

1. 公開サイトの `robots.txt` / `sitemap.xml` / トップページが期待どおりか。
2. その日に公開した記事の 14 検査を再実行。
3. その日に公開した商品の CTA が正しく出ているか。

### ステップ

- [ ] `ISSUE_LABELS` がちょうど 7 個である失敗テストを書く（2 分）
- [ ] 何も起きていない入力で `decideNotifications` が空配列を返す失敗テストを書く（3 分）
- [ ] 6 日連続失敗では通知せず、7 日で通知する失敗テストを書く（4 分）
- [ ] `revertHappened: true` で `automation-revert` を返す失敗テストを書く（2 分）
- [ ] 保留 9 件で通知せず、10 件で `automation-backlog` を返す失敗テストを書く（3 分）
- [ ] `decideNotifications` の入力に AI 関連のフィールドが無いことを型で確認する失敗テストを書く（3 分）
- [ ] 複数条件が同時に立つと複数の `NotifyCondition` を返す失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `notify.ts` と `post-deploy-check.ts` を実装する（12 分）
- [ ] `automation-commit.yml` に公開後検査ジョブ（`needs` + 10 分待機）を足す（6 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { ISSUE_LABELS, decideNotifications } from '../src/lib/automation/notify';

it('通知条件はちょうど 7 種', () => {
  expect(ISSUE_LABELS).toHaveLength(7);
});

it('通常の成功では通知しない', () => {
  expect(decideNotifications({
    consecutiveFailureDays: 0, revertHappened: false, recallDetected: [],
    mergeBlocked: false, adapterFailures: {} as never, heldCount: 3, budgetShortDays: 0,
  })).toEqual([]);
});

it('7 日連続で初めて通知する', () => {
  const base = { revertHappened: false, recallDetected: [], mergeBlocked: false,
    adapterFailures: {} as never, heldCount: 0, budgetShortDays: 0 };
  expect(decideNotifications({ ...base, consecutiveFailureDays: 6 })).toEqual([]);
  expect(decideNotifications({ ...base, consecutiveFailureDays: 7 })).toHaveLength(1);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-notify.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/notify
```

### 最小実装

`decideNotifications` は 7 つの条件を順に評価し、立ったものだけを配列に積む純関数。
Issue の開閉は `automation-commit.yml` の `actions/github-script@v7` が行う
（既存 `travel-goods-audit.yml` と同じ方式）。

### 成功確認コマンド

```bash
cd travel-goods-site && npm test && npm run typecheck && npm run lint && npx vitest run tests/workflow-yaml.test.ts
```

### コミット

```
feat(travel-goods-site): 公開後検査と Issue 通知の条件を追加

通知するのは 7 条件だけ。通常の成功は通知しない。
Workers AI の参考所見はそれ自体では通知しない。
ラベルごとに開く Issue は 1 件までとし、解消したら自動で閉じる。
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
