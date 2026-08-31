/**
 * 購入導線の確認用データを、リポジトリのデータセットを汚さずに用意する。
 *
 * 本番データ（datasets/production）を .preview/linkcheck-dataset へ複製し、
 * 指定商品の楽天リンクだけを「照合済み」に置き換える。
 *
 * ここで使う紹介URLはテスト専用の架空値。**本番データには書き込まない。**
 * 生成先は .gitignore 済みで、SITE_MODE=production では読み込めない
 * （src/lib/catalog/load.ts の CATALOG_DATASET_DIR ガード）。
 *
 * 実行: npm run preview:linkcheck
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MerchantLink } from '../src/lib/catalog/types';

/** テスト専用の架空の紹介URL。実在しません。 */
const TEST_AFFILIATE_URL = 'https://hb.afl.rakuten.co.jp/hgc/linkcheck-fixture-not-real/';
const TARGET_PRODUCT = process.env.LINKCHECK_PRODUCT ?? 'elecom-bma-trcs01mbk-m-black';
const TARGET_VARIANT_FALLBACK = 'Mサイズ / ブラック';

const source = path.resolve(process.cwd(), 'datasets/production');
const target = path.resolve(process.cwd(), '.preview/linkcheck-dataset');

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

// 商品の variant を読んで、一致させたリンクを作る（不一致は表示されないため）
const products: { id: string; variant: string }[] = [];
const productsDir = path.join(target, 'products');
for (const file of fs.readdirSync(productsDir)) {
  if (!file.endsWith('.json')) continue;
  const entries = JSON.parse(fs.readFileSync(path.join(productsDir, file), 'utf8')) as {
    id: string;
    variant: string;
  }[];
  products.push(...entries);
}
const product = products.find((entry) => entry.id === TARGET_PRODUCT);
const variant = product?.variant ?? TARGET_VARIANT_FALLBACK;

const rakutenPath = path.join(target, 'merchants', 'rakuten.json');
const links = JSON.parse(fs.readFileSync(rakutenPath, 'utf8')) as MerchantLink[];
const today = new Date().toISOString().slice(0, 10);

const updated: MerchantLink[] = links.map((link) =>
  link.productId === TARGET_PRODUCT
    ? {
        ...link,
        affiliateUrl: TEST_AFFILIATE_URL,
        matchedVariant: variant,
        verifiedAt: today,
        status: 'verified',
        note: 'テスト専用の架空URL。本番データには使用しない。',
      }
    : link,
);
fs.writeFileSync(rakutenPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');

console.log(`購入導線の確認用データを生成しました: ${target}`);
console.log(`  対象商品   : ${TARGET_PRODUCT}（${variant}）`);
console.log(`  紹介URL    : ${TEST_AFFILIATE_URL}（テスト専用の架空値）`);
console.log('  ビルド     : CATALOG_DATASET_DIR=.preview/linkcheck-dataset CATALOG_DATASET=production \\');
console.log('               NEXT_PUBLIC_GA_ID=G-LINKCHECK npm run build:only');
