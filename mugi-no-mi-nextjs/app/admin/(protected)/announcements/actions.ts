'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/admin/auth';
import { parseAnnouncementForm } from '@/lib/admin/validation';

export interface AnnouncementFormState {
  error: string | null;
  fieldErrors: Record<string, string>;
}

function revalidatePublicPages() {
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/admin/announcements');
}

/** お知らせ追加 */
export async function createAnnouncementAction(
  _prevState: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  // 操作の直前に必ずサーバー側で管理者判定する
  await requireAdmin();

  const { values, fieldErrors } = parseAnnouncementForm(formData);
  if (!values) {
    return { error: '入力内容をご確認ください。', fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase.from('announcements').insert(values);

  if (error) {
    console.error('[admin] createAnnouncementAction失敗:', error.message);
    return { error: 'お知らせの追加に失敗しました。時間をおいて再度お試しください。', fieldErrors: {} };
  }

  revalidatePublicPages();
  redirect('/admin/announcements?msg=created');
}

/** お知らせ更新 */
export async function updateAnnouncementAction(
  id: string,
  _prevState: AnnouncementFormState,
  formData: FormData,
): Promise<AnnouncementFormState> {
  await requireAdmin();

  const { values, fieldErrors } = parseAnnouncementForm(formData);
  if (!values) {
    return { error: '入力内容をご確認ください。', fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('announcements')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[admin] updateAnnouncementAction失敗:', error.message);
    return { error: 'お知らせの更新に失敗しました。時間をおいて再度お試しください。', fieldErrors: {} };
  }

  revalidatePublicPages();
  redirect('/admin/announcements?msg=updated');
}

/** お知らせ削除 */
export async function deleteAnnouncementAction(id: string): Promise<void> {
  await requireAdmin();

  const supabase = createClient();
  const { error } = await supabase.from('announcements').delete().eq('id', id);

  if (error) {
    console.error('[admin] deleteAnnouncementAction失敗:', error.message);
    redirect('/admin/announcements?msg=delete_failed');
  }

  revalidatePublicPages();
  redirect('/admin/announcements?msg=deleted');
}

export interface ToggleResult {
  ok: boolean;
  error?: string;
}

/**
 * 一覧画面からのワンクリック公開/非公開切り替え。redirectはせず結果オブジェクトを
 * 返す(呼び出し側のクライアントコンポーネントが画面遷移なしで楽観的更新を行うため)。
 */
export async function toggleAnnouncementPublishedAction(id: string, value: boolean): Promise<ToggleResult> {
  await requireAdmin();

  const supabase = createClient();
  const { error } = await supabase
    .from('announcements')
    .update({ is_published: value, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('[admin] toggleAnnouncementPublishedAction失敗:', error.message);
    return { ok: false, error: '更新に失敗しました。時間をおいて再度お試しください。' };
  }

  revalidatePublicPages();
  return { ok: true };
}
