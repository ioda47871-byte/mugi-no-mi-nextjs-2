import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Supabase公式推奨のミドルウェア処理。
 * - 期限切れが近いセッションのトークンを自動でリフレッシュする
 * - /admin 以下(/admin/login を除く)は未ログインなら /admin/login へリダイレクトする
 *
 * getSession() ではなく getUser() を使うのは、getSession() がCookieの中身を
 * そのまま信頼してしまうのに対し、getUser() はSupabase Authサーバーへ問い合わせて
 * トークンの正当性を検証するため(公式に推奨されているセキュアな方法)。
 *
 * Cookieの受け渡しは getAll/setAll 方式を使用している(@supabase/ssrの
 * 現行バージョンが要求するインターフェース。旧get/set/remove方式は
 * このバージョンでは使用できない)。
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: request.headers } });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/admin/login';
  const isAdminRoute = pathname.startsWith('/admin');

  if (isAdminRoute && !isLoginPage && !user) {
    const redirectUrl = new URL('/admin/login', request.url);
    redirectUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
