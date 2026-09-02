// tests/automation-state.test.ts
import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_STATE_FILES,
  REVERT_HISTORY_LIMIT,
  budgetFileSchema,
  linkHealthFileSchema,
  queueFileSchema,
  type BudgetFile,
} from '../src/lib/automation/state/schema';

function budgetFixture(over: Partial<BudgetFile> = {}): BudgetFile {
  return {
    version: 1,
    date: '2026-09-02',
    rakutenRequests: 0,
    workersAiNeurons: 0,
    browserSeconds: 0,
    pagesDeploysThisMonth: 0,
    circuitBreaker: { state: 'closed', trippedOn: null, reason: null, revertHistory: [] },
    ...over,
  };
}

describe('automation 状態ファイルのスキーマ', () => {
  it('状態ファイルは queue / budget / link-health の 3 つ', () => {
    expect(AUTOMATION_STATE_FILES).toEqual([
      'automation/queue.json',
      'automation/budget.json',
      'automation/link-health.json',
    ]);
  });

  it('circuitBreaker.state は closed / open だけを受ける', () => {
    const invalid = { ...budgetFixture(), circuitBreaker: { state: 'half-open', trippedOn: null, reason: null, revertHistory: [] } };
    expect(budgetFileSchema.safeParse(invalid).success).toBe(false);
  });

  it('revert の記録には日付が必要（3 日窓の計算に使う）', () => {
    const withoutDate = {
      ...budgetFixture(),
      circuitBreaker: { state: 'open', trippedOn: '2026-09-20', reason: 'x', revertHistory: [{ sha: 'a'.repeat(40) }] },
    };
    expect(budgetFileSchema.safeParse(withoutDate).success).toBe(false);

    const withDate = budgetFixture({
      circuitBreaker: {
        state: 'open', trippedOn: '2026-09-20', reason: 'x',
        revertHistory: [{ sha: 'a'.repeat(40), revertedOn: '2026-09-20' }],
      },
    });
    expect(budgetFileSchema.safeParse(withDate).success).toBe(true);
  });

  it('revertHistory の保持上限を超えたら拒否する', () => {
    const tooMany = budgetFixture({
      circuitBreaker: {
        state: 'open', trippedOn: '2026-09-20', reason: 'x',
        revertHistory: Array.from({ length: REVERT_HISTORY_LIMIT + 1 }, (_, i) => ({
          sha: String(i).padStart(40, '0'), revertedOn: '2026-09-20',
        })),
      },
    });
    expect(budgetFileSchema.safeParse(tooMany).success).toBe(false);
  });

  it('payload に原文が入らないよう長さを制限する', () => {
    const long = {
      version: 1,
      entries: [{
        kind: 'candidate', targetId: 't1', queuedAt: '2026-09-02',
        attempts: 0, lastReason: 'no-official-page', payload: { note: 'あ'.repeat(201) },
      }],
    };
    expect(queueFileSchema.safeParse(long).success).toBe(false);
  });

  it('payload が 200 文字以内なら受ける', () => {
    const ok = {
      version: 1,
      entries: [{
        kind: 'candidate', targetId: 't1', queuedAt: '2026-09-02',
        attempts: 0, lastReason: 'no-official-page', payload: { note: 'あ'.repeat(200) },
      }],
    };
    expect(queueFileSchema.safeParse(ok).success).toBe(true);
  });

  it('linkHealthFileSchema は state の未知の値を拒否する', () => {
    const entry = {
      productId: 'fixture-ace-06936',
      merchant: 'rakuten',
      externalProductId: 'testshop:test-item-001',
      signals: {
        itemCodeAlive: true,
        availability: 1,
        affiliateTargetChanged: false,
        httpStatus: null,
        identifierMatch: 'strong',
        variantMatch: true,
      },
      consecutiveFailures: 0,
      consecutiveOutOfStock: 0,
      lastHealthyAt: '2026-09-02',
      state: 'healthy',
    };
    expect(linkHealthFileSchema.safeParse({ version: 1, entries: [entry] }).success).toBe(true);
    expect(
      linkHealthFileSchema.safeParse({ version: 1, entries: [{ ...entry, state: 'broken' }] }).success,
    ).toBe(false);
  });

  it('httpStatus は null を受ける（規約確認が済むまで常に null）', () => {
    const entry = {
      productId: 'fixture-ace-06936',
      merchant: 'rakuten',
      externalProductId: 'testshop:test-item-001',
      signals: {
        itemCodeAlive: true,
        availability: null,
        affiliateTargetChanged: false,
        httpStatus: null,
        identifierMatch: 'none',
        variantMatch: false,
      },
      consecutiveFailures: 2,
      consecutiveOutOfStock: 0,
      lastHealthyAt: null,
      state: 'uncertain',
    };
    expect(linkHealthFileSchema.safeParse({ version: 1, entries: [entry] }).success).toBe(true);
  });

  it('availability は 0 / 1 / null だけを受ける', () => {
    const base = {
      productId: 'p1', merchant: 'rakuten', externalProductId: 'shop:i1',
      signals: {
        itemCodeAlive: true, availability: 2, affiliateTargetChanged: false,
        httpStatus: null, identifierMatch: 'weak', variantMatch: true,
      },
      consecutiveFailures: 0, consecutiveOutOfStock: 0, lastHealthyAt: null, state: 'healthy',
    };
    expect(linkHealthFileSchema.safeParse({ version: 1, entries: [base] }).success).toBe(false);
  });
});
