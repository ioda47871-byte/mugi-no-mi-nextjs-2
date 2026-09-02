/**
 * Anker のアダプター。表から公表値を読む。
 *
 * モバイルバッテリーには容量(L)が存在しないため capacityL を必須にしない。
 * 商品ページ URL は model から導出できない（A110DN11 → a110d、A1335011 → a1335 と
 * 規則が一定でない）ので、既存 Source が無ければ常に失敗を返す。推測しない。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 6・8
 */
import { createHash } from 'node:crypto';
import { firstKnownSourceUrl } from './ace';
import {
  parseCapacityMah,
  parseLabeledSizeMm,
  parseWatt,
  parseWeightG,
  tableRows,
} from './spec-parse';
import type { ExtractionResult, ManufacturerAdapter, UrlResolution } from './types';

export const ANKER_HOST = 'www.ankerjapan.com';
const SPEC_TABLE_RE = /<table class="spec">[\s\S]*?<\/table>/;

const RECALL_TERMS = [
  'リコール',
  '回収',
  '使用中止',
  '自主回収',
  '無償交換のお知らせ',
  '販売終了のお知らせ',
] as const;

export function extractAnkerSpec(html: string): ExtractionResult {
  const rows = tableRows(html, SPEC_TABLE_RE);
  if (rows === null) return { ok: false, reason: 'no-spec-table' };

  const rawWeight = rows.get('重量');
  const rawSize = rows.get('サイズ');
  // capacityL は必須にしない（モバイルバッテリーには存在しない）
  if (rawWeight === undefined || rawSize === undefined) {
    return { ok: false, reason: 'required-field-missing' };
  }

  const weightG = parseWeightG(rawWeight);
  const outerSizeMm = parseLabeledSizeMm(rawSize);
  if (weightG === null || outerSizeMm === null) {
    return { ok: false, reason: 'unit-unparseable' };
  }

  // 公表されていない項目は作らない。読めた値だけを入れる。
  const specs: Record<string, string | number | boolean> = {};
  const rawCapacityMah = rows.get('容量');
  if (rawCapacityMah !== undefined) {
    const capacityMah = parseCapacityMah(rawCapacityMah);
    if (capacityMah !== null) specs.capacityMah = capacityMah;
  }
  const rawMaxOutput = rows.get('最大出力');
  if (rawMaxOutput !== undefined) {
    const maxOutputW = parseWatt(rawMaxOutput);
    if (maxOutputW !== null) specs.maxOutputW = maxOutputW;
  }

  return {
    ok: true,
    spec: {
      weightG,
      outerSizeMm,
      capacityL: null,
      sizeBasis: 'unspecified',
      measurementState: 'not-applicable',
      specs,
    },
    rangeHash: ankerRangeHash(html) ?? '',
  };
}

export function ankerRangeHash(html: string): string | null {
  const table = SPEC_TABLE_RE.exec(html)?.[0];
  return table === undefined ? null : createHash('sha256').update(table, 'utf8').digest('hex');
}

export const ankerAdapter: ManufacturerAdapter = {
  manufacturerId: 'anker',
  allowedHosts: [ANKER_HOST],
  findProductUrl(_model, _variant, knownSources): UrlResolution {
    const known = firstKnownSourceUrl(knownSources, [ANKER_HOST]);
    if (known !== null) return { ok: true, url: known, basis: 'existing-source' };
    return { ok: false, reason: 'model-shape-unsupported' };
  },
  extract: extractAnkerSpec,
  extractedRangeHash: ankerRangeHash,
  recallTerms: RECALL_TERMS,
  // capacityL はモバイルバッテリーに存在しないため必須にしない
  requiredFields: ['weightG', 'outerSizeMm'],
};
