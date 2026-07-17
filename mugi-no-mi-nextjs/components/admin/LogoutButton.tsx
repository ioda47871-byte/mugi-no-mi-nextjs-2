'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="min-h-[44px] rounded-[2px] border border-line px-4 text-[13px] tracking-wide text-ink transition-colors hover:border-ink disabled:opacity-50"
    >
      {loading ? 'ログアウト中…' : 'ログアウト'}
    </button>
  );
}
