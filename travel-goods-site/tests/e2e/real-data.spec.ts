import { expect, test } from '@playwright/test';

/**
 * 本番データセット（実商品）での確認（追記指示 11節のチェック項目）。
 *
 * 実行: npm run test:e2e:production
 * （CATALOG_DATASET=production でビルドした out/ を配信して実行する）
 */

test('取り込んだ実商品が正しい件数だけ公開されている', async ({ page }) => {
  await page.goto('/categories/suitcases/');
  await expect(page.getByTestId('result-count')).toContainText('全 9 件');

  await page.goto('/categories/backpacks/');
  await expect(page.getByTestId('result-count')).toContainText('全 5 件');

  await page.goto('/categories/pouches/');
  await expect(page.getByTestId('result-count')).toContainText('全 4 件');

  // モバイルバッテリーは公開4件。安全確認が未完了の1件は review 状態＝非公開のまま
  await page.goto('/categories/power-banks/');
  await expect(page.getByTestId('result-count')).toContainText('全 4 件');
  await expect(page.locator('article[data-product-id="elecom-de-c63-10000bk"]')).toHaveCount(0);
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
  await expect(page.locator('article[data-product-id="ace-cresta2-06936-35l-black-hairline"]')).toContainText(
    '2.9 kg',
  );

  await page.goto('/categories/pouches/');
  // 220g は g のまま
  await expect(page.locator('article[data-product-id="elecom-bma-trcs01mbk-m-black"]')).toContainText('220 g');

  await page.goto('/categories/backpacks/');
  await expect(page.locator('article[data-product-id="elecom-bm-bptrcsepbk-30l-black"]')).toContainText(
    '1.25 kg',
  );
});

test('ハンドルを除く寸法が「ハンドル・キャスター含む」欄に出ない', async ({ page }) => {
  await page.goto('/categories/pouches/');
  await page.locator('[data-testid="product-card"] details').first().evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const card = page.locator('article[data-product-id="elecom-bma-trcs01mbk-m-black"]');
  await expect(card).toContainText('拡張時の外寸（ハンドルを除く）');
  await expect(card).not.toContainText('ハンドル・キャスター含む');
  await expect(card).toContainText('240 × 340 × 140 mm');
});

test('スーツケースは外寸と本体寸法を分けて表示する', async ({ page }) => {
  await page.goto('/categories/suitcases/');
  await page.locator('[data-testid="product-card"] details').first().evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const card = page.locator('article[data-product-id="ace-cresta2-06936-35l-black-hairline"]');
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
  const card = page.locator('article[data-product-id="elecom-bm-bptrcsepbk-30l-black"]');
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

test('正式名称を表示し、旧仮称を配信しない', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner')).toContainText('旅モノ比較');
  await expect(page.locator('footer')).toContainText('旅モノ比較');
  await expect(page).toHaveTitle(/旅モノ比較/);
  expect(await page.locator('body').innerText()).not.toContain('旅じたくガイド');
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

/** 楽天アフィリエイト管理画面で発行され、そのまま登録した紹介URL。加工しない。 */
const RAKUTEN_AFFILIATE_URL =
  'https://hb.afl.rakuten.co.jp/ichiba/5701a01f.9678bdb7.5701a020.aecdb911/' +
  '?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fnanshindo%2Fj197439%2F&link_type=picttext' +
  '&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJwaWN0dGV4dCIsInNpemUiOiIyNDB4MjQwIiwibmFtIjoxLCJuYW1wIjoic' +
  'mlnaHQiLCJjb20iOjEsImNvbXAiOiJkb3duIiwicHJpY2UiOjEsImJvciI6MSwiY29sIjoxLCJiYnRuIjoxLCJwcm9kIjowLCJhbXAiOmZhbHNlfQ%3D%3D';

test('照合済みのポーチには楽天ボタンが出て、発行されたURLと完全一致する', async ({ page }) => {
  for (const path of ['/categories/pouches/', '/articles/pouch-size-weight-compartments/']) {
    await page.goto(path);
    const cta = page.locator(
      'article[data-product-id="elecom-bma-trcs01mbk-m-black"] a[rel*="sponsored"]',
    );
    await expect(cta).toHaveCount(1);
    await expect(cta).toHaveText(/楽天市場で商品を見る/);
    // 発行された紹介URLを加工しない（クエリの追加・削除をしない）
    await expect(cta).toHaveAttribute('href', RAKUTEN_AFFILIATE_URL);
  }
});

test('広告リンクの rel は発行元のコードに合わせる', async ({ page }) => {
  await page.goto('/categories/pouches/');
  const rel =
    (await page.locator('a[rel*="sponsored"]').first().getAttribute('rel')) ?? '';
  expect(rel).toContain('sponsored');
  expect(rel).toContain('nofollow');
  expect(rel).toContain('noopener');
  // 成果判定にリファラが使われる可能性があるため noreferrer は付けない
  expect(rel).not.toContain('noreferrer');
});

test('販売先の価格・在庫・画像を取り込まない', async ({ page }) => {
  for (const path of ['/categories/pouches/', '/articles/pouch-size-weight-compartments/']) {
    await page.goto(path);
    const body = await page.locator('body').innerText();
    expect(body).not.toContain('3,186');
    expect(body).not.toContain('円');
    // 楽天が配信する商品画像を転載しない
    await expect(page.locator('img[src*="rakuten.co.jp"]')).toHaveCount(0);
  }
});

test('リンク未発行・未照合の商品にはCTAもダミーリンクも出さない', async ({ page }) => {
  for (const [path, productId] of [
    // 紹介URLが登録されていない商品
    ['/categories/backpacks/', 'elecom-bm-bptrcsepbk-30l-black'],
    ['/categories/suitcases/', 'proteca-360g4-02420-24l-black'],
    // 紹介URLは登録済みだが unverified の商品。登録があっても出してはいけない。
    ['/categories/suitcases/', 'ace-crestas-09162-60l-gunmetallic'],
  ] as const) {
    await page.goto(path);
    const card = page.locator(`article[data-product-id="${productId}"]`);
    await expect(card).toHaveCount(1);
    await expect(card.locator('a[rel*="sponsored"]')).toHaveCount(0);
    await expect(page.locator('a[href="#"]')).toHaveCount(0);
  }
});

test('未照合の商品の紹介URLは配信物に現れない', async ({ page }) => {
  // クレスタS 09162 は登録済み・unverified。遷移先の商品ページURLごと出力に無いこと。
  await page.goto('/categories/suitcases/');
  const html = await page.content();
  expect(html).not.toContain('galleria-annex/ace00093');
});

test('選択式の販売ページに備えた案内を購入導線に出す', async ({ page }) => {
  await page.goto('/categories/backpacks/');
  await expect(page.getByTestId('merchant-actions').first()).toContainText(
    '色・サイズが選択式の場合は、販売ページで対象の仕様を選択してください。',
  );
});
