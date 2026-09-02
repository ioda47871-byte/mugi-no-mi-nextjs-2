# 実装計画 4/4: 段階0 の統合検証と観察運転の受け皿

## Goal

計画1〜3 で作った部品を**通しで動かせる状態**にし、
段階1（7 日間の観察運転）に必要な**dry-run 実行系と測定レポートの保存・集計**を用意する。

この計画が終わった時点で、`AUTOMATION_ENABLED=false` のまま
`npm run automation:dry-run` が「今日の判定結果」を 1 つの JSON レポートとして出力でき、
`automation-observe.yml` を手動実行すると artifact として保存され、
7 日分がそろえば集計できる状態になる。

**この計画では段階1 を開始しない。段階2 以降の有効化操作は一切含まない。**

## Architecture

```
travel-goods-site/src/lib/automation/
  observe.ts         … 日次レポートの型と組み立て（純関数）
  summarize.ts       … 7 日分の集計と欠損判定（純関数）
  redact.ts          … レポートに入れてよい値の検査（純関数）

travel-goods-site/scripts/
  automation-dry-run.ts   … 通しの dry-run。外部通信あり。書き込みなし
  summarize-observation.ts … 7 日分の集計

.github/workflows/
  automation-observe.yml  … 新規。workflow_dispatch のみ。artifact を保存
```

## Tech Stack

- TypeScript 5.9 / `tsx`
- Vitest 3
- GitHub Actions（`actions/upload-artifact@v4`、`actions/github-script@v7`）
- GitHub REST API（`GET /actions/workflows/{id}/runs`、`GET /actions/runs/{id}/artifacts`）

## Spec へのパス

`docs/superpowers/specs/2026-09-02-travel-goods-automation-design.md`

対応節: 4.2（保存しないもの）/ 4.3（ブロックを迂回しない）/ 10.1 / 10.2 / 10.3 / 10.4 / 10.5 /
14.1 / 14.3 / 14.4 / 15（段階0・段階1）/ 17.2 / 18.1 / 18.2 / 18.3 / 18.4

## 他の計画書との依存順

| 順 | 計画 | この計画との関係 |
|---:|---|---|
| 1 | `2026-09-02-travel-goods-automation-foundation.md` | **前提。** `decideTier`、`nextLinkState`、`readBudget`、`adapterFor` を使う |
| 2 | `2026-09-02-travel-goods-article-automation.md` | **前提。** `runArticleChecks`、`eligiblePlugins` を使う |
| 3 | `2026-09-02-travel-goods-workflows.md` | **前提。** `readSwitches`、`check:breaker`、workflow の書き方を踏襲する |
| **4** | **本計画（shadow-rollout）** | 最後 |

**計画1・2・3 のすべてが完了してから着手する。**

### 本計画が触れる共有ファイル

| ファイル | 扱い |
|---|---|
| `travel-goods-site/package.json` | `automation:dry-run` と `automation:summarize` の 2 script を**追加するだけ**。計画1・2・3 が追加した script は変更しない |
| `travel-goods-site/tests/workflow-yaml.test.ts` | 計画3 が作成したファイルの**末尾に `describe` を足すだけ**。既存の describe は変更しない |

本計画が新規作成するファイルを、他の計画が作成することはない。

## Global Constraints

1. **本番データを変更しない。** `automation-dry-run.ts` は `datasets/` にも
   `automation/` にも書き込まない。書き込む口自体を持たない。
2. **レポートに秘密・原文・外部レスポンス本文を入れない。** artifact も同じ規則。
3. **`automation-observe.yml` は `workflow_dispatch` のみ。** `schedule` を持たない。
   段階1 の開始（`schedule` の追加）は人が別 PR で行う。
4. **停止スイッチを変更しない。** すべて既定値のまま。
5. **ブロックを迂回しない。** 403 / 429 を受けたら諦め、分類コードだけを記録する。
6. コミットは Task 単位。

## 完了条件

- [ ] `npm run typecheck` 成功
- [ ] `npm run lint` 成功
- [ ] `npm test` 成功。計画3 完了時点から **+26 件以上**
- [ ] ブラウザ E2E が **4 系統すべて成功**（デモ / 本番データ / 購入導線 / 自動運用）
- [ ] `npm run validate:content:all` 成功
- [ ] `CATALOG_DATASET=production npm run automation:dry-run -- --offline` が終了コード 0 でレポート JSON を出力する
- [ ] `git status --short` が `datasets/` と `automation/` に差分を出さない
- [ ] `.github/workflows/automation-observe.yml` が `schedule` を持たない

## 非対象

- **段階1 の開始**（`automation-observe.yml` に `schedule` を足す変更）
- **段階2 以降の有効化**（停止スイッチを `true` / `S` にする操作）
- `SITE_MODE` の変更
- Cloudflare・DNS・Vercel の操作
- **Workers AI の実通信**（Task 4 は型と無効実装だけ。実通信は段階3 以降の別 PR）
- Browser Run の実運用（楽天の規約確認が前提。設計書 17.1 未解決事項1）

---

## Task 1: 日次観測レポートの型と伏せ字検査

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/observe.ts` |
| 作成 | `travel-goods-site/src/lib/automation/redact.ts` |
| 作成 | `travel-goods-site/tests/automation-observe.test.ts` |

### Consumes / Produces

- Consumes: `Tier`（計画1 Task 8）、`LinkState`（計画1 Task 9）、`ArticleCheckId`（計画2 Task 5）、`ManufacturerId`（計画1 Task 5）
- Produces:
  - `export type ObservationReport = { date: string; tierCounts: Record<Tier, number>; tierBReasons: Record<string, number>; rakutenRequests: number; rakutenErrors: Record<'429'|'403'|'5xx'|'other', number>; manufacturerFetch: Record<ManufacturerId, { attempted: number; succeeded: number; lastStatus: number | null }>; workersAiNeurons: number; browserSeconds: number; articleCandidates: { generated: number; rejectedByCheck: Partial<Record<ArticleCheckId, number>> }; articleSimilarity: { maxJaccard: number }; linkSignals: Record<LinkState, number>; availabilityFieldPresent: boolean; actionsMinutes: number }`
  - `export function emptyReport(date: string): ObservationReport`
  - `export const REPORT_ARTIFACT_PREFIX = 'observation-'`
  - `export function artifactName(date: string): string`（`observation-YYYY-MM-DD`）
  - `redact.ts`:
    - `export type RedactionViolation = { path: string; kind: 'secret' | 'raw-text' | 'url' }`
    - `export function findRedactionViolations(report: unknown, env: NodeJS.ProcessEnv): RedactionViolation[]`

### 仕様（設計書 4.2・15 に対応）

`findRedactionViolations` はレポートを走査し、次を検出する:

1. **秘密情報** — `RAKUTEN_APPLICATION_ID` / `RAKUTEN_ACCESS_KEY` / `RAKUTEN_AFFILIATE_ID` /
   `CLOUDFLARE_API_TOKEN` の値（8 文字以上）が含まれる
2. **原文** — 20 文字を超える日本語混じりの文字列（商品名・キャプションの混入）
3. **URL** — `https?://` を含む文字列

**レポートは集計値と分類コードだけを持つ。** 上の 3 種はどれも入ってはならない。

### ステップ

- [ ] `emptyReport('2026-09-02')` の全数値が 0 である失敗テストを書く（3 分）
- [ ] `artifactName('2026-09-02')` が `'observation-2026-09-02'` を返す失敗テストを書く（2 分）
- [ ] `findRedactionViolations` が資格情報の値を検出する失敗テストを書く（4 分）
- [ ] 20 文字超の日本語文字列を `'raw-text'` として検出する失敗テストを書く（4 分）
- [ ] `https://` を含む文字列を `'url'` として検出する失敗テストを書く（3 分）
- [ ] `emptyReport` の出力に違反が 0 件である失敗テストを書く（3 分）
- [ ] 分類コード（`no-official-page` など英小文字ハイフン）は違反にならない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `ObservationReport` の型と `emptyReport` を実装する（5 分）
- [ ] `artifactName` と `REPORT_ARTIFACT_PREFIX` を実装する（2 分）
- [ ] `findRedactionViolations` の再帰走査を実装する（5 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { emptyReport, artifactName } from '../src/lib/automation/observe';
import { findRedactionViolations } from '../src/lib/automation/redact';

it('空レポートは違反ゼロ', () => {
  expect(findRedactionViolations(emptyReport('2026-09-02'), {})).toEqual([]);
});

it('資格情報の値が混ざったら検出する', () => {
  const bad = { ...emptyReport('2026-09-02'), note: 'abcd1234efgh' };
  const v = findRedactionViolations(bad, { RAKUTEN_ACCESS_KEY: 'abcd1234efgh' });
  expect(v).toHaveLength(1);
  expect(v[0].kind).toBe('secret');
});

it('商品名の原文が混ざったら検出する', () => {
  const bad = { ...emptyReport('2026-09-02'), note: 'エース クレスタ2 スーツケース 35L ブラックヘアライン' };
  expect(findRedactionViolations(bad, {})[0].kind).toBe('raw-text');
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-observe.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/observe
```

### 最小実装

`findRedactionViolations` は `JSON.stringify` せず、再帰で値を走査してパスを記録する。
日本語判定は `/[ぁ-んァ-ヶ一-龠]/` を含み、かつ長さ 20 超。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-observe.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 観測レポートの型と伏せ字検査を追加

レポートは集計値と分類コードだけを持つ。
秘密情報・原文・URL が混ざっていないことを機械的に検査する。
```

---

## Task 2: 通しの dry-run 実行系

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/scripts/automation-dry-run.ts` |
| 変更 | `travel-goods-site/package.json`（`automation:dry-run` を追加） |
| 変更 | `travel-goods-site/scripts/rakuten-mock-server.mjs`（`availability` の各パターンを追加） |
| 作成 | `travel-goods-site/tests/automation-dry-run.test.ts` |

### Consumes / Produces

- Consumes: `decideTier`, `nextLinkState`, `eligiblePlugins`, `runArticleChecks`,
  `readSwitches`, `RakutenClient`, `adapterFor`, `emptyReport`, `findRedactionViolations`
- Produces:
  - CLI: `npm run automation:dry-run -- [--offline] [--out <path>] [--max-requests N]`
  - 標準出力に `ObservationReport` の JSON

### 仕様（設計書 15 段階0・段階1 に対応）

- **書き込みを一切行わない。** `fs.writeFileSync` は `--out` で指定された
  レポート出力先にだけ使い、`datasets/` と `automation/` には**触らない**。
- `--offline` は楽天 API とメーカー公式へ接続せず、
  `tests/fixtures/` と `rakuten-mock-server.mjs` の応答だけで通す（CI 用）。
- 実行の最後に `findRedactionViolations` を通し、**違反があれば終了コード 3 で失敗する**。
- 楽天 API の `availability` フィールドが応答に含まれるかを観測し、
  `availabilityFieldPresent` に記録する（設計書 17.2 の測定項目）。
- 403 / 429 を受けたら**迂回せず**、`rakutenErrors` に分類だけを記録して次へ進む。

### ステップ

- [ ] `rakuten-mock-server.mjs` に `availability: 1` を返す商品を足す（3 分）
- [ ] 同じ mock に `availability: 0` を返す商品を足す（3 分）
- [ ] 同じ mock に `availability` フィールド自体を持たない商品を足す（3 分）
- [ ] `--offline` で外部通信なしに終了コード 0 になる失敗テストを書く（4 分）
- [ ] 実行後に `datasets/` と `automation/` に差分が出ない失敗テストを書く（一時 clone で `git status` を見る）（5 分）
- [ ] 出力 JSON が `ObservationReport` の形である失敗テストを書く（3 分）
- [ ] レポートに違反を混ぜると終了コード 3 になる失敗テストを書く（4 分）
- [ ] `availabilityFieldPresent` がモックの応答に応じて `true` / `false` になる失敗テストを書く（4 分）
- [ ] `AUTOMATION_ENABLED` が何であっても書き込まない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] 引数解析と `--offline` の分岐を実装する（4 分）
- [ ] リンク点検の段を実装する（5 分）
- [ ] 商品判定の段を実装する（5 分）
- [ ] 記事候補の段を実装する（5 分）
- [ ] レポート組み立てと `findRedactionViolations` の終了コード 3 を実装する（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { execFileSync } from 'node:child_process';

it('offline で終了コード 0、レポートを出力する', () => {
  const out = execFileSync('npx', ['tsx', 'scripts/automation-dry-run.ts', '--offline'],
    { encoding: 'utf8', env: { ...process.env, CATALOG_DATASET: 'production' } });
  const report = JSON.parse(out);
  expect(report).toHaveProperty('tierCounts');
  expect(report).toHaveProperty('availabilityFieldPresent');
});

it('本番データにも状態ファイルにも書き込まない', () => {
  execFileSync('npx', ['tsx', 'scripts/automation-dry-run.ts', '--offline'],
    { env: { ...process.env, CATALOG_DATASET: 'production' } });
  const status = execFileSync('git', ['status', '--short', 'datasets', 'automation'],
    { encoding: 'utf8' });
  expect(status.trim()).toBe('');
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-dry-run.test.ts
```

### 期待する失敗内容

```
Error: Cannot find module 'scripts/automation-dry-run.ts'
```

### 最小実装

各段（リンク点検 → 商品判定 → 記事候補）を関数に分け、
それぞれが `ObservationReport` の一部を返す。書き込み系の関数を import しない。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-dry-run.test.ts \
  && CATALOG_DATASET=production npm run automation:dry-run -- --offline > /dev/null \
  && git -C .. status --short
```

期待: 終了コード 0。`git status --short` が新規ソース以外を出さない。

### コミット

```
feat(travel-goods-site): 通しの dry-run 実行系を追加

リンク点検・商品判定・記事候補を一度に走らせ、観測レポートを出力する。
本番データにも状態ファイルにも書き込まない。
レポートに秘密・原文・URL が混ざっていたら終了コード 3 で失敗する。
403 / 429 は迂回せず分類だけ記録して次へ進む。
```

---

## Task 3: 7 日分の集計と欠損判定

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/summarize.ts` |
| 作成 | `travel-goods-site/scripts/summarize-observation.ts` |
| 変更 | `travel-goods-site/package.json`（`automation:summarize` を追加） |
| 作成 | `travel-goods-site/tests/automation-summarize.test.ts` |

### Consumes / Produces

- Consumes: `ObservationReport` from `./observe`
- Produces:
  - `export const OBSERVATION_WINDOW_DAYS: 7`
  - `export type RunRef = { runId: number; createdAt: string; artifactName: string }`
  - `export function pickLatestPerDate(runs: RunRef[]): Map<string, RunRef>`
  - `export type ObservationSummary = { window: { from: string; to: string }; daysExpected: 7; daysFound: number; missingDates: string[]; complete: boolean; sourceRuns: Record<string, number>; tierCounts: Record<Tier, number>; tierBReasons: Record<string, number>; peakRakutenRequests: number; peakWorkersAiNeurons: number; peakBrowserSeconds: number; manufacturerSuccessRate: Record<ManufacturerId, number>; maxArticleJaccard: number; availabilityFieldPresent: boolean }`
  - `export function summarize(reports: ObservationReport[], from: string, to: string): ObservationSummary`
  - CLI: `npm run automation:summarize -- --from <date> --to <date> --dir <path>`

### 仕様（設計書 15 段階1 に対応）

- **artifact 名に含まれる日付**で対応づける（run の実行日ではない）。
- **同じ日付の artifact が複数の成功 run にあるとき、`createdAt` が最新のものだけを採用する。**
- **7 日分が揃わなければ `complete: false`。** `missingDates` に欠損日を入れる。
- `complete: false` のあいだは**段階1 完了と判定しない**。
- 集計値は「最大値」（枠に収まるかを見るため）と「合計」（分布を見るため）を分ける。

### ステップ

- [ ] `pickLatestPerDate` が同日 2 件から `createdAt` の新しい方を選ぶ失敗テストを書く（4 分）
- [ ] `pickLatestPerDate` が日付ごとに 1 件だけ返す失敗テストを書く（3 分）
- [ ] 7 件揃えば `complete: true`、`missingDates: []` になる失敗テストを書く（3 分）
- [ ] 6 件なら `complete: false`、`missingDates` に 1 件入る失敗テストを書く（4 分）
- [ ] `daysExpected` が常に 7 である失敗テストを書く（2 分）
- [ ] `peakRakutenRequests` が 7 日の最大値になる失敗テストを書く（3 分）
- [ ] `manufacturerSuccessRate` が `succeeded / attempted` を返し、`attempted: 0` なら `0` を返す失敗テストを書く（4 分）
- [ ] `availabilityFieldPresent` が 7 日すべて `true` のときだけ `true` になる失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `pickLatestPerDate` を実装する（4 分）
- [ ] `summarize` の欠損判定と `complete` を実装する（5 分）
- [ ] `scripts/summarize-observation.ts` を実装する（5 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-summarize.test.ts
import { describe, expect, it } from 'vitest';
import {
  OBSERVATION_WINDOW_DAYS,
  pickLatestPerDate,
  summarize,
} from '../src/lib/automation/summarize';
import { emptyReport } from '../src/lib/automation/observe';
import type { ObservationReport } from '../src/lib/automation/observe';

const WINDOW = ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
  '2026-09-08', '2026-09-09', '2026-09-10'] as const;

function report(date: string, over: Partial<ObservationReport> = {}): ObservationReport {
  return { ...emptyReport(date), ...over };
}

const sevenReports = WINDOW.map((d) => report(d));
const sixReports = WINDOW.filter((d) => d !== '2026-09-07').map((d) => report(d));

describe('run の選別', () => {
  it('同日に複数の成功 run があれば最新だけ採用する', () => {
    const picked = pickLatestPerDate([
      { runId: 1, createdAt: '2026-09-04T21:00:00Z', artifactName: 'observation-2026-09-04' },
      { runId: 2, createdAt: '2026-09-04T23:00:00Z', artifactName: 'observation-2026-09-04' },
    ]);
    expect(picked.size).toBe(1);
    expect(picked.get('2026-09-04')?.runId).toBe(2);
  });

  it('日付ごとに 1 件だけ返す', () => {
    const picked = pickLatestPerDate([
      { runId: 1, createdAt: '2026-09-04T21:00:00Z', artifactName: 'observation-2026-09-04' },
      { runId: 2, createdAt: '2026-09-05T21:00:00Z', artifactName: 'observation-2026-09-05' },
      { runId: 3, createdAt: '2026-09-05T22:00:00Z', artifactName: 'observation-2026-09-05' },
    ]);
    expect(picked.size).toBe(2);
    expect(picked.get('2026-09-05')?.runId).toBe(3);
  });

  it('run の実行日ではなく artifact 名の日付で対応づける', () => {
    const picked = pickLatestPerDate([
      { runId: 9, createdAt: '2026-09-11T00:00:00Z', artifactName: 'observation-2026-09-04' },
    ]);
    expect([...picked.keys()]).toEqual(['2026-09-04']);
  });
});

describe('7 日分の集計', () => {
  it('7 件そろえば complete', () => {
    const s = summarize(sevenReports, '2026-09-04', '2026-09-10');
    expect(s.daysExpected).toBe(OBSERVATION_WINDOW_DAYS);
    expect(s.daysFound).toBe(7);
    expect(s.missingDates).toEqual([]);
    expect(s.complete).toBe(true);
  });

  it('6 件では complete にせず欠損日を記録する', () => {
    const s = summarize(sixReports, '2026-09-04', '2026-09-10');
    expect(s.daysFound).toBe(6);
    expect(s.complete).toBe(false);
    expect(s.missingDates).toEqual(['2026-09-07']);
  });

  it('日次の最大値を取る', () => {
    const reports = [report('2026-09-04', { rakutenRequests: 12 }),
      report('2026-09-05', { rakutenRequests: 28 })];
    expect(summarize(reports, '2026-09-04', '2026-09-10').peakRakutenRequests).toBe(28);
  });

  it('availability は 7 日すべて true のときだけ true', () => {
    const allTrue = WINDOW.map((d) => report(d, { availabilityFieldPresent: true }));
    expect(summarize(allTrue, '2026-09-04', '2026-09-10').availabilityFieldPresent).toBe(true);
    const oneFalse = allTrue.map((r, i) => (i === 3 ? { ...r, availabilityFieldPresent: false } : r));
    expect(summarize(oneFalse, '2026-09-04', '2026-09-10').availabilityFieldPresent).toBe(false);
  });

  it('取得を試みていないメーカーの成功率は 0 とする', () => {
    const s = summarize(sevenReports, '2026-09-04', '2026-09-10');
    expect(s.manufacturerSuccessRate.elecom).toBe(0);
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-summarize.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/summarize
```

### 最小実装

`pickLatestPerDate` は `artifactName.slice('observation-'.length)` を日付キーにし、
`createdAt` の比較で `Map` を更新する。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-summarize.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 7 日分の観測レポートの集計と欠損判定を追加

artifact 名の日付で対応づけ、同日に複数の成功 run があれば最新だけ採用する。
7 日分が揃わなければ complete: false とし、欠損日を記録する。
```

---

## Task 4: 参考所見のインターフェース（段階0 では実通信しない）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/src/lib/automation/advisory.ts` |
| 作成 | `travel-goods-site/tests/automation-advisory.test.ts` |

### Consumes / Produces

- Consumes: なし（`fetch` を呼ばない）
- Produces:
  - `export type AdvisoryInput = { body: string; facts: Readonly<Record<string, number | null>> }`
  - `export type Advisory = { available: false; reason: 'disabled-in-phase-0' } | { available: true; notes: readonly string[] }`
  - `export type AdvisoryProvider = (input: AdvisoryInput) => Promise<Advisory>`
  - `export const disabledAdvisoryProvider: AdvisoryProvider`
  - `export function mergeAdvisoryIntoPrBody(prBody: string, advisory: Advisory): string`

### 段階0 では実通信を計画しない

**この Task は `fetch` を書かない。** 理由は次のとおり。

1. 参考所見は**判定に影響しない**（設計書 1.3）。段階0 の目的は判定の正しさを固めることであり、
   所見の実通信はそこに何も足さない。
2. 実通信を計画するなら、公式のモデルID・REST エンドポイント・入力/出力上限・timeout・
   レスポンス schema・Neuron 予算計算をすべて確定させる必要がある。
   **これらは段階0 の完了条件に含まれない**ため、確定していない値を計画に書かない。
3. `CLOUDFLARE_API_TOKEN` を段階0 で用意する必要がなくなる（付録A の Secrets が増えない）。

したがって段階0 で作るのは、**`AdvisoryProvider` という型と、
常に `{ available: false, reason: 'disabled-in-phase-0' }` を返す実装**だけである。

**実通信を追加するのは段階3 以降の別 PR とする。** そのとき確定させる項目:

| 確定が必要な項目 | なぜ段階0 で決めないか |
|---|---|
| モデルID | 無料枠で使えるモデルは変わりうる。使う直前に公式ドキュメントで確認する |
| REST エンドポイント | 同上 |
| 入力・出力の上限トークン数 | 記事本文の長さが決まってから測る |
| timeout | 実測してから決める |
| レスポンス schema | モデルが決まらないと書けない |
| Neuron 予算計算 | 1 リクエストあたりの消費を実測してから決める（計画4 Task 3 の集計項目） |

### 型が守ること

- `AdvisoryInput` は `body`（**自サイトが生成した本文**）と `facts`（**構造化済みの数値**）だけを取る。
  メーカーページの HTML も楽天の `itemCaption` 全文も**型として渡せない**（設計書 4.4）。
- **`Advisory` から公開可否を導く関数を export しない。**
  `mergeAdvisoryIntoPrBody` だけが `Advisory` を消費し、PR 本文の文字列を返す。

### ステップ

- [ ] `disabledAdvisoryProvider` が常に `{ available: false, reason: 'disabled-in-phase-0' }` を返す失敗テストを書く（3 分）
- [ ] `advisory.ts` が `fetch` を呼ばないことをソース検査で確かめる失敗テストを書く（4 分）
- [ ] `AdvisoryInput` にメーカー本文を渡せないことを `@ts-expect-error` で確かめる失敗テストを書く（4 分）
- [ ] `Advisory` から公開可否を導く関数を export していない失敗テストを書く（4 分）
- [ ] `mergeAdvisoryIntoPrBody` が両方の状態で例外を投げない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] `AdvisoryInput` / `Advisory` の型を書く（メーカー本文を渡せない形にする）（4 分）
- [ ] 常に `{ available: false }` を返す無効実装を書く（3 分）
- [ ] `mergeAdvisoryIntoPrBody`（参考所見を本文へ併記するだけ）を実装する（4 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
// tests/automation-advisory.test.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as advisory from '../src/lib/automation/advisory';

const source = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/automation/advisory.ts'),
  'utf8',
);

describe('参考所見のインターフェース', () => {
  it('段階0 では常に無効を返す', async () => {
    const result = await advisory.disabledAdvisoryProvider({ body: '本文', facts: { weightG: 2900 } });
    expect(result).toEqual({ available: false, reason: 'disabled-in-phase-0' });
  });

  it('段階0 では外部通信を書かない', () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    expect(source).not.toContain('api.cloudflare.com');
  });

  it('メーカー本文を渡せない型になっている', () => {
    // @ts-expect-error html は AdvisoryInput に存在しない
    void advisory.disabledAdvisoryProvider({ body: 'x', facts: {}, html: '<html>...</html>' });
  });

  it('所見から公開可否を導く関数を export しない', () => {
    expect(Object.keys(advisory).sort()).toEqual([
      'disabledAdvisoryProvider',
      'mergeAdvisoryIntoPrBody',
    ]);
  });

  it('無効でも PR 本文の組み立てが壊れない', () => {
    const body = advisory.mergeAdvisoryIntoPrBody('## 変更', { available: false, reason: 'disabled-in-phase-0' });
    expect(body).toContain('## 変更');
    const withNotes = advisory.mergeAdvisoryIntoPrBody('## 変更', { available: true, notes: ['表記ゆれ 1 件'] });
    expect(withNotes).toContain('表記ゆれ 1 件');
    expect(withNotes).toContain('参考所見');
  });
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-advisory.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/advisory
```

### 最小実装

```ts
export const disabledAdvisoryProvider: AdvisoryProvider = async () => ({
  available: false,
  reason: 'disabled-in-phase-0',
});

export function mergeAdvisoryIntoPrBody(prBody: string, advisory: Advisory): string {
  if (!advisory.available) return prBody;
  return `${prBody}\n\n### 参考所見（判定には使っていません）\n\n${advisory.notes.map((n) => `- ${n}`).join('\n')}`;
}
```

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-advisory.test.ts && npm run typecheck && npm run lint
```

### コミット

```
feat(travel-goods-site): 参考所見のインターフェースを追加（段階0 は無効）

型と、常に無効を返す実装だけを置く。段階0 では外部通信を書かない。
渡せるのは自サイトが生成した本文と構造化済みの数値だけで、
メーカー本文は型として渡せない。所見から公開可否を導く関数を export しない。
実通信の追加は、モデルID・エンドポイント・上限・timeout・schema・Neuron 予算を
確定させたうえで段階3 以降の別 PR で行う。
```

---

## Task 5: automation-observe.yml（artifact 保存と集計）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `.github/workflows/automation-observe.yml` |
| 変更 | `travel-goods-site/tests/workflow-yaml.test.ts` |

### Consumes / Produces

- Consumes: `automation:dry-run`, `automation:summarize`
- Produces: artifact `observation-YYYY-MM-DD` と `observation-summary-YYYY-MM-DD`

### 仕様（設計書 15 段階1 に対応）

**`on: workflow_dispatch` のみ。`schedule` を持たない。**
段階1 の開始（`schedule: - cron: '0 21 * * *'` の追加）は、人が別 PR で行う。

```yaml
name: travel-goods-site 観察運転

on:
  workflow_dispatch:
    inputs:
      summarize:
        description: '直近7日分を集計する（最終日に true）'
        type: boolean
        default: false

concurrency:
  group: travel-goods-automation
  cancel-in-progress: false

permissions:
  contents: read
  actions: read        # 過去 run の artifact を列挙するために必要
  issues: write

defaults:
  run:
    working-directory: travel-goods-site
```

**日次ジョブ**:

1. `npm ci`
2. `CATALOG_DATASET=production npm run automation:dry-run -- --out observation.json`
3. `actions/upload-artifact@v4` で `name: observation-<JSTの当日>`、`retention-days: 14`

**集計ジョブ**（`inputs.summarize == true` のときだけ）:

1. `GET /repos/{owner}/{repo}/actions/workflows/automation-observe.yml/runs?status=success&created>=<7日前>`
   で成功 run を列挙する。
2. 各 run の `GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` を引き、
   **artifact 名 `observation-YYYY-MM-DD` を日付で選別**する。
3. **同じ日付が複数 run にあれば `created_at` が最新の run のものだけ**を取る。
4. `GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip` でダウンロードして展開する。
5. `npm run automation:summarize -- --from <7日前> --to <当日> --dir <展開先>`
6. `observation-summary-<当日>` として upload する。
7. `complete: false` なら**欠損日を Issue（`automation-failure`）に記録する**。

### ステップ

- [ ] `automation-observe.yml` が `schedule` を持たない失敗テストを書く（3 分）
- [ ] `permissions` に `actions: read` がある失敗テストを書く（2 分）
- [ ] 同一 concurrency group を使う失敗テストを書く（2 分）
- [ ] `retention-days: 14` を指定している失敗テストを書く（2 分）
- [ ] artifact 名が `observation-` 接頭辞である失敗テストを書く（2 分）
- [ ] `--force` を含まない失敗テストを書く（2 分）
- [ ] 書き込み系のコマンド（`git push`、`--apply`）を含まない失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] 共通ヘッダと `permissions`（`actions: read`）を書く（4 分）
- [ ] 日次ジョブ（dry-run と upload-artifact）を書く（5 分）
- [ ] 集計ジョブの run 列挙と artifact 選別を書く（5 分）
- [ ] 欠損日の Issue 記録を書く（3 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
it('観察運転は workflow_dispatch のみ。schedule を持たない', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-observe.yml'), 'utf8');
  expect(y).toContain('workflow_dispatch:');
  expect(y).not.toMatch(/^\s*schedule:/m);
});

it('過去 run の artifact を読むため actions: read を持つ', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-observe.yml'), 'utf8');
  expect(y).toMatch(/actions:\s*read/);
});

it('観察運転は書き込まない', () => {
  const y = fs.readFileSync(path.join(dir, 'automation-observe.yml'), 'utf8');
  expect(y).not.toMatch(/git push|--apply\b/);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts
```

### 期待する失敗内容

```
Error: ENOENT: no such file or directory, open '.../automation-observe.yml'
```

### 最小実装

`actions/github-script@v7` で REST を叩き、`fs` に展開する。
zip の展開は `unzip -o` でよい（`ubuntu-latest` に含まれる）。

### 成功確認コマンド

```bash
cd travel-goods-site && npx vitest run tests/workflow-yaml.test.ts && npm test && npm run lint
```

### コミット

```
feat: 観察運転の workflow を追加（workflow_dispatch のみ）

日次レポートを artifact として 14 日保持し、最終日に直近 7 日分を集計する。
過去 run の artifact は actions: read と REST API で集める。
同日に複数の成功 run があれば最新だけ採用し、欠損日は Issue に記録する。
schedule は持たない。段階1 の開始は人が別 PR で行う。
```

---

## Task 6: 段階0 の通し確認と段階1 への移行条件

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/docs/automation-runbook.md` |
| 作成 | `travel-goods-site/tests/automation-integration.test.ts` |

### Consumes / Produces

- Consumes: 計画1〜4 のすべて
- Produces: 運用手順書とスモークテスト

### 仕様

`automation-runbook.md` に次を書く（**運用手順であり、実行はしない**）:

1. 段階0 の完了確認コマンド一覧
2. 段階1 を開始する手順（`automation-observe.yml` に `schedule` を足す PR を人が出す）
3. 段階1 の完了判定（`complete: true` かつ誤判定率が許容範囲）
4. 停止のしかた（スイッチ / workflow 無効化 / `git revert`）
5. circuit breaker の解除手順（`automation-reset.yml` の 3 入力）

`automation-integration.test.ts` は**段階0 のスモークテスト**:

- 停止スイッチがすべて既定値のとき、`readSwitches` の全項目が安全側であること
- `evaluateMergeGate` が `closed` + `content` で許可すること（正常時の経路が生きている）
- `decideTier` に「すべて満たす入力」を渡すと `'S'` になること（部品が結線されている）
- `runArticleChecks` が 14 件返すこと
- `ALLOWED_AUTOMATION_PATHS` と `AUTOMATION_STATE_FILES` が整合すること
  （状態ファイル 3 つが許可パスに含まれる）

### ステップ

- [ ] 停止スイッチ既定値のスモークテストを書く（3 分）
- [ ] `ALLOWED_AUTOMATION_PATHS` が `AUTOMATION_STATE_FILES` の 3 つを含む失敗テストを書く（4 分）
- [ ] `decideTier` / `runArticleChecks` / `evaluateMergeGate` の結線確認テストを書く（5 分）
- [ ] `.github/workflows/` の `automation-*` が **6 本**ある失敗テストを書く（3 分）
- [ ] `automation-revert.yml` が存在せず、revert が `automation-commit.yml` の job である失敗テストを書く（3 分）
- [ ] テストを実行し失敗を確認する（1 分）
- [ ] 段階0 の完了確認コマンド一覧を書く（4 分）
- [ ] 段階1 の開始手順と完了判定を書く（4 分）
- [ ] 停止のしかたと circuit breaker の解除手順を書く（4 分）
- [ ] `RECALL_SOURCES` と `OFFICIAL_FETCH_POLICIES` の承認手順を書く（5 分）
- [ ] テストが成功することを確認する（1 分）

### 最初に失敗するテスト

```ts
import { ALLOWED_AUTOMATION_PATHS } from '../src/lib/automation/changed-paths';
import { AUTOMATION_STATE_FILES } from '../src/lib/automation/state/schema';

it('状態ファイル 3 つがすべて許可パスに含まれる', () => {
  for (const f of AUTOMATION_STATE_FILES) {
    expect(ALLOWED_AUTOMATION_PATHS).toContain(`travel-goods-site/${f}`);
  }
});

it('automation workflow は 6 本', () => {
  const files = fs.readdirSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.github/workflows'),
  ).filter((f) => f.startsWith('automation-'));
  expect(files.sort()).toEqual([
    'automation-articles.yml',
    'automation-commit.yml',
    'automation-discover.yml',
    'automation-links.yml',
    'automation-observe.yml',
    'automation-reset.yml',
  ]);
});

it('revert は別 workflow ではなく automation-commit の job', () => {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.github/workflows');
  expect(fs.existsSync(path.join(dir, 'automation-revert.yml'))).toBe(false);
  expect(fs.readFileSync(path.join(dir, 'automation-commit.yml'), 'utf8')).toMatch(/^\s{2}revert:/m);
});
```

計画3 が作る **5 本**（links / discover / articles / commit / reset）に
本計画の `automation-observe.yml` を加えて **6 本**になる。
revert は `automation-commit.yml` の job であり、独立した workflow ファイルは作らない。

### テスト実行コマンド

```bash
cd travel-goods-site && npx vitest run tests/automation-integration.test.ts
```

### 期待する失敗内容

```
Error: Failed to load url ../src/lib/automation/changed-paths
```
（計画3 未完了の場合）または `expected [ 5 items ] to deeply equal [ 6 items ]`（`automation-observe.yml` 未作成の場合）

### 最小実装

テストのみ。`automation-runbook.md` は手順を書くだけで、コードは増えない。

### 成功確認コマンド

```bash
cd travel-goods-site
npm run typecheck && npm run lint && npm test && npm run validate:content:all
CATALOG_DATASET=production npm run automation:dry-run -- --offline > /dev/null
git -C .. status --short
```

### コミット

```
docs(travel-goods-site): 自動運用の運用手順書と段階0 のスモークテストを追加

段階0 の完了確認、段階1 の開始手順、停止のしかた、breaker の解除手順を書く。
スモークテストで停止スイッチの既定値と部品の結線を確認する。
```

---

## Task 7: E2E の追加（自動公開・非表示・生成記事）

### 対象ファイル

| 種別 | パス |
|---|---|
| 作成 | `travel-goods-site/tests/e2e/automation-flow.spec.ts` |
| 作成 | `travel-goods-site/scripts/automation-e2e-fixture.ts` |
| 変更 | `travel-goods-site/package.json`（`test:e2e:automation` を追加） |
| 変更 | `travel-goods-site/playwright.config.ts`（`E2E_DATASET=automation` を追加） |

### Consumes / Produces

- Consumes: 既存 `scripts/linkcheck-fixture.ts` の方式、`buildArticle`（計画2 Task 6）
- Produces:
  - `npm run test:e2e:automation`（fixture 生成 → `CATALOG_DATASET_DIR` 付きビルド → Playwright）
  - E2E 4 ケース

### 仕様（設計書 14.3 に対応）

**本番データセットを使わない。** 既存 `linkcheck-fixture.ts` と同じ方式で、
一時ディレクトリに**このビルド限定の fixture データセット**を作る。
`.preview/automation-dataset` を `CATALOG_DATASET_DIR` に渡してビルドする。

追加する 4 ケース:

| # | 検査内容 |
|---:|---|
| 1 | 自動公開された商品の CTA が表示され、`href` が登録した紹介 URL と**完全一致**する |
| 2 | `hidden` 状態のリンクが **CTA を出さない**（ダミーも出さない） |
| 3 | 生成記事が公開され、**比較表の数値が商品データと一致**する |
| 4 | 自動非公開になった記事が**一覧にも直接 URL にも出ない** |

### ステップ

- [ ] `linkcheck-fixture.ts` を雛形にデータセット複製を書く（4 分）
- [ ] 自動公開商品 2 件と `hidden` リンク 1 件を作る（5 分）
- [ ] 生成記事 1 本と非公開化した記事 1 本を作る（5 分）
- [ ] ケース1（CTA の href 完全一致）の失敗テストを書く（4 分）
- [ ] ケース2（`hidden` は CTA を出さない）の失敗テストを書く（4 分）
- [ ] ケース3（比較表の数値一致）の失敗テストを書く（5 分）
- [ ] ケース4（非公開記事が出ない）の失敗テストを書く（4 分）
- [ ] `playwright.config.ts` に `automation` データセットの分岐を足す（4 分）
- [ ] `package.json` に `test:e2e:automation` を足す（2 分）
- [ ] テストを実行し失敗を確認する（2 分）
- [ ] ケース1・2（CTA の href と hidden）を通す（5 分）
- [ ] ケース3・4（比較表の数値と非公開記事）を通す（5 分）
- [ ] **本番データセットに差分が出ていないことを確認する**（2 分）

### 最初に失敗するテスト

```ts
// tests/e2e/automation-flow.spec.ts
import { expect, test } from '@playwright/test';

test('自動公開された商品の CTA が登録した紹介URLと完全一致する', async ({ page }) => {
  await page.goto('/categories/suitcases/');
  const cta = page.getByRole('link', { name: '楽天市場で商品を見る' }).first();
  await expect(cta).toHaveAttribute('href', process.env.E2E_EXPECTED_AFFILIATE_URL as string);
  await expect(cta).toHaveAttribute('rel', 'nofollow sponsored noopener');
});

test('hidden 状態のリンクは CTA を出さない', async ({ page }) => {
  await page.goto('/categories/backpacks/');
  const card = page.getByTestId('product-card-hidden-link');
  await expect(card.getByRole('link', { name: /楽天市場|Amazon/ })).toHaveCount(0);
});

test('自動非公開になった記事は一覧にも直接URLにも出ない', async ({ page }) => {
  await page.goto('/articles/');
  await expect(page.getByRole('link', { name: /自動非公開テスト/ })).toHaveCount(0);
  const res = await page.goto('/articles/auto-unpublished-fixture/');
  expect(res?.status()).toBe(404);
});
```

### テスト実行コマンド

```bash
cd travel-goods-site && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:automation
```

### 期待する失敗内容

```
Error: ENOENT: no such file or directory, scandir '.preview/automation-dataset'
```
（fixture 未作成）または `expect(received).toHaveAttribute(...)` の不一致

### 最小実装

`automation-e2e-fixture.ts` は本番データセットを**読み取って複製**し、
複製側にだけテスト専用の紹介 URL と生成記事を書き込む
（既存 `linkcheck-fixture.ts` と同じ「本番データを汚さない」方式）。
`playwright.config.ts` は `E2E_DATASET` の値で `webServer` の起動を切り替える。

### 成功確認コマンド

```bash
cd travel-goods-site \
  && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e \
  && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:production \
  && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:linkcheck \
  && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:automation \
  && git -C .. status --short
```

期待: 4 系統すべて成功。`git status --short` が `datasets/` に差分を出さない。

### コミット

```
test(travel-goods-site): 自動運用の E2E 4 ケースを追加

自動公開商品の CTA、hidden リンクの非表示、生成記事の数値一致、
自動非公開記事の非表示を確認する。
既存の linkcheck と同じ方式で、このビルド限定の fixture データセットを使う。
本番データセットは読み取るだけで変更しない。
```

---

## 完了時の確認

```bash
cd travel-goods-site
npm run typecheck && npm run lint && npm test && npm run validate:content:all
CATALOG_DATASET=production npm run automation:dry-run -- --offline
git -C .. status --short
git -C .. diff --name-only main
```

期待:

- すべて成功
- `git status --short` が `datasets/` と `automation/` に差分を出さない
- **停止スイッチはすべて既定値のまま**（`AUTOMATION_ENABLED=false`、`AUTO_PUBLISH_PRODUCTS=off`）
- **Actions を 1 度も実行していない**
- `SITE_MODE=preview` のまま

## 段階1 へ進む前に人が行うこと（この計画では実施しない）

1. GitHub Variables に停止スイッチ 7 種を既定値で作成する。
2. `main` のブランチ保護の必須チェックを `automation/verify` の 1 つにする。
3. `automation-observe.yml` を **手動で 1 回実行**し、artifact が保存されることを確認する。
4. `automation-observe.yml` に `schedule` を足す PR を出す（**これが段階1 の開始**）。
5. 7 日後に `summarize: true` で実行し、`complete: true` を確認する。
6. 誤判定率の許容値（設計書 17.1 未解決事項2）を決める。
