import { Resend } from 'resend';
import { ContactConfigError } from './errors';
import type { ContactFormData } from './validation';

const SUBJECT_LABELS: Record<ContactFormData['subject'], string> = {
  gift: 'ギフトのご相談',
  reserve: '貸切・イベントについて',
  press: '取材・お仕事のご依頼',
  other: 'その他',
};

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new ContactConfigError('RESEND_API_KEYが未設定です。');
  }
  return new Resend(apiKey);
}

function getFromAddress(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) {
    throw new ContactConfigError('RESEND_FROM_EMAILが未設定です。');
  }
  return from;
}

/**
 * 受信先を決定する。
 * - VERCEL_ENV === 'production' の場合のみ CONTACT_FORM_TO_EMAIL を使う
 * - それ以外(preview / development / VERCEL_ENV未設定)は
 *   CONTACT_FORM_TEST_TO_EMAIL を使う
 * - 本番以外で CONTACT_FORM_TO_EMAIL へフォールバックすることは絶対に行わない
 *   (Preview環境から実店舗アドレスへ誤送信することを防ぐため)
 */
function getRecipient(): string {
  const isProduction = process.env.VERCEL_ENV === 'production';

  if (isProduction) {
    const recipient = process.env.CONTACT_FORM_TO_EMAIL;
    if (!recipient) {
      throw new ContactConfigError('CONTACT_FORM_TO_EMAILが未設定です。');
    }
    return recipient;
  }

  const testRecipient = process.env.CONTACT_FORM_TEST_TO_EMAIL;
  if (!testRecipient) {
    throw new ContactConfigError(
      'CONTACT_FORM_TEST_TO_EMAILが未設定です(Production以外の環境ではCONTACT_FORM_TO_EMAILへフォールバックしません)。',
    );
  }
  return testRecipient;
}

/**
 * お問い合わせ内容を店舗宛にメール送信する。
 * Reply-Toには送信者本人のメールアドレスを設定し、店舗側が
 * そのまま返信できるようにする。HTMLメールではなくプレーンテキストにすることで、
 * エスケープ漏れによるメールクライアント側での表示崩れ・XSS類のリスクを避けている。
 */
export async function sendContactEmail(data: ContactFormData): Promise<void> {
  const resend = getResendClient();
  const to = getRecipient();
  const from = getFromAddress();

  const subjectLabel = SUBJECT_LABELS[data.subject] ?? data.subject;

  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: data.email,
    subject: `[お問い合わせ] ${subjectLabel} - ${data.name}様`,
    text: [
      `お名前: ${data.name}`,
      `メールアドレス: ${data.email}`,
      `電話番号: ${data.phone || '(未入力)'}`,
      `お問い合わせ種別: ${subjectLabel}`,
      '',
      'お問い合わせ内容:',
      data.message,
    ].join('\n'),
  });

  if (error) {
    throw new Error(`Resend送信エラー: ${error.message}`);
  }
}
