'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: 'このアカウントには管理画面へのアクセス権がありません。',
  server_error: '確認中にエラーが発生しました。時間をおいて再度お試しください。',
};

/**
 * useSearchParams() を使うため、Next.jsのApp Router公式推奨に従い
 * Suspenseでラップする必要があります(でないと、Vercelでの静的プリレンダリング時に
 * 「useSearchParams() should be wrapped in a suspense boundary」でビルドが失敗します)。
 * そのため、実際のログインフォームはこの内側のコンポーネントに分離し、
 * 下の AdminLoginPage(デフォルトエクスポート)側で <Suspense> によりラップしています。
 * 機能・デザインの変更は行っていません。
 */
function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/admin';
  const urlError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(urlError ? ERROR_MESSAGES[urlError] ?? null : null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('メールアドレスまたはパスワードが正しくありません。');
      setLoading(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="w-full max-w-sm rounded-[2px] border border-line bg-white p-8">
      <h1 className="mb-1 font-display text-xl text-ink">Brot yanagi 管理画面</h1>
      <p className="mb-7 text-sm text-kura">スタッフ用ログイン</p>

      {error && (
        <p className="mb-5 rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-[13px] tracking-wide text-kura">
            メールアドレス
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-[44px] w-full rounded-[2px] border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-brand-deep"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-2 block text-[13px] tracking-wide text-kura">
            パスワード
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-[44px] w-full rounded-[2px] border border-line bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none focus:border-brand-deep"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 min-h-[48px] rounded-[2px] bg-brand px-8 text-[13px] tracking-[0.14em] text-ink transition-all duration-300 ease-signature hover:bg-brand-deep disabled:opacity-60"
        >
          {loading ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ivory px-5">
      <Suspense fallback={<LoginFormSkeleton />}>
        <AdminLoginForm />
      </Suspense>
    </div>
  );
}

/**
 * Suspenseのfallback。ネットワーク的にはほぼ一瞬しか表示されないが、
 * レイアウトのガタつきを防ぐため、実フォームと同じ外枠サイズを再現している
 * (見た目・機能を変えないため、文言や装飾は追加していない)。
 */
function LoginFormSkeleton() {
  return (
    <div className="w-full max-w-sm rounded-[2px] border border-line bg-white p-8">
      <div className="mb-1 h-6 w-40 rounded bg-line/60" />
      <div className="mb-7 mt-2 h-4 w-24 rounded bg-line/40" />
      <div className="flex flex-col gap-5">
        <div className="h-[44px] w-full rounded-[2px] border border-line bg-white" />
        <div className="h-[44px] w-full rounded-[2px] border border-line bg-white" />
        <div className="mt-2 h-[48px] w-full rounded-[2px] bg-line/40" />
      </div>
    </div>
  );
}