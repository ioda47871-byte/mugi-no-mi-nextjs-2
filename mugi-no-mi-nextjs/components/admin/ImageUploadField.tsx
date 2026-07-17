'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { createClient } from '@/lib/supabase/browser';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  PRODUCT_IMAGE_BUCKET,
  buildProductImagePath,
  validateImageFile,
} from '@/lib/admin/storage';

interface ImageUploadFieldProps {
  /** Supabase Storageの公開URL、または未選択ならnull */
  initialImageUrl?: string | null;
  error?: string;
}

/**
 * 商品画像のアップロードUI。
 * - 「画像を選択」→ ファイル選択 → クライアント側で拡張子/サイズを検証
 * - Supabase Storage(products-imagesバケット、products/{uuid}.ext)へアップロード
 * - 成功したら getPublicUrl() で取得した公開URLをプレビュー表示 + hidden input(name="image")へセット
 * - hidden inputの値は、既存のServer Action(createProductAction/updateProductAction)が
 *   そのままFormDataとして受け取るため、CRUD側のコードは一切変更していません。
 */
export function ImageUploadField({ initialImageUrl = null, error }: ImageUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを連続で選び直せるようにする
    if (!file) return;

    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.error ?? '画像を確認してください。');
      return;
    }

    setUploadError(null);
    setUploading(true);

    try {
      const supabase = createClient();
      const path = buildProductImagePath(file);

      const { error: uploadErr } = await supabase.storage
        .from(PRODUCT_IMAGE_BUCKET)
        .upload(path, file, { upsert: false, cacheControl: '3600' });

      if (uploadErr) {
        console.error('[admin] 画像アップロード失敗:', uploadErr.message);
        setUploadError('アップロードに失敗しました。時間をおいて再度お試しください。');
        setUploading(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);

      setImageUrl(publicUrlData.publicUrl);
    } catch (err) {
      console.error('[admin] 画像アップロード中に予期しないエラー:', err);
      setUploadError('アップロードに失敗しました。時間をおいて再度お試しください。');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="mb-2 block text-[13px] tracking-wide text-kura">商品画像</label>

      {/* Server Actionへ渡す実データ。textの画像URL入力欄は廃止し、この隠しフィールドに一本化 */}
      <input type="hidden" name="image" value={imageUrl ?? ''} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-[2px] border border-line bg-brand-pale/40">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- プレビューはドメイン制限のない<img>で表示
            <img src={imageUrl} alt="商品画像プレビュー" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[11px] text-kura">
              画像未選択
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-[11px] text-kura">
              アップロード中…
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="min-h-[44px] rounded-[2px] border border-line px-5 text-[13px] tracking-wide text-ink transition-colors hover:border-ink disabled:opacity-50"
          >
            {uploading ? 'アップロード中…' : imageUrl ? '画像を差し替える' : '画像を選択'}
          </button>
          <p className="text-xs text-kura">jpg・jpeg・png・webp / 5MBまで</p>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
          {error && !uploadError && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
