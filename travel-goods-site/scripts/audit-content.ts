/**
 * 定期点検（計画書 12-1節）。
 *
 * 外部アクセスを一切しない。日付とデータだけで「放っておくと壊れるもの」を探す。
 * 何も見つからなければ何も報告しない（＝人を呼ばない）ことを目的にする。
 *
 *   npm run audit                     現在のデータセットを点検
 *   npm run audit -- --dataset production
 *   npm run audit -- --json           機械可読（GitHub Actions用）
 *   npm run audit -- --fail-on attention   確認事項でも非ゼロ終了する
 *
 * 終了コード: 0 = 対応不要 / 1 = 要対応あり / 2 = 実行できなかった
 */
import fs from 'node:fs';
import { readDatasetInput, resolveDatasetDir, resolveDatasetKind } from '../src/lib/catalog/load';
import { inspectCatalog } from '../src/lib/catalog/validate';
import { auditCatalog, formatFinding, type AuditFinding } from '../src/lib/catalog/audit';
import { getMerchantConfig } from '../src/config/merchants';
import { candidatesPath } from '../src/lib/rakuten/candidates';
import type { DatasetKind } from '../src/lib/catalog/types';

const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : null;
};
const has = (name: string) => argv.includes(`--${name}`);

const asJson = has('json');
const failOnAttention = flag('fail-on') === 'attention';

const requested = flag('dataset');
const datasetKind: DatasetKind =
  requested === 'production' || requested === 'demo' ? requested : resolveDatasetKind();

const inspection = inspectCatalog(readDatasetInput(datasetKind), { now: new Date() });
if (!inspection.ok) {
  console.error('データセットの検証に失敗しているため点検できません。先に validate:content を実行してください。');
  process.exit(2);
}

// 候補ファイルは任意（未収集なら空）
const datasetDir = resolveDatasetDir(datasetKind);
const candidatesFile = candidatesPath(datasetDir);
const candidates = fs.existsSync(candidatesFile)
  ? (JSON.parse(fs.readFileSync(candidatesFile, 'utf8')) as {
      itemCode: string;
      itemName: string;
      status: string;
      fetchedAt: string;
    }[])
  : [];

const result = auditCatalog({
  catalog: inspection.catalog,
  merchantConfig: getMerchantConfig(),
  candidates,
  now: new Date(),
});

const actionRequired = result.findings.filter((f) => f.severity === 'action-required');
const attention = result.findings.filter((f) => f.severity === 'attention');

if (asJson) {
  console.log(
    JSON.stringify(
      {
        dataset: datasetKind,
        checkedAt: result.checkedAt,
        actionRequired: actionRequired.length,
        attention: attention.length,
        findings: result.findings,
      },
      null,
      2,
    ),
  );
} else if (result.findings.length === 0) {
  console.log(`点検（${datasetKind}）: 対応が必要な項目はありません。`);
} else {
  console.log(`\n=== 点検結果（${datasetKind} / ${result.checkedAt}）===\n`);
  const print = (title: string, items: AuditFinding[]) => {
    if (items.length === 0) return;
    console.log(`${title}（${items.length} 件）`);
    for (const finding of items) {
      console.log(`  ${formatFinding(finding)}`);
      console.log(`      → ${finding.suggestedAction}`);
    }
    console.log('');
  };
  print('■ 要対応', actionRequired);
  print('■ 確認しておきたいこと', attention);
  console.log('この点検は外部サイトへアクセスしていません。日付とデータだけで判断しています。');
}

if (actionRequired.length > 0) process.exit(1);
if (failOnAttention && attention.length > 0) process.exit(1);
process.exit(0);
