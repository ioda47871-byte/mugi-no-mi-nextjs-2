import { NextResponse } from 'next/server';
import { getStoredToken, saveToken } from '@/lib/instagram/token-store';
import { refreshInstagramToken } from '@/lib/instagram/refresh';
import { revalidateInstagramPostsCache } from '@/lib/instagram';

/**
 * Vercel Cron専用エンドポイント。Instagram長期アクセストークンを
 * 期限切れ前(約30日ごと)に自動更新し、Supabaseへ保存する。
 *
 * vercel.json の schedule("0 0 1 * *" = 毎月1日 0:00 UTC)から呼び出される想定。
 * Vercel Cronは、CRON_SECRETが設定されているプロジェクトに対して
 * リクエストヘッダー `Authorization: Bearer {CRON_SECRET}` を自動的に付与する
 * (Vercel公式の推奨パターン)。
 *
 * レスポンス・ログのいずれにも、アクセストークンの値そのものは一切含めない。
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const stored = await getStoredToken();
    const currentToken = stored?.accessToken ?? process.env.INSTAGRAM_INITIAL_ACCESS_TOKEN;

    if (!currentToken) {
      // リフレッシュ対象のトークンが無い(初回登録も未実施)。秘密情報は含めない。
      console.error('[cron] リフレッシュ対象のInstagramトークンがありません。');
      return NextResponse.json({ success: false, error: 'no_token_to_refresh' }, { status: 500 });
    }

    const { accessToken, expiresAt } = await refreshInstagramToken(currentToken);
    const saved = await saveToken(accessToken, expiresAt);

    if (!saved) {
      return NextResponse.json({ success: false, error: 'save_failed' }, { status: 500 });
    }

    // 最大1時間の投稿キャッシュを待たず、新しいトークンでの取得に即座に切り替える。
    // トークンの更新・保存(本質的に重要な処理)は既に成功しているため、
    // このキャッシュ無効化はベストエフォートとして扱う。ここで例外が発生しても
    // 全体を失敗として返さない(投稿キャッシュは最長でも約1時間後に自然に
    // 更新されるため、失敗しても実害は軽微)。
    try {
      revalidateInstagramPostsCache();
    } catch (err) {
      console.error('[cron] 投稿キャッシュの即時更新に失敗しました(トークン更新自体は成功):', err instanceof Error ? err.message : 'unknown error');
    }

    return NextResponse.json({
      success: true,
      refreshedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) {
    console.error('[cron] Instagramトークンの更新に失敗しました:', err instanceof Error ? err.message : 'unknown error');
    return NextResponse.json({ success: false, error: 'refresh_failed' }, { status: 500 });
  }
}
