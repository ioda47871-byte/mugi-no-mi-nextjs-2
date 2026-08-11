export const PRODUCT_IMAGE_BUCKET = 'products-images';

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const ALLOWED_IMAGE_MIME_TYPES = Object.keys(MIME_TO_EXTENSION);

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

/** アップロード前のクライアント側バリデーション(拡張子/サイズ) */
export function validateImageFile(file: File): ImageValidationResult {
  if (!MIME_TO_EXTENSION[file.type]) {
    return { valid: false, error: 'jpg, jpeg, png, webp のいずれかの画像を選択してください。' };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { valid: false, error: '画像サイズは5MBまでです。' };
  }
  return { valid: true };
}

/** products/{uuid}.{ext} 形式のStorageパスを組み立てる */
export function buildProductImagePath(file: File): string {
  const ext = MIME_TO_EXTENSION[file.type] ?? 'jpg';
  const uuid = crypto.randomUUID();
  return `products/${uuid}.${ext}`;
}

// ============================================================================
// サイト写真(Hero/外観/入口/店内/ショーケース/雑貨/ディスプレイ)
// ============================================================================
// 商品画像とはバケット・上限サイズ・保存方式(オリジナル+最適化版の2ファイル)が
// 異なるため、専用の定数・ヘルパーを用意している。MIME許可リストは
// ALLOWED_IMAGE_MIME_TYPES を共用する(要件が同じjpg/jpeg/png/webpのため)。

export const SITE_PHOTO_BUCKET = 'site-photos';

export const MAX_SITE_PHOTO_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/** 最適化時にリサイズする長辺の最大px */
export const SITE_PHOTO_MAX_DIMENSION = 3000;

/**
 * sharpに渡す入力ピクセル数の上限(幅×高さ)。100,000,000px(約1億px)。
 *
 * 現行スマートフォンの標準的な撮影出力(iPhoneの既定12MP、Android各機種の
 * 12〜50MP程度)を問題なく通しつつ、極端に高い解像度(Samsungの108MPモード等、
 * 一般利用ではまず使われない特殊モード)を切り捨てることで、圧縮率が高く
 * ファイルサイズは小さいが展開後のピクセル数が膨大な「解凍爆弾」的な
 * ファイルによるメモリ消費を防ぐ。1億pxをRGBA(4byte/px)で展開すると
 * 生バッファは約400MBで、Vercel Serverless Functionsの一般的なメモリ上限
 * (1024MB〜)に対して十分な余裕を残す。
 */
export const SITE_PHOTO_MAX_INPUT_PIXELS = 100_000_000;

/** sharpが実際に検出する画像フォーマット名(拡張子ではなくsharp.metadata().formatの値) */
export const ALLOWED_SITE_PHOTO_FORMATS = ['jpeg', 'png', 'webp'] as const;

export const SITE_PHOTO_SLOTS = [
  { slot: 'hero', label: 'Hero(トップページ背景)' },
  { slot: 'exterior', label: '外観' },
  { slot: 'entrance', label: '入口' },
  { slot: 'interior', label: '店内' },
  { slot: 'kitchen', label: '厨房(About「OUR KITCHEN」・Galleryで使用)' },
  { slot: 'showcase', label: 'ショーケース' },
  { slot: 'goods-corner', label: '雑貨コーナー' },
  { slot: 'display-accent', label: 'ディスプレイ' },
] as const;

export type SitePhotoSlot = (typeof SITE_PHOTO_SLOTS)[number]['slot'];

export const SITE_PHOTO_SLOT_VALUES = SITE_PHOTO_SLOTS.map((s) => s.slot);

export function isSitePhotoSlot(value: string): value is SitePhotoSlot {
  return (SITE_PHOTO_SLOT_VALUES as string[]).includes(value);
}

/** アップロード前のクライアント側バリデーション(拡張子/サイズ)。上限は10MB */
export function validateSitePhotoFile(file: File): ImageValidationResult {
  if (!MIME_TO_EXTENSION[file.type]) {
    return { valid: false, error: 'jpg, jpeg, png, webp のいずれかの画像を選択してください。' };
  }
  if (file.size > MAX_SITE_PHOTO_SIZE_BYTES) {
    return { valid: false, error: '10MB以下の画像を選択してください。' };
  }
  return { valid: true };
}

const ORIGINAL_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

// crypto.randomUUID()が生成する形式(UUID v4)。クライアントから渡された
// originalPathを信用せず、サーバー側で再検証する際にも使用する。
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_REGEX = new RegExp(`^${UUID_PATTERN}$`, 'i');

/**
 * temp/{slot}/original-{uuid}.{ext} 形式でオリジナルファイルのパスを組み立てる。
 * 最適化版({slot}/optimized-{uuid}.webp、temp/配下ではない)と同じuuidを
 * 共有するため、Supabaseダッシュボード上でもペアだと分かるようにしている。
 *
 * temp/配下に置くのは、アップロード後にServer Actionが呼ばれずクライアントが
 * 離脱した場合でも、孤立ファイル自動削除(cronジョブ)が安全に判定できる
 * ようにするため(DB確定後もオリジナルはtemp/配下に留まり続ける。移動はしない)。
 */
export function buildSitePhotoOriginalPath(slot: SitePhotoSlot, file: File): { uuid: string; path: string } {
  const ext = MIME_TO_EXTENSION[file.type] ?? 'jpg';
  const uuid = crypto.randomUUID();
  return { uuid, path: `temp/${slot}/original-${uuid}.${ext}` };
}

/** {slot}/optimized-{uuid}.webp 形式で最適化版ファイルのパスを組み立てる */
export function buildSitePhotoOptimizedPath(slot: SitePhotoSlot, uuid: string): string {
  return `${slot}/optimized-${uuid}.webp`;
}

/**
 * クライアントから渡されたoriginalPath/uuidを、サーバー側で厳密に再検証する。
 * 期待する形式は必ず temp/{slot}/original-{uuid}.{ext} で、以下すべてを満たす
 * 場合のみtrueを返す:
 *   - uuidが正規のUUID形式(v4生成物と同じパターン)であること
 *   - extがjpg/jpeg/png/webpのいずれかであること
 *   - pathが「temp/{slot}/original-{uuid}.{ext}」と完全一致すること
 *     (slotは引数のslotと必ず一致する。".."や余分な階層、空文字は
 *     正規表現の完全一致(^...$)により構造的に排除される)
 *
 * bucket名はここでは扱わない(呼び出し側が常にSITE_PHOTO_BUCKET定数を
 * 使用するため、クライアントから任意のbucketを指定させる余地がない)。
 */
export function isValidOriginalPath(path: string, slot: SitePhotoSlot, uuid: string): boolean {
  if (!UUID_REGEX.test(uuid)) return false;

  const extPattern = ORIGINAL_EXTENSIONS.join('|');
  const expectedPattern = new RegExp(`^temp/${slot}/original-${uuid}\\.(${extPattern})$`);
  return expectedPattern.test(path);
}
