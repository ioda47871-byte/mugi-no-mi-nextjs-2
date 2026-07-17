import { createBrowserClient } from '@supabase/ssr';

/**
 * Client Component専用のSupabaseクライアント。
 * ログインフォーム・ログアウトボタンなど、ブラウザ側で直接
 * Supabase Authを呼び出す箇所でのみ使用してください。
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
