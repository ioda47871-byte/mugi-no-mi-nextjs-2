/**
 * ContactFormState と初期値は、'use server' ファイル(app/contact/actions.ts)から
 * 分離している。'use server' ファイルは非同期関数のみをエクスポートする規約のため、
 * プレーンなオブジェクト定数をそこから直接エクスポートするとビルド時エラーになる。
 */
export interface ContactFormState {
  status: 'idle' | 'success' | 'error';
  error: string | null;
  fieldErrors: Record<string, string>;
}

export const initialContactFormState: ContactFormState = {
  status: 'idle',
  error: null,
  fieldErrors: {},
};
