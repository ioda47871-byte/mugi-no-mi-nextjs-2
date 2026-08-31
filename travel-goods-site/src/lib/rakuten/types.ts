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

/**
 * formatVersion=1 は要素が入れ子（Item / item）、formatVersion=2 は平ら。
 * 公式ドキュメントの例は小文字（items[0].item.itemName）で書かれている一方、
 * 実際の商品検索APIは大文字（Items / Item）で返します。**どちらが返っても
 * 0件にならないよう、両方を受けます。**
 */
const wrapped = z.union([
  z.object({ Item: rakutenItemSchema }),
  z.object({ item: rakutenItemSchema }),
]);

const itemsArraySchema = z.array(z.union([wrapped, rakutenItemSchema]));

export const rakutenSearchResponseSchema = z
  .object({
    Items: itemsArraySchema.optional(),
    items: itemsArraySchema.optional(),
    count: z.number().optional(),
    page: z.number().optional(),
    pageCount: z.number().optional(),
    hits: z.number().optional(),
  })
  .passthrough()
  .refine((value) => value.Items !== undefined || value.items !== undefined, {
    message: 'Items（または items）がありません',
  });

/** どの形でも同じ配列に均す。 */
export function normalizeItems(response: unknown): RakutenItem[] {
  const parsed = rakutenSearchResponseSchema.safeParse(response);
  if (!parsed.success) return [];
  const entries = parsed.data.Items ?? parsed.data.items ?? [];
  return entries.map((entry) => {
    if ('Item' in entry && entry.Item) return entry.Item as RakutenItem;
    if ('item' in entry && entry.item) return entry.item as RakutenItem;
    return entry as RakutenItem;
  });
}
