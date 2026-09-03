/**
 * ELECOM のアダプター。定義リスト（<dt>/<dd>）から公表値を読む。
 *
 * 注記: 現行 ELECOM の 4 出典は automatedFetch: 'unverified' である。
 * アダプターは実装するが、段階0 では取得対象にならない（Global Constraints 4）。
 * 実際に使われるのは、出典の automatedFetch を 'allowed' に変える判断（人が行う）の後。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 8
 */
import { createHash } from 'node:crypto';
import { firstKnownSourceUrl } from './ace';
import {
  definitionRows,
  parseCapacityL,
  parseLabeledSizeMm,
  parseWeightG,
} from './spec-parse';
import type { ExtractionResult, ManufacturerAdapter, UrlResolution } from './types';

export const ELECOM_HOST = 'www.elecom.co.jp';
/** model は英数字とハイフンだけで 6 文字以上。それ以外は導かない。 */
const ELECOM_MODEL_RE = /^[A-Z0-9-]{6,}$/;
const SPEC_LIST_RE = /<dl class="spec">[\s\S]*?<\/dl>/;

const RECALL_TERMS = [
  'リコール',
  '回収',
  '使用中止',
  '自主回収',
  '無償交換のお知らせ',
  '販売終了のお知らせ',
] as const;

export function extractElecomSpec(html: string): ExtractionResult {
  const rows = definitionRows(html, SPEC_LIST_RE);
  if (rows === null) return { ok: false, reason: 'no-spec-table' };

  const rawWeight = rows.get('質量');
  const rawSize = rows.get('外形寸法');
  const rawCapacity = rows.get('容量');
  if (rawWeight === undefined || rawSize === undefined || rawCapacity === undefined) {
    return { ok: false, reason: 'required-field-missing' };
  }

  const weightG = parseWeightG(rawWeight);
  const outerSizeMm = parseLabeledSizeMm(rawSize);
  const capacityL = parseCapacityL(rawCapacity);
  if (weightG === null || outerSizeMm === null || capacityL === null) {
    return { ok: false, reason: 'unit-unparseable' };
  }

  return {
    ok: true,
    spec: {
      weightG,
      outerSizeMm,
      capacityL,
      // 外形寸法はハンドル・ストラップを含まない値として公表されている
      sizeBasis: 'excludes-handle-and-straps',
      measurementState: 'normal',
      specs: {},
    },
    rangeHash: elecomRangeHash(html) ?? '',
  };
}

export function elecomRangeHash(html: string): string | null {
  const list = SPEC_LIST_RE.exec(html)?.[0];
  return list === undefined ? null : createHash('sha256').update(list, 'utf8').digest('hex');
}

export const elecomAdapter: ManufacturerAdapter = {
  manufacturerId: 'elecom',
  allowedHosts: [ELECOM_HOST],
  findProductUrl(model, _variant, knownSources): UrlResolution {
    const known = firstKnownSourceUrl(knownSources, [ELECOM_HOST]);
    if (known !== null) return { ok: true, url: known, basis: 'existing-source' };
    const trimmed = model.trim();
    if (!ELECOM_MODEL_RE.test(trimmed)) return { ok: false, reason: 'model-shape-unsupported' };
    return {
      ok: true,
      url: `https://${ELECOM_HOST}/products/${trimmed}.html`,
      basis: 'deterministic-rule',
    };
  },
  extract: extractElecomSpec,
  extractedRangeHash: elecomRangeHash,
  recallTerms: RECALL_TERMS,
  requiredFields: ['weightG', 'outerSizeMm', 'capacityL'],
};
