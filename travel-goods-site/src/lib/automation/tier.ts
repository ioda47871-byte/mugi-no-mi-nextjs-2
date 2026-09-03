/**
 * 商品の S/A/B 判定。fail-closed。
 *
 * 判定不能を false や成功として扱わない。取得できなかった・確認できなかった状態は
 * すべて型の上に持ち、1 つでもブロッカーが立てば B にする（保留側が常に勝つ）。
 *
 * Workers AI の所見はこの判定に一切入らない（設計書 1.3）。
 * 段階0 は取得未承認（officialFetchStatus: 'failed'）とリコール未確認
 * （recallStatus: 'unavailable'）により、すべての商品が B になる。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 9
 * 設計書 5.5 に対応する。
 */
import type { ExtractionResult, ManufacturerId } from '@/lib/manufacturers/types';

export type Tier = 'S' | 'A' | 'B';

/** 公式ページの取得結果。boolean にしない。取得できなかった理由を区別する。 */
export type OfficialFetchStatus = 'ok' | 'robots-denied' | 'http-blocked' | 'failed';

/** リコール確認。`unavailable`（確認できなかった）を必ず持つ。 */
export type RecallStatus = 'clear' | 'hit' | 'unavailable';

/** JAN の公表状態と一致状態を 1 つの型で表す。 */
export type JanState = 'published-and-matched' | 'published-but-mismatched' | 'not-published';

/** 型番の一致状態。 */
export type ModelMatchState = 'exact' | 'partial' | 'ambiguous' | 'absent';

/** variant の照合状態。`unknown` と `conflicting` を区別する。 */
export type VariantState = 'matched' | 'unknown' | 'conflicting';

/** 初期選択の根拠。6a と 6b は同格（設計書 10.5）。 */
export type InitialSelectionState = '6a-observed' | '6b-inferred' | 'none';

/** 紹介URLの状態。 */
export type AffiliateUrlState = 'valid-item-page' | 'missing' | 'invalid-host';

/** 重複の状態。 */
export type DuplicateState = 'unique' | 'duplicate';

/** 除外語（中古・訳あり・並行輸入・まとめ買い）の状態。 */
export type ExcludedTermState = 'clean' | 'hit';

/** 公式仕様と販売ページの整合。`unknown` を必ず持つ。 */
export type OfficialConsistencyState = 'consistent' | 'inconsistent' | 'unknown';

/** 24 時間後の再確認。 */
export type RecheckState = 'matched-previous-day' | 'not-yet' | 'mismatched';

/** 全フィールド必須。省略可能なフィールドを作らない（未設定を既定値で埋めない）。 */
export type TierInput = {
  manufacturerId: ManufacturerId | null;
  officialFetchStatus: OfficialFetchStatus;
  extraction: ExtractionResult;
  recallStatus: RecallStatus;
  jan: JanState;
  model: ModelMatchState;
  variant: VariantState;
  initialSelection: InitialSelectionState;
  affiliateUrl: AffiliateUrlState;
  duplicate: DuplicateState;
  excludedTerm: ExcludedTermState;
  officialConsistency: OfficialConsistencyState;
  recheck: RecheckState;
};

export type BlockerCode =
  | 'manufacturer-unknown'
  | 'official-robots-denied'
  | 'official-http-blocked'
  | 'official-fetch-failed'
  | 'official-extract-failed'
  | 'recall-hit'
  | 'recall-unavailable'
  | 'excluded-term'
  | 'variant-unknown'
  | 'variant-conflicting'
  | 'duplicate'
  | 'affiliate-url-missing'
  | 'affiliate-url-invalid-host'
  | 'initial-selection-unknown'
  | 'model-ambiguous'
  | 'model-absent'
  | 'official-inconsistent';

export const BLOCKER_CODES: readonly BlockerCode[] = [
  'manufacturer-unknown',
  'official-robots-denied',
  'official-http-blocked',
  'official-fetch-failed',
  'official-extract-failed',
  'recall-hit',
  'recall-unavailable',
  'excluded-term',
  'variant-unknown',
  'variant-conflicting',
  'duplicate',
  'affiliate-url-missing',
  'affiliate-url-invalid-host',
  'initial-selection-unknown',
  'model-ambiguous',
  'model-absent',
  'official-inconsistent',
];

export type TierVerdict = { tier: Tier; blockers: BlockerCode[]; satisfied: string[] };

/** 17 ブロッカーの成立条件。BLOCKER_CODES と 1 対 1 に対応させる。 */
const BLOCKER_RULES: readonly { code: BlockerCode; holds: (input: TierInput) => boolean }[] = [
  { code: 'manufacturer-unknown', holds: (i) => i.manufacturerId === null },
  { code: 'official-robots-denied', holds: (i) => i.officialFetchStatus === 'robots-denied' },
  { code: 'official-http-blocked', holds: (i) => i.officialFetchStatus === 'http-blocked' },
  { code: 'official-fetch-failed', holds: (i) => i.officialFetchStatus === 'failed' },
  { code: 'official-extract-failed', holds: (i) => !i.extraction.ok },
  { code: 'recall-hit', holds: (i) => i.recallStatus === 'hit' },
  { code: 'recall-unavailable', holds: (i) => i.recallStatus === 'unavailable' },
  { code: 'excluded-term', holds: (i) => i.excludedTerm === 'hit' },
  { code: 'variant-unknown', holds: (i) => i.variant === 'unknown' },
  { code: 'variant-conflicting', holds: (i) => i.variant === 'conflicting' },
  { code: 'duplicate', holds: (i) => i.duplicate === 'duplicate' },
  { code: 'affiliate-url-missing', holds: (i) => i.affiliateUrl === 'missing' },
  { code: 'affiliate-url-invalid-host', holds: (i) => i.affiliateUrl === 'invalid-host' },
  { code: 'initial-selection-unknown', holds: (i) => i.initialSelection === 'none' },
  { code: 'model-ambiguous', holds: (i) => i.model === 'ambiguous' },
  { code: 'model-absent', holds: (i) => i.model === 'absent' },
  { code: 'official-inconsistent', holds: (i) => i.officialConsistency === 'inconsistent' },
];

/** S の 9 条件（設計書 5.5）。1 つでも欠ければ S にしない。 */
const S_CONDITIONS: readonly { name: string; holds: (input: TierInput) => boolean }[] = [
  { name: 's1-manufacturer-known', holds: (i) => i.manufacturerId !== null },
  { name: 's2-official-fetched', holds: (i) => i.officialFetchStatus === 'ok' },
  { name: 's3-spec-extracted', holds: (i) => i.extraction.ok },
  {
    name: 's4-model-and-jan-matched',
    holds: (i) => i.model === 'exact' && i.jan === 'published-and-matched',
  },
  { name: 's5-variant-matched', holds: (i) => i.variant === 'matched' },
  { name: 's6-initial-selection-known', holds: (i) => i.initialSelection !== 'none' },
  { name: 's7-affiliate-url-valid', holds: (i) => i.affiliateUrl === 'valid-item-page' },
  { name: 's8-recall-clear', holds: (i) => i.recallStatus === 'clear' },
  { name: 's9-unique', holds: (i) => i.duplicate === 'unique' },
];

/** A の 8 条件（設計書 5.5）。JAN 未公表のときだけ通る経路。 */
const A_CONDITIONS: readonly { name: string; holds: (input: TierInput) => boolean }[] = [
  { name: 'a1-manufacturer-known', holds: (i) => i.manufacturerId !== null },
  { name: 'a2-official-fetched', holds: (i) => i.officialFetchStatus === 'ok' },
  { name: 'a3-spec-extracted', holds: (i) => i.extraction.ok },
  { name: 'a4-jan-not-published', holds: (i) => i.jan === 'not-published' },
  { name: 'a5-model-exact', holds: (i) => i.model === 'exact' },
  { name: 'a6-variant-matched', holds: (i) => i.variant === 'matched' },
  {
    name: 'a7-selection-url-recall-unique',
    holds: (i) =>
      i.initialSelection !== 'none' &&
      i.affiliateUrl === 'valid-item-page' &&
      i.recallStatus === 'clear' &&
      i.duplicate === 'unique',
  },
  {
    name: 'a8-consistent-and-rechecked',
    holds: (i) => i.officialConsistency === 'consistent' && i.recheck === 'matched-previous-day',
  },
];

export function decideTier(input: TierInput): TierVerdict {
  // ブロッカーは早期 return せず全部評価する。
  // 立った理由がすべて残り、Issue と観測レポートで内訳を数えられる。
  const blockers = BLOCKER_RULES.filter((rule) => rule.holds(input)).map((rule) => rule.code);
  if (blockers.length > 0) return { tier: 'B', blockers, satisfied: [] };

  const satisfiedS = S_CONDITIONS.filter((c) => c.holds(input)).map((c) => c.name);
  if (satisfiedS.length === S_CONDITIONS.length) {
    return { tier: 'S', blockers: [], satisfied: satisfiedS };
  }

  const satisfiedA = A_CONDITIONS.filter((c) => c.holds(input)).map((c) => c.name);
  if (satisfiedA.length === A_CONDITIONS.length) {
    return { tier: 'A', blockers: [], satisfied: satisfiedA };
  }

  // ブロッカーが無くても S でも A でもなければ B。
  return { tier: 'B', blockers: [], satisfied: satisfiedS.length >= satisfiedA.length ? satisfiedS : satisfiedA };
}
