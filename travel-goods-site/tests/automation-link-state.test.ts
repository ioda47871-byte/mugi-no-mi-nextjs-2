// tests/automation-link-state.test.ts
import { describe, expect, it } from 'vitest';
import { LINK_THRESHOLDS, decideReplacement, nextLinkState } from '../src/lib/automation/link-state';
import type { LinkHealthEntry, LinkSignals } from '../src/lib/automation/state/schema';
import { makeLinkHealthEntry, makeLinkSignals, makeMerchantLink } from './factories';

const healthy: LinkSignals = makeLinkSignals();
/** API は正常に応答し、そのうえで itemCode が見つからない。availability も取れない。 */
const gone: LinkSignals = makeLinkSignals({
  observationStatus: 'ok',
  itemCodeAlive: false,
  availability: null,
  identifierMatch: 'none',
  variantMatch: false,
});
const outOfStock: LinkSignals = makeLinkSignals({ availability: 0 });
/** API 自体が応答しない。商品が消えたのかどうかは判断できない。 */
const apiError: LinkSignals = makeLinkSignals({
  observationStatus: 'unavailable',
  itemCodeAlive: false,
  availability: null,
  identifierMatch: 'none',
  variantMatch: false,
});

/** signals を n 日連続で与えたあとの状態を返す。 */
function advance(start: LinkHealthEntry, signals: LinkSignals, days: number): LinkHealthEntry {
  let entry = start;
  for (let i = 0; i < days; i += 1) entry = nextLinkState(entry, signals);
  return entry;
}

describe('リンク状態機械', () => {
  it('しきい値は 3 日 / 7 日 / 14 日', () => {
    expect(LINK_THRESHOLDS).toEqual({ hiddenDays: 3, replaceDays: 7, outOfStockDays: 14 });
  });

  it('正常な信号で連続失敗日数が 0 に戻る', () => {
    const prev = makeLinkHealthEntry({ consecutiveFailures: 2, state: 'hidden' });
    const next = nextLinkState(prev, healthy);
    expect(next.state).toBe('healthy');
    expect(next.consecutiveFailures).toBe(0);
    expect(next.consecutiveOutOfStock).toBe(0);
  });

  it('API エラー（availability が null）では連続失敗日数を増やさない', () => {
    const prev = makeLinkHealthEntry({ consecutiveFailures: 2, state: 'uncertain' });
    const next = nextLinkState(prev, apiError);
    expect(next.state).toBe('uncertain');
    expect(next.consecutiveFailures).toBe(2);
  });

  it('API 障害が 30 日続いても hidden や replace にしない（判定材料がないため）', () => {
    const start = makeLinkHealthEntry();
    const after30 = advance(start, apiError, 30);
    expect(after30.state).toBe('uncertain');
    expect(after30.consecutiveFailures).toBe(0);
    expect(after30.consecutiveOutOfStock).toBe(0);
  });

  it('API 障害では在庫切れ日数も据え置く', () => {
    const prev = makeLinkHealthEntry({ consecutiveOutOfStock: 5, state: 'healthy' });
    const next = nextLinkState(prev, apiError);
    expect(next.consecutiveOutOfStock).toBe(5);
    expect(next.consecutiveFailures).toBe(0);
    expect(next.state).toBe('uncertain');
  });

  it('API が正常なら availability が null でも itemCode 不在を数える', () => {
    const start = makeLinkHealthEntry();
    expect(advance(start, gone, 1).consecutiveFailures).toBe(1);
    expect(advance(start, gone, 7).consecutiveFailures).toBe(7);
  });

  it('API 障害のあと正常応答で itemCode 不在なら、そこから数え始める', () => {
    const afterOutage = advance(makeLinkHealthEntry(), apiError, 10);
    expect(afterOutage.consecutiveFailures).toBe(0);
    expect(advance(afterOutage, gone, 3).state).toBe('hidden');
  });

  it('itemCode が戻れば連続失敗日数が 0 に戻る', () => {
    const after5 = advance(makeLinkHealthEntry(), gone, 5);
    expect(after5.consecutiveFailures).toBe(5);
    const recovered = nextLinkState(after5, healthy);
    expect(recovered.consecutiveFailures).toBe(0);
    expect(recovered.state).toBe('healthy');
  });

  it('itemCode 不在が 3 日続くと hidden、7 日で replace', () => {
    const start = makeLinkHealthEntry();
    expect(advance(start, gone, 2).state).not.toBe('hidden');
    expect(advance(start, gone, 3).state).toBe('hidden');
    expect(advance(start, gone, 7).state).toBe('replace');
  });

  it('在庫切れだけでは 13 日目まで表示を維持し、14 日目に hidden', () => {
    const start = makeLinkHealthEntry();
    expect(advance(start, outOfStock, 13).state).toBe('healthy');
    expect(advance(start, outOfStock, 14).state).toBe('hidden');
  });

  it('在庫が戻れば連続在庫切れ日数がリセットされる', () => {
    const after10 = advance(makeLinkHealthEntry(), outOfStock, 10);
    expect(after10.consecutiveOutOfStock).toBe(10);
    const recovered = nextLinkState(after10, healthy);
    expect(recovered.consecutiveOutOfStock).toBe(0);
    expect(recovered.state).toBe('healthy');
  });

  it('同一商品と断定できない組み合わせは manual-hold', () => {
    const next = nextLinkState(makeLinkHealthEntry(), makeLinkSignals({ identifierMatch: 'weak', variantMatch: false }));
    expect(next.state).toBe('manual-hold');
  });

  it('manual-hold は itemCode 不在より優先しない（消えたリンクは hidden へ進む）', () => {
    const weakGone = makeLinkSignals({
      itemCodeAlive: false, availability: 0, identifierMatch: 'weak', variantMatch: false,
    });
    expect(advance(makeLinkHealthEntry(), weakGone, 3).state).toBe('hidden');
  });

  it('healthy になった日は lastHealthyAt を更新できる', () => {
    const next = nextLinkState(makeLinkHealthEntry({ lastHealthyAt: null }), healthy, '2026-09-02');
    expect(next.state).toBe('healthy');
    expect(next.lastHealthyAt).toBe('2026-09-02');
  });

  it('healthy でない日は lastHealthyAt を書き換えない', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    expect(nextLinkState(prev, apiError, '2026-09-02').lastHealthyAt).toBe('2026-09-01');
    expect(nextLinkState(prev, gone, '2026-09-02').lastHealthyAt).toBe('2026-09-01');
  });

  it('紹介URLの遷移先が変わったら healthy にしない', () => {
    const changed = makeLinkSignals({ affiliateTargetChanged: true });
    const next = nextLinkState(makeLinkHealthEntry(), changed, '2026-09-02');
    expect(next.state).toBe('manual-hold');
  });

  it('遷移先が変わった日は連続失敗日数を増やさず lastHealthyAt も更新しない', () => {
    const prev = makeLinkHealthEntry({ consecutiveFailures: 0, lastHealthyAt: '2026-09-01' });
    const next = nextLinkState(prev, makeLinkSignals({ affiliateTargetChanged: true }), '2026-09-02');
    expect(next.consecutiveFailures).toBe(0);
    expect(next.lastHealthyAt).toBe('2026-09-01');
  });

  it('遷移先が変わり続けても hidden や replace へ進めない（自動交換しない）', () => {
    const changed = makeLinkSignals({ affiliateTargetChanged: true });
    const after30 = advance(makeLinkHealthEntry(), changed, 30);
    expect(after30.state).toBe('manual-hold');
    expect(after30.consecutiveFailures).toBe(0);
  });

  it('itemCode が消えていれば遷移先の変化より不在を優先する', () => {
    const goneAndChanged = makeLinkSignals({
      observationStatus: 'ok', itemCodeAlive: false, availability: null,
      identifierMatch: 'none', variantMatch: false, affiliateTargetChanged: true,
    });
    expect(advance(makeLinkHealthEntry(), goneAndChanged, 7).state).toBe('replace');
  });

  it('signals をそのまま記録する（判定と信号を混ぜない）', () => {
    const next = nextLinkState(makeLinkHealthEntry(), outOfStock);
    expect(next.signals).toEqual(outOfStock);
  });
});

describe('lastHealthyAt は在庫を確認できた日だけ更新する', () => {
  /** 在庫切れの日を n 日与える。today を進めながら渡す。 */
  function advanceWithDates(start: LinkHealthEntry, signals: LinkSignals, days: number): LinkHealthEntry {
    let entry = start;
    for (let i = 0; i < days; i += 1) {
      entry = nextLinkState(entry, signals, `2026-09-${String(i + 2).padStart(2, '0')}`);
    }
    return entry;
  }

  it('在庫切れ 1 日では更新しない（表示は維持したまま）', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    const next = nextLinkState(prev, outOfStock, '2026-09-02');
    expect(next.state).toBe('healthy');
    expect(next.lastHealthyAt).toBe('2026-09-01');
  });

  it('在庫切れが 13 日続いても lastHealthyAt は変わらない', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    const after13 = advanceWithDates(prev, outOfStock, 13);
    expect(after13.state).toBe('healthy');
    expect(after13.lastHealthyAt).toBe('2026-09-01');
  });

  it('14 日目の hidden でも更新しない', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    const after14 = advanceWithDates(prev, outOfStock, 14);
    expect(after14.state).toBe('hidden');
    expect(after14.lastHealthyAt).toBe('2026-09-01');
  });

  it('availability === 1 の日だけ today へ更新する', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    expect(nextLinkState(prev, healthy, '2026-09-02').lastHealthyAt).toBe('2026-09-02');
  });

  it('在庫が戻った日に更新される（在庫切れ 10 日のあと）', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    const after10 = advanceWithDates(prev, outOfStock, 10);
    expect(after10.lastHealthyAt).toBe('2026-09-01');
    expect(nextLinkState(after10, healthy, '2026-09-12').lastHealthyAt).toBe('2026-09-12');
  });

  it('manual-hold / hidden / replace / API 障害では更新しない', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    const changed = makeLinkSignals({ affiliateTargetChanged: true });
    expect(nextLinkState(prev, changed, '2026-09-02').lastHealthyAt).toBe('2026-09-01');
    expect(nextLinkState(prev, apiError, '2026-09-02').lastHealthyAt).toBe('2026-09-01');
    expect(advanceWithDates(prev, gone, 3).lastHealthyAt).toBe('2026-09-01');
    expect(advanceWithDates(prev, gone, 7).lastHealthyAt).toBe('2026-09-01');
  });
});

describe('itemCode はあるが在庫を取得できない日', () => {
  /** API は答えた。商品も見つかった。しかし在庫情報だけ取れなかった。 */
  const stockUnknown: LinkSignals = makeLinkSignals({
    observationStatus: 'ok',
    itemCodeAlive: true,
    availability: null,
    identifierMatch: 'strong',
    variantMatch: true,
  });

  it('healthy にしない（healthy は availability === 1 のときだけ）', () => {
    const next = nextLinkState(makeLinkHealthEntry(), stockUnknown, '2026-09-02');
    expect(next.state).toBe('uncertain');
  });

  it('itemCode の存在は確認できたので連続失敗日数は 0', () => {
    const prev = makeLinkHealthEntry({ consecutiveFailures: 2 });
    expect(nextLinkState(prev, stockUnknown).consecutiveFailures).toBe(0);
  });

  it('在庫が戻った証拠は無いので連続在庫切れ日数を 0 へ戻さない', () => {
    const after10 = advance(makeLinkHealthEntry(), outOfStock, 10);
    expect(after10.consecutiveOutOfStock).toBe(10);
    const next = nextLinkState(after10, stockUnknown);
    expect(next.consecutiveOutOfStock).toBe(10);
    expect(next.state).not.toBe('healthy');
  });

  it('lastHealthyAt を更新しない', () => {
    const prev = makeLinkHealthEntry({ lastHealthyAt: '2026-09-01' });
    expect(nextLinkState(prev, stockUnknown, '2026-09-02').lastHealthyAt).toBe('2026-09-01');
  });
});

describe('観測不能日は確定済みの制限状態を解除しない', () => {
  it('healthy だけが uncertain へ落ちる', () => {
    const prev = makeLinkHealthEntry({ state: 'healthy' });
    expect(nextLinkState(prev, apiError).state).toBe('uncertain');
  });

  it.each(['uncertain', 'hidden', 'replace', 'manual-hold'] as const)(
    '%s は API 障害で緩和されない',
    (state) => {
      const prev = makeLinkHealthEntry({ state, consecutiveFailures: 5, consecutiveOutOfStock: 3 });
      const next = nextLinkState(prev, apiError, '2026-09-02');
      expect(next.state).toBe(state);
      expect(next.consecutiveFailures).toBe(5);
      expect(next.consecutiveOutOfStock).toBe(3);
      expect(next.lastHealthyAt).toBe(prev.lastHealthyAt);
    },
  );

  it('hidden まで進んだリンクは API 障害が続いても hidden のまま', () => {
    const hidden = advance(makeLinkHealthEntry(), gone, 3);
    expect(hidden.state).toBe('hidden');
    expect(advance(hidden, apiError, 30).state).toBe('hidden');
  });

  it('replace まで進んだリンクは API 障害で交換対象から外れない', () => {
    const replace = advance(makeLinkHealthEntry(), gone, 7);
    expect(replace.state).toBe('replace');
    expect(advance(replace, apiError, 10).state).toBe('replace');
  });

  it('manual-hold は API 障害で自動復帰しない', () => {
    const held = nextLinkState(makeLinkHealthEntry(), makeLinkSignals({ affiliateTargetChanged: true }));
    expect(held.state).toBe('manual-hold');
    expect(advance(held, apiError, 5).state).toBe('manual-hold');
  });
});

describe('代替リンクへの交換', () => {
  it('目視確認済みリンクは replace でも自動交換しない', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'visual' });
    for (const tier of ['S', 'A', 'B'] as const) {
      expect(decideReplacement(link, 'replace', tier)).toEqual({ action: 'pr-only', reason: 'human-verified' });
    }
  });

  it('目視確認済みリンクでも replace 以外は hold（正常なリンクを PR へ出さない）', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'visual' });
    for (const state of ['healthy', 'uncertain', 'hidden', 'manual-hold'] as const) {
      for (const tier of ['S', 'A', 'B'] as const) {
        const decision = decideReplacement(link, state, tier);
        expect(decision.action).toBe('hold');
      }
    }
  });

  it('自動取得のリンクは候補 Tier で動作が変わる', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'identifier-match' });
    expect(decideReplacement(link, 'replace', 'S')).toEqual({ action: 'replace-now' });
    expect(decideReplacement(link, 'replace', 'A')).toEqual({ action: 'replace-after-recheck' });
    expect(decideReplacement(link, 'replace', 'B').action).toBe('hold');
  });

  it('replace 以外の状態では交換しない', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'identifier-match' });
    for (const state of ['healthy', 'uncertain', 'hidden', 'manual-hold'] as const) {
      expect(decideReplacement(link, state, 'S').action).toBe('hold');
    }
  });

  it('判定不能（uncertain）では候補が S でも交換しない', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'identifier-match' });
    const decision = decideReplacement(link, 'uncertain', 'S');
    expect(decision.action).toBe('hold');
    if (decision.action === 'hold') expect(decision.reason.length).toBeGreaterThan(0);
  });
});
