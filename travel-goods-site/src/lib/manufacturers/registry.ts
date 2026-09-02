/**
 * メーカーアダプターの登録簿と brand の正規化。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 6・7・8
 */
import { aceAdapter, protecaAdapter, worldTravelerAdapter } from './ace';
import { ankerAdapter } from './anker';
import { elecomAdapter } from './elecom';
import type { ManufacturerAdapter, ManufacturerId } from './types';

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

const ADAPTERS: Readonly<Record<ManufacturerId, ManufacturerAdapter>> = {
  ace: aceAdapter,
  proteca: protecaAdapter,
  'world-traveler': worldTravelerAdapter,
  elecom: elecomAdapter,
  anker: ankerAdapter,
};

export function adapterFor(id: ManufacturerId): ManufacturerAdapter {
  return ADAPTERS[id];
}
