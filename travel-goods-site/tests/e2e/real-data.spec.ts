import { expect, test } from '@playwright/test';

/**
 * 本番データセット（実商品）での確認（追記指示 11節のチェック項目）。
 *
 * 実行: npm run test:e2e:production
 * （CATALOG_DATASET=production でビルドした out/ を配信して実行する）
 */

test('取り込んだ実商品が正しい件数だけ公開されている', async ({ page }) => {
  await page.goto('/categories/suitcases/');
  await expect(page.getByTestId('result-count')).toContainText('全 1 件');

  await page.goto('/categories/backpacks/');
  await expect(page.getByTestId('result-count')).toContainText('全 1 件');

  await page.goto('/categories/pouches/');
  await expect(page.getByTestId('result-count')).toContainText('全 1 件');

  // モバイルバッテリーは安全確認が未完了のため review 状態＝非公開
  await page.goto('/categories/power-banks/');
  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.locator('[data-product-id="elecom-de-c63-10000bk"]')).toHaveCount(0);
});

test('review状態の商品は直接URLからも出てこない', async ({ page }) => {
  // 記事一覧・サイトマップ・カテゴリのどこにもバッテリーは現れない
  for (const path of ['/', '/categories/power-banks/', '/articles/']) {
    await page.goto(path);
    expect(await page.locator('body').innerText()).not.toContain('DE-C63-10000BK');
  }
});

test('単位変換が正しい（g→kg の閾値と表示）', async ({ page }) => {
  await page.goto('/categories/suitcases/');
  // 2900g は 2.9 kg
  await expect(page.locator('[data-product-id="ace-cresta2-06936-35l-black-hairline"]')).toContainText(
    '2.9 kg',
  );

  await page.goto('/categories/pouches/');
  // 220g は g のまま
  await expect(page.locator('[data-product-id="elecom-bma-trcs01mbk-m-black"]')).toContainText('220 g');

  await page.goto('/categories/backpacks/');
  await expect(page.locator('[data-product-id="elecom-bm-bptrcsepbk-30l-black"]')).toContainText(
    '1.25 kg',
  );
});

test('ハンドルを除く寸法が「ハンドル・キャスター含む」欄に出ない', async ({ page }) => {
  await page.goto('/categories/pouches/');
  await page.locator('[data-testid="product-card"] details').first().evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const card = page.locator('[data-product-id="elecom-bma-trcs01mbk-m-black"]');
  await expect(card).toContainText('拡張時の外寸（ハンドルを除く）');
  await expect(card).not.toContainText('ハンドル・キャスター含む');
  await expect(card).toContainText('240 × 340 × 140 mm');
});

test('スーツケースは外寸と本体寸法を分けて表示する', async ({ page }) => {
  await page.goto('/categories/suitcases/');
  await page.locator('[data-testid="product-card"] details').first().evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const card = page.locator('[data-product-id="ace-cresta2-06936-35l-black-hairline"]');
  await expect(card).toContainText('外寸（ハンドル・キャスター含む）');
  await expect(card).toContainText('350 × 550 × 250 mm');
  await expect(card).toContainText('本体寸法（本体のみ）');
  await expect(card).toContainText('340 × 480 × 250 mm');
});

test('リュックは通常時と拡張時を区別して表示する', async ({ page }) => {
  await page.goto('/categories/backpacks/');
  await page.locator('[data-testid="product-card"] details').first().evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const card = page.locator('[data-product-id="elecom-bm-bptrcsepbk-30l-black"]');
  await expect(card).toContainText('通常時の容量');
  await expect(card).toContainText('30 L');
  await expect(card).toContainText('拡張時の容量');
  await expect(card).toContainText('40 L');
  await expect(card).toContainText('通常時の外寸（ハンドル・ショルダーベルトを除く）');
  await expect(card).toContainText('320 × 510 × 200 mm');
  await expect(card).toContainText('拡張時の外寸（ハンドル・ショルダーベルトを除く）');
  await expect(card).toContainText('320 × 510 × 250 mm');
});

test('実データのプレビューでは「架空」ではなく「未公開プレビュー」と表示する', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('preview-notice')).toContainText('未公開プレビュー');
  await expect(page.getByTestId('demo-notice')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain('架空');
});

test('実データの記事が公開され、出典が実在のメーカーを指す', async ({ page }) => {
  await page.goto('/articles/');
  await expect(page.getByRole('link', { name: /旅行ポーチを選ぶときに見る/ })).toBeVisible();

  await page.goto('/articles/pouch-size-weight-compartments/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('旅行ポーチを選ぶとき');
  await expect(page.locator('table')).toBeVisible();

  const source = page.getByRole('link', { name: 'エレコム株式会社' }).first();
  await expect(source).toHaveAttribute(
    'href',
    'https://www.elecom.co.jp/products/BMA-TRCS01MBK.html',
  );
});

test('購入リンクが未発行のうちはCTAを出さない', async ({ page }) => {
  for (const path of ['/categories/pouches/', '/articles/pouch-size-weight-compartments/']) {
    await page.goto(path);
    await expect(page.locator('a[rel*="sponsored"]')).toHaveCount(0);
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
  }
});
