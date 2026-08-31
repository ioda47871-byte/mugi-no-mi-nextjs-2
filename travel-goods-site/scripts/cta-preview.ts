/**
 * 購入ボタン（CTA）の画面確認用ハーネス（追記指示 5節）。
 *
 * 目的: 紹介IDの提供前でも、ボタンの見た目・フォーカス・並びを確認する。
 *
 * 安全のための約束:
 * - 出力先は test-results/。**本番の静的出力（out/）には含めない。**
 * - ここで使う ASIN・紹介URL・tag はすべてテスト専用の架空値。
 *   本番データセットにも、この値を書き込まない。
 * - 実店舗へは接続しない。生成するのは静的HTMLだけで、リンクは押さない。
 *
 * 実行: npm run preview:cta   （事前に npm run build:only が必要）
 */
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import MerchantActions from '../src/components/MerchantActions';
import type { MerchantLinkResolution } from '../src/lib/affiliate/resolve';
import { resolveMerchantLinks } from '../src/lib/affiliate/resolve';
import type { MerchantLink, Product } from '../src/lib/catalog/types';

/** テスト専用の架空値。本番データには使用しない。 */
const TEST_ASIN = 'B0TEST0001';
const TEST_TAG = 'example-22';
const TEST_RAKUTEN_URL = 'https://hb.afl.rakuten.co.jp/hgc/test-preview-only/';

const baseProduct: Product = {
  id: 'cta-preview-product',
  category: 'pouches',
  brand: 'テスト',
  model: 'CTA-PREVIEW',
  variant: 'プレビュー用',
  status: 'published',
  summary: 'CTAの画面確認専用。実在しません。',
  weightG: { value: 100, sourceId: 'src-test', checkedAt: '2026-08-31' },
  outerSizeMm: { value: [100, 100, 100], sourceId: 'src-test', checkedAt: '2026-08-31' },
  sizeBasis: 'unspecified',
  measurementState: 'not-applicable',
  capacityL: { value: 1, sourceId: 'src-test', checkedAt: '2026-08-31' },
  alternateMeasurements: [],
  specs: {},
  caveats: [],
  image: null,
};

function link(merchant: 'amazon' | 'rakuten'): MerchantLink {
  return {
    productId: baseProduct.id,
    merchant,
    externalProductId: merchant === 'amazon' ? TEST_ASIN : 'testshop:item-0001',
    affiliateUrl: merchant === 'rakuten' ? TEST_RAKUTEN_URL : null,
    matchedVariant: baseProduct.variant,
    verifiedAt: '2026-08-31',
    status: 'verified',
  };
}

const CASES: { id: string; title: string; note: string; resolution: MerchantLinkResolution }[] = [
  {
    id: 'both',
    title: '① 両方（楽天・Amazon）',
    note: '同じ商品を両方の販売先で照合できた場合。',
    resolution: resolveMerchantLinks(baseProduct, [link('amazon'), link('rakuten')], {
      amazonAssociateTag: TEST_TAG,
      rakutenEnabled: true,
    }),
  },
  {
    id: 'rakuten-only',
    title: '② 楽天のみ',
    note: 'Amazonの紹介IDが未設定、または照合できていない場合。',
    resolution: resolveMerchantLinks(baseProduct, [link('rakuten')], {
      amazonAssociateTag: null,
      rakutenEnabled: true,
    }),
  },
  {
    id: 'amazon-only',
    title: '③ Amazonのみ',
    note: '楽天の発行済み紹介URLがまだ無い場合。',
    resolution: resolveMerchantLinks(baseProduct, [link('amazon')], {
      amazonAssociateTag: TEST_TAG,
      rakutenEnabled: true,
    }),
  },
  {
    id: 'none',
    title: '④ どちらもなし',
    note: '照合済みリンクが1件も無い場合。ボタンも運営側の事情も表示しない。',
    resolution: resolveMerchantLinks(baseProduct, [], {
      amazonAssociateTag: null,
      rakutenEnabled: true,
    }),
  },
];

/** ビルド済みのTailwind CSSを取り込み、本番と同じ見た目で確認する。 */
function readBuiltCss(): string {
  const cssDir = path.resolve(process.cwd(), 'out/_next/static/css');
  if (!fs.existsSync(cssDir)) {
    throw new Error('out/_next/static/css がありません。先に npm run build:only を実行してください。');
  }
  return fs
    .readdirSync(cssDir)
    .filter((file) => file.endsWith('.css'))
    .map((file) => fs.readFileSync(path.join(cssDir, file), 'utf8'))
    .join('\n');
}

const body = CASES.map(
  (testCase) => `
  <section class="card p-4 sm:p-5" data-case="${testCase.id}">
    <h2 class="text-sm font-bold text-ink">${testCase.title}</h2>
    <p class="mt-1 text-xs text-ink-faint">${testCase.note}</p>
    <div class="mt-3" data-cta-slot="${testCase.id}">
      ${
        renderToStaticMarkup(
          createElement(MerchantActions, {
            productId: baseProduct.id,
            resolution: testCase.resolution,
            placement: 'cta-preview',
          }),
        ) || '<p class="text-xs text-ink-faint">（描画なし）</p>'
      }
    </div>
  </section>`,
).join('\n');

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>CTA表示確認（テスト専用・本番出力に含みません）</title>
<style>${readBuiltCss()}</style>
</head>
<body class="bg-paper text-ink">
<div class="mx-auto max-w-2xl px-4 py-6">
  <header class="mb-5">
    <h1 class="text-lg font-bold text-ink">購入ボタンの表示確認</h1>
    <p class="mt-1 text-xs leading-relaxed text-ink-faint">
      テスト専用の架空データで描画しています。ASIN・紹介URL・トラッキングIDはすべてテスト用の値で、
      本番データには使用しません。このページは本番の静的出力には含まれません。
    </p>
  </header>
  <div class="space-y-4">
${body}
  </div>
</div>
</body>
</html>
`;

const outPath = path.resolve(process.cwd(), '.preview/cta/index.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, 'utf8');
console.log(`CTA表示確認ページを生成しました: ${outPath}`);
console.log('  ケース: ' + CASES.map((c) => `${c.id}(${c.resolution.links.length}ボタン)`).join(' / '));
