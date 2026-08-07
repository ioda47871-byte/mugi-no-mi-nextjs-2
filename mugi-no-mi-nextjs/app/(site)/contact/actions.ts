'use server';

import { getClientIp, hashIp } from '@/lib/contact/ip';
import { checkContactRateLimit } from '@/lib/contact/rate-limit';
import { parseContactForm } from '@/lib/contact/validation';
import { sendContactEmail } from '@/lib/contact/email';
import { ContactConfigError } from '@/lib/contact/errors';
import type { ContactFormState } from '@/lib/contact/state';

const RATE_LIMIT_MESSAGES: Record<string, string> = {
  too_soon: '送信間隔が短すぎます。1分ほど時間をおいて再度お試しください。',
  hourly_limit: '短時間に送信が集中しています。しばらく時間をおいて再度お試しください。',
  daily_limit: '本日の送信回数の上限に達しました。お急ぎの場合はお電話にてご連絡ください。',
};

/** お問い合わせフォームの送信処理。redirectはせず、同一ページ内でstateを切り替える。 */
export async function submitContactAction(
  _prevState: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  // ハニーポット欄: 通常の利用者には見えない欄。埋まっていればボットとみなし、
  // 成功したふりをして何もしない(レート制限もメール送信も行わない)。
  const honeypot = String(formData.get('company') ?? '');
  if (honeypot.trim() !== '') {
    return { status: 'success', error: null, fieldErrors: {} };
  }

  const { values, fieldErrors } = parseContactForm(formData);
  if (!values) {
    return { status: 'error', error: '入力内容をご確認ください。', fieldErrors };
  }

  try {
    const ip = getClientIp();
    const isUnknown = ip === 'unknown';
    const ipHash = hashIp(ip);

    const rateLimitResult = await checkContactRateLimit(ipHash, isUnknown);
    if (!rateLimitResult.allowed) {
      const message =
        (rateLimitResult.reason && RATE_LIMIT_MESSAGES[rateLimitResult.reason]) ??
        'しばらく時間をおいて再度お試しください。';
      return { status: 'error', error: message, fieldErrors: {} };
    }

    await sendContactEmail(values);

    return { status: 'success', error: null, fieldErrors: {} };
  } catch (err) {
    if (err instanceof ContactConfigError) {
      // 環境変数の未設定・不正な形式などの構成ミス。一時的な通信障害とは異なり
      // 静かにfail openさせず、はっきりとログへ残した上で送信を停止する。
      console.error('[contact] 設定エラーのため送信を停止しました:', err.message);
      return {
        status: 'error',
        error: '現在お問い合わせフォームをご利用いただけません。恐れ入りますがお電話にてご連絡ください。',
        fieldErrors: {},
      };
    }

    console.error(
      '[contact] 送信処理中に予期しないエラーが発生しました:',
      err instanceof Error ? err.message : 'unknown error',
    );
    return {
      status: 'error',
      error: '送信に失敗しました。時間をおいて再度お試しください。',
      fieldErrors: {},
    };
  }
}
