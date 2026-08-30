'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import * as tus from 'tus-js-client';
import { createClient } from '@/lib/supabase/browser';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  SITE_PHOTO_BUCKET,
  buildSitePhotoOriginalPath,
  validateSitePhotoFile,
  type SitePhotoSlot,
} from '@/lib/admin/storage';
import { finalizeSitePhotoUploadAction, clearSitePhotoAction } from '@/app/admin/(protected)/site-photos/actions';

interface SitePhotoUploadFieldProps {
  slot: SitePhotoSlot;
  label: string;
  initialImageUrl: string | null;
  initialAltText: string | null;
  initialUpdatedAt: string | null;
}

// SupabaseのリジューマブルアップロードはchunkSizeを6MB固定で扱う。
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

type Phase = 'idle' | 'uploading' | 'canceling' | 'processing';

/**
 * サイト写真1スロット分の、ドラッグ&ドロップ対応アップロードUI。
 *
 * 流れ:
 *   1. クライアント側で拡張子/サイズ(10MB)を検証
 *   2. TUS(再開可能アップロード)でブラウザ→Supabase Storageへ直接アップロード
 *      (進捗表示のため。Next.jsサーバーは経由しない)
 *   3. アップロード成功後、finalizeSitePhotoUploadAction(Server Action)を呼び出し、
 *      サーバー側でダウンロード→リサイズ・WebP変換→再保存→DB更新を行う
 *   4. 結果に応じてプレビュー・エラーを更新する
 *
 * phaseは 'idle' → 'uploading'(TUSアップロード中。キャンセル可能) →
 * 'processing'(finalize中。キャンセル不可。既存のロールバック処理に任せる) →
 * 'idle' と遷移する。'canceling' は 'uploading' からキャンセルボタンを押した
 * 直後の一瞬だけの状態で、連打防止のために存在する。
 *
 * スロットの数だけこのコンポーネントが独立して並ぶため、複数スロットを
 * 同時並行でアップロードできる(各インスタンスが自分のstateだけを持つため)。
 */
export function SitePhotoUploadField({
  slot,
  label,
  initialImageUrl,
  initialAltText,
  initialUpdatedAt,
}: SitePhotoUploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);
  // アンマウント後にsetStateを呼ばないようにするためのフラグ。
  // TUSのコールバックやfinalize Server Actionは非同期のため、
  // 呼び出し完了時にはコンポーネントが既にアンマウントされている場合がある。
  const mountedRef = useRef(true);

  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialUpdatedAt);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const busy = phase !== 'idle';
  const canCancel = phase === 'uploading';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // アンマウント時にアップロードが進行中であれば中断する(サーバー側の
      // 未完了アップロードも削除)。失敗してもUIは既に破棄されているため
      // 警告ログのみとし、孤立ファイルは日次クリーンアップに任せる。
      if (uploadRef.current) {
        uploadRef.current.abort(true).catch((err) => {
          console.warn(
            '[admin] アンマウント時のアップロード中断に失敗しました(孤立ファイルは日次クリーンアップで回収されます):',
            err instanceof Error ? err.message : 'unknown error',
          );
        });
        uploadRef.current = null;
      }
    };
  }, []);

  function handleFile(file: File) {
    if (phase !== 'idle') return; // 二重操作防止(UI側でも操作不可にしているが念のため)

    setError(null);
    setCancelNotice(null);

    const validation = validateSitePhotoFile(file);
    if (!validation.valid) {
      setError(validation.error ?? '画像を確認してください。');
      return;
    }

    void startUpload(file);
  }

  async function startUpload(file: File) {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!mountedRef.current) return;

    if (!session) {
      setError('セッションが切れています。再度ログインしてください。');
      return;
    }

    const { uuid, path } = buildSitePhotoOriginalPath(slot, file);
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    setPhase('uploading');
    setProgress(0);

    // uploadRef.current !== upload を「このuploadインスタンスは既に
    // キャンセル/差し替え済みで、もはや現役ではない」の判定に使う。
    // handleCancel/クリーンアップはabort()呼び出し前にuploadRef.currentを
    // nullにするため、その後に届く遅延コールバックはここで無視される。
    const upload: tus.Upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: TUS_CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      metadata: {
        bucketName: SITE_PHOTO_BUCKET,
        objectName: path,
        contentType: file.type,
        cacheControl: '3600',
      },
      onProgress: (bytesSent, bytesTotal) => {
        if (!mountedRef.current || uploadRef.current !== upload) return;
        setProgress(Math.round((bytesSent / bytesTotal) * 100));
      },
      onError: (err) => {
        const isStale = uploadRef.current !== upload;
        if (uploadRef.current === upload) uploadRef.current = null;
        if (!mountedRef.current || isStale) return; // キャンセル済み・アンマウント済みなら無視
        console.error('[admin] サイト写真アップロード失敗:', err);
        setError('アップロードに失敗しました。時間をおいて再度お試しください。');
        setPhase('idle');
        setProgress(0);
      },
      onSuccess: async () => {
        const isStale = uploadRef.current !== upload;
        if (uploadRef.current === upload) uploadRef.current = null;
        if (!mountedRef.current || isStale) return;

        setPhase('processing');
        try {
          const result = await finalizeSitePhotoUploadAction(slot, uuid, path);
          if (!mountedRef.current) return;
          if (!result.ok) {
            setError(result.error ?? '画像の処理に失敗しました。');
            setPhase('idle');
            return;
          }
          setImageUrl(result.imageUrl ?? null);
          setUpdatedAt(new Date().toISOString());
          setPhase('idle');
          setProgress(0);
        } catch (err) {
          if (!mountedRef.current) return;
          console.error('[admin] サイト写真の最適化処理呼び出しに失敗:', err);
          setError('画像の処理に失敗しました。時間をおいて再度お試しください。');
          setPhase('idle');
        }
      },
    });

    uploadRef.current = upload;
    upload.start();
  }

  async function handleCancel() {
    if (phase !== 'uploading') return; // finalize中・連打はここで弾く
    const upload = uploadRef.current;
    if (!upload) return;

    setPhase('canceling');
    uploadRef.current = null; // 以降、このuploadの遅延コールバックはstale扱いになる

    try {
      await upload.abort(true); // true: Supabase側の未完了アップロードも削除する
    } catch (err) {
      // abort自体が失敗しても、UIは必ずidleへ復帰させる(要件5)。
      // 削除できなかった一時ファイルは日次クリーンアップ(cron)が回収する。
      console.warn(
        '[admin] アップロードのキャンセル処理に失敗しました(孤立ファイルは日次クリーンアップで回収されます):',
        err instanceof Error ? err.message : 'unknown error',
      );
    }

    if (!mountedRef.current) return;
    setPhase('idle');
    setProgress(0);
    setError(null);
    setCancelNotice('アップロードをキャンセルしました。');
  }

  async function handleClear() {
    if (busy) return;
    if (!confirm(`${label}の写真設定を解除しますか?(既存のフォールバック表示に戻ります)`)) return;

    setError(null);
    setCancelNotice(null);
    setPhase('processing');
    try {
      const result = await clearSitePhotoAction(slot);
      if (!mountedRef.current) return;
      if (!result.ok) {
        setError(result.error ?? '削除に失敗しました。');
        setPhase('idle');
        return;
      }
      setImageUrl(null);
      setUpdatedAt(null);
      setPhase('idle');
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[admin] サイト写真の解除に失敗:', err);
      setError('削除に失敗しました。時間をおいて再度お試しください。');
      setPhase('idle');
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const statusText =
    phase === 'uploading'
      ? `アップロード中… ${progress}%`
      : phase === 'canceling'
        ? 'キャンセル中…'
        : phase === 'processing'
          ? '画像を最適化・保存中…'
          : null;

  return (
    <div className="rounded-[2px] border border-line bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base text-ink">{label}</h3>
        <span className="font-accent text-xs italic text-kura">{slot}</span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative aspect-[4/3] overflow-hidden rounded-[2px] border-2 border-dashed transition-colors ${
          isDragging ? 'border-brand-deep bg-brand-pale/40' : 'border-line bg-brand-pale/20'
        }`}
      >
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- プレビューはドメイン制限のない<img>で表示
          <img src={imageUrl} alt={`${label}のプレビュー`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-[12px] text-kura">
            画像未設定
            <br />
            (既存のフォールバック表示中)
          </div>
        )}

        {statusText && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 px-4 text-center text-[12px] text-kura"
          >
            <span>{statusText}</span>
            {phase === 'uploading' && (
              <div className="h-1.5 w-2/3 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-brand transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
            )}
            {(phase === 'uploading' || phase === 'canceling') && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={!canCancel}
                aria-label={`${label}のアップロードをキャンセル`}
                className="mt-1 min-h-[32px] rounded-[2px] border border-line px-3 text-[11px] tracking-wide text-kura transition-colors hover:border-kura hover:text-ink disabled:opacity-50"
              >
                {phase === 'canceling' ? 'キャンセル中…' : 'キャンセル'}
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className={`mt-3 flex flex-col items-center justify-center gap-1 rounded-[2px] border border-dashed px-3 py-4 text-center transition-colors ${
          isDragging ? 'border-brand-deep bg-brand-pale/40' : 'border-line'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_IMAGE_MIME_TYPES.join(',')}
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) handleFile(file);
          }}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="min-h-[40px] rounded-[2px] border border-line px-4 text-[13px] tracking-wide text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {imageUrl ? '画像を差し替える' : '画像を選択'}
        </button>
        <p className="text-[11px] text-kura">ドラッグ&ドロップも可能 / jpg・png・webp / 10MBまで</p>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-kura">
          {updatedAt ? `更新: ${new Date(updatedAt).toLocaleString('ja-JP')}` : '未設定'}
        </p>
        {imageUrl && (
          <button
            type="button"
            onClick={handleClear}
            disabled={busy}
            className="text-[11px] text-kura underline decoration-dotted hover:text-red-700 disabled:opacity-50"
          >
            解除する
          </button>
        )}
      </div>

      <div aria-live="polite">
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        {!error && cancelNotice && <p className="mt-2 text-xs text-kura">{cancelNotice}</p>}
      </div>
      {initialAltText && <p className="mt-1 text-[11px] text-kura/70">代替テキスト: {initialAltText}</p>}
    </div>
  );
}
