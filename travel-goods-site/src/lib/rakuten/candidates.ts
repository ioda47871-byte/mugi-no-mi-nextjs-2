import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * 自動収集した商品候補の保管。
 *
 * ここは**サイトのビルドが読み込まない場所**です（load.ts は products/ sources.json
 * merchants/ articles/ dataset.json だけを読みます）。候補が公開物に混ざりません。
 *
 * 保存するのは、照合と発注判断に要る最小限のフィールドだけ:
 *   価格・在庫・ポイント・レビュー・画像は保存しません（計画書 2節・12-3節）。
 *   取得したAPIレスポンスの原文もそのまま残しません。
 */

export const CANDIDATE_STATUSES = ['new', 'adopted', 'rejected'] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export const candidateSchema = z
  .object({
    /** 楽天の商品コード（shopCode:itemCode 形式）。候補の一意キー。 */
    itemCode: z.string().min(1),
    itemName: z.string().min(1),
    shopName: z.string().min(1).nullable(),
    /** 発行された紹介URL。加工せずそのまま保持する。 */
    affiliateUrl: z.string().url().nullable(),
    /** どの検索語で見つかったか。 */
    query: z.string().min(1),
    /** 収集時に指定したカテゴリ（編集上の分類）。 */
    category: z.string().min(1).nullable(),
    /** 既存商品と結び付いた場合のID。 */
    matchedProductId: z.string().nullable(),
    matchConfidence: z.enum(['strong', 'weak', 'none']),
    matchReasons: z.array(z.string()).max(10),
    fetchedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(CANDIDATE_STATUSES),
    note: z.string().max(400).optional(),
  })
  .strict();

export type Candidate = z.infer<typeof candidateSchema>;

export const CANDIDATES_FILE = 'candidates/rakuten.json';

/** 保持期間。これより古い `new` の候補は prune で削除できる。 */
export const CANDIDATE_RETENTION_DAYS = 60;

export function candidatesPath(datasetDir: string): string {
  return path.join(datasetDir, CANDIDATES_FILE);
}

export function readCandidates(datasetDir: string): Candidate[] {
  const file = candidatesPath(datasetDir);
  if (!fs.existsSync(file)) return [];
  const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} は配列である必要があります`);
  }
  return parsed.map((entry, index) => {
    const result = candidateSchema.safeParse(entry);
    if (!result.success) {
      throw new Error(
        `${file}[${index}] の形式が不正です: ${result.error.issues.map((i) => i.message).join(' / ')}`,
      );
    }
    return result.data;
  });
}

export function writeCandidates(datasetDir: string, candidates: Candidate[]): void {
  const file = candidatesPath(datasetDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sorted = [...candidates].sort((a, b) =>
    a.itemCode === b.itemCode ? 0 : a.itemCode < b.itemCode ? -1 : 1,
  );
  fs.writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
}

/**
 * 同じ itemCode の候補は差分を作らずに更新する（同じデータで毎回コミットが出ないように）。
 * 人が付けた status（adopted / rejected）は上書きしない。
 */
export function mergeCandidates(existing: Candidate[], incoming: Candidate[]): Candidate[] {
  const byCode = new Map(existing.map((entry) => [entry.itemCode, entry]));

  for (const candidate of incoming) {
    const previous = byCode.get(candidate.itemCode);
    if (!previous) {
      byCode.set(candidate.itemCode, candidate);
      continue;
    }
    byCode.set(candidate.itemCode, {
      ...candidate,
      // 人の判断を自動処理で戻さない
      status: previous.status === 'new' ? candidate.status : previous.status,
      // 初回に見つけた日を残す
      fetchedAt: previous.fetchedAt,
      ...(previous.note ? { note: previous.note } : {}),
    });
  }

  return [...byCode.values()];
}

/** 古い未処理の候補を落とす（無期限に貯めない）。 */
export function pruneCandidates(candidates: Candidate[], now: Date): Candidate[] {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - CANDIDATE_RETENTION_DAYS);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  return candidates.filter((entry) => entry.status !== 'new' || entry.fetchedAt >= cutoffDay);
}
