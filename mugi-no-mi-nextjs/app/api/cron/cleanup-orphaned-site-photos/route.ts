import 'server-only';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SITE_PHOTO_BUCKET, SITE_PHOTO_SLOT_VALUES } from '@/lib/admin/storage';

/**
 * Vercel Cron専用エンドポイント。site-photosバケット内の孤立ファイル
 * (site_photosテーブルのどの行からも参照されておらず、作成から24時間以上
 * 経過したオブジェクト)を削除する。
 *
 * 孤立の主な発生源:
 *   - クライアントがStorageへオリジナルをアップロードした後、
 *     finalizeSitePhotoUploadAction(Server Action)を呼ばずに離脱した場合
 *   - DB更新失敗・競合時のロールバックで削除しきれなかった場合(ベストエフォート)
 *
 * vercel.jsonの schedule("0 3 * * *" = 毎日3:00 UTC)から呼び出される想定。
 * VercelはCRON_SECRETが設定されているプロジェクトに対して
 * リクエストヘッダー `Authorization: Bearer {CRON_SECRET}` を自動的に付与する。
 *
 * 重要: Vercel CronはProductionデプロイURLに対してのみ実行される。
 * Previewだけを運用している間は自動実行されない(README「9-2. サイト写真」
 * 参照)。本番公開前は ?dryRun=true を付けて手動実行し、削除候補件数だけを
 * 確認してから本番運用を開始すること。
 *
 * レスポンスにはファイルパス・件数以外の情報は一切含めない
 * (実際に削除したパスはサーバーログにのみ出力する)。
 */
export const dynamic = 'force-dynamic';

// バケット一覧・DB読み取り・削除バッチの合計でも数秒程度に収まる想定。
// Hobbyプランでも安全に完了できるよう保守的に10秒としている。
export const maxDuration = 10;

const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000; // 24時間
const LIST_PAGE_SIZE = 100;
// 一度に削除する最大件数。大量削除による予期しない影響を避けるための
// 安全な小分けバッチ(Storage APIの一括削除は失敗時に単位全体が失敗しうる
// ため、バッチを小さく保つことで「1件の異常が全体を止める」影響範囲を限定する)。
const DELETE_BATCH_SIZE = 20;

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface StorageObjectInfo {
  path: string;
  createdAtMs: number;
}

/** 指定prefix配下のオブジェクトをページネーションしながら全件列挙する */
async function listAllObjectsUnderPrefix(
  supabase: ReturnType<typeof getServiceClient>,
  prefix: string,
): Promise<StorageObjectInfo[]> {
  const results: StorageObjectInfo[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await supabase.storage.from(SITE_PHOTO_BUCKET).list(prefix, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const item of data) {
      // Supabase Storageのlist()は、フォルダ相当のエントリをid:nullで返す。
      // フォルダ自体は削除対象ではないためスキップする。
      if (item.id === null) continue;
      const createdAtMs = item.created_at ? new Date(item.created_at).getTime() : Date.now();
      results.push({ path: `${prefix}/${item.name}`, createdAtMs });
    }

    if (data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return results;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  // 手動テスト用: ?dryRun=true を付けると削除は行わず、削除候補の件数のみ返す。
  // 本番運用開始前は、必ずこのモードで一度確認してから通常実行に切り替えること。
  const dryRun = url.searchParams.get('dryRun') === 'true';

  try {
    const supabase = getServiceClient();

    // 1. site_photosに現在参照されているパスを収集する(削除対象から除外するため)。
    //    ここで取得できなかった場合、安全側に倒して処理全体を中断する
    //    (参照情報が取れない状態で削除を進めるのは危険なため)。
    const { data: rows, error: rowsError } = await supabase
      .from('site_photos')
      .select('storage_path, original_storage_path');

    if (rowsError) {
      console.error('[cron] site_photos取得に失敗しました:', rowsError.message);
      return NextResponse.json({ success: false, error: 'db_read_failed' }, { status: 500 });
    }

    const referencedPaths = new Set<string>();
    for (const row of rows ?? []) {
      if (row.storage_path) referencedPaths.add(row.storage_path);
      if (row.original_storage_path) referencedPaths.add(row.original_storage_path);
    }

    // 2. site-photosバケット内の全オブジェクトを列挙する。
    //    オリジナルは temp/{slot}/、最適化版は {slot}/ 配下にあるため、
    //    SITE_PHOTO_SLOT_VALUESの各スロット × 2プレフィックスをそれぞれ列挙する。
    const prefixes = SITE_PHOTO_SLOT_VALUES.flatMap((slot) => [`temp/${slot}`, slot]);
    const allObjects: StorageObjectInfo[] = [];
    for (const prefix of prefixes) {
      const objects = await listAllObjectsUnderPrefix(supabase, prefix);
      allObjects.push(...objects);
    }

    // 3. 削除候補 = 「DBのどの行からも参照されていない」かつ
    //    「作成から24時間以上経過している」もの。
    //    参照有無の判定を最優先にしており、参照されているファイルは
    //    経過時間に関わらず絶対に削除候補へ含まれない。
    const now = Date.now();
    const candidates = allObjects.filter(
      (obj) => !referencedPaths.has(obj.path) && now - obj.createdAtMs >= ORPHAN_MIN_AGE_MS,
    );

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        scannedCount: allObjects.length,
        candidateCount: candidates.length,
      });
    }

    // 4. 安全のため小さいバッチに分けて削除する。
    //    1バッチが失敗しても、次のバッチの処理は継続する
    //    (個々の失敗で全処理を止めない)。
    let deletedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < candidates.length; i += DELETE_BATCH_SIZE) {
      const batch = candidates.slice(i, i + DELETE_BATCH_SIZE);
      const batchPaths = batch.map((c) => c.path);

      const { data: removed, error: removeError } = await supabase.storage
        .from(SITE_PHOTO_BUCKET)
        .remove(batchPaths);

      if (removeError) {
        console.error('[cron] バッチ削除に失敗しました(次のバッチへ継続):', removeError.message);
        failedCount += batch.length;
        continue;
      }

      const removedCount = removed?.length ?? 0;
      deletedCount += removedCount;
      failedCount += batch.length - removedCount;
      // 実際に削除したパスはサーバーログにのみ出力する(公開レスポンスには含めない)。
      console.log(`[cron] ${removedCount}件削除しました。`);
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      scannedCount: allObjects.length,
      candidateCount: candidates.length,
      deletedCount,
      failedCount,
    });
  } catch (err) {
    console.error('[cron] 孤立ファイルの削除処理に失敗しました:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'cleanup_failed' }, { status: 500 });
  }
}
