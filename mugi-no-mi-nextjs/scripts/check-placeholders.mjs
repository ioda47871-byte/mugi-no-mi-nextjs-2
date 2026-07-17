#!/usr/bin/env node
/**
 * check-placeholders.mjs
 * ----------------------------------------------------------------
 * lib/placeholder-content.ts と lib/products.ts を静的にスキャンし、
 * `isPlaceholder: true` が残っている項目を一覧で警告表示します。
 *
 * 使い方:
 *   npm run check:placeholders          -> 一覧を表示するだけ(ビルドは止めない)
 *   npm run check:placeholders:strict   -> 1件でも残っていれば exit code 1
 *
 * package.json の "build" スクリプトから自動実行されるため、
 * `npm run build` のたびにターミナルへ警告が出ます。
 * ----------------------------------------------------------------
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const targets = [
  path.join(rootDir, 'lib', 'placeholder-content.ts'),
  path.join(rootDir, 'lib', 'products.ts'),
];

const strict = process.argv.includes('--strict');

/**
 * ざっくりとした静的解析:
 * `isPlaceholder: true` を含むオブジェクトブロックの直前にある
 * フィールド名 (例: `founderName:`) や `id:`/`name:` を拾って一覧化する。
 * 完全なASTパースではなく正規表現ベースの簡易チェックです。
 */
function scanFile(filePath) {
  const src = readFileSync(filePath, 'utf-8');
  const lines = src.split('\n');
  const hits = [];

  lines.forEach((line, idx) => {
    if (/isPlaceholder:\s*true/.test(line)) {
      // 直近数行をさかのぼって、わかりやすい識別子を探す
      let label = null;
      for (let i = idx; i >= Math.max(0, idx - 6); i--) {
        const m = lines[i].match(/^\s*([a-zA-Z0-9_]+):\s*\{?/);
        if (m && !['value', 'isPlaceholder', 'note'].includes(m[1])) {
          label = m[1];
          break;
        }
      }
      hits.push({ line: idx + 1, label: label ?? '(unknown field)' });
    }
  });

  return hits;
}

let total = 0;
const report = [];

for (const file of targets) {
  try {
    const hits = scanFile(file);
    if (hits.length > 0) {
      report.push({ file: path.relative(rootDir, file), hits });
      total += hits.length;
    }
  } catch {
    // ファイルが無ければスキップ
  }
}

if (total === 0) {
  console.log('\n✅ 仮データ(isPlaceholder: true)は見つかりませんでした。本番差し替えは完了しています。\n');
  process.exit(0);
}

console.log('\n⚠️  以下は本番未差し替えの仮データです(isPlaceholder: true)。');
console.log('   公開前に「実店舗情報チェックリスト.md」を参照して差し替えてください。\n');

for (const { file, hits } of report) {
  console.log(`  ${file}`);
  for (const hit of hits) {
    console.log(`    - line ${hit.line}: ${hit.label}`);
  }
}

console.log(`\n  合計 ${total} 件の仮データが残っています。\n`);

if (strict) {
  console.error('❌ --strict モードのため、仮データが残っている状態ではビルドを中止します。');
  process.exit(1);
}

// 通常モードでは警告のみでビルドは継続する
process.exit(0);
