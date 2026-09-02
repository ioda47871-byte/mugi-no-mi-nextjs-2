// tests/automation-tier.test.ts
import { describe, expect, it } from 'vitest';
import {
  BLOCKER_CODES,
  decideTier,
  type BlockerCode,
  type TierInput,
} from '../src/lib/automation/tier';
import { makeTierInput } from './factories';

/** S を満たす入力に、ブロッカーを 1 つだけ立てる差分。 */
const BLOCKER_CASES: readonly { code: BlockerCode; patch: Partial<TierInput> }[] = [
  { code: 'manufacturer-unknown', patch: { manufacturerId: null } },
  { code: 'official-robots-denied', patch: { officialFetchStatus: 'robots-denied' } },
  { code: 'official-http-blocked', patch: { officialFetchStatus: 'http-blocked' } },
  { code: 'official-fetch-failed', patch: { officialFetchStatus: 'failed' } },
  { code: 'official-extract-failed', patch: { extraction: { ok: false, reason: 'no-spec-table' } } },
  { code: 'recall-hit', patch: { recallStatus: 'hit' } },
  { code: 'recall-unavailable', patch: { recallStatus: 'unavailable' } },
  { code: 'excluded-term', patch: { excludedTerm: 'hit' } },
  { code: 'variant-unknown', patch: { variant: 'unknown' } },
  { code: 'variant-conflicting', patch: { variant: 'conflicting' } },
  { code: 'duplicate', patch: { duplicate: 'duplicate' } },
  { code: 'affiliate-url-missing', patch: { affiliateUrl: 'missing' } },
  { code: 'affiliate-url-invalid-host', patch: { affiliateUrl: 'invalid-host' } },
  { code: 'initial-selection-unknown', patch: { initialSelection: 'none' } },
  { code: 'model-ambiguous', patch: { model: 'ambiguous' } },
  { code: 'model-absent', patch: { model: 'absent' } },
  { code: 'official-inconsistent', patch: { officialConsistency: 'inconsistent' } },
];

/** A を満たす入力（JAN 未公表・型番完全一致・整合・再確認済み）。 */
const aInput = (): TierInput =>
  makeTierInput({ jan: 'not-published', officialConsistency: 'consistent', recheck: 'matched-previous-day' });

describe('S/A/B 判定', () => {
  it('ブロッカーは 17 種で、テーブルが全種を網羅している', () => {
    expect(BLOCKER_CODES).toHaveLength(17);
    expect(BLOCKER_CASES.map((c) => c.code).sort()).toEqual([...BLOCKER_CODES].sort());
  });

  it('既定の入力は S', () => {
    const verdict = decideTier(makeTierInput());
    expect(verdict.blockers).toEqual([]);
    expect(verdict.tier).toBe('S');
  });

  it('A の条件を満たす入力は A', () => {
    expect(decideTier(aInput()).tier).toBe('A');
  });

  it.each(BLOCKER_CASES)('S の入力に $code を加えると B になる', ({ code, patch }) => {
    const verdict = decideTier({ ...makeTierInput(), ...patch });
    expect(verdict.tier).toBe('B');
    expect(verdict.blockers).toContain(code);
  });

  it.each(BLOCKER_CASES)('A の入力に $code を加えても B になる', ({ code, patch }) => {
    const verdict = decideTier({ ...aInput(), ...patch });
    expect(verdict.tier).toBe('B');
    expect(verdict.blockers).toContain(code);
  });

  it('6b（推定）でも S になりうる', () => {
    expect(decideTier(makeTierInput({ initialSelection: '6b-inferred' })).tier).toBe('S');
  });

  it('6a（実観測）でも S になりうる', () => {
    expect(decideTier(makeTierInput({ initialSelection: '6a-observed' })).tier).toBe('S');
  });

  it('JAN が公表されているのに一致しないものは S にも A にもしない', () => {
    expect(decideTier(makeTierInput({ jan: 'published-but-mismatched' })).tier).toBe('B');
  });

  it('再確認が済んでいない A 候補は B のまま', () => {
    expect(decideTier({ ...aInput(), recheck: 'not-yet' }).tier).toBe('B');
    expect(decideTier({ ...aInput(), recheck: 'mismatched' }).tier).toBe('B');
  });

  it('公式との整合が確認できない A 候補は B のまま', () => {
    expect(decideTier({ ...aInput(), officialConsistency: 'unknown' }).tier).toBe('B');
  });

  it('型番が部分一致どまりなら S にならない', () => {
    expect(decideTier(makeTierInput({ model: 'partial' })).tier).toBe('B');
  });

  it('ブロッカーが 1 つも無くても、S でも A でもなければ B', () => {
    // JAN 未公表かつ再確認前。ブロッカーは立たないが A の条件を満たさない。
    const verdict = decideTier(makeTierInput({ jan: 'not-published', recheck: 'not-yet' }));
    expect(verdict.blockers).toEqual([]);
    expect(verdict.tier).toBe('B');
  });

  it('ブロッカーは早期 return せず、立った理由をすべて残す', () => {
    const verdict = decideTier(makeTierInput({
      manufacturerId: null,
      recallStatus: 'unavailable',
      excludedTerm: 'hit',
      duplicate: 'duplicate',
    }));
    expect(verdict.tier).toBe('B');
    expect(verdict.blockers).toEqual(expect.arrayContaining([
      'manufacturer-unknown', 'recall-unavailable', 'excluded-term', 'duplicate',
    ]));
    expect(verdict.blockers.length).toBe(4);
  });

  it('段階0 の既定（取得未承認・リコール未確認）では必ず B', () => {
    const verdict = decideTier(makeTierInput({
      officialFetchStatus: 'failed',
      recallStatus: 'unavailable',
    }));
    expect(verdict.tier).toBe('B');
    expect(verdict.blockers).toEqual(expect.arrayContaining([
      'official-fetch-failed', 'recall-unavailable',
    ]));
  });

  it('S の 9 条件を 1 つずつ崩すと S にならない', () => {
    const breaks: Partial<TierInput>[] = [
      { manufacturerId: null },
      { officialFetchStatus: 'failed' },
      { extraction: { ok: false, reason: 'unit-unparseable' } },
      { model: 'partial' },
      { jan: 'not-published', recheck: 'not-yet' },
      { variant: 'unknown' },
      { initialSelection: 'none' },
      { affiliateUrl: 'missing' },
      { recallStatus: 'unavailable' },
      { duplicate: 'duplicate' },
    ];
    for (const patch of breaks) {
      expect(decideTier({ ...makeTierInput(), ...patch }).tier).not.toBe('S');
    }
  });

  it('satisfied には満たした条件が残る', () => {
    expect(decideTier(makeTierInput()).satisfied.length).toBeGreaterThan(0);
    expect(decideTier(makeTierInput({ manufacturerId: null })).satisfied).toEqual([]);
  });
});
