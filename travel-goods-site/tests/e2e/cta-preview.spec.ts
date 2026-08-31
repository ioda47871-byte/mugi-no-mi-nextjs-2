import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 購入ボタンの画面確認（追記指示 5節）。
 *
 * - テスト専用の架空データで描画したページを開く（本番出力には含まれない）。
 * - **外部への通信をすべて遮断**し、実店舗へはアクセスしない。
 * - リンクの遷移は preventDefault で止める。押して確かめるのはボタン側の挙動だけ。
 */

const PREVIEW = path.resolve(process.cwd(), '.preview/cta/index.html');

test.beforeEach(async ({ context, page }) => {
  // file:// 以外の通信をすべて中止する（計測送信・店舗アクセスを起こさない）
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('file://')) return route.continue();
    return route.abort();
  });

  const failed: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('file://')) failed.push(request.url());
  });
  test.info().annotations.push({ type: 'network', description: 'external requests blocked' });

  if (!fs.existsSync(PREVIEW)) {
    throw new Error('.preview/cta/index.html がありません。npm run preview:cta を先に実行してください。');
  }
  await page.goto(`file://${PREVIEW}`);

  // 遷移を起こさない
  await page.evaluate(() => {
    document.addEventListener('click', (event) => event.preventDefault(), true);
  });
});

test('4状態が意図どおりのボタン数で描画される', async ({ page }) => {
  await expect(page.locator('[data-case="both"] a[rel*="sponsored"]')).toHaveCount(2);
  await expect(page.locator('[data-case="rakuten-only"] a[rel*="sponsored"]')).toHaveCount(1);
  await expect(page.locator('[data-case="amazon-only"] a[rel*="sponsored"]')).toHaveCount(1);
  await expect(page.locator('[data-case="none"] a[rel*="sponsored"]')).toHaveCount(0);
});

test('店舗名が分かる文言とアクセシブルな注記が付く', async ({ page }) => {
  const both = page.locator('[data-case="both"]');
  await expect(both.getByRole('link', { name: /楽天市場で商品を見る/ })).toBeVisible();
  await expect(both.getByRole('link', { name: /Amazonで商品を見る/ })).toBeVisible();
  // 新しいタブで開くことが読み上げでも分かる
  await expect(both.locator('a[rel*="sponsored"]').first()).toContainText('広告・新しいタブで開きます');
});

test('広告リンクの属性が正しい', async ({ page }) => {
  const links = page.locator('a[rel*="sponsored"]');
  const count = await links.count();
  expect(count).toBe(4);
  for (let index = 0; index < count; index += 1) {
    const link = links.nth(index);
    const rel = (await link.getAttribute('rel')) ?? '';
    expect(rel).toContain('sponsored');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
    expect(await link.getAttribute('target')).toBe('_blank');

    const href = (await link.getAttribute('href')) ?? '';
    expect(href.startsWith('https://')).toBe(true);
    expect(['www.amazon.co.jp', 'hb.afl.rakuten.co.jp']).toContain(new URL(href).hostname);
  }
});

test('どちらもなしの状態では運営側の事情を表示しない', async ({ page }) => {
  const none = page.locator('[data-case="none"]');
  const text = (await none.innerText()).replace(/\s+/g, '');
  for (const jargon of ['紹介ID', '未設定', '型番照合', 'unverified', 'バリエーション不一致']) {
    expect(text).not.toContain(jargon);
  }
});

test('クリック領域が十分な高さで、キーボードで到達できる', async ({ page }) => {
  const link = page.locator('[data-case="both"] a[rel*="sponsored"]').first();
  const box = await link.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await link.focus();
  await expect(link).toBeFocused();
  // Enter を押しても遷移しない（preventDefault 済み）ことを確認する
  await page.keyboard.press('Enter');
  await expect(link).toBeFocused();
});

test('スマートフォン幅ではボタンが縦に並ぶ', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const links = page.locator('[data-case="both"] a[rel*="sponsored"]');
  const first = await links.nth(0).boundingBox();
  const second = await links.nth(1).boundingBox();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  // 縦積み: 2つ目の上端が1つ目の下端以降にある
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height - 1);
});
