'use server';

import sharp from 'sharp';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import {
  ALLOWED_SITE_PHOTO_FORMATS,
  MAX_SITE_PHOTO_SIZE_BYTES,
  SITE_PHOTO_BUCKET,
  SITE_PHOTO_MAX_DIMENSION,
  SITE_PHOTO_MAX_INPUT_PIXELS,
  buildSitePhotoOptimizedPath,
  isSitePhotoSlot,
  isValidOriginalPath,
} from '@/lib/admin/storage';

type SupabaseServerClient = ReturnType<typeof createClient>;

// maxDurationはこのファイル('use server')には書けない(Server Actionsファイルは
// async関数以外をexportできない制約があるため)。代わりにこのアクションを呼び出す
// app/admin/(protected)/site-photos/page.tsx側で設定している。

export interface SitePhotoActionResult {
  ok: boolean;
  error?: string;
  imageUrl?: string;
}

function revalidatePublicPages() {
  revalidatePath('/');
  revalidatePath('/about');
  revalidatePath('/gallery');
  revalidatePath('/access');
  revalidatePath('/menu');
  revalidatePath('/admin/site-photos');
}

/** ロールバック用のベストエフォート削除。失敗してもエラーにはせず警告ログのみ */
async function removeObjects(supabase: SupabaseServerClient, paths: string[], context: string) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(SITE_PHOTO_BUCKET).remove(paths);
  if (error) {
    console.warn(`[admin] ${context}: ファイル削除に失敗しました(孤立ファイルとして残る可能性があります):`, error.message);
  }
}

/**
 * クライアントがブラウザ→Supabase Storageへ直接アップロードしたオリジナル画像を、
 * サーバー側でダウンロード→sharpでリサイズ・WebP変換→再アップロードし、
 * site_photosの該当スロット行を更新する。
 *
 * 処理順序(失敗時にDBが常に実在するファイルだけを参照するように):
 *   1. 現在の行を読む(旧ファイルパス + updated_atを楽観的排他制御用に保持)
 *   2. オリジナルをダウンロード → 失敗したらオリジナルを削除して終了
 *   3. sharpで加工 → 失敗したらオリジナルを削除して終了
 *   4. 最適化版をアップロード → 失敗したらオリジナルを削除して終了
 *   5. DB更新(updated_atが読み取り時と一致する場合のみ = 楽観的排他制御)
 *      → 失敗 or 0件更新(競合)ならオリジナル+最適化版の両方を削除して終了
 *   6. 成功したら、置き換えられた旧ファイル(旧オリジナル+旧最適化版)を削除
 *
 * 5が成功するまでは、DBは常に「変更前の状態」を指し続けるため、
 * 途中のどの段階で失敗してもサイト表示が壊れることはない。
 */
export async function finalizeSitePhotoUploadAction(
  slotRaw: string,
  uuid: string,
  originalPath: string,
): Promise<SitePhotoActionResult> {
  await requireAdmin();

  if (!isSitePhotoSlot(slotRaw)) {
    return { ok: false, error: '不正なスロットです。' };
  }
  const slot = slotRaw;

  // クライアントから渡されたパスを無条件に信用しない: temp/{slot}/original-{uuid}.{ext}
  // という厳密な形式に一致しない場合は、ダウンロードすら行わずに拒否する。
  // (bucket名はSITE_PHOTO_BUCKET定数を常に使用するため、クライアントが
  // 任意のbucketを指定する余地はそもそも無い)
  if (!isValidOriginalPath(originalPath, slot, uuid)) {
    console.error('[admin] 不正なoriginalPathを検出しました:', { slot, uuid });
    return { ok: false, error: '不正なリクエストです。もう一度アップロードし直してください。' };
  }

  const supabase = createClient();

  const { data: currentRow, error: readError } = await supabase
    .from('site_photos')
    .select('storage_path, original_storage_path, updated_at')
    .eq('slot', slot)
    .single();

  if (readError || !currentRow) {
    console.error('[admin] site_photos読み取り失敗:', readError?.message);
    await removeObjects(supabase, [originalPath], '読み取り失敗時のロールバック');
    return { ok: false, error: '現在の状態の取得に失敗しました。もう一度お試しください。' };
  }

  const { data: originalBlob, error: downloadError } = await supabase.storage
    .from(SITE_PHOTO_BUCKET)
    .download(originalPath);

  if (downloadError || !originalBlob) {
    console.error('[admin] オリジナル画像のダウンロード失敗:', downloadError?.message);
    await removeObjects(supabase, [originalPath], 'ダウンロード失敗時のロールバック');
    return { ok: false, error: '画像の処理に失敗しました。もう一度お試しください。' };
  }

  // サーバー側での再検証: クライアント側のMIME/サイズチェックは改変・バイパス
  // 可能なため、ダウンロードした実バイト列に対してここでも再確認する。
  // ファイル拡張子やアップロード時のContent-Typeヘッダーは一切信用せず、
  // sharp.metadata()が実際にデコードできた結果(実体)だけを判断材料にする。
  if (originalBlob.size > MAX_SITE_PHOTO_SIZE_BYTES) {
    console.error('[admin] サーバー側再検証: ファイルサイズ超過', { slot, size: originalBlob.size });
    await removeObjects(supabase, [originalPath], 'サイズ超過時のロールバック');
    return { ok: false, error: '10MB以下の画像を選択してください。' };
  }

  const arrayBuffer = await originalBlob.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  let optimizedBuffer: Buffer;
  try {
    // limitInputPixelsを明示することで、圧縮後は小さいが展開後のピクセル数が
    // 膨大な「解凍爆弾」的ファイルを、デコード前に確実に拒否する。
    const image = sharp(inputBuffer, { limitInputPixels: SITE_PHOTO_MAX_INPUT_PIXELS });
    const metadata = await image.metadata();

    if (!metadata.format || !(ALLOWED_SITE_PHOTO_FORMATS as readonly string[]).includes(metadata.format)) {
      console.error('[admin] サーバー側再検証: 未対応フォーマット', { slot, format: metadata.format });
      await removeObjects(supabase, [originalPath], '未対応フォーマット時のロールバック');
      return { ok: false, error: 'jpg, jpeg, png, webp のいずれかの画像を選択してください。' };
    }

    if (metadata.pages && metadata.pages > 1) {
      console.error('[admin] サーバー側再検証: アニメーション画像を検出', { slot, pages: metadata.pages });
      await removeObjects(supabase, [originalPath], 'アニメーション画像時のロールバック');
      return { ok: false, error: 'アニメーション画像には対応していません。静止画像を選択してください。' };
    }

    optimizedBuffer = await image
      .rotate() // EXIFの向き情報を反映してから、向き情報自体は破棄する(標準的な挙動)
      .resize({
        width: SITE_PHOTO_MAX_DIMENSION,
        height: SITE_PHOTO_MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    // sharpが解析できない = 壊れた画像、またはlimitInputPixels超過。
    // いずれもエラーメッセージのみログし、画像データ自体はログに出さない。
    console.error('[admin] 画像の最適化処理に失敗:', err instanceof Error ? err.message : 'unknown error');
    await removeObjects(supabase, [originalPath], '最適化失敗時のロールバック');
    return { ok: false, error: '画像を処理できませんでした。ファイルが壊れていないかご確認ください。' };
  }

  const optimizedPath = buildSitePhotoOptimizedPath(slot, uuid);
  const { error: uploadError } = await supabase.storage
    .from(SITE_PHOTO_BUCKET)
    .upload(optimizedPath, optimizedBuffer, { contentType: 'image/webp', upsert: false, cacheControl: '3600' });

  if (uploadError) {
    console.error('[admin] 最適化画像のアップロード失敗:', uploadError.message);
    await removeObjects(supabase, [originalPath], '最適化版アップロード失敗時のロールバック');
    return { ok: false, error: '画像の保存に失敗しました。もう一度お試しください。' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(SITE_PHOTO_BUCKET).getPublicUrl(optimizedPath);

  const { data: updatedRows, error: updateError } = await supabase
    .from('site_photos')
    .update({
      image_url: publicUrl,
      storage_path: optimizedPath,
      original_storage_path: originalPath,
      updated_at: new Date().toISOString(),
    })
    .eq('slot', slot)
    .eq('updated_at', currentRow.updated_at)
    .select('slot');

  if (updateError) {
    console.error('[admin] site_photos更新失敗:', updateError.message);
    await removeObjects(supabase, [originalPath, optimizedPath], 'DB更新失敗時のロールバック');
    return { ok: false, error: '保存に失敗しました。もう一度お試しください。' };
  }

  if (!updatedRows || updatedRows.length === 0) {
    // 楽観的排他制御: 読み取り後にDB側のupdated_atが変わっていた = 他の更新と競合した
    await removeObjects(supabase, [originalPath, optimizedPath], '競合時のロールバック');
    return { ok: false, error: '他の変更と競合しました。画面を更新してもう一度お試しください。' };
  }

  const oldPaths = [currentRow.storage_path, currentRow.original_storage_path].filter(
    (p): p is string => Boolean(p),
  );
  await removeObjects(supabase, oldPaths, '差し替え後の旧ファイル削除');

  revalidatePublicPages();

  return { ok: true, imageUrl: publicUrl };
}

/** スロットの写真設定を解除し、既存の静的フォールバック表示に戻す */
export async function clearSitePhotoAction(slotRaw: string): Promise<SitePhotoActionResult> {
  await requireAdmin();

  if (!isSitePhotoSlot(slotRaw)) {
    return { ok: false, error: '不正なスロットです。' };
  }
  const slot = slotRaw;

  const supabase = createClient();

  const { data: currentRow, error: readError } = await supabase
    .from('site_photos')
    .select('storage_path, original_storage_path')
    .eq('slot', slot)
    .single();

  if (readError || !currentRow) {
    console.error('[admin] clearSitePhotoAction読み取り失敗:', readError?.message);
    return { ok: false, error: '現在の状態の取得に失敗しました。' };
  }

  const { error: updateError } = await supabase
    .from('site_photos')
    .update({
      image_url: null,
      storage_path: null,
      original_storage_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq('slot', slot);

  if (updateError) {
    console.error('[admin] clearSitePhotoAction更新失敗:', updateError.message);
    return { ok: false, error: '削除に失敗しました。もう一度お試しください。' };
  }

  const oldPaths = [currentRow.storage_path, currentRow.original_storage_path].filter(
    (p): p is string => Boolean(p),
  );
  await removeObjects(supabase, oldPaths, '解除後のファイル削除');

  revalidatePublicPages();

  return { ok: true };
}
