/**
 * 記事の下書きを作る CLI（計画書 11節 Task 7）。
 *
 * - 外部APIを一切呼ばない決定的なテンプレート生成。
 * - 作られる記事の status は必ず 'draft'。このコマンドで公開状態にはしない。
 * - 未記入マーカーを残すため、そのままでは公開判定を通らない。
 * - --dry-run では一切ファイルを変更しない。
 * - 既存 slug への上書きは --force がない限り拒否する。
 *
 * 使い方:
 *   npm run create:draft -- --slug my-slug --title "記事タイトル" \
 *     --category suitcases --products d-sc-a,d-sc-b [--dataset demo] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readDatasetInput, resolveDatasetKind, DATASET_ROOT } from '../src/lib/catalog/load';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { CATEGORIES, type Category } from '../src/lib/catalog/types';

const argv = process.argv.slice(2);

function flag(name: string): string | null {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
}

function has(name: string): boolean {
  return argv.includes(`--${name}`);
}

function fail(message: string): never {
  console.error(`エラー: ${message}`);
  process.exit(2);
}

const slug = flag('slug');
const title = flag('title');
const categoryArg = flag('category');
const productsArg = flag('products');
const dryRun = has('dry-run');
const force = has('force');
const datasetArg = flag('dataset');

if (!slug || !title || !categoryArg) {
  fail(
    '必須引数が不足しています。\n' +
      '  --slug <slug> --title "タイトル" --category <suitcases|backpacks|pouches|power-banks|packing>\n' +
      '  任意: --products id1,id2  --dataset production|demo  --dry-run  --force',
  );
}
if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(slug)) {
  fail('slug は英小文字・数字・ハイフン（2〜64文字）で指定してください');
}

const validCategories = [...CATEGORIES, 'packing'];
if (!validCategories.includes(categoryArg)) {
  fail(`category は次のいずれかです: ${validCategories.join(' | ')}`);
}
const category = categoryArg as Category | 'packing';

const datasetKind =
  datasetArg === 'production' || datasetArg === 'demo' ? datasetArg : resolveDatasetKind();

// 参照商品の存在をここで確かめる（存在しないIDの下書きを作らない）。
const inspection = inspectCatalog(readDatasetInput(datasetKind), { now: new Date() });
if (!inspection.ok) {
  fail(`データセット ${datasetKind} の検証に失敗しています。先に validate:content を通してください。`);
}
const catalog = inspection.catalog;

const productIds = (productsArg ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

const knownIds = new Set(catalog.products.map((product) => product.id));
const missing = productIds.filter((id) => !knownIds.has(id));
if (missing.length > 0) fail(`存在しない商品IDです: ${missing.join(', ')}`);

const products = productIds
  .map((id) => catalog.products.find((product) => product.id === id))
  .filter((product) => product !== undefined);

// 参照商品の仕様が使っている出典を、下書きの sourceIds に入れておく。
const sourceIds = [
  ...new Set(
    products.flatMap((product) => {
      const facts = [
        product.weightG,
        product.outerSizeMm,
        product.bodySizeMm,
        product.capacityL,
        ...Object.values(product.specs),
      ];
      return facts.flatMap((fact) => (fact?.sourceId ? [fact.sourceId] : []));
    }),
  ),
];

const targetDir = path.join(DATASET_ROOT, datasetKind, 'articles');
const targetPath = path.join(targetDir, `${slug}.md`);

if (fs.existsSync(targetPath) && !force) {
  fail(`同じ slug のファイルが既に存在します: ${targetPath}（上書きするには --force）`);
}

const yamlList = (items: string[]) =>
  items.length === 0 ? ' []' : `\n${items.map((item) => `  - ${item}`).join('\n')}`;

const productSections = products
  .map(
    (product) => `### ${product.brand} ${product.model}（${product.variant}）

TODO: この商品が向いている用途を、公表仕様から言える範囲で書く。

TODO: 仕様上の制約・不明な項目を書く。使っていない体験としての評価は書かない。
`,
  )
  .join('\n');

const body = `## この記事の対象と結論

TODO: 誰向けの記事かと、「この条件なら候補になる」という結論を先に書く。

## 選定条件（母集団と除外理由）

- 母集団: TODO: どの範囲から選んだかを書く。
- 条件: TODO: どの数値・機能で絞ったかを書く。
- 除外: TODO: 条件に使う項目が不明で対象外にしたものを書く。

{{comparison}}

## 比較して分かること

TODO: 表から読み取れることを書く。順位付けは根拠のある数値だけで行う。

## 選び方と注意点

TODO: 選び方の考え方と、不明な項目・断定できないことを明記する。

${productSections === '' ? 'TODO: 取り上げる商品を追記する。\n' : `## 取り上げた商品\n\n${productSections}`}
## 出典と確認

TODO: 参照した公表情報と確認日を確認する。安全情報・航空ルールに触れる場合は公開前に目視レビューする。
`;

const frontmatter = `---
title: ${title}
description: 【未記入】この記事が答える問いを1〜2文で書く。
category: ${category}
status: draft
productIds:${yamlList(productIds)}
sourceIds:${yamlList(sourceIds)}
publishedAt: null
updatedAt: null
reviewedAt: null
reviewer: null
intentKey: ${slug}
---

`;

const content = frontmatter + body;

if (dryRun) {
  console.log(`[dry-run] 書き込みません: ${targetPath}`);
  console.log(`[dry-run] データセット: ${datasetKind} / 参照商品 ${productIds.length} 件 / 出典 ${sourceIds.length} 件`);
  console.log('----- 生成される内容 -----');
  console.log(content);
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(targetPath, content, 'utf8');

console.log(`下書きを作成しました: ${targetPath}`);
console.log(`  status: draft（このコマンドでは公開状態にしません）`);
console.log(`  参照商品: ${productIds.length} 件 / 出典: ${sourceIds.length} 件`);
console.log('  次の手順:');
console.log('    1. TODO: と【未記入】の箇所を埋める');
console.log('    2. 事実確認とレビューを行い、reviewedAt / reviewer を記入する');
console.log('    3. status を published にし、publishedAt / updatedAt を記入する');
console.log('    4. npm run validate:content を実行する');
