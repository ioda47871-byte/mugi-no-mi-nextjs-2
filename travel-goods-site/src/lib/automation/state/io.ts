/**
 * automation 状態ファイルの読み書き。
 *
 * 同じ状態からは必ず同じバイト列を作り、内容が変わらなければ書き込まない。
 * 自動 PR の差分を人が読めるものに保つための土台であり、
 * 「実行しただけで差分が出る」状態を作らない。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 3
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  budgetFileSchema,
  linkHealthFileSchema,
  queueFileSchema,
  type BudgetFile,
  type LinkHealthFile,
  type QueueFile,
} from './schema';

const QUEUE_FILE = 'automation/queue.json';
const BUDGET_FILE = 'automation/budget.json';
const LINK_HEALTH_FILE = 'automation/link-health.json';

/** キーを昇順に並べ替えて直列化する。入力のキー順に出力が左右されないようにする。 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      sorted[key] = sortKeysDeep(source[key]);
    }
    return sorted;
  }
  return value;
}

/** 2 スペースインデント・キー昇順・末尾改行 1 つ。既存の JSON と揃える。 */
function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

/** queuedAt 昇順、同日は targetId 昇順。 */
export function serializeQueue(file: QueueFile): string {
  const entries = [...file.entries].sort(
    (a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.targetId.localeCompare(b.targetId),
  );
  return stableStringify({ ...file, entries });
}

/**
 * 配列は circuitBreaker.revertHistory だけ。
 * revertedOn 降順（新しい順）、同日は sha 昇順で並べる。
 *
 * 「新しい順」は schema.ts の型コメントで定めた契約であり、
 * circuit breaker の trip() が新しい RevertRecord を配列の先頭へ足して
 * slice(0, REVERT_HISTORY_LIMIT) で切ることを前提にしている。
 * ここを昇順で書き出すと、読み戻した履歴が古い順になり、
 * 上限まで埋まった状態で trip() したとき最古ではなく直前の新しい履歴が落ちる。
 * 同日は sha 昇順にして、入力順に依存しない決定的な出力を保つ。
 */
export function serializeBudget(file: BudgetFile): string {
  const revertHistory = [...file.circuitBreaker.revertHistory].sort(
    (a, b) => b.revertedOn.localeCompare(a.revertedOn) || a.sha.localeCompare(b.sha),
  );
  return stableStringify({ ...file, circuitBreaker: { ...file.circuitBreaker, revertHistory } });
}

/** productId 昇順。 */
export function serializeLinkHealth(file: LinkHealthFile): string {
  const entries = [...file.entries].sort((a, b) => a.productId.localeCompare(b.productId));
  return stableStringify({ ...file, entries });
}

/** 既存の内容と同一なら書かない。空の変更で自動 PR を立てないための関門。 */
export function writeIfChanged(absPath: string, content: string): 'written' | 'unchanged' {
  if (fs.existsSync(absPath) && fs.readFileSync(absPath, 'utf8') === content) {
    return 'unchanged';
  }
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf8');
  return 'written';
}

/**
 * 状態ファイルを読む。無ければ null を返し、
 * 内容がスキーマに合わなければ例外で止める（壊れた状態の上に書き足さない）。
 */
function readStateFile(dir: string, relPath: string): unknown | null {
  const absPath = path.join(dir, relPath);
  if (!fs.existsSync(absPath)) return null;
  return JSON.parse(fs.readFileSync(absPath, 'utf8')) as unknown;
}

function parseOrThrow<T>(
  schema: { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: unknown } },
  raw: unknown,
  relPath: string,
): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${relPath} の内容がスキーマに合いません: ${JSON.stringify(result.error)}`);
  }
  return result.data as T;
}

export function readQueue(dir: string): QueueFile {
  const raw = readStateFile(dir, QUEUE_FILE);
  if (raw === null) return { version: 1, entries: [] };
  return parseOrThrow<QueueFile>(queueFileSchema, raw, QUEUE_FILE);
}

export function readLinkHealth(dir: string): LinkHealthFile {
  const raw = readStateFile(dir, LINK_HEALTH_FILE);
  if (raw === null) return { version: 1, entries: [] };
  return parseOrThrow<LinkHealthFile>(linkHealthFileSchema, raw, LINK_HEALTH_FILE);
}

function emptyBudget(today: string): BudgetFile {
  return {
    version: 1,
    date: today,
    rakutenRequests: 0,
    workersAiNeurons: 0,
    browserSeconds: 0,
    pagesDeploysThisMonth: 0,
    circuitBreaker: { state: 'closed', trippedOn: null, reason: null, revertHistory: [] },
  };
}

/**
 * 日付が変われば日次の消費値を 0 に戻す。
 * pagesDeploysThisMonth は月次なので、月が同じなら引き継ぐ。
 * circuitBreaker は日付が変わっても必ず引き継ぐ（日次で自動復旧させない。
 * 復旧は automation-reset.yml だけが行う）。
 */
export function readBudget(dir: string, today: string): BudgetFile {
  const raw = readStateFile(dir, BUDGET_FILE);
  if (raw === null) return emptyBudget(today);
  const stored = parseOrThrow<BudgetFile>(budgetFileSchema, raw, BUDGET_FILE);
  if (stored.date === today) return stored;

  const sameMonth = stored.date.slice(0, 7) === today.slice(0, 7);
  return {
    ...stored,
    date: today,
    rakutenRequests: 0,
    workersAiNeurons: 0,
    browserSeconds: 0,
    pagesDeploysThisMonth: sameMonth ? stored.pagesDeploysThisMonth : 0,
    circuitBreaker: stored.circuitBreaker,
  };
}
