import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Instagramの長期アクセストークンをSupabaseで管理するための、
 * SUPABASE_SERVICE_ROLE_KEY専用のストア。
 *
 * 先頭の `import 'server-only'` により、万一このモジュールをクライアント
 * コンポーネントから誤ってimportした場合、ビルド時エラーになります
 * (Next.js公式のクライアントバンドル混入防止の仕組み)。
 *
 * SUPABASE_SERVICE_ROLE_KEY は RLS を完全にバイパスする強力な鍵のため、
 * このファイル以外では絶対に使用しないでください。lib/supabase/配下の
 * 既存クライアント(すべてanon/publicキーのみ使用)とは完全に分離しています。
 *
 * トークンの値そのものは、成功時の戻り値以外(ログ・例外メッセージ等)には
 * 一切含めません。
 */

export interface InstagramTokenRecord {
  accessToken: string;
  expiresAt: Date;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です。');
  }

  // persistSession/autoRefreshTokenはブラウザ向けの機能でありサーバー側の
  // 一度きりの呼び出しには不要なため無効化する(不要な内部状態を持たせない)。
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Supabaseに保存されている最新のトークンを取得する。存在しない場合はnull。 */
export async function getStoredToken(): Promise<InstagramTokenRecord | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from('instagram_credentials')
    .select('access_token, expires_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    console.error('[instagram] トークンの取得に失敗しました:', error.message);
    return null;
  }
  if (!data) return null;

  return { accessToken: data.access_token, expiresAt: new Date(data.expires_at) };
}

/**
 * トークンをSupabaseへ保存する(既存レコードがあれば上書き)。
 * created_at はupsertの対象に含めていないため、初回作成時のみDEFAULT値が使われ、
 * 以後の更新では変更されない。
 */
export async function saveToken(accessToken: string, expiresAt: Date): Promise<boolean> {
  const supabase = getServiceClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from('instagram_credentials').upsert(
    {
      id: 1,
      access_token: accessToken,
      expires_at: expiresAt.toISOString(),
      last_refreshed_at: now,
      updated_at: now,
    },
    { onConflict: 'id' },
  );

  if (error) {
    console.error('[instagram] トークンの保存に失敗しました:', error.message);
    return false;
  }
  return true;
}

/**
 * 実際に使用するアクセストークンを解決する。
 *   1. Supabaseに保存済みのトークンがあればそれを使う
 *   2. 無ければ INSTAGRAM_INITIAL_ACCESS_TOKEN(初期登録用)を使う
 *      - この場合、可能であればSupabaseへも保存しておく(以後はSupabase側を正とする)
 *      - 保存に失敗しても、今回の取得自体は初期トークンでそのまま続行する(ベストエフォート)
 *   3. どちらも無ければ null を返す(呼び出し元は既存のフォールバック表示に切り替える)
 */
export async function resolveAccessToken(): Promise<string | null> {
  const stored = await getStoredToken();
  if (stored) return stored.accessToken;

  const initialToken = process.env.INSTAGRAM_INITIAL_ACCESS_TOKEN;
  if (!initialToken) return null;

  // 初期トークンの正確な有効期限は分からないため、Instagram長期トークンの
  // 標準的な有効期間(約60日)を暫定値として保存しておく。次回のCronリフレッシュ
  // (30日ごと)で実際の有効期限に基づいた正しい値に上書きされる。
  const APPROXIMATE_LONG_LIVED_TOKEN_LIFETIME_MS = 60 * 24 * 60 * 60 * 1000;
  const provisionalExpiresAt = new Date(Date.now() + APPROXIMATE_LONG_LIVED_TOKEN_LIFETIME_MS);

  await saveToken(initialToken, provisionalExpiresAt);

  return initialToken;
}
