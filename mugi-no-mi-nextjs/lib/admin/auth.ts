import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * ログイン済みかつ is_admin() = true (admin_users登録済み)のユーザーのみを通す関門。
 * - 未ログイン: /admin/login へリダイレクト
 * - ログイン済みだが admin_users に登録が無い: サインアウトさせた上で
 *   /admin/login?error=forbidden へリダイレクト(ログインしただけの
 *   一般ユーザーが管理者になれてしまうことを防ぐ)
 *
 * 管理者判定は、RLSポリシーが内部で使っているものと同じ
 * public.is_admin() (SECURITY DEFINER関数)をRPC経由で呼び出しています。
 * これにより、アプリ側の判定とDB側のRLS判定が常に同じロジックになります。
 *
 * このチェックは以下の両方で必ず呼び出してください:
 *   1. app/admin/(protected)/layout.tsx (画面表示のガード)
 *   2. 各Server Action(実際の書き込み操作の直前のガード)
 * 最終的な安全性はSupabaseのRLS(is_admin()に基づくポリシー)が担保しますが、
 * アプリ側でも二重にチェックすることで、意図しない挙動やエラーメッセージの
 * わかりにくさを防ぎます。
 */
export async function requireAdmin(): Promise<{ user: User }> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  const { data: isAdmin, error } = await supabase.rpc('is_admin');

  if (error) {
    console.error('[admin] is_admin()確認中にエラーが発生しました:', error.message);
    redirect('/admin/login?error=server_error');
  }

  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect('/admin/login?error=forbidden');
  }

  return { user };
}
