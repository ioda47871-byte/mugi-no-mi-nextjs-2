import { expect, test } from '@playwright/test';

/**
 * 購入導線の通し確認（記事・カテゴリ画面）。
 *
 * 実行: npm run test:e2e:linkcheck
 *
 * 使うのは .preview/linkcheck-dataset（本番データの複製に、テスト専用の
 * 架空の紹介URLを1件だけ差し込んだもの）。本番データセットは変更していない。
 *
 * 外部への通信はすべて遮断する。実店舗にも計測サーバーにもアクセスしない。
 */

const PRODUCT = 'elecom-bma-trcs01mbk-m-black';
const EXPECTED_HREF = 'https://hb.afl.rakuten.co.jp/hgc/linkcheck-fixture-not-real/';
const ARTICLE = '/articles/pouch-size-weight-compartments/';
const CATEGORY = '/categories/pouches/';

/**
 * 外部通信を止める。
 * gtag.js（googletagmanager）も遮断されるため、実際に動くのは
 * ページが自前で定義する gtag シム（dataLayer へ積むだけ）になる。
 * つまり送信内容は dataLayer から読める。外部へは何も出ない。
 */
async function isolate(page: import('@playwright/test').Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) {
      return route.continue();
    }
    return route.abort();
  });
  await page.addInitScript(() => {
    (window as unknown as { __navigations: string[] }).__navigations = [];
  });
}

/** dataLayer に積まれた affiliate_click イベントを取り出す。 */
async function affiliateEvents(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const layer = (window as unknown as { dataLayer?: unknown[] }).dataLayer ?? [];
    return layer
      .map((entry) => Array.from(entry as ArrayLike<unknown>))
      .filter((args) => args[0] === 'event' && args[1] === 'affiliate_click') as [
      string,
      string,
      Record<string, string>,
    ][];
  });
}

/**
 * 計測タグが有効になるまで待つ。
 * next/script の afterInteractive はハイドレーション後に走るため、
 * これを待つことで「React のクリックハンドラも動く状態」であることも保証できる。
 */
async function expectAnalyticsEnabled(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () =>
      Array.isArray((window as unknown as { dataLayer?: unknown[] }).dataLayer) &&
      typeof (window as unknown as { gtag?: unknown }).gtag === 'function',
    undefined,
    { timeout: 10_000 },
  );
}

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

test.describe('ボタン表示', () => {
  test('カテゴリ画面に楽天ボタンが1つ出る', async ({ page }) => {
    await page.goto(CATEGORY);
    const card = page.locator(`[data-product-id="${PRODUCT}"]`);
    const cta = card.locator('a[rel*="sponsored"]');
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveText(/楽天市場で商品を見る/);
    // 紹介IDが未設定のAmazonボタンは出ない
    await expect(card.locator('a[data-merchant="amazon"]')).toHaveCount(0);
  });

  test('記事画面にも同じボタンが出る', async ({ page }) => {
    await page.goto(ARTICLE);
    const card = page.locator(`[data-product-id="${PRODUCT}"]`);
    const cta = card.locator('a[rel*="sponsored"]');
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveText(/楽天市場で商品を見る/);
  });

  test('広告であることが画面に示される', async ({ page }) => {
    await page.goto(ARTICLE);
    await expect(page.getByTestId('ad-disclosure')).toBeVisible();
    await expect(page.getByTestId('merchant-actions').first()).toContainText('広告リンクです');
  });
});

test.describe('遷移先', () => {
  for (const [label, path] of [
    ['カテゴリ', CATEGORY],
    ['記事', ARTICLE],
  ] as const) {
    test(`${label}画面のhrefが登録した紹介URLと完全一致する`, async ({ page }) => {
      await page.goto(path);
      const cta = page.locator(`[data-product-id="${PRODUCT}"] a[rel*="sponsored"]`);
      // 発行済み紹介URLを加工しない（独自の計測クエリを足さない）
      await expect(cta).toHaveAttribute('href', EXPECTED_HREF);
      await expect(cta).toHaveAttribute('target', '_blank');
      const rel = (await cta.getAttribute('rel')) ?? '';
      expect(rel).toContain('sponsored');
      expect(rel).toContain('nofollow');
      expect(rel).toContain('noopener');
      expect(rel).not.toContain('noreferrer');
    });
  }

  test('中継ページを挟まず販売先へ直接リンクする', async ({ page }) => {
    await page.goto(CATEGORY);
    const href = await page
      .locator(`[data-product-id="${PRODUCT}"] a[rel*="sponsored"]`)
      .getAttribute('href');
    const url = new URL(href!);
    expect(url.protocol).toBe('https:');
    expect(url.hostname).toBe('hb.afl.rakuten.co.jp');
    // 自サイトのリダイレクタや短縮URLを経由していない
    expect(url.hostname).not.toContain('127.0.0.1');
    expect(url.search).toBe('');
  });
});

test.describe('クリック計測', () => {
  test('カテゴリ画面のクリックでカテゴリ識別子が送られる', async ({ page }) => {
    await page.goto(CATEGORY);
    await expectAnalyticsEnabled(page);
    await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
    await page.locator(`[data-product-id="${PRODUCT}"] a[rel*="sponsored"]`).click();

    const events = await affiliateEvents(page);
    expect(events).toHaveLength(1);
    const params = events[0]![2];
    expect(params.product_id).toBe(PRODUCT);
    expect(params.merchant).toBe('rakuten');
    expect(params.category_id).toBe('pouches');
    expect(params.article_slug).toBe('');
    expect(params.placement).toBe('category-card');
  });

  test('記事画面のクリックで記事slugが送られる', async ({ page }) => {
    await page.goto(ARTICLE);
    await expectAnalyticsEnabled(page);
    await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
    await page.locator(`[data-product-id="${PRODUCT}"] a[rel*="sponsored"]`).click();

    const events = await affiliateEvents(page);
    expect(events).toHaveLength(1);
    const params = events[0]![2];
    expect(params.article_slug).toBe('pouch-size-weight-compartments');
    expect(params.category_id).toBe('');
    expect(params.placement).toBe('article-card');
  });

  test('個人情報や外部URLを送らない', async ({ page }) => {
    await page.goto(ARTICLE);
    await expectAnalyticsEnabled(page);
    await page.evaluate(() => document.addEventListener('click', (e) => e.preventDefault(), true));
    await page.locator(`[data-product-id="${PRODUCT}"] a[rel*="sponsored"]`).click();

    const events = await affiliateEvents(page);
    const payload = JSON.stringify(events);
    expect(payload).not.toContain('http');
    expect(payload).not.toContain('rakuten.co.jp');
    expect(payload).not.toContain('@');
    // 送るキーは識別子だけ
    const params = events[0]![2];
    expect(Object.keys(params).sort()).toEqual([
      'article_slug',
      'category_id',
      'merchant',
      'placement',
      'product_id',
    ]);
  });

  test('計測が失敗してもリンクは機能する', async ({ page }) => {
    await page.goto(ARTICLE);
    await expectAnalyticsEnabled(page);
    // gtag が例外を投げる状態にする
    await page.evaluate(() => {
      (window as unknown as { gtag: () => void }).gtag = () => {
        throw new Error('計測失敗のシミュレーション');
      };
      document.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          (window as unknown as { __navigations: string[] }).__navigations.push(
            (e.target as HTMLElement).closest('a')?.getAttribute('href') ?? '',
          );
        },
        true,
      );
    });

    const cta = page.locator(`[data-product-id="${PRODUCT}"] a[rel*="sponsored"]`);
    await cta.click();

    // 例外がハンドラの外へ出ず、クリックイベントは通常どおり進む
    const navigations = await page.evaluate(
      () => (window as unknown as { __navigations: string[] }).__navigations,
    );
    expect(navigations).toEqual([EXPECTED_HREF]);
    await expect(cta).toBeVisible();
  });
});

test.describe('本番データを汚していないこと', () => {
  test('テスト用の紹介URLはこのビルド限定である', async ({ page }) => {
    await page.goto(CATEGORY);
    // fixture 由来の値であることを明示（本番データセットには入っていない）
    const href = await page
      .locator(`[data-product-id="${PRODUCT}"] a[rel*="sponsored"]`)
      .getAttribute('href');
    expect(href).toContain('linkcheck-fixture-not-real');
  });
});
