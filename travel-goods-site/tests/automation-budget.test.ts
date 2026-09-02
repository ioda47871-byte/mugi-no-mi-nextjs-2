// tests/automation-budget.test.ts
import { describe, expect, it } from 'vitest';
import {
  DAILY_LIMITS,
  canSpend,
  dequeue,
  enqueue,
  pruneQueue,
  remaining,
  spend,
} from '../src/lib/automation/budget';
import type { BudgetFile, QueueEntry, QueueFile } from '../src/lib/automation/state/schema';

const budget: BudgetFile = {
  version: 1 as const, date: '2026-09-02', rakutenRequests: 28, workersAiNeurons: 0,
  browserSeconds: 0, pagesDeploysThisMonth: 0,
  circuitBreaker: { state: 'closed' as const, trippedOn: null, reason: null, revertHistory: [] },
};

function entry(over: Partial<QueueEntry> = {}): QueueEntry {
  return {
    kind: 'candidate',
    targetId: 't1',
    queuedAt: '2026-09-02',
    attempts: 0,
    lastReason: 'no-official-page',
    payload: {},
    ...over,
  };
}

describe('日次予算', () => {
  it('remaining は上限から消費を引いた値', () => {
    expect(remaining(budget, 'rakutenRequests')).toBe(2);
    expect(remaining(budget, 'workersAiNeurons')).toBe(DAILY_LIMITS.workersAiNeurons);
    expect(remaining(budget, 'browserSeconds')).toBe(DAILY_LIMITS.browserSeconds);
  });

  it('残量ちょうどは使えるが、1 超過は使えない', () => {
    expect(canSpend(budget, 'rakutenRequests', 2)).toBe(true);
    expect(canSpend(budget, 'rakutenRequests', 3)).toBe(false);
  });

  it('spend は元のオブジェクトを変更しない', () => {
    const next = spend(budget, 'rakutenRequests', 2);
    expect(budget.rakutenRequests).toBe(28);
    expect(next.rakutenRequests).toBe(30);
    expect(DAILY_LIMITS.rakutenRequests).toBe(30);
  });

  it('上限は設計書 10 節の値', () => {
    expect(DAILY_LIMITS).toEqual({
      rakutenRequests: 30,
      workersAiNeurons: 8000,
      browserSeconds: 480,
      pagesDeploysPerDay: 1,
    });
  });
});

describe('繰越キュー', () => {
  it('enqueue は同一 kind+targetId で重複を作らず attempts を増やす', () => {
    const first = enqueue({ version: 1, entries: [] }, entry());
    expect(first.entries.map((e) => e.attempts)).toEqual([0]);

    const second = enqueue(first, entry({ queuedAt: '2026-09-03', lastReason: 'recall-unavailable' }));
    expect(second.entries).toHaveLength(1);
    expect(second.entries.map((e) => e.attempts)).toEqual([1]);
    expect(second.entries.map((e) => e.lastReason)).toEqual(['recall-unavailable']);
    expect(second.entries.map((e) => e.queuedAt)).toEqual(['2026-09-03']);
  });

  it('kind が違えば別の項目として積む', () => {
    const queue = enqueue(
      enqueue({ version: 1, entries: [] }, entry()),
      entry({ kind: 'tier-a-recheck' }),
    );
    expect(queue.entries).toHaveLength(2);
  });

  it('enqueue は元のキューを変更しない', () => {
    const before: QueueFile = { version: 1, entries: [] };
    enqueue(before, entry());
    expect(before.entries).toEqual([]);
  });

  it('dequeue は queuedAt の古い順に limit 件だけ取り、残りを返す', () => {
    const queue: QueueFile = {
      version: 1,
      entries: [
        entry({ targetId: 't-new', queuedAt: '2026-09-03' }),
        entry({ targetId: 't-old', queuedAt: '2026-09-01' }),
        entry({ targetId: 't-mid', queuedAt: '2026-09-02' }),
      ],
    };
    const { taken, rest } = dequeue(queue, 'candidate', 2);
    expect(taken.map((e) => e.targetId)).toEqual(['t-old', 't-mid']);
    expect(rest.entries.map((e) => e.targetId)).toEqual(['t-new']);
  });

  it('dequeue は指定した kind だけを取る', () => {
    const queue: QueueFile = {
      version: 1,
      entries: [
        entry({ targetId: 't-a', kind: 'tier-a-recheck', queuedAt: '2026-09-01' }),
        entry({ targetId: 't-c', kind: 'candidate', queuedAt: '2026-09-02' }),
      ],
    };
    const { taken, rest } = dequeue(queue, 'candidate', 5);
    expect(taken.map((e) => e.targetId)).toEqual(['t-c']);
    expect(rest.entries.map((e) => e.targetId)).toEqual(['t-a']);
  });

  it('pruneQueue は 60 日を超えた candidate を落とす', () => {
    const queue: QueueFile = {
      version: 1,
      entries: [
        entry({ targetId: 't-fresh', queuedAt: '2026-09-01' }),
        entry({ targetId: 't-60', queuedAt: '2026-07-04' }),   // 2026-09-02 の 60 日前
        entry({ targetId: 't-61', queuedAt: '2026-07-03' }),   // 61 日前
      ],
    };
    const pruned = pruneQueue(queue, '2026-09-02', 60);
    expect(pruned.entries.map((e) => e.targetId)).toEqual(['t-fresh', 't-60']);
  });

  it('pruneQueue は candidate 以外を落とさない', () => {
    const queue: QueueFile = {
      version: 1,
      entries: [
        entry({ targetId: 't-a', kind: 'tier-a-recheck', queuedAt: '2020-01-01' }),
        entry({ targetId: 't-l', kind: 'link-recheck', queuedAt: '2020-01-01' }),
        entry({ targetId: 't-p', kind: 'article-plan', queuedAt: '2020-01-01' }),
        entry({ targetId: 't-c', kind: 'candidate', queuedAt: '2020-01-01' }),
      ],
    };
    const pruned = pruneQueue(queue, '2026-09-02', 60);
    expect(pruned.entries.map((e) => e.targetId)).toEqual(['t-a', 't-l', 't-p']);
  });

  it('pruneQueue は元のキューを変更しない', () => {
    const before: QueueFile = { version: 1, entries: [entry({ queuedAt: '2020-01-01' })] };
    pruneQueue(before, '2026-09-02', 60);
    expect(before.entries).toHaveLength(1);
  });
});
