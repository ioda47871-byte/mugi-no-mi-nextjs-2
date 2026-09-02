/**
 * 日次予算の判定と繰越キュー。すべて純関数で、ファイルにも外部にも触れない。
 *
 * 上限に達しても例外にせず、未処理分をキューへ積んで翌日へ繰り越す
 * （設計書 10.4「安全に翌日へ繰り越す」）。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 4
 */
import type {
  BudgetFile,
  QueueEntry,
  QueueFile,
  QueueKind,
} from './state/schema';

/**
 * 無料枠より十分小さい自前の日次上限。
 *
 *   rakutenRequests   30    楽天API は 1 req/sec。1 実行あたり最大 30 回で止める
 *   workersAiNeurons  8000  無料枠 10,000 Neurons/日 の 8 割
 *   browserSeconds    480   無料枠 600 秒/日（10 分）の 8 割
 *   pagesDeploysPerDay 1    Pages は 500 builds/月。1 日 1 回なら月 31 回
 */
export const DAILY_LIMITS = {
  rakutenRequests: 30,
  workersAiNeurons: 8000,
  browserSeconds: 480,
  pagesDeploysPerDay: 1,
} as const;

/**
 * canSpend / spend の対象。
 * pagesDeploysPerDay は含めない（workflow 側の同時実行制御で担保する）。
 */
export type ResourceName = 'rakutenRequests' | 'workersAiNeurons' | 'browserSeconds';

export function remaining(budget: BudgetFile, resource: ResourceName): number {
  return Math.max(0, DAILY_LIMITS[resource] - budget[resource]);
}

export function canSpend(budget: BudgetFile, resource: ResourceName, amount: number): boolean {
  return amount <= remaining(budget, resource);
}

/** 新しいオブジェクトを返す。書き込みの成否と独立に予算を積めるようにする。 */
export function spend(budget: BudgetFile, resource: ResourceName, amount: number): BudgetFile {
  return { ...budget, [resource]: budget[resource] + amount };
}

function queueKey(entry: Pick<QueueEntry, 'kind' | 'targetId'>): string {
  return `${entry.kind}:${entry.targetId}`;
}

/**
 * 同一 kind + targetId があれば attempts を +1 して置換する。
 * 同じ対象が毎日積まれて queue.json が膨らむのを防ぐ。
 */
export function enqueue(queue: QueueFile, entry: QueueEntry): QueueFile {
  const key = queueKey(entry);
  const existing = queue.entries.find((row) => queueKey(row) === key);
  const merged: QueueEntry = existing
    ? { ...entry, attempts: existing.attempts + 1 }
    : entry;
  return {
    ...queue,
    entries: existing
      ? queue.entries.map((row) => (queueKey(row) === key ? merged : row))
      : [...queue.entries, merged],
  };
}

/**
 * queuedAt の古い順に limit 件だけ取り、残りを rest として返す。
 * 取ったものはここでは消費済みにしない（書き込みが成功して初めて消える）。
 */
export function dequeue(
  queue: QueueFile,
  kind: QueueKind,
  limit: number,
): { taken: QueueEntry[]; rest: QueueFile } {
  const candidates = queue.entries
    .filter((row) => row.kind === kind)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt) || a.targetId.localeCompare(b.targetId));
  const taken = candidates.slice(0, Math.max(0, limit));
  const takenKeys = new Set(taken.map(queueKey));
  return {
    taken,
    rest: { ...queue, entries: queue.entries.filter((row) => !takenKeys.has(queueKey(row))) },
  };
}

function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);
  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * queuedAt から retentionDays を超えた candidate を落とす。
 * tier-a-recheck / link-recheck / article-plan は落とさない
 * （期限切れで消えると、再確認そのものが行われなくなる）。
 */
export function pruneQueue(queue: QueueFile, today: string, retentionDays: 60): QueueFile {
  return {
    ...queue,
    entries: queue.entries.filter(
      (row) => row.kind !== 'candidate' || daysBetween(row.queuedAt, today) <= retentionDays,
    ),
  };
}
