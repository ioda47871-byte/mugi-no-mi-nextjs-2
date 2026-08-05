'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { parseProductForm } from '@/lib/admin/validation';

export interface ProductFormState {
  error: string | null;
  fieldErrors: Record<string, string>;
}

function revalidatePublicPages() {
  revalidatePath('/');
  revalidatePath('/menu');
  revalidatePath('/admin');
}

/** 商品追加 */
export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  // 操作の直前に必ずサーバー側で管理者判定する
  await requireAdmin();

  const { values, fieldErrors } = parseProductForm(formData);
  if (!values) {
    return { error: '入力内容をご確認ください。', fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase.from('products').insert(values);

  if (error) {
    console.error('[admin] createProductAction失敗:', error.message);
    return { error: '商品の追加に失敗しました。時間をおいて再度お試しください。', fieldErrors: {} };
  }

  revalidatePublicPages();
  redirect('/admin?msg=created');
}

/** 商品更新 */
export async function updateProductAction(
  id: string,
  _prevState: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireAdmin();

  const { values, fieldErrors } = parseProductForm(formData);
  if (!values) {
    return { error: '入力内容をご確認ください。', fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase.from('products').update(values).eq('id', id);

  if (error) {
    console.error('[admin] updateProductAction失敗:', error.message);
    return { error: '商品の更新に失敗しました。時間をおいて再度お試しください。', fieldErrors: {} };
  }

  revalidatePublicPages();
  redirect('/admin?msg=updated');
}

/** 商品削除 */
export async function deleteProductAction(id: string): Promise<void> {
  await requireAdmin();

  const supabase = createClient();
  const { error } = await supabase.from('products').delete().eq('id', id);

  if (error) {
    console.error('[admin] deleteProductAction失敗:', error.message);
    redirect('/admin?msg=delete_failed');
  }

  revalidatePublicPages();
  redirect('/admin?msg=deleted');
}

// ----------------------------------------------------------------------------
// 一覧画面からのワンクリック切り替え(公開 / 人気 / 季節限定 / 売り切れ / おすすめ)
// ----------------------------------------------------------------------------

export type ToggleField = 'is_active' | 'is_popular' | 'is_sold_out' | 'is_seasonal' | 'is_featured_home';

const VALID_TOGGLE_FIELDS: ToggleField[] = [
  'is_active',
  'is_popular',
  'is_sold_out',
  'is_seasonal',
  'is_featured_home',
];

export interface ToggleResult {
  ok: boolean;
  error?: string;
}

/**
 * 一覧画面のトグルボタンから直接呼び出す。redirectはせず結果オブジェクトを返す
 * (呼び出し側のクライアントコンポーネントが画面遷移なしで楽観的更新を行うため)。
 *
 * is_active / is_popular / is_sold_out / is_seasonal / is_featured_home はすべて
 * products テーブルの専用boolean列です。tag列(表示用タグ: 定番/人気/数量限定など)
 * には一切触れません。
 */
export async function toggleProductFlagAction(
  id: string,
  field: ToggleField,
  value: boolean,
): Promise<ToggleResult> {
  await requireAdmin();

  if (!VALID_TOGGLE_FIELDS.includes(field)) {
    return { ok: false, error: '不正なリクエストです。' };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('products')
    .update({ [field]: value })
    .eq('id', id);

  if (error) {
    console.error('[admin] toggleProductFlagAction失敗:', error.message);
    return { ok: false, error: '更新に失敗しました。時間をおいて再度お試しください。' };
  }

  revalidatePublicPages();
  return { ok: true };
}
