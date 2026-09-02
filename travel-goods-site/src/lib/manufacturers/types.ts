/**
 * メーカーアダプターの契約。
 *
 * アダプターは「公式ページの URL を決める」「仕様表から公表値を取り出す」の 2 つだけを行う。
 * どちらも**推測しない**。決められないときは失敗を返し、呼び出し側が安全側へ倒す。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 6
 * 設計書 5.2・5.3・4.3 に対応する。
 */
import type { MeasurementState, SizeBasis, Source } from '@/lib/catalog/types';

export const MANUFACTURER_IDS = ['ace', 'proteca', 'world-traveler', 'elecom', 'anker'] as const;
export type ManufacturerId = (typeof MANUFACTURER_IDS)[number];

/** 公式ページの仕様表から取り出した値。取れなかった項目は null のままにする。 */
export type ExtractedSpec = {
  weightG: number | null;
  outerSizeMm: [number, number, number] | null;
  capacityL: number | null;
  sizeBasis: SizeBasis;
  measurementState: MeasurementState;
  specs: Record<string, string | number | boolean>;
};

export type ExtractionFailure =
  | 'no-spec-table'
  | 'unit-unparseable'
  | 'required-field-missing'
  | 'page-shape-changed';

export type ExtractionResult =
  | { ok: true; spec: ExtractedSpec; rangeHash: string }
  | { ok: false; reason: ExtractionFailure };

/**
 * `'official-search'` は将来の拡張のために型として用意するだけで、
 * 段階0 の 5 アダプターはこの basis を返さない。
 */
export type UrlResolution =
  | { ok: true; url: string; basis: 'existing-source' | 'deterministic-rule' | 'official-search' }
  | {
      ok: false;
      reason:
        | 'no-existing-source'
        | 'model-shape-unsupported'
        | 'variant-code-missing'
        | 'search-not-permitted';
    };

export type ManufacturerAdapter = {
  manufacturerId: ManufacturerId;
  allowedHosts: readonly string[];
  /** URL を推測しない。既存 Source を第一候補にし、決定的な規則が成立するときだけ導く。 */
  findProductUrl(model: string, variant: string, knownSources: readonly Source[]): UrlResolution;
  extract(html: string): ExtractionResult;
  extractedRangeHash(html: string): string | null;
  recallTerms: readonly string[];
  requiredFields: readonly ('weightG' | 'outerSizeMm' | 'capacityL')[];
};
