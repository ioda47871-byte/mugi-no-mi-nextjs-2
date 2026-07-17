import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server Component / Server Action / Route Handler専用のSupabaseクライアント。
 * Cookieに保存されたセッションを読み書きするため、リクエストごとに新しく
 * 生成してください(モジュールスコープでキャッシュしないこと)。
 *
 * 使用するキーは anon(public)キーのみです。service_role キーはここでは
 * 一切使用しません。管理者かどうかの判定はRLS + admin_usersテーブルで行います
 * (lib/admin/auth.ts 参照)。
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // Server Componentのレンダリング中に呼ばれた場合は書き込めないため無視する。
            // セッションの更新自体は middleware.ts (updateSession) が担当する。
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {
            // 同上
          }
        },
      },
    },
  );
}
