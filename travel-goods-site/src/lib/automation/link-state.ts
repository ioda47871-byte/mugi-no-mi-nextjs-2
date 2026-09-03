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

  // 観測そのものが成立しなかった日。商品の状態を何も知らないので、
  // どのカウンタも lastHealthyAt も動かさない。API 障害が何日続いても同じ。
  //
  // **確定済みの制限状態は解除しない。** 「観測できなかった」は
  // 「以前確定した異常が解消した」を意味しないので、hidden / replace /
  // manual-hold はそのまま据え置く。緩和するのは healthy だけ。
  if (signals.observationStatus === 'unavailable') {
    return { ...base, state: previous.state === 'healthy' ? 'uncertain' : previous.state };
  }

  // ここから先は「API は正常に応答した」日。
  // itemCode が見つからない日を数える。availability が null でも数える
  // （商品が消えていれば在庫情報も返らないため、null は不在の裏付けにこそなる）。
  const consecutiveFailures = signals.itemCodeAlive ? 0 : previous.consecutiveFailures + 1;

  // itemCode はあるが在庫情報だけ取れなかった日は、在庫の判断材料が無い。
  // 在庫が戻った証拠は無いので連続在庫切れ日数を 0 へ戻さず、据え置く。
  const stockUnknown = signals.itemCodeAlive && signals.availability === null;
  const consecutiveOutOfStock = stockUnknown
    ? previous.consecutiveOutOfStock
    : signals.itemCodeAlive && signals.availability === 0
      ? previous.consecutiveOutOfStock + 1
      : 0;

  const state = decideState(signals, consecutiveFailures, consecutiveOutOfStock);

  // lastHealthyAt は「在庫があると確認できた日」だけ進める。
  // 在庫切れ（availability === 0）でも 14 日目までは state が healthy のままなので、
  // state だけを見ると在庫切れの日まで健全だったことになってしまう。
  const stockConfirmed = signals.itemCodeAlive && signals.availability === 1;
  const lastHealthyAt =
    state === 'healthy' && stockConfirmed && today !== undefined ? today : previous.lastHealthyAt;

  return { ...base, consecutiveFailures, consecutiveOutOfStock, state, lastHealthyAt };
}

function decideState(
  signals: LinkSignals,
  consecutiveFailures: number,
  consecutiveOutOfStock: number,
): LinkState {
  // 消えたリンクを最優先で扱う。manual-hold や遷移先の変化で足を止めない。
  if (consecutiveFailures >= LINK_THRESHOLDS.replaceDays) return 'replace';
  if (consecutiveFailures >= LINK_THRESHOLDS.hiddenDays) return 'hidden';
  if (consecutiveOutOfStock >= LINK_THRESHOLDS.outOfStockDays) return 'hidden';

  // 紹介URLの pc 遷移先が変わった。別商品へ飛ぶ可能性があるので CTA を正常扱いしない。
  // 連続失敗日数は増やさない（商品が消えたわけではない）ため、
  // ここから hidden / replace へ自動的に進むこともない。人の確認へ回す。
  if (signals.affiliateTargetChanged) return 'manual-hold';

  // 同一商品と断定できない組み合わせは、人の確認へ回す。
  if (signals.identifierMatch === 'weak' && !signals.variantMatch) return 'manual-hold';
  if (signals.identifierMatch === 'none' || !signals.variantMatch) return 'uncertain';

  if (!signals.itemCodeAlive) return 'uncertain';

  // healthy にするのは在庫が「ある」と確認できたときだけ。
  // availability === null は在庫の判断材料が無いので healthy にしない。
  if (signals.availability === null) return 'uncertain';

  // 在庫切れ（availability === 0）の間も、しきい値に達するまでは表示を維持する。
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
  // まず状態を見る。replace に達していないリンクは、目視確認済みかどうかに関わらず
  // 何もしない。ここで human-verified を先に見ると、正常なリンクまで PR へ出てしまう。
  if (state !== 'replace') return { action: 'hold', reason: `state-not-replace:${state}` };
  // replace に達したうえで、人が目視で確認したリンクなら自動交換しない。
  if (isHumanVerifiedLink(link)) return { action: 'pr-only', reason: 'human-verified' };
  if (candidateTier === 'S') return { action: 'replace-now' };
  if (candidateTier === 'A') return { action: 'replace-after-recheck' };
  return { action: 'hold', reason: 'candidate-tier-b' };
}
