// tests/automation-link-state.test.ts
import { describe, expect, it } from 'vitest';
import { LINK_THRESHOLDS, decideReplacement, nextLinkState } from '../src/lib/automation/link-state';
import type { LinkHealthEntry, LinkSignals } from '../src/lib/automation/state/schema';
import { makeLinkHealthEntry, makeLinkSignals, makeMerchantLink } from './factories';

const healthy: LinkSignals = makeLinkSignals();
const gone: LinkSignals = makeLinkSignals({ itemCodeAlive: false, availability: 0, identifierMatch: 'none', variantMatch: false });
const outOfStock: LinkSignals = makeLinkSignals({ availability: 0 });
const apiError: LinkSignals = makeLinkSignals({ itemCodeAlive: false, availability: null, identifierMatch: 'none', variantMatch: false });

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

  it('API エラーが何日続いても hidden や replace にしない（判定材料がないため）', () => {
    const start = makeLinkHealthEntry();
    expect(advance(start, apiError, 30).state).toBe('uncertain');
    expect(advance(start, apiError, 30).consecutiveFailures).toBe(0);
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

  it('signals をそのまま記録する（判定と信号を混ぜない）', () => {
    const next = nextLinkState(makeLinkHealthEntry(), outOfStock);
    expect(next.signals).toEqual(outOfStock);
  });
});

describe('代替リンクへの交換', () => {
  it('目視確認済みリンクは replace でも自動交換しない', () => {
    const link = makeMerchantLink({ status: 'verified', verificationMethod: 'visual' });
    for (const tier of ['S', 'A', 'B'] as const) {
      expect(decideReplacement(link, 'replace', tier)).toEqual({ action: 'pr-only', reason: 'human-verified' });
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
