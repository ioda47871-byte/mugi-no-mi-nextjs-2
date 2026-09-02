/**
 * 販売先リンクの健全性を表す状態機械と、代替リンクへの交換判定。
 *
 * 信号（itemCode の生存・在庫・識別子一致・variant 一致）を別々に扱い、
 * **判定材料が無い日（API エラー）を「壊れた日」として数えない。**
 * 外部障害でリンクが自動的に消えていくことを防ぐ。
 *
 * 人が目視で確認したリンクは、状態が replace に達しても自動交換しない。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 10
 * 設計書 8.3・8.4 に対応する。
 */
import type { MerchantLink } from '@/lib/catalog/types';
import { isHumanVerifiedLink } from '@/lib/rakuten/match';
import type { LinkHealthEntry, LinkSignals, LinkState } from './state/schema';
import type { Tier } from './tier';

export type { LinkState } from './state/schema';

export const LINK_THRESHOLDS = {
  /** itemCode 不在がこの日数続いたら非表示にする。 */
  hiddenDays: 3,
  /** itemCode 不在がこの日数続いたら代替リンクを探す。 */
  replaceDays: 7,
  /** 在庫切れだけがこの日数続いたら非表示にする。 */
  outOfStockDays: 14,
} as const;

export type ReplacementDecision =
  | { action: 'replace-now' }
  | { action: 'replace-after-recheck' }
  | { action: 'pr-only'; reason: 'human-verified' }
  | { action: 'hold'; reason: string };

/**
 * 1 日分の信号を受けて次の状態を返す純関数。
 *
 * `availability === null` は「取得できなかった」であり「在庫なし」ではない。
 * この日は連続日数を一切増やさず `uncertain` に留める。
 */
export function nextLinkState(
  previous: LinkHealthEntry,
  signals: LinkSignals,
  today?: string,
): LinkHealthEntry {
  const base = { ...previous, signals };

  // 判定材料が無い日。連続日数を増やさず、状態も進めない。
  if (signals.availability === null) {
    return { ...base, state: 'uncertain' };
  }

  // itemCode が消えている日を数える。在庫切れとは別に数える。
  const consecutiveFailures = signals.itemCodeAlive ? 0 : previous.consecutiveFailures + 1;
  const consecutiveOutOfStock =
    signals.itemCodeAlive && signals.availability === 0 ? previous.consecutiveOutOfStock + 1 : 0;

  const state = decideState(signals, consecutiveFailures, consecutiveOutOfStock);
  const lastHealthyAt =
    state === 'healthy' && today !== undefined ? today : previous.lastHealthyAt;

  return { ...base, consecutiveFailures, consecutiveOutOfStock, state, lastHealthyAt };
}

function decideState(
  signals: LinkSignals,
  consecutiveFailures: number,
  consecutiveOutOfStock: number,
): LinkState {
  // 消えたリンクを最優先で扱う。manual-hold で足を止めない。
  if (consecutiveFailures >= LINK_THRESHOLDS.replaceDays) return 'replace';
  if (consecutiveFailures >= LINK_THRESHOLDS.hiddenDays) return 'hidden';
  if (consecutiveOutOfStock >= LINK_THRESHOLDS.outOfStockDays) return 'hidden';

  // 同一商品と断定できない組み合わせは、人の確認へ回す。
  if (signals.identifierMatch === 'weak' && !signals.variantMatch) return 'manual-hold';
  if (signals.identifierMatch === 'none' || !signals.variantMatch) return 'uncertain';

  if (!signals.itemCodeAlive) return 'uncertain';
  // 在庫切れの間も、しきい値に達するまでは表示を維持する。
  return 'healthy';
}

/**
 * 代替リンクへ交換してよいかを決める。
 *
 * 人が目視で確認したリンクは、状態が replace でも**自動交換しない**。
 * PR に候補を載せるだけにして、差し替えの判断を人に残す。
 */
export function decideReplacement(
  link: MerchantLink,
  state: LinkState,
  candidateTier: Tier,
): ReplacementDecision {
  if (isHumanVerifiedLink(link)) return { action: 'pr-only', reason: 'human-verified' };
  if (state !== 'replace') return { action: 'hold', reason: `state-not-replace:${state}` };
  if (candidateTier === 'S') return { action: 'replace-now' };
  if (candidateTier === 'A') return { action: 'replace-after-recheck' };
  return { action: 'hold', reason: 'candidate-tier-b' };
}
