import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabaseクライアント。
 * ----------------------------------------------------------------
 * NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が
 * .env.local に設定されていない場合は null を返します。
 * lib/products.ts 側で null の場合は data/products.json にフォールバックするため、
 * Supabase未設定の状態でも開発・プレビューが止まりません。
 * ----------------------------------------------------------------
 */

let cachedClient: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}
