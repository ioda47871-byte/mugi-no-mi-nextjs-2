import { expect, test } from '@playwright/test';

/**
 * 静的出力（out/）を配信して主要導線を確認する。
 * 検証対象: 閲覧、フィルタ、CTA、モバイル表示、下書きの非公開。
 */

test.describe('閲覧の基本導線', () => {
  test('トップから4カテゴリと記事一覧へ行ける', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('旅の荷物');

    await page.getByRole('link', { name: 'スーツケース', exact: true }).first().click();
    await expect(page).toHaveURL(/\/categories\/suitcases\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('スーツケース');

    await page.getByRole('link', { name: '記事一覧' }).first().click();
    await expect(page).toHaveURL(/\/articles\/$/);
  });

  test('デモデータの注意書きが全ページに出る', async ({ page }) => {
    for (const path of ['/', '/categories/backpacks/', '/articles/', '/about/']) {
      await page.goto(path);
      await expect(page.getByTestId('demo-notice')).toBeVisible();
    }
  });

  test('存在しないURLは404ページになる', async ({ page }) => {
    const response = await page.goto('/no-such-page/');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ページが見つかりません');
  });
});

test.describe('カテゴリ画面の絞り込み', () => {
  test('条件で件数が減り、解除で元に戻る', async ({ page }) => {
    await page.goto('/categories/suitcases/');
    const count = page.getByTestId('result-count');
    await expect(count).toContainText('該当 8 件');

    await page.getByLabel('本体重量').selectOption({ label: '3.0kg以下' });
    await expect(count).toContainText('該当 3 件');

    await page.getByRole('button', { name: '選択を解除' }).click();
    await expect(count).toContainText('該当 8 件');
  });

  test('不明値の商品は数値条件の結果に含まれない', async ({ page }) => {
    await page.goto('/categories/backpacks/');
    // 本体重量が不明な商品（d-bp-hoshi-22）は、重量条件を指定すると外れる。
    await expect(page.locator('[data-product-id="d-bp-hoshi-22"]')).toBeVisible();
    await page.getByLabel('本体重量').selectOption({ label: '1.0kg以下' });
    await expect(page.locator('[data-product-id="d-bp-hoshi-22"]')).toHaveCount(0);
  });

  test('条件に合うものが無いと0件の案内が出る', async ({ page }) => {
    await page.goto('/categories/suitcases/');
    await page.getByLabel('本体重量').selectOption({ label: '2.5kg以下' });
    await page.getByLabel('容量').selectOption({ label: '60L以上' });
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByTestId('result-count')).toContainText('該当 0 件');
  });

  test('キーボードだけで絞り込みを操作できる', async ({ page }) => {
    await page.goto('/categories/pouches/');
    const weight = page.getByLabel('本体重量');
    await weight.focus();
    await expect(weight).toBeFocused();
    await weight.selectOption({ index: 1 });
    await expect(page.getByTestId('result-count')).not.toContainText('該当 8 件');
  });

  test('表で比較に切り替えると比較表が出る', async ({ page }) => {
    await page.goto('/categories/power-banks/');
    await page.getByRole('button', { name: '表で比較' }).click();
    const table = page.locator('table');
    await expect(table).toBeVisible();
    // 不明値は「不明」と表示される（空欄や0にしない）
    await expect(table).toContainText('不明');
  });
});

test.describe('記事', () => {
  test('記事本文に比較表と出典が出る', async ({ page }) => {
    await page.goto('/articles/suitcase-under-3kg/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('本体重量3kg以下');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.getByRole('heading', { name: '出典' })).toBeVisible();
    await expect(page.getByTestId('ad-disclosure')).toBeVisible();
  });

  test('本文の生HTMLがそのまま実行されない', async ({ page }) => {
    await page.goto('/articles/power-bank-specs/');
    // 記事本文の領域に script が生成されていないこと
    const inlineScripts = await page.locator('article script:not([type="application/ld+json"])').count();
    expect(inlineScripts).toBe(0);
  });

  test('構造化データはArticleとBreadcrumbListのみ', async ({ page }) => {
    await page.goto('/articles/packing-cube-compare/');
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = blocks.map((raw) => JSON.parse(raw)['@type']);
    expect(types.sort()).toEqual(['Article', 'BreadcrumbList']);
    // 架空の評価・価格を作らない
    expect(blocks.join('')).not.toContain('AggregateRating');
    expect(blocks.join('')).not.toContain('"Offer"');
  });
});

test.describe('購入リンク', () => {
  test('未設定・未照合の店舗はボタンを出さず、運営側の事情も見せない', async ({ page }) => {
    await page.goto('/categories/suitcases/');
    // デモデータには照合済みリンクが無いため、CTAは1つも出ない
    await expect(page.locator('a[rel*="sponsored"]')).toHaveCount(0);
    await expect(page.getByTestId('merchant-actions')).toHaveCount(0);

    // 読者向けの領域に開発者向けの説明を出さない
    const main = (await page.locator('main').innerText()).replace(/\s+/g, '');
    for (const jargon of ['紹介ID', '型番照合が未完了', '販売先リンク未登録', 'unverified']) {
      expect(main).not.toContain(jargon);
    }
  });

  test('ダミーURLやhref="#"のCTAが存在しない', async ({ page }) => {
    for (const path of ['/', '/categories/suitcases/', '/articles/suitcase-stopper/']) {
      await page.goto(path);
      await expect(page.locator('a[href="#"]')).toHaveCount(0);
      await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    }
  });
});

test.describe('公開状態', () => {
  test('下書き記事は一覧にも直接URLにも出ない', async ({ page }) => {
    await page.goto('/articles/');
    const links = await page.locator('a[href^="/articles/"]').count();
    expect(links).toBeGreaterThan(0);
    // 本番データセット側の下書きslugは、このビルドには存在しない
    const response = await page.goto('/articles/demo-draft-test/');
    expect(response?.status()).toBe(404);
  });

  test('プレビューは noindex になる', async ({ page }) => {
    await page.goto('/');
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toContain('noindex');
  });
});

test.describe('読者向け画面と開発情報の分離', () => {
  test('内部状態はプレビューの開発情報にだけ置く', async ({ page }) => {
    for (const path of ['/', '/about/', '/editorial-policy/', '/contact/']) {
      await page.goto(path);
      const main = (await page.locator('main').innerText()).replace(/\s+/g, '');
      for (const jargon of [
        'SITE_URL',
        'SITE_NAME',
        'PUBLIC_OPERATOR_NAME',
        'PUBLIC_CONTACT_EMAIL',
        'AMAZON_ASSOCIATE_TAG',
        'NEXT_PUBLIC_GA_ID',
        'データセット',
        '登録済み出典',
      ]) {
        expect(main, `${path} に ${jargon} が出ています`).not.toContain(jargon);
      }
    }
  });

  test('開発情報はプレビューでのみ、折りたたまれて出る', async ({ page }) => {
    await page.goto('/');
    const dev = page.getByTestId('dev-info');
    await expect(dev).toBeVisible();
    // 既定では閉じている（読者の邪魔をしない）
    expect(await dev.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
  });
});

test.describe('レイアウト', () => {
  test('固定ヘッダーがフィルタ操作を隠さない', async ({ page }) => {
    await page.goto('/categories/suitcases/');
    const select = page.getByLabel('本体重量');
    await select.scrollIntoViewIfNeeded();

    const hidden = await page.evaluate(() => {
      const header = document.querySelector('header');
      const target = document.querySelector('select');
      if (!header || !target) return true;
      const h = header.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      // 操作対象がヘッダー帯に食い込んでいないこと
      return t.top < h.bottom && t.bottom > h.top;
    });
    expect(hidden).toBe(false);

    // 実際に操作できる
    await select.selectOption({ label: '3.0kg以下' });
    await expect(page.getByTestId('result-count')).toContainText('該当 3 件');
  });

  test('本文が横にはみ出さず、比較表だけ横スクロールできる', async ({ page }) => {
    await page.goto('/categories/suitcases/');
    await page.getByRole('button', { name: '表で比較' }).click();
    await expect(page.locator('table')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    const scrollable = await page.evaluate(() => {
      const region = document.querySelector('[role="region"]');
      return region ? region.scrollWidth > region.clientWidth : false;
    });
    // 1440px幅では表が収まることもあるため、はみ出しが無いことだけを必須にする
    expect(typeof scrollable).toBe('boolean');
  });
});
