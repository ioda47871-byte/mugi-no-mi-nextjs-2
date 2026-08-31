/**
 * 販売先リンクを登録・有効化する CLI。
 *
 * 紹介URLを受け取ったときに、手作業で JSON を編集せずに済ませるためのもの。
 * 形式・ホスト・バリエーション一致を機械的に確認し、条件を満たすときだけ
 * status を verified にする。
 *
 * 例（楽天の紹介URLを受け取ったとき）:
 *   npm run link:set -- --product elecom-bma-trcs01mbk-m-black \
 *     --merchant rakuten --url "https://hb.afl.rakuten.co.jp/..." --verify
 *
 * 例（Amazon の ASIN を照合できたとき）:
 *   npm run link:set -- --product <id> --merchant amazon --asin B0XXXXXXXX --verify
 *
 * --verify を付けない場合は unverified のまま登録する（画面には出ない）。
 * --dry-run はファイルを変更しない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { readDatasetInput, resolveDatasetDir, resolveDatasetKind } from '../src/lib/catalog/load';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { isRakutenAffiliateUrl, RAKUTEN_AFFILIATE_HOSTS } from '../src/lib/affiliate/rakuten';
import { isValidAsin } from '../src/lib/affiliate/amazon';
import type { MerchantLink, MerchantName } from '../src/lib/catalog/types';

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
};
const has = (name: string) => argv.includes(`--${name}`);
// アロー関数だと never による絞り込みが効かないため関数宣言にする。
function fail(message: string): never {
  console.error(`エラー: ${message}`);
  process.exit(2);
}

const productId = flag('product');
const merchantArg = flag('merchant');
const url = flag('url');
const asin = flag('asin');
const externalId = flag('external-id');
const verify = has('verify');
const dryRun = has('dry-run');
const note = flag('note');
const today = new Date().toISOString().slice(0, 10);

if (!productId || (merchantArg !== 'rakuten' && merchantArg !== 'amazon')) {
  fail(
    '必須引数が不足しています。\n' +
      '  --product <商品ID> --merchant <rakuten|amazon>\n' +
      '  楽天: --url "<発行済み紹介URL>" [--external-id shop:item]\n' +
      '  Amazon: --asin <ASIN10桁>\n' +
      '  任意: --verify  --note "..."  --dry-run',
  );
}
const merchant = merchantArg as MerchantName;

const datasetKind = resolveDatasetKind();
if (datasetKind !== 'production') {
  fail(`本番データセット以外では実行しません（現在: ${datasetKind}）。CATALOG_DATASET=production を指定してください。`);
}

const inspection = inspectCatalog(readDatasetInput(datasetKind), { now: new Date() });
if (!inspection.ok) fail('データセットの検証に失敗しています。先に validate:content を通してください。');
const catalog = inspection.catalog;

const product = catalog.products.find((entry) => entry.id === productId);
if (!product) fail(`商品IDが見つかりません: ${productId}`);

// --- 店舗ごとの形式チェック -------------------------------------------
let affiliateUrl: string | null = null;
let external: string | null = externalId;

if (merchant === 'rakuten') {
  if (!url) fail('楽天には --url（管理画面で発行した紹介URL）が必要です。');
  const rakutenUrl: string = url;
  if (!isRakutenAffiliateUrl(rakutenUrl)) {
    fail(
      `紹介URLとして認められない形式です: ${rakutenUrl}\n` +
        `  許可ホスト: ${RAKUTEN_AFFILIATE_HOSTS.join(', ')}\n` +
        '  item.rakuten.co.jp などの通常の商品URLは紹介URLではありません。\n' +
        '  管理画面で発行したリンクのホストがこの一覧に無い場合は、\n' +
        '  src/lib/affiliate/rakuten.ts の許可リストに根拠つきで追記してください。',
    );
  }
  affiliateUrl = rakutenUrl;
  external =
    external ?? (new URL(rakutenUrl).pathname.replace(/^\/+|\/+$/g, '') || 'rakuten-affiliate-link');
  // 到達時点で必ず値がある
} else {
  if (!asin) fail('Amazon には --asin（10桁）が必要です。');
  const amazonAsin: string = asin;
  if (!isValidAsin(amazonAsin)) fail(`ASIN の形式が不正です: ${amazonAsin}`);
  external = amazonAsin;
}

const filePath = path.join(resolveDatasetDir(datasetKind), 'merchants', `${merchant}.json`);
const existing: MerchantLink[] = fs.existsSync(filePath)
  ? (JSON.parse(fs.readFileSync(filePath, 'utf8')) as MerchantLink[])
  : [];

const entry: MerchantLink = {
  productId: product.id,
  merchant,
  externalProductId: external as string,
  affiliateUrl,
  // バリエーション一致は表示条件。商品側の値をそのまま使う。
  matchedVariant: product.variant,
  verifiedAt: verify ? today : null,
  status: verify ? 'verified' : 'unverified',
  ...(note ? { note } : {}),
};

const index = existing.findIndex((item) => item.productId === product.id && item.merchant === merchant);
const updated = index >= 0 ? existing.map((item, i) => (i === index ? entry : item)) : [...existing, entry];

// 書き込む前に、更新後のカタログ全体が検証を通ることを確かめる。
const rewritten = inspectCatalog(
  {
    ...readDatasetInput(datasetKind),
    merchantLinks: [
      ...catalog.merchantLinks.filter(
        (item) => !(item.productId === product.id && item.merchant === merchant),
      ),
      entry,
    ],
  },
  { now: new Date() },
);
if (!rewritten.ok) {
  console.error('この内容ではカタログ検証に通りません:');
  for (const issue of rewritten.issues.filter((i) => i.severity === 'error')) {
    console.error(`  - [${issue.code}] ${issue.subject}: ${issue.message}`);
  }
  process.exit(1);
}

console.log(`商品      : ${product.brand} ${product.model}（${product.variant}）`);
console.log(`店舗      : ${merchant}`);
console.log(`識別子    : ${entry.externalProductId}`);
if (affiliateUrl) console.log(`紹介URL   : ${affiliateUrl}`);
console.log(`状態      : ${entry.status}${verify ? `（照合日 ${today}）` : '（画面には表示されません）'}`);

if (dryRun) {
  console.log('\n[dry-run] ファイルは変更していません。');
  process.exit(0);
}

fs.mkdirSync(path.dirname(filePath), { recursive: true });
fs.writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
console.log(`\n更新しました: ${filePath}`);
console.log('次の手順:');
console.log('  1. npm run validate:content -- --dataset production');
console.log('  2. CATALOG_DATASET=production npm run build:only');
console.log('  3. npm run test:e2e:production');
if (verify) {
  console.log('  4. リンク先を目視で開き、商品・サイズ・色が一致することを確認する（購入はしない）');
}
