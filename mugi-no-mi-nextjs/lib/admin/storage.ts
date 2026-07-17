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
