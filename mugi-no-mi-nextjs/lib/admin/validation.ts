import { parseJstDatetimeLocalToIso } from '@/lib/datetime';

export const CATEGORY_OPTIONS = [
  { id: 'shokupan', label: '食パン' },
  { id: 'savory', label: '惣菜パン' },
  { id: 'sweet', label: '菓子パン' },
  { id: 'meal-bread', label: '食事パン' },
] as const;

// 「季節限定」は is_seasonal (専用のboolean列)で管理するため、
// タグの選択肢からは除外しています。tagは「定番」「人気」「数量限定」など、
// is_seasonalと独立して付けられる表示用タグ専用です。
export const TAG_OPTIONS = ['定番', '人気', '数量限定'] as const;

// 移行前(tag='季節限定')のデータを編集フォームでそのまま保存し直しても
// バリデーションエラーにならないよう、書き込み許可リストにのみ残しています。
// 新規に選択できる項目としては表示しません(TAG_OPTIONSには含めていません)。
const WRITE_ALLOWED_TAGS: readonly string[] = [...TAG_OPTIONS, '季節限定'];

const CATEGORY_IDS = CATEGORY_OPTIONS.map((c) => c.id);

/**
 * フォームから受け取ってよい商品の書き込み用データ形状。
 * このオブジェクトのキー以外はSupabaseへ絶対に書き込まない
 * (任意フィールド更新・SQLインジェクション対策)。
 */
export interface ProductWriteData {
  name: string;
  category_id: string;
  description: string;
  price: number;
  image: string;
  tag: string | null;
  is_popular: boolean;
  is_active: boolean;
  is_sold_out: boolean;
  is_seasonal: boolean;
  is_featured_home: boolean;
  display_order: number;
}

export interface ValidationResult {
  values: ProductWriteData | null;
  fieldErrors: Record<string, string>;
}

/**
 * フォームから受け取ってよいお知らせの書き込み用データ形状。
 * published_at / expires_at はすでにUTCのISO文字列に変換済み(lib/datetime.ts)
 * であることを前提とする(このファイルではJST⇔UTC変換は行わない)。
 */
export interface AnnouncementWriteData {
  title: string;
  body: string;
  published_at: string;
  expires_at: string | null;
  is_published: boolean;
}

export interface AnnouncementValidationResult {
  values: AnnouncementWriteData | null;
  fieldErrors: Record<string, string>;
}

/**
 * FormDataを検証し、Supabaseへ書き込んでよい形に整形する。
 * published_at / expires_at は<input type="datetime-local">の値(JST壁時計時刻)
 * を受け取り、parseJstDatetimeLocalToIso()でUTCのISO文字列へ変換する。
 * 1つでもエラーがあれば values は null になる。
 */
export function parseAnnouncementForm(formData: FormData): AnnouncementValidationResult {
  const fieldErrors: Record<string, string> = {};

  const title = String(formData.get('title') ?? '').trim();
  if (!title) fieldErrors.title = 'タイトルを入力してください。';

  const body = String(formData.get('body') ?? '').trim();
  if (!body) fieldErrors.body = '本文を入力してください。';

  const publishedAtRaw = String(formData.get('published_at') ?? '').trim();
  const publishedAt = parseJstDatetimeLocalToIso(publishedAtRaw);
  if (!publishedAt) fieldErrors.published_at = '公開開始日時を入力してください。';

  const expiresAtRaw = String(formData.get('expires_at') ?? '').trim();
  const expiresAt = parseJstDatetimeLocalToIso(expiresAtRaw);
  if (expiresAtRaw && !expiresAt) {
    fieldErrors.expires_at = '公開終了日時の形式が正しくありません。';
  }
  if (publishedAt && expiresAt && expiresAt <= publishedAt) {
    fieldErrors.expires_at = '公開終了日時は公開開始日時より後にしてください。';
  }

  const isPublished = formData.get('is_published') === 'on';

  if (Object.keys(fieldErrors).length > 0) {
    return { values: null, fieldErrors };
  }

  return {
    values: {
      title,
      body,
      published_at: publishedAt as string,
      expires_at: expiresAt,
      is_published: isPublished,
    },
    fieldErrors: {},
  };
}

/**
 * FormDataを検証し、Supabaseへ書き込んでよい形に整形する。
 * 1つでもエラーがあれば values は null になる。
 */
export function parseProductForm(formData: FormData): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  const name = String(formData.get('name') ?? '').trim();
  if (!name) fieldErrors.name = '商品名を入力してください。';

  const categoryId = String(formData.get('category_id') ?? '');
  if (!CATEGORY_IDS.includes(categoryId as (typeof CATEGORY_IDS)[number])) {
    fieldErrors.category_id = 'カテゴリーを選択してください。';
  }

  const description = String(formData.get('description') ?? '').trim();
  if (!description) fieldErrors.description = '説明を入力してください。';

  const image = String(formData.get('image') ?? '').trim();
  if (!image) {
    fieldErrors.image = '画像URLを入力してください。';
  } else if (!/^https?:\/\/.+/.test(image) && !image.startsWith('/')) {
    fieldErrors.image = '画像URLは http(s):// から始まるURL、または / から始まる社内パスを指定してください。';
  }

  const priceRaw = String(formData.get('price') ?? '').trim();
  const price = Number(priceRaw);
  if (priceRaw === '' || !Number.isInteger(price) || price < 0) {
    fieldErrors.price = '価格は0以上の整数で入力してください。';
  }

  const tagRaw = String(formData.get('tag') ?? '');
  const tag = tagRaw === '' || tagRaw === 'none' ? null : tagRaw;
  if (tag !== null && !WRITE_ALLOWED_TAGS.includes(tag)) {
    fieldErrors.tag = 'タグの指定が正しくありません。';
  }

  const displayOrderRaw = String(formData.get('display_order') ?? '').trim();
  const displayOrder = displayOrderRaw === '' ? 0 : Number(displayOrderRaw);
  if (!Number.isInteger(displayOrder) || displayOrder < 0) {
    fieldErrors.display_order = '表示順は0以上の整数で入力してください。';
  }

  const isPopular = formData.get('is_popular') === 'on';
  const isActive = formData.get('is_active') === 'on';
  const isSoldOut = formData.get('is_sold_out') === 'on';
  const isSeasonal = formData.get('is_seasonal') === 'on';
  const isFeaturedHome = formData.get('is_featured_home') === 'on';

  if (Object.keys(fieldErrors).length > 0) {
    return { values: null, fieldErrors };
  }

  return {
    values: {
      name,
      category_id: categoryId,
      description,
      price,
      image,
      tag,
      is_popular: isPopular,
      is_active: isActive,
      is_sold_out: isSoldOut,
      is_seasonal: isSeasonal,
      is_featured_home: isFeaturedHome,
      display_order: displayOrder,
    },
    fieldErrors: {},
  };
}
