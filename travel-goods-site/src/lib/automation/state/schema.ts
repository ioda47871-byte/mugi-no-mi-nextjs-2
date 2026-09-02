/**
 * automation の状態ファイル（queue / budget / link-health）の型と Zod スキーマ。
 *
 * ここに置くのは「自動運用が自分で書き換える状態」だけで、商品・記事・出典・
 * 販売先リンクのデータは含まない。外部から取得した本文は保存せず、
 * 分類コードとハッシュだけを持つ。
 *
 * 実装計画: docs/superpowers/plans/2026-09-02-travel-goods-automation-foundation.md Task 2
 * 設計書 11 節（状態ファイル）・12.6 節（circuit breaker）に対応する。
 */
import { z } from 'zod';

export const AUTOMATION_STATE_FILES = [
  'automation/queue.json',
  'automation/budget.json',
  'automation/link-health.json',
] as const satisfies readonly ['automation/queue.json', 'automation/budget.json', 'automation/link-health.json'];

/** revert 履歴の保持上限。これを超える履歴は捨てる。 */
export const REVERT_HISTORY_LIMIT = 20;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD で書く');
const gitSha = z.string().regex(/^[0-9a-f]{40}$/, '40 桁の 16 進で書く');

// ---------------------------------------------------------------- queue

export const QUEUE_KINDS = ['candidate', 'tier-a-recheck', 'link-recheck', 'article-plan'] as const;
export type QueueKind = (typeof QUEUE_KINDS)[number];

export const queueEntrySchema = z
  .object({
    kind: z.enum(QUEUE_KINDS),
    /** 商品ID / itemCode / 記事slug */
    targetId: z.string().min(1).max(200),
    queuedAt: isoDate,
    attempts: z.number().int().min(0),
    /** 分類コードのみ。外部本文を入れない。 */
    lastReason: z.string().min(1).max(200),
    /** ハッシュ・分類コードのみ。原文は保存しない。 */
    payload: z.record(z.string(), z.string().max(200)),
  })
  .strict();

export const queueFileSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(queueEntrySchema),
  })
  .strict();

export type QueueEntry = z.infer<typeof queueEntrySchema>;
export type QueueFile = { version: 1; entries: QueueEntry[] };

// ---------------------------------------------------------------- budget

/**
 * revert 1 件の記録。
 * 日付を持たないと「3 日以内に 2 回」（設計書 12.6）を計算できないため、
 * sha の配列ではなくレコードの配列として持つ。
 */
export const revertRecordSchema = z
  .object({ sha: gitSha, revertedOn: isoDate })
  .strict();

export const circuitBreakerSchema = z
  .object({
    state: z.enum(['closed', 'open']),
    trippedOn: isoDate.nullable(),
    reason: z.string().min(1).max(200).nullable(),
    /** 新しい順。保持上限 REVERT_HISTORY_LIMIT 件。 */
    revertHistory: z.array(revertRecordSchema).max(REVERT_HISTORY_LIMIT),
  })
  .strict();

export const budgetFileSchema = z
  .object({
    version: z.literal(1),
    date: isoDate,
    rakutenRequests: z.number().int().min(0),
    workersAiNeurons: z.number().int().min(0),
    browserSeconds: z.number().int().min(0),
    pagesDeploysThisMonth: z.number().int().min(0),
    circuitBreaker: circuitBreakerSchema,
  })
  .strict();

export type RevertRecord = z.infer<typeof revertRecordSchema>;
export type CircuitBreaker = {
  state: 'closed' | 'open';
  trippedOn: string | null;
  reason: string | null;
  revertHistory: RevertRecord[];
};
export type BudgetFile = {
  version: 1;
  date: string;
  rakutenRequests: number;
  workersAiNeurons: number;
  browserSeconds: number;
  pagesDeploysThisMonth: number;
  circuitBreaker: CircuitBreaker;
};

// ---------------------------------------------------------------- link-health

export const LINK_STATES = ['healthy', 'uncertain', 'hidden', 'replace', 'manual-hold'] as const;
export type LinkState = (typeof LINK_STATES)[number];

export const OBSERVATION_STATUSES = ['ok', 'unavailable'] as const;
export type ObservationStatus = (typeof OBSERVATION_STATUSES)[number];

export const linkSignalsSchema = z
  .object({
    /**
     * その日の観測そのものが成立したか。
     * 'unavailable' は「API が応答しなかった」であり、商品の状態を何も意味しない。
     * itemCodeAlive === false（商品が見つからない）とは別の軸として持つ。
     */
    observationStatus: z.enum(OBSERVATION_STATUSES),
    itemCodeAlive: z.boolean(),
    /** null = 取得できなかった */
    availability: z.union([z.literal(0), z.literal(1)]).nullable(),
    affiliateTargetChanged: z.boolean(),
    /** 規約確認が済むまで常に null（設計書 8.2） */
    httpStatus: z.number().int().nullable(),
    identifierMatch: z.enum(['strong', 'weak', 'none']),
    variantMatch: z.boolean(),
  })
  .strict();

export const linkHealthEntrySchema = z
  .object({
    productId: z.string().min(1).max(200),
    merchant: z.literal('rakuten'),
    externalProductId: z.string().min(1).max(200),
    signals: linkSignalsSchema,
    consecutiveFailures: z.number().int().min(0),
    consecutiveOutOfStock: z.number().int().min(0),
    lastHealthyAt: isoDate.nullable(),
    state: z.enum(LINK_STATES),
  })
  .strict();

export const linkHealthFileSchema = z
  .object({
    version: z.literal(1),
    entries: z.array(linkHealthEntrySchema),
  })
  .strict();

export type LinkSignals = {
  observationStatus: ObservationStatus;
  itemCodeAlive: boolean;
  availability: 0 | 1 | null;
  affiliateTargetChanged: boolean;
  httpStatus: number | null;
  identifierMatch: 'strong' | 'weak' | 'none';
  variantMatch: boolean;
};
export type LinkHealthEntry = {
  productId: string;
  merchant: 'rakuten';
  externalProductId: string;
  signals: LinkSignals;
  consecutiveFailures: number;
  consecutiveOutOfStock: number;
  lastHealthyAt: string | null;
  state: LinkState;
};
export type LinkHealthFile = { version: 1; entries: LinkHealthEntry[] };
