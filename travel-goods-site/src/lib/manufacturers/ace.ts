/**
 * ACE・PROTECA・World Traveler の URL 解決と仕様抽出。
 *
 * 3 ブランドは store.ace.jp を共有するが manufacturerId は分離する
 * （取得成功率の集計とリコール告知の参照先がブランドごとに異なるため）。
 * 抽出規則だけをここで共有する。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 6・7
 */
import { createHash } from 'node:crypto';
import type { Source } from '@/lib/catalog/types';
import type {
  ExtractionResult,
  ManufacturerAdapter,
  ManufacturerId,
  UrlResolution,
} from './types';

export const ACE_HOST = 'store.ace.jp';

/** model 内の 5 桁品番。例: 「クレスタ2 06936」→ 06936 */
const MODEL_NUMBER_RE = /(\d{5})/;
/** variant 先頭側の 2 桁カラーコード。例: 「35L / 01 ブラックヘアライン」→ 01 */
const COLOR_CODE_RE = /(?:^|\/\s*)(\d{2})\s/;

/**
 * 5 桁品番と 2 桁カラーコードが**両方**取れたときだけ URL を導く。
 * どちらか欠ければ推測せずに失敗を返す。
 */
export function resolveAceUrl(model: string, variant: string): UrlResolution {
  const modelNumber = MODEL_NUMBER_RE.exec(model)?.[1];
  if (modelNumber === undefined) return { ok: false, reason: 'model-shape-unsupported' };
  const colorCode = COLOR_CODE_RE.exec(variant)?.[1];
  if (colorCode === undefined) return { ok: false, reason: 'variant-code-missing' };
  return {
    ok: true,
    url: `https://${ACE_HOST}/shop/g/g${modelNumber}-${colorCode}/`,
    basis: 'deterministic-rule',
  };
}

/** 既存 Source のうち、許可ホストのものを登録順に第一候補として返す。 */
export function firstKnownSourceUrl(
  knownSources: readonly Source[],
  allowedHosts: readonly string[],
): string | null {
  for (const source of knownSources) {
    let host: string;
    try {
      host = new URL(source.url).host;
    } catch {
      continue;
    }
    if (allowedHosts.includes(host)) return source.url;
  }
  return null;
}

// ------------------------------------------------------------------ 仕様抽出

const SPEC_TABLE_RE = /<table class="spec">[\s\S]*?<\/table>/;
const ROW_RE = /<tr>\s*<th>([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/g;

const WEIGHT_KG_RE = /^([\d.]+)\s*kg$/;
const WEIGHT_G_RE = /^([\d.]+)\s*g$/;
const OUTER_SIZE_RE = /^W([\d.]+)×H([\d.]+)×D([\d.]+)\s*cm/;
const CAPACITY_RE = /^([\d.]+)\s*L$/;

/** スペック表の該当範囲だけを取り出す。ページの他の部分は見ない。 */
function specTableOf(html: string): string | null {
  return SPEC_TABLE_RE.exec(html)?.[0] ?? null;
}

function rowsOf(table: string): Map<string, string> {
  const rows = new Map<string, string>();
  for (const match of table.matchAll(ROW_RE)) {
    const label = match[1];
    const value = match[2];
    if (label === undefined || value === undefined) continue;
    rows.set(label.trim(), value.trim());
  }
  return rows;
}

/** 単位が読めなければ null。推定しない。 */
function parseWeightG(raw: string): number | null {
  const kg = WEIGHT_KG_RE.exec(raw)?.[1];
  if (kg !== undefined) return Math.round(Number(kg) * 1000);
  const g = WEIGHT_G_RE.exec(raw)?.[1];
  if (g !== undefined) return Math.round(Number(g));
  return null;
}

/** 登録順（幅・高さ・奥行）のまま返す。並べ替えない。 */
function parseOuterSizeMm(raw: string): [number, number, number] | null {
  const match = OUTER_SIZE_RE.exec(raw);
  const [, w, h, d] = match ?? [];
  if (w === undefined || h === undefined || d === undefined) return null;
  return [Math.round(Number(w) * 10), Math.round(Number(h) * 10), Math.round(Number(d) * 10)];
}

function parseCapacityL(raw: string): number | null {
  const value = CAPACITY_RE.exec(raw)?.[1];
  return value === undefined ? null : Number(value);
}

export function extractAceSpec(html: string): ExtractionResult {
  const table = specTableOf(html);
  if (table === null) return { ok: false, reason: 'no-spec-table' };

  const rows = rowsOf(table);
  const rawWeight = rows.get('本体重量');
  const rawOuterSize = rows.get('外寸');
  const rawCapacity = rows.get('容量');

  // 行そのものが無い = 必須項目の欠落
  if (rawWeight === undefined || rawOuterSize === undefined || rawCapacity === undefined) {
    return { ok: false, reason: 'required-field-missing' };
  }

  const weightG = parseWeightG(rawWeight);
  const outerSizeMm = parseOuterSizeMm(rawOuterSize);
  const capacityL = parseCapacityL(rawCapacity);

  // 行はあるが単位・表記が読めない = ページの書き方が変わった。推定しない。
  if (weightG === null || outerSizeMm === null || capacityL === null) {
    return { ok: false, reason: 'unit-unparseable' };
  }

  return {
    ok: true,
    spec: {
      weightG,
      outerSizeMm,
      capacityL,
      // 外寸はハンドル・キャスターを含む値として公表されている
      sizeBasis: 'with-handle-and-wheels',
      // 拡張機構の記載が無い前提の合成 fixture に合わせる。
      // 拡張の扱いは alternateMeasurements として別途持つ（このアダプターでは作らない）。
      measurementState: 'not-applicable',
      specs: {},
    },
    rangeHash: sha256(table),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** スペック表の範囲だけのハッシュ。表の外側が変わっても値は変わらない。 */
export function aceRangeHash(html: string): string | null {
  const table = specTableOf(html);
  return table === null ? null : sha256(table);
}

const RECALL_TERMS = [
  'リコール',
  '回収',
  '使用中止',
  '自主回収',
  '無償交換のお知らせ',
  '販売終了のお知らせ',
] as const;

function aceLikeAdapter(manufacturerId: ManufacturerId): ManufacturerAdapter {
  const allowedHosts = [ACE_HOST] as const;
  return {
    manufacturerId,
    allowedHosts,
    findProductUrl(model, variant, knownSources) {
      const known = firstKnownSourceUrl(knownSources, allowedHosts);
      if (known !== null) return { ok: true, url: known, basis: 'existing-source' };
      return resolveAceUrl(model, variant);
    },
    extract: extractAceSpec,
    extractedRangeHash: aceRangeHash,
    recallTerms: RECALL_TERMS,
    requiredFields: ['weightG', 'outerSizeMm', 'capacityL'],
  };
}

export const aceAdapter = aceLikeAdapter('ace');
export const protecaAdapter = aceLikeAdapter('proteca');
export const worldTravelerAdapter = aceLikeAdapter('world-traveler');
