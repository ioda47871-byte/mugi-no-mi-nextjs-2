import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server Component / Server Action / Route Handler専用のSupabaseクライアント。
 * Cookieに保存されたセッションを読み書きするため、リクエストごとに新しく
 * 生成してください(モジュールスコープでキャッシュしないこと)。
 *
 * 使用するキーは anon(public)キーのみです。service_role キーはここでは
 * 一切使用しません。管理者かどうかの判定はRLS + admin_usersテーブルで行います
 * (lib/admin/auth.ts 参照)。
 *
 * Cookieの受け渡しは getAll/setAll 方式を使用している(@supabase/ssrの
 * 現行バージョンが要求するインターフェース。旧get/set/remove方式は
 * このバージョンでは使用できない)。
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Componentのレンダリング中に呼ばれた場合は書き込めないため無視する。
            // セッションの更新自体は middleware.ts (updateSession) が担当する。
          }
        },
      },
    },
  );
}
