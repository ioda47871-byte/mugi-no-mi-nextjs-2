/**
 * 目視確認の待ち行列を出す CLI（読み取りのみ）。
 *
 *   CATALOG_DATASET=production npm run link:pending
 *
 * unverified の販売先リンクを、確認用の商品ページURLつきで一覧にする。
 * URLは **紹介URLの pc パラメータから取り出す**。externalProductId の
 * 数字（店舗内の管理番号）をURLに入れると別ページか404になるため使わない。
 *
 * **紹介URL本体は出力しない。** アフィリエイトIDが含まれる。
 */
import { readDatasetInput, resolveDatasetKind } from '../src/lib/catalog/load';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { itemPageUrlFromAffiliateUrl } from '../src/lib/affiliate/rakuten';

const datasetKind = resolveDatasetKind();
const inspection = inspectCatalog(readDatasetInput(datasetKind), { now: new Date() });
if (!inspection.ok) {
  console.error('データセットの検証に失敗しています。先に validate:content を通してください。');
  process.exit(1);
}
const catalog = inspection.catalog;
const products = new Map(catalog.products.map((product) => [product.id, product]));

const pending = catalog.merchantLinks.filter((link) => link.status === 'unverified');
console.log(`確認待ちの販売先リンク: ${pending.length} 件（データセット: ${datasetKind}）\n`);

for (const link of pending) {
  const product = products.get(link.productId);
  const label = product ? `${product.brand} ${product.model}（${product.variant}）` : link.productId;
  const itemPage = link.affiliateUrl ? itemPageUrlFromAffiliateUrl(link.affiliateUrl) : null;
  console.log(`- ${label}`);
  console.log(`  商品ID  : ${link.productId}`);
  console.log(`  店舗    : ${link.externalProductId}`);
  console.log(`  確認用URL: ${itemPage ?? '取り出せませんでした（紹介URL未登録か短縮URL）'}`);
}

if (pending.length > 0) {
  console.log('\n確認したら、1件ずつ次で承認します（--url は省略可。保存済みの紹介URLを使います）:');
  console.log('  CATALOG_DATASET=production npm run link:set -- \\');
  console.log('    --product <商品ID> --merchant rakuten --verify --visual-check --note "..."');
}
