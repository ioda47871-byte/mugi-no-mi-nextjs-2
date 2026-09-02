/**
 * メーカーアダプターの登録簿と brand の正規化。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 6
 */
import { ACE_HOST, firstKnownSourceUrl, resolveAceUrl } from './ace';
import type {
  ExtractionResult,
  ManufacturerAdapter,
  ManufacturerId,
  UrlResolution,
} from './types';

export {
  MANUFACTURER_IDS,
  type ExtractedSpec,
  type ExtractionFailure,
  type ExtractionResult,
  type ManufacturerAdapter,
  type ManufacturerId,
  type UrlResolution,
} from './types';

/**
 * 現行 7 種類の brand 文字列を完全一致で正規化する。
 * **部分一致で推測しない。** 表記が増えたらこの表に追記する。
 */
const BRAND_MAP: Readonly<Record<string, ManufacturerId>> = {
  'エース（ACE）': 'ace',
  'エース（ace. GENE LABEL）': 'ace',
  'エース（ace. TOKYO LABEL）': 'ace',
  'プロテカ（PROTECA）': 'proteca',
  'ワールドトラベラー（World Traveler）': 'world-traveler',
  'エレコム（ELECOM）': 'elecom',
  'アンカー・ジャパン（Anker）': 'anker',
};

export function normalizeBrand(brand: string): ManufacturerId | null {
  return BRAND_MAP[brand.trim()] ?? null;
}

/** 段階0 のスタブ。仕様抽出は Task 7・8 で実装する。 */
const stubExtract = (): ExtractionResult => ({ ok: false, reason: 'no-spec-table' });
const stubRangeHash = (): string | null => null;

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
    extract: stubExtract,
    extractedRangeHash: stubRangeHash,
    recallTerms: RECALL_TERMS,
    requiredFields: ['weightG', 'outerSizeMm', 'capacityL'],
  };
}

const ELECOM_HOST = 'www.elecom.co.jp';
/** ELECOM の model は英数字とハイフンだけで 6 文字以上。それ以外は導かない。 */
const ELECOM_MODEL_RE = /^[A-Z0-9-]{6,}$/;

const elecomAdapter: ManufacturerAdapter = {
  manufacturerId: 'elecom',
  allowedHosts: [ELECOM_HOST],
  findProductUrl(model, _variant, knownSources): UrlResolution {
    const known = firstKnownSourceUrl(knownSources, [ELECOM_HOST]);
    if (known !== null) return { ok: true, url: known, basis: 'existing-source' };
    if (!ELECOM_MODEL_RE.test(model.trim())) {
      return { ok: false, reason: 'model-shape-unsupported' };
    }
    return {
      ok: true,
      url: `https://${ELECOM_HOST}/products/${model.trim()}.html`,
      basis: 'deterministic-rule',
    };
  },
  extract: stubExtract,
  extractedRangeHash: stubRangeHash,
  recallTerms: RECALL_TERMS,
  requiredFields: ['weightG', 'outerSizeMm', 'capacityL'],
};

const ANKER_HOST = 'www.ankerjapan.com';

/**
 * Anker の商品ページ URL は model から導出できない。
 * A110DN11 → a110d、A1335011 → a1335 のように規則が一定でないため、
 * 既存 Source が無ければ**常に失敗**を返す。推測しない。
 */
const ankerAdapter: ManufacturerAdapter = {
  manufacturerId: 'anker',
  allowedHosts: [ANKER_HOST],
  findProductUrl(_model, _variant, knownSources): UrlResolution {
    const known = firstKnownSourceUrl(knownSources, [ANKER_HOST]);
    if (known !== null) return { ok: true, url: known, basis: 'existing-source' };
    return { ok: false, reason: 'model-shape-unsupported' };
  },
  extract: stubExtract,
  extractedRangeHash: stubRangeHash,
  recallTerms: RECALL_TERMS,
  requiredFields: ['weightG', 'capacityL'],
};

const ADAPTERS: Readonly<Record<ManufacturerId, ManufacturerAdapter>> = {
  ace: aceLikeAdapter('ace'),
  proteca: aceLikeAdapter('proteca'),
  'world-traveler': aceLikeAdapter('world-traveler'),
  elecom: elecomAdapter,
  anker: ankerAdapter,
};

export function adapterFor(id: ManufacturerId): ManufacturerAdapter {
  return ADAPTERS[id];
}
