/**
 * 本番公開前チェック（計画書 11節 Task 1・8）。
 *
 * 「実装が動くこと」と「公開してよい状態か」を分けて判定する。
 * 未設定を成功扱いにしない。落ちた項目は理由付きで一覧する。
 *
 * 使い方:
 *   npm run check:release              … 設定とデータを確認
 *   npm run check:release -- --out out … ビルド成果物も走査する
 */
import fs from 'node:fs';
import path from 'node:path';
import { readDatasetInput, resolveDatasetKind } from '../src/lib/catalog/load';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { evaluatePublication } from '../src/lib/content/publication';
import { siteConfig, missingLaunchSettings, shouldAllowIndexing } from '../src/config/site';
import { getMerchantConfig } from '../src/config/merchants';

type Check = { name: string; ok: boolean; detail: string; blocking: boolean };

const checks: Check[] = [];
const add = (name: string, ok: boolean, detail: string, blocking = true) =>
  checks.push({ name, ok, detail, blocking });

const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
const outDir = outIndex >= 0 ? (argv[outIndex + 1] ?? 'out') : null;

// --- 0. 一時的な読み込み元の差し替えがないこと -------------------------
add(
  '読み込み元の差し替えなし',
  !process.env.CATALOG_DATASET_DIR?.trim(),
  process.env.CATALOG_DATASET_DIR?.trim()
    ? `CATALOG_DATASET_DIR=${process.env.CATALOG_DATASET_DIR} が設定されています。検証用の一時データから本番を作らないでください`
    : '設定なし（datasets/ 配下のみを読み込み）',
);

// --- 1. 公開モードとデータセット -------------------------------------
add(
  '公開モード',
  siteConfig.isProduction,
  siteConfig.isProduction
    ? 'SITE_MODE=production'
    : `SITE_MODE=${siteConfig.mode}（本番公開には production が必要）`,
);

let datasetKind: 'production' | 'demo' | null = null;
try {
  datasetKind = resolveDatasetKind();
} catch (error) {
  add('データセット解決', false, (error as Error).message);
}

if (datasetKind) {
  add(
    'データセット',
    datasetKind === 'production',
    datasetKind === 'production'
      ? '本番データセットを使用'
      : `デモデータセット(${datasetKind})を使用中。本番公開には production が必要`,
  );
}

// --- 2. 公開用の設定 -------------------------------------------------
const missing = missingLaunchSettings();
add(
  '公開情報の設定',
  missing.length === 0,
  missing.length === 0 ? 'サイト名・URL・運営者名・連絡先がすべて設定済み' : `未設定: ${missing.join(' / ')}`,
);

add(
  'インデックス許可',
  shouldAllowIndexing,
  shouldAllowIndexing ? '本番モードかつ SITE_URL 設定済み（indexable）' : 'noindex のまま（SITE_MODE と SITE_URL を確認）',
);

// --- 3. 収益化設定 ---------------------------------------------------
const merchants = getMerchantConfig();
const kind = datasetKind ?? 'production';
let verifiedAmazon = 0;
let verifiedRakuten = 0;
let publishedProducts = 0;
let publishableArticles = 0;

try {
  const inspection = inspectCatalog(readDatasetInput(kind), { now: new Date() });
  if (inspection.ok) {
    const catalog = inspection.catalog;
    publishedProducts = catalog.products.filter((p) => p.status === 'published').length;
    publishableArticles = catalog.articles.filter(
      (article) => evaluatePublication(article, catalog).ok,
    ).length;
    verifiedAmazon = catalog.merchantLinks.filter(
      (l) => l.merchant === 'amazon' && l.status === 'verified',
    ).length;
    verifiedRakuten = catalog.merchantLinks.filter(
      (l) => l.merchant === 'rakuten' && l.status === 'verified',
    ).length;
  }
  add('データ検証', inspection.ok, inspection.ok ? 'エラーなし' : 'validate:content でエラーを確認してください');
} catch (error) {
  add('データ検証', false, (error as Error).message);
}

add('公開商品', publishedProducts > 0, `公開状態の商品 ${publishedProducts} 件`);
add('公開記事', publishableArticles > 0, `公開条件を満たす記事 ${publishableArticles} 本`);

const amazonUsable = merchants.amazonAssociateTag !== null && verifiedAmazon > 0;
const rakutenUsable = verifiedRakuten > 0;
add(
  '有効なアフィリエイト設定',
  amazonUsable || rakutenUsable,
  `Amazon: 紹介ID ${merchants.amazonAssociateTag ? '設定済み' : '未設定'} / 照合済みリンク ${verifiedAmazon} 件、` +
    `楽天: 照合済み紹介URL ${verifiedRakuten} 件`,
);

add(
  '計測設定',
  siteConfig.gaMeasurementId !== null,
  siteConfig.gaMeasurementId ? '計測IDが設定済み' : '計測ID未設定（サイトは動作するが計測は行われない）',
  false,
);

// --- 4. ビルド成果物の走査 -------------------------------------------
if (outDir) {
  const root = path.resolve(process.cwd(), outDir);
  if (!fs.existsSync(root)) {
    add('ビルド成果物', false, `${root} がありません。先に npm run build を実行してください`);
  } else {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(html|js|json|txt|xml|css)$/.test(entry.name)) files.push(full);
      }
    };
    walk(root);

    // 4-1. 架空データ・サンプルID・テスト値の混入
    const forbidden: { pattern: RegExp; label: string }[] = [
      { pattern: /example\.invalid/i, label: 'テスト用ドメイン example.invalid' },
      { pattern: /デモデータ|デモ用の架空|架空メーカー/, label: 'デモデータの文言' },
      { pattern: /B0TEST\d{4}/, label: 'テスト用ASIN' },
      { pattern: /example-22/, label: 'テスト用アソシエイトタグ' },
      { pattern: /【未記入】|TODO:/, label: '下書きの未記入マーカー' },
    ];
    const hits: string[] = [];
    // 4-2. 秘密情報の流出
    const secretEnvNames = [
      'RAKUTEN_APPLICATION_ID',
      'RAKUTEN_ACCESS_KEY',
      'RAKUTEN_AFFILIATE_ID',
      'ANTHROPIC_API_KEY',
    ];
    const secretValues = secretEnvNames
      .map((name) => ({ name, value: process.env[name]?.trim() }))
      .filter((entry): entry is { name: string; value: string } => Boolean(entry.value && entry.value.length >= 8));
    const secretHits: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(root, file);
      for (const { pattern, label } of forbidden) {
        if (pattern.test(content)) hits.push(`${rel}: ${label}`);
      }
      for (const secret of secretValues) {
        if (content.includes(secret.value)) secretHits.push(`${rel}: ${secret.name} の値`);
      }
      if (/sk-ant-[A-Za-z0-9_-]{10,}/.test(content)) secretHits.push(`${rel}: APIキーらしき文字列`);
    }

    add(
      '架空データ・サンプルIDの非混入',
      hits.length === 0,
      hits.length === 0 ? `走査 ${files.length} ファイル、検出なし` : `検出: ${[...new Set(hits)].slice(0, 10).join(' / ')}`,
    );
    add(
      '秘密情報の非混入',
      secretHits.length === 0,
      secretHits.length === 0
        ? `走査 ${files.length} ファイル、検出なし`
        : `検出: ${[...new Set(secretHits)].join(' / ')}`,
    );

    // 4-3. robots / sitemap の整合
    const robotsPath = path.join(root, 'robots.txt');
    const robots = fs.existsSync(robotsPath) ? fs.readFileSync(robotsPath, 'utf8') : '';
    const robotsAllows = /Allow:\s*\//i.test(robots) && !/Disallow:\s*\/\s*$/im.test(robots);
    add(
      'robots.txt',
      robotsAllows === shouldAllowIndexing,
      `robots.txt は ${robotsAllows ? 'クロール許可' : 'クロール拒否'}、想定は ${shouldAllowIndexing ? '許可' : '拒否'}`,
    );

    const sitemapPath = path.join(root, 'sitemap.xml');
    const sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
    const urlCount = (sitemap.match(/<loc>/g) ?? []).length;
    add(
      'サイトマップ',
      shouldAllowIndexing ? urlCount > 0 : urlCount === 0,
      `サイトマップのURL数: ${urlCount}（プレビューでは 0 が正しい）`,
    );

    // 4-4. ダミーリンクの検出
    const dummyLinks: string[] = [];
    for (const file of files.filter((f) => f.endsWith('.html'))) {
      const content = fs.readFileSync(file, 'utf8');
      if (/rel="sponsored[^"]*"[^>]*href="#"/.test(content) || /href="#"[^>]*rel="sponsored/.test(content)) {
        dummyLinks.push(path.relative(root, file));
      }
    }
    add('ダミーCTAリンクの非混入', dummyLinks.length === 0, dummyLinks.length === 0 ? '検出なし' : dummyLinks.join(' / '));
  }
} else {
  add('ビルド成果物の走査', true, '--out を指定すると out/ を走査します（未実施）', false);
}

// --- 出力 -------------------------------------------------------------
console.log('\n=== 本番公開チェック ===\n');
for (const check of checks) {
  const mark = check.ok ? 'OK  ' : check.blocking ? 'NG  ' : 'WARN';
  console.log(`  [${mark}] ${check.name}: ${check.detail}`);
}

const blockers = checks.filter((check) => !check.ok && check.blocking);
console.log('');
if (blockers.length === 0) {
  console.log('本番公開の必須項目はすべて満たしています。');
  console.log('※ このチェックは設定と成果物の機械的な確認です。内容の正しさを保証するものではありません。');
  process.exit(0);
}
console.log(`本番公開はまだできません（未達 ${blockers.length} 件）:`);
for (const blocker of blockers) console.log(`  - ${blocker.name}: ${blocker.detail}`);
console.log('\n各項目の対応手順は docs/launch-checklist.md を参照してください。');
process.exit(1);
