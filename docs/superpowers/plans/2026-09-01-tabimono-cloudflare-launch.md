# 旅モノ比較 Cloudflare Pages Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 旅行用品比較サイトを正式名称「旅モノ比較」に変更し、Cloudflare Pages の GitHub 連携と独自ドメイン `tabimono-hikaku.jp` で安全に公開できる状態へ整える。

**Architecture:** Next.js 15 の `output: 'export'` と既存の `out/` をそのまま使用し、Cloudflare Functions やデプロイ用 API トークンは追加しない。`main` を Cloudflare Pages の Production branch とし、独自ドメインと TLS の確認までは Production 環境も `SITE_MODE=preview` に固定する。正式名称はコード既定値とし、URL・運営者名・連絡先だけを本番公開の必須入力として残す。

**Tech Stack:** Next.js 15、React 19、TypeScript 5.9、Vitest 3、Playwright 1.62、Cloudflare Pages GitHub integration

**Spec:** `docs/superpowers/specs/2026-09-01-tabimono-cloudflare-launch-design.md`

## Global Constraints

- 正式名称は `旅モノ比較`、正規 URL は `https://tabimono-hikaku.jp` とする。
- Cloudflare Pages の Root directory は `travel-goods-site`、Build command は `npm run build`、Build output directory は `out` とする。
- Cloudflare Functions、Wrangler デプロイ、Cloudflare API トークンは追加しない。
- Production branch は `main` だけとし、ブランチ Preview は常に `SITE_MODE=preview`、`CATALOG_DATASET=production` とする。
- 楽天 API の資格情報は Cloudflare Pages に渡さず、GitHub Actions の既存 Secrets / Variables に限定する。
- 商品、記事、紹介 URL、リンク照合状態、楽天資格情報を変更しない。
- `PUBLIC_OPERATOR_NAME` と `PUBLIC_CONTACT_EMAIL` は実値をコミットせず、公開時に Cloudflare の環境変数へ入力する。
- ドメイン購入、GitHub App の許可、Cloudflare アカウント操作、本番公開はこの実装計画の対象外とする。

## File Structure

| File | Responsibility |
|---|---|
| `travel-goods-site/src/config/site.ts` | 正式名称の既定値、URL、公開必須設定の単一情報源 |
| `travel-goods-site/tests/site-config.test.ts` | 正式名称と `missingLaunchSettings()` の環境変数契約 |
| `travel-goods-site/tests/e2e/real-data.spec.ts` | 実データ Preview に新名称が出て旧名称が出ないことの画面回帰 |
| `travel-goods-site/scripts/check-release.ts` | 本番成果物への旧名称・Vercel URL 混入を拒否する公開ゲート |
| `travel-goods-site/.env.example` | Cloudflare の Preview / Production で使う環境変数の説明 |
| `travel-goods-site/README.md` | 正式名称と Cloudflare 公開方式の入口 |
| `travel-goods-site/docs/cloudflare-pages-setup.md` | Git連携、環境変数、DNS、切替、ロールバックの運営手順 |
| `travel-goods-site/docs/vercel-setup.md` | Vercel は移行中の Preview 専用であることを示す旧環境手順 |
| `travel-goods-site/docs/launch-checklist.md` | 本番公開時の入力と検証順序 |
| `travel-goods-site/docs/status.md` | 正式名称決定、ホスティング決定、未完了の外部操作の現状 |
| `README.md` | モノレポ直下から旅行サイトの正式名称と公開文書へ案内 |

---

### Task 1: 正式名称をサイト設定の既定値にする

**Files:**
- Create: `travel-goods-site/tests/site-config.test.ts`
- Modify: `travel-goods-site/src/config/site.ts`

**Interfaces:**
- Consumes: `process.env.SITE_NAME`, `SITE_URL`, `PUBLIC_OPERATOR_NAME`, `PUBLIC_CONTACT_EMAIL`
- Produces: `DEFAULT_SITE_NAME: '旅モノ比較'`, `siteConfig.name`, `missingLaunchSettings(): string[]`

- [ ] **Step 1: 正式名称と公開必須設定の失敗テストを書く**

Create `travel-goods-site/tests/site-config.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const KEYS = [
  'SITE_NAME',
  'SITE_URL',
  'SITE_MODE',
  'PUBLIC_OPERATOR_NAME',
  'PUBLIC_CONTACT_EMAIL',
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('site config', () => {
  it('SITE_NAME 未設定でも正式名称を使い、名称を公開不足に数えない', async () => {
    for (const key of KEYS) delete process.env[key];
    vi.resetModules();

    const { DEFAULT_SITE_NAME, missingLaunchSettings, siteConfig } = await import('@/config/site');

    expect(DEFAULT_SITE_NAME).toBe('旅モノ比較');
    expect(siteConfig.name).toBe('旅モノ比較');
    expect(siteConfig).not.toHaveProperty('nameIsProvisional');
    expect(missingLaunchSettings()).toEqual([
      'SITE_URL（正規URL。canonical・サイトマップに必要）',
      'PUBLIC_OPERATOR_NAME（公開用の運営者名）',
      'PUBLIC_CONTACT_EMAIL（公開用の問い合わせ先）',
    ]);
  });

  it('SITE_NAME が設定されていれば環境別の表示名として上書きする', async () => {
    process.env.SITE_NAME = '旅モノ比較 Preview';
    vi.resetModules();

    const { siteConfig } = await import('@/config/site');
    expect(siteConfig.name).toBe('旅モノ比較 Preview');
  });
});
```

- [ ] **Step 2: 新しいテストを実行し、旧仮称契約で失敗することを確認する**

Run:

```bash
cd travel-goods-site
npx vitest run tests/site-config.test.ts
```

Expected: FAIL because `DEFAULT_SITE_NAME` is not exported and `siteConfig.name` still defaults to `旅じたくガイド`.

- [ ] **Step 3: 仮称状態を廃止して正式名称を既定値にする**

In `travel-goods-site/src/config/site.ts`, replace the provisional-name block with:

```ts
/** 正式名称。SITE_NAME は Preview など環境別の表示名を上書きするときだけ使う。 */
export const DEFAULT_SITE_NAME = '旅モノ比較';

export const siteConfig = {
  name: env('SITE_NAME') ?? DEFAULT_SITE_NAME,
  tagline: '旅の荷物を、軽く、迷わず。',
```

Delete `PROVISIONAL_SITE_NAME` and `nameIsProvisional`. Change `missingLaunchSettings()` to:

```ts
export function missingLaunchSettings(): string[] {
  const missing: string[] = [];
  if (!siteConfig.baseUrl) missing.push('SITE_URL（正規URL。canonical・サイトマップに必要）');
  if (!siteConfig.operatorName) missing.push('PUBLIC_OPERATOR_NAME（公開用の運営者名）');
  if (!siteConfig.contactEmail) missing.push('PUBLIC_CONTACT_EMAIL（公開用の問い合わせ先）');
  return missing;
}
```

Update the file header comment so it states that the formal name is fixed and public operator details remain environment-only.

- [ ] **Step 4: 単体テストと型検査を実行する**

Run:

```bash
npx vitest run tests/site-config.test.ts
npm run typecheck
```

Expected: both commands exit 0; the new file reports 2 passed tests.

- [ ] **Step 5: 正式名称の設定変更をコミットする**

```bash
git add travel-goods-site/src/config/site.ts travel-goods-site/tests/site-config.test.ts
git commit -m "feat(travel-goods-site): set 旅モノ比較 as official name"
```

---

### Task 2: 旧名称と旧ホストの本番混入を回帰検査で止める

**Files:**
- Modify: `travel-goods-site/tests/e2e/real-data.spec.ts`
- Modify: `travel-goods-site/scripts/check-release.ts`

**Interfaces:**
- Consumes: Task 1 の `siteConfig.name === '旅モノ比較'`
- Produces: 画面の正式名称回帰、`check:release` の旧名称・Vercel URL 成果物検査

- [ ] **Step 1: 実データ画面に正式名称が出る失敗テストを追加する**

Add to `travel-goods-site/tests/e2e/real-data.spec.ts` immediately after the Preview notice test:

```ts
test('正式名称を表示し、旧仮称を配信しない', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner')).toContainText('旅モノ比較');
  await expect(page.locator('footer')).toContainText('旅モノ比較');
  await expect(page).toHaveTitle(/旅モノ比較/);
  expect(await page.locator('body').innerText()).not.toContain('旅じたくガイド');
});
```

- [ ] **Step 2: Task 1 を一時的に戻さず、旧成果物でテストが失敗することを確認する**

Use the base commit in a temporary build directory rather than modifying the working tree:

```bash
git show HEAD^:travel-goods-site/src/config/site.ts | rg -q '旅じたくガイド'
```

Expected: exit 0, proving the previous implementation used the old name. The Playwright test added in Step 1 protects the new behavior after Task 1.

- [ ] **Step 3: 公開ゲートへ旧名称とVercel本番URLの検出を追加する**

In the `forbidden` array of `travel-goods-site/scripts/check-release.ts`, add:

```ts
{ pattern: /旅じたくガイド/, label: '旧サイト名 旅じたくガイド' },
{ pattern: /https:\/\/[^\s"'<>]*vercel\.app/i, label: 'Vercel URL' },
```

This scan applies only to generated `out/` files, not documentation. It must not reject the word `Vercel` by itself because migration documentation legitimately contains it.

- [ ] **Step 4: 正式名称の Preview をビルドしてE2Eを実行する**

Run:

```bash
SITE_MODE=preview CATALOG_DATASET=production SITE_NAME='旅モノ比較' npm run build:only
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium CATALOG_DATASET=production npm run test:e2e:production
```

Expected: build exits 0; all production-dataset E2E tests pass on desktop and mobile, including the new identity test.

- [ ] **Step 5: 生成物を直接走査する**

Run:

```bash
rg -n '旅じたくガイド|https://[^[:space:]"'"'"'<>]*vercel\.app' out && exit 1 || true
rg -n '旅モノ比較' out/index.html
```

Expected: the first scan prints nothing; the second scan finds `旅モノ比較` in `out/index.html`.

- [ ] **Step 6: 回帰検査をコミットする**

```bash
git add travel-goods-site/tests/e2e/real-data.spec.ts travel-goods-site/scripts/check-release.ts
git commit -m "test(travel-goods-site): block legacy launch identity"
```

---

### Task 3: Cloudflare Git連携と切替手順を運営文書へ反映する

**Files:**
- Create: `travel-goods-site/docs/cloudflare-pages-setup.md`
- Modify: `travel-goods-site/.env.example`
- Modify: `travel-goods-site/README.md`
- Modify: `travel-goods-site/docs/vercel-setup.md`
- Modify: `travel-goods-site/docs/launch-checklist.md`
- Modify: `travel-goods-site/docs/status.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Cloudflare Pages dashboard, GitHub repository access, `main`, `travel-goods-site/out`
- Produces: 運営者が秘密情報をチャットやGitへ出さずに初回 Preview、独自ドメイン、本番切替、ロールバックを行える手順

- [ ] **Step 1: Cloudflare Pages の設定手順を作成する**

Create `travel-goods-site/docs/cloudflare-pages-setup.md` with these exact sections and values:

```markdown
# Cloudflare Pages 公開手順

## 1. GitHub連携

- Repository: `ioda47871-byte/mugi-no-mi-nextjs-2`
- Production branch: `main`
- Root directory: `travel-goods-site`
- Build command: `npm run build`
- Build output directory: `out`
- Framework preset: `Next.js (Static HTML Export)`
- Node.js: `22`

Cloudflare Workers & Pages GitHub App の Repository access は
`mugi-no-mi-nextjs-2` だけに限定する。Cloudflare API token は作らない。

## 2. 初回Preview

Production と Preview の両環境へ、最初は次だけを設定する。

| Variable | Value |
|---|---|
| `SITE_MODE` | `preview` |
| `CATALOG_DATASET` | `production` |
| `SITE_NAME` | `旅モノ比較` |

`SITE_URL`、公開用運営者情報、GA4、Amazon、楽天API資格情報は入れない。
初回は `robots.txt` が `Disallow: /`、sitemap URL数が0、画面上部が
「未公開プレビューです」であることを確認する。

## 3. 独自ドメイン

1. `tabimono-hikaku.jp` を取得する。
2. Cloudflareへzoneを追加する。
3. レジストラのネームサーバーをCloudflare指定値へ変更する。
4. Pages > Custom domains で `tabimono-hikaku.jp` を追加する。
5. `www.tabimono-hikaku.jp` をapexへ恒久転送する。
6. TLSが有効であることを確認する。

## 4. 本番切替

Production 環境だけに次を設定し、再デプロイする。

| Variable | Value |
|---|---|
| `SITE_MODE` | `production` |
| `CATALOG_DATASET` | `production` |
| `SITE_NAME` | `旅モノ比較` |
| `SITE_URL` | `https://tabimono-hikaku.jp` |
| `PUBLIC_OPERATOR_NAME` | 公開を承認した運営者名 |
| `PUBLIC_CONTACT_EMAIL` | 公開を承認した連絡先 |

Preview 環境の `SITE_MODE=preview` は変更しない。`*.pages.dev` の Production URL は
独自ドメインへ転送する。

## 5. 本番確認

- 旧名称「旅じたくガイド」が出ない
- canonicalが `https://tabimono-hikaku.jp` を指す
- robotsがクロールを許可する
- sitemapが本番URLだけを含む
- 照合済み楽天CTAが14件、未照合CTAが0件
- CTAの `rel` が `nofollow sponsored noopener`
- デモ・Preview文言・資格情報が出ない

## 6. ロールバック

Cloudflare Pages > Deployments から直前の成功デプロイへRollbackする。
DNSをVercelへ戻さない。問題のある楽天リンクだけならリンクを `unverified` に戻し、
サイト全体を停止しない。
```

- [ ] **Step 2: 環境変数テンプレートを正式名称へ更新する**

In `travel-goods-site/.env.example`:

- Change the `SITE_NAME` comment to `正式名称の既定値は「旅モノ比較」。Previewなどで表示名を変える場合だけ設定する。`
- Change the URL example to `https://tabimono-hikaku.jp`.
- Change the `RAKUTEN_API_REFERER` comment from Referer-only wording to `Origin / Referer の基準` so it matches the current API implementation.
- Keep every value empty; do not add real emails, IDs, access keys, or tokens.

- [ ] **Step 3: READMEと公開チェックリストをCloudflare前提へ更新する**

Make these exact content changes:

- `travel-goods-site/README.md` title becomes `# travel-goods-site（旅モノ比較）`.
- Add `docs/cloudflare-pages-setup.md` as the primary deployment document.
- Describe `docs/vercel-setup.md` as migration-period Preview reference only.
- In `travel-goods-site/docs/launch-checklist.md`, set the formal name to `旅モノ比較`, domain to `tabimono-hikaku.jp`, hosting to `Cloudflare Pages Free`, and remove `SITE_NAME` from the list of values whose absence blocks release.
- In the repository-root `README.md`, call the site `旅モノ比較` and point deployment readers to `travel-goods-site/docs/cloudflare-pages-setup.md`.

- [ ] **Step 4: Vercel文書を移行期間限定へ変更する**

At the top of `travel-goods-site/docs/vercel-setup.md`, add:

```markdown
> この文書は移行期間中のPreview確認用です。本番はCloudflare Pagesを使用します。
> 新しい公開手順は `docs/cloudflare-pages-setup.md` を参照してください。
```

Remove statements that say the travel site will use Vercel for production. Preserve the instructions needed to inspect or stop the existing Preview project until Cloudflare cutover succeeds.

- [ ] **Step 5: statusを事実に合わせる**

In `travel-goods-site/docs/status.md`, record:

```markdown
| 正式名称 | 決定: 旅モノ比較 |
| 公開候補ドメイン | tabimono-hikaku.jp（2026-09-01 JPRS WHOISで登録情報なし。購入時に再確認） |
| 本番ホスティング | 決定: Cloudflare Pages Free / GitHub連携 |
| 本番公開 | 未完了（ドメイン取得、公開用運営者名・連絡先、Cloudflare外部設定が必要） |
```

Do not change product, article, source, or merchant-link counts in this task.

- [ ] **Step 6: 文書の矛盾と秘密情報を機械検索する**

Run from the repository root:

```bash
rg -n '仮称「旅じたくガイド」|ホスティング.*未決定|Vercel.*本番運用' \
  travel-goods-site/README.md travel-goods-site/.env.example \
  travel-goods-site/docs/launch-checklist.md travel-goods-site/docs/status.md README.md
rg -n 'RAKUTEN_(APPLICATION_ID|ACCESS_KEY|AFFILIATE_ID)=' travel-goods-site/docs travel-goods-site/README.md
```

Expected: both commands print no matches. The second command intentionally does not scan `.env.example`, where empty variable names are documented.

- [ ] **Step 7: 文書変更をコミットする**

```bash
git add README.md travel-goods-site/.env.example travel-goods-site/README.md \
  travel-goods-site/docs/cloudflare-pages-setup.md \
  travel-goods-site/docs/vercel-setup.md \
  travel-goods-site/docs/launch-checklist.md travel-goods-site/docs/status.md
git commit -m "docs(travel-goods-site): prepare Cloudflare Pages launch"
```

---

### Task 4: 本番相当ビルドと全回帰検証を完了する

**Files:**
- Modify only if verification exposes an issue: files already listed in Tasks 1-3

**Interfaces:**
- Consumes: Task 1-3 の正式名称、公開ゲート、Cloudflare運営手順
- Produces: 本番公開前のローカル検証記録と、外部操作だけが残ったクリーンなブランチ

- [ ] **Step 1: 静的検証をまとめて実行する**

Run from `travel-goods-site`:

```bash
npm run typecheck
npm run lint
npm test
npm run validate:content:all
```

Expected: all commands exit 0. Unit tests include the 2 new site-config tests in addition to the existing 139 tests.

- [ ] **Step 2: Preview環境の実データビルドを確認する**

```bash
SITE_MODE=preview CATALOG_DATASET=production SITE_NAME='旅モノ比較' npm run build:only
npm run check:release -- --out out; test $? -ne 0
```

Expected: build succeeds. `check:release` exits non-zero because Preview is intentionally noindex and public operator details are absent; it must not report demo data, old site name, Vercel URL, test IDs, secrets, or merchant-link errors.

- [ ] **Step 3: 本番相当の環境変数でリリースゲートを通す**

Use non-secret local rehearsal values that are not committed:

```bash
SITE_MODE=production \
CATALOG_DATASET=production \
SITE_NAME='旅モノ比較' \
SITE_URL='https://tabimono-hikaku.jp' \
PUBLIC_OPERATOR_NAME='旅モノ比較 編集部' \
PUBLIC_CONTACT_EMAIL='contact@tabimono-hikaku.jp' \
npm run build:only

SITE_MODE=production \
CATALOG_DATASET=production \
SITE_NAME='旅モノ比較' \
SITE_URL='https://tabimono-hikaku.jp' \
PUBLIC_OPERATOR_NAME='旅モノ比較 編集部' \
PUBLIC_CONTACT_EMAIL='contact@tabimono-hikaku.jp' \
npm run check:release -- --out out
```

Expected: both commands exit 0. This verifies the build contract only; it does not authorize those rehearsal operator values for public use.

- [ ] **Step 4: 3系統のE2Eを実行する**

```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:production
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e:linkcheck
```

Expected: all three commands exit 0. Production E2E includes the new desktop/mobile identity checks; linkcheck keeps the verified/unverified CTA contract unchanged.

- [ ] **Step 5: 本番成果物を直接検査する**

Rebuild with the production rehearsal environment from Step 3, then run:

```bash
rg -n '旅じたくガイド|https://[^[:space:]"'"'"'<>]*vercel\.app|未公開プレビュー|デモデータ表示中' out && exit 1 || true
rg -n 'https://tabimono-hikaku\.jp' out/robots.txt out/sitemap.xml out/index.html
test "$(rg -l '楽天市場で商品を見る' out --glob '*.html' | wc -l)" -gt 0
```

Expected: the forbidden-content scan prints nothing; the domain is present in robots, sitemap, and the home page; at least one generated HTML page contains a verified Rakuten CTA.

- [ ] **Step 6: 作業ツリーとコミット列を確認する**

```bash
git status --short
git log --oneline --decorate -5
```

Expected: `git status --short` prints nothing. The log contains separate commits for official identity, release regression tests, and Cloudflare operations documentation.

- [ ] **Step 7: 外部操作の引き継ぎ項目を報告する**

Report exactly these remaining user actions without performing them:

1. Recheck and purchase `tabimono-hikaku.jp`.
2. Create/connect the Cloudflare Pages project using `docs/cloudflare-pages-setup.md`.
3. Decide the real public `PUBLIC_OPERATOR_NAME` and `PUBLIC_CONTACT_EMAIL`.
4. Merge the release branch to `main` only after the Cloudflare Preview build succeeds.
5. Attach the domain, verify DNS/TLS, then change Production to `SITE_MODE=production`.
6. Confirm the live release, redirect the Production `*.pages.dev` URL, and stop Vercel auto-deploy.

Do not claim that the domain is purchased, Cloudflare is connected, or the site is publicly indexed until those states are observed directly.
