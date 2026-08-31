/**
 * データ・記事の検証 CLI（計画書 11節 Task 2）。
 *
 * 使い方:
 *   npm run validate:content            … 現在のデータセットを検証
 *   npm run validate:content:all        … production と demo の両方を検証
 *   npx tsx scripts/validate-content.ts --dataset demo
 *
 * 不整合があれば非ゼロ終了する。
 */
import { inspectCatalog, formatIssue } from '../src/lib/catalog/validate';
import { readDatasetInput, resolveDatasetKind } from '../src/lib/catalog/load';
import { evaluatePublication } from '../src/lib/content/publication';
import { resolveMerchantLinks, SUPPRESSION_MESSAGES } from '../src/lib/affiliate/resolve';
import { getMerchantConfig } from '../src/config/merchants';
import type { DatasetKind } from '../src/lib/catalog/types';

const argv = process.argv.slice(2);

function requestedDatasets(): DatasetKind[] {
  if (argv.includes('--all')) return ['production', 'demo'];
  const index = argv.indexOf('--dataset');
  if (index >= 0) {
    const value = argv[index + 1];
    if (value === 'production' || value === 'demo') return [value];
    console.error(`--dataset には production か demo を指定してください（受け取った値: ${value}）`);
    process.exit(2);
  }
  return [resolveDatasetKind()];
}

let failed = false;

for (const kind of requestedDatasets()) {
  console.log(`\n=== データセット: ${kind} ===`);
  let input;
  try {
    input = readDatasetInput(kind);
  } catch (error) {
    console.error(`  読み込み失敗: ${(error as Error).message}`);
    failed = true;
    continue;
  }

  const result = inspectCatalog(input, { now: new Date() });
  const errors = result.issues.filter((issue) => issue.severity === 'error');
  const warnings = result.issues.filter((issue) => issue.severity === 'warning');

  for (const issue of errors) console.error(`  ERROR  ${formatIssue(issue)}`);
  for (const issue of warnings) console.warn(`  WARN   ${formatIssue(issue)}`);

  if (!result.ok) {
    console.error(`  → 検証失敗（エラー ${errors.length} 件）`);
    failed = true;
    continue;
  }

  const catalog = result.catalog;
  const publishedProducts = catalog.products.filter((p) => p.status === 'published');
  const factsWithValue = catalog.products.reduce((sum, product) => {
    const facts = [
      product.weightG,
      product.outerSizeMm,
      product.bodySizeMm,
      product.capacityL,
      ...Object.values(product.specs),
    ];
    return sum + facts.filter((fact) => fact && fact.value !== null).length;
  }, 0);

  const publishable: string[] = [];
  const withheld: { slug: string; reasons: string[] }[] = [];
  for (const article of catalog.articles) {
    const verdict = evaluatePublication(article, catalog);
    if (verdict.ok) publishable.push(article.slug);
    else withheld.push({ slug: article.slug, reasons: verdict.reasons });
  }

  const verifiedLinks = catalog.merchantLinks.filter((link) => link.status === 'verified');

  console.log(`  商品          : ${catalog.products.length} 件（公開 ${publishedProducts.length} 件）`);
  console.log(`  出典           : ${catalog.sources.length} 件（編集確認済み ${catalog.sources.filter((s) => s.editorialUse === 'verified').length} 件）`);
  console.log(`  根拠付きの仕様値: ${factsWithValue} 件`);
  console.log(`  販売先リンク   : ${catalog.merchantLinks.length} 件（照合済み ${verifiedLinks.length} 件）`);
  console.log(`    - Amazon 照合済み: ${verifiedLinks.filter((l) => l.merchant === 'amazon').length} 件`);
  console.log(`    - 楽天   照合済み: ${verifiedLinks.filter((l) => l.merchant === 'rakuten').length} 件`);
  console.log(`  記事           : ${catalog.articles.length} 本（公開可 ${publishable.length} 本 / 保留 ${withheld.length} 本）`);

  if (withheld.length > 0) {
    console.log('  保留の理由:');
    for (const item of withheld) {
      for (const reason of item.reasons) console.log(`    - ${reason}`);
    }
  }
  // 購入リンクを出せない理由の内部レポート（読者向け画面には出さない情報）
  const merchantConfig = getMerchantConfig();
  const suppressionReport = publishedProducts
    .map((product) => ({
      product,
      resolution: resolveMerchantLinks(product, catalog.merchantLinks, merchantConfig),
    }))
    .filter((entry) => entry.resolution.links.length === 0);

  if (suppressionReport.length > 0) {
    console.log(`  購入リンク未表示の商品 ${suppressionReport.length} 件（理由は画面に出しません）:`);
    for (const { product, resolution } of suppressionReport) {
      const reasons = resolution.suppressed
        .map((item) => `${item.merchant}=${SUPPRESSION_MESSAGES[item.reason]}`)
        .join(' / ');
      console.log(`    - ${product.id}: ${reasons}`);
    }
  }

  if (warnings.length > 0) console.log(`  警告 ${warnings.length} 件（公開は妨げません）`);
  console.log('  → 検証OK');
}

if (failed) {
  console.error('\n検証に失敗しました。');
  process.exit(1);
}
console.log('\nすべてのデータセットの検証に成功しました。');
