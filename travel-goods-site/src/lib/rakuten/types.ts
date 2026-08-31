import { z } from 'zod';

/**
 * 楽天商品検索APIのレスポンス。
 *
 * 外部から来る内容は「データ」として扱う（計画書 12-3節）。
 * 指示として解釈しない。使うフィールドだけを取り出し、未知のキーは無視する。
 *
 * 注意: フィールド名は実装時点の想定です。**初回の実行で実レスポンスと
 * 突き合わせて確認してください**（docs/rakuten-automation.md の初回チェック）。
 * formatVersion による2つの形（Items:[{Item:{…}}] と Items:[{…}]）の両方を受けます。
 */

/** 保存・利用するフィールドだけを定義する。価格・レビュー・画像は取り込まない。 */
export const rakutenItemSchema = z
  .object({
    itemCode: z.string().min(1),
    itemName: z.string().min(1),
    itemUrl: z.string().url().optional(),
    affiliateUrl: z.string().optional(),
    shopName: z.string().optional(),
    shopCode: z.string().optional(),
    genreId: z.union([z.string(), z.number()]).optional(),
    itemCaption: z.string().optional(),
  })
  .passthrough();

export type RakutenItem = z.infer<typeof rakutenItemSchema>;

const wrapped = z.object({ Item: rakutenItemSchema });

export const rakutenSearchResponseSchema = z
  .object({
    Items: z.array(z.union([wrapped, rakutenItemSchema])),
    count: z.number().optional(),
    page: z.number().optional(),
    pageCount: z.number().optional(),
    hits: z.number().optional(),
  })
  .passthrough();

/** どちらの形でも同じ配列に均す。 */
export function normalizeItems(response: unknown): RakutenItem[] {
  const parsed = rakutenSearchResponseSchema.safeParse(response);
  if (!parsed.success) return [];
  return parsed.data.Items.map((entry) =>
    'Item' in entry && entry.Item ? (entry.Item as RakutenItem) : (entry as RakutenItem),
  );
}
