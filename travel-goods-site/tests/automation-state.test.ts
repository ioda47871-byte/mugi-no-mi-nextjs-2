// tests/automation-state.test.ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  readBudget,
  readLinkHealth,
  readQueue,
  serializeLinkHealth,
  serializeQueue,
  writeIfChanged,
} from '../src/lib/automation/state/io';
import {
  AUTOMATION_STATE_FILES,
  REVERT_HISTORY_LIMIT,
  budgetFileSchema,
  linkHealthFileSchema,
  queueFileSchema,
  type BudgetFile,
  type LinkHealthEntry,
  type LinkHealthFile,
  type QueueEntry,
  type QueueFile,
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

// ---------------------------------------------------------------- Task 3: io

describe('状態ファイルの読み書き（安定シリアライズ）', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-state-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('内容が変わらなければ書き込まない', () => {
    const file = path.join(dir, 'x.json');
    expect(writeIfChanged(file, 'a\n')).toBe('written');
    expect(writeIfChanged(file, 'a\n')).toBe('unchanged');
    expect(writeIfChanged(file, 'b\n')).toBe('written');
  });

  it('entries の順序が入れ替わっても serializeLinkHealth の出力は同一', () => {
    const entry = (productId: string): LinkHealthEntry => ({
      productId,
      merchant: 'rakuten',
      externalProductId: `shop:${productId}`,
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
    });
    const a: LinkHealthFile = { version: 1, entries: [entry('p-b'), entry('p-a'), entry('p-c')] };
    const b: LinkHealthFile = { version: 1, entries: [entry('p-c'), entry('p-b'), entry('p-a')] };
    expect(serializeLinkHealth(a)).toBe(serializeLinkHealth(b));
    // productId 昇順で並ぶ
    const parsed = JSON.parse(serializeLinkHealth(a)) as LinkHealthFile;
    expect(parsed.entries.map((e) => e.productId)).toEqual(['p-a', 'p-b', 'p-c']);
    // 末尾に改行を 1 つ付ける
    expect(serializeLinkHealth(a).endsWith('}\n')).toBe(true);
  });

  it('serializeQueue は queuedAt 昇順、同日は targetId 昇順で並べる', () => {
    const entry = (targetId: string, queuedAt: string): QueueEntry => ({
      kind: 'candidate', targetId, queuedAt, attempts: 0, lastReason: 'x', payload: {},
    });
    const file: QueueFile = {
      version: 1,
      entries: [
        entry('t-b', '2026-09-02'),
        entry('t-a', '2026-09-02'),
        entry('t-z', '2026-09-01'),
      ],
    };
    const parsed = JSON.parse(serializeQueue(file)) as QueueFile;
    expect(parsed.entries.map((e) => [e.queuedAt, e.targetId])).toEqual([
      ['2026-09-01', 't-z'],
      ['2026-09-02', 't-a'],
      ['2026-09-02', 't-b'],
    ]);
  });

  it('キーの並び順が違っても同じバイト列になる', () => {
    const file: QueueFile = {
      version: 1,
      entries: [{
        kind: 'candidate', targetId: 't1', queuedAt: '2026-09-02',
        attempts: 1, lastReason: 'no-official-page', payload: { b: '2', a: '1' },
      }],
    };
    const reordered: QueueFile = {
      version: 1,
      entries: [{
        payload: { a: '1', b: '2' }, lastReason: 'no-official-page', attempts: 1,
        queuedAt: '2026-09-02', targetId: 't1', kind: 'candidate',
      }],
    };
    expect(serializeQueue(file)).toBe(serializeQueue(reordered));
  });

  it('ファイルが無ければ空の初期値を返す（例外にしない）', () => {
    expect(readQueue(dir)).toEqual({ version: 1, entries: [] });
    expect(readLinkHealth(dir)).toEqual({ version: 1, entries: [] });
    const budget = readBudget(dir, '2026-09-02');
    expect(budget.date).toBe('2026-09-02');
    expect(budget.rakutenRequests).toBe(0);
    expect(budget.circuitBreaker.state).toBe('closed');
  });

  it('日付が変わると消費値は 0 に戻り、circuitBreaker は引き継ぐ', () => {
    fs.mkdirSync(path.join(dir, 'automation'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'automation/budget.json'), JSON.stringify({
      version: 1, date: '2026-09-01', rakutenRequests: 30, workersAiNeurons: 100,
      browserSeconds: 60, pagesDeploysThisMonth: 5,
      circuitBreaker: { state: 'open', trippedOn: '2026-09-01', reason: 'x', revertHistory: [{ sha: 'a'.repeat(40), revertedOn: '2026-09-01' }] },
    }));
    const budget = readBudget(dir, '2026-09-02');
    expect(budget.rakutenRequests).toBe(0);
    expect(budget.workersAiNeurons).toBe(0);
    expect(budget.browserSeconds).toBe(0);
    expect(budget.pagesDeploysThisMonth).toBe(5);       // 月次なので引き継ぐ
    expect(budget.circuitBreaker.state).toBe('open');   // 停止状態は引き継ぐ
    expect(budget.circuitBreaker.revertHistory).toHaveLength(1);
    expect(budget.date).toBe('2026-09-02');
  });

  it('月が変われば pagesDeploysThisMonth も 0 に戻る', () => {
    fs.mkdirSync(path.join(dir, 'automation'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'automation/budget.json'), JSON.stringify({
      version: 1, date: '2026-09-30', rakutenRequests: 30, workersAiNeurons: 0,
      browserSeconds: 0, pagesDeploysThisMonth: 5,
      circuitBreaker: { state: 'closed', trippedOn: null, reason: null, revertHistory: [] },
    }));
    expect(readBudget(dir, '2026-10-01').pagesDeploysThisMonth).toBe(0);
  });

  it('同じ日付なら消費値をそのまま返す', () => {
    fs.mkdirSync(path.join(dir, 'automation'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'automation/budget.json'), JSON.stringify({
      version: 1, date: '2026-09-02', rakutenRequests: 7, workersAiNeurons: 0,
      browserSeconds: 0, pagesDeploysThisMonth: 1,
      circuitBreaker: { state: 'closed', trippedOn: null, reason: null, revertHistory: [] },
    }));
    expect(readBudget(dir, '2026-09-02').rakutenRequests).toBe(7);
  });

  it('壊れた状態ファイルは例外で止める（上に書き足さない）', () => {
    fs.mkdirSync(path.join(dir, 'automation'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'automation/queue.json'), JSON.stringify({
      version: 1, entries: [{ kind: 'unknown-kind', targetId: 't1', queuedAt: '2026-09-02', attempts: 0, lastReason: 'x', payload: {} }],
    }));
    expect(() => readQueue(dir)).toThrow();
  });
});
