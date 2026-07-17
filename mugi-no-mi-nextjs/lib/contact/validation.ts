const NAME_MAX_LENGTH = 100;
const EMAIL_MAX_LENGTH = 254;
const PHONE_MAX_LENGTH = 20;
const MESSAGE_MAX_LENGTH = 2000;

const SUBJECT_OPTIONS = ['gift', 'reserve', 'press', 'other'] as const;
type SubjectOption = (typeof SUBJECT_OPTIONS)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * フォームから受け取ってよいお問い合わせデータの形状。
 * このオブジェクトのキー以外はメール本文や以降の処理に一切渡さない
 * (任意フィールド混入対策)。
 */
export interface ContactFormData {
  name: string;
  email: string;
  phone: string;
  subject: SubjectOption;
  message: string;
}

export interface ContactValidationResult {
  values: ContactFormData | null;
  fieldErrors: Record<string, string>;
}

/**
 * FormDataを検証し、メール送信に使ってよい形に整形する。
 * 1つでもエラーがあれば values は null になる。
 */
export function parseContactForm(formData: FormData): ContactValidationResult {
  const fieldErrors: Record<string, string> = {};

  const name = String(formData.get('name') ?? '').trim();
  if (!name) {
    fieldErrors.name = 'お名前を入力してください。';
  } else if (name.length > NAME_MAX_LENGTH) {
    fieldErrors.name = `お名前は${NAME_MAX_LENGTH}文字以内で入力してください。`;
  }

  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    fieldErrors.email = 'メールアドレスを入力してください。';
  } else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = '正しいメールアドレスをご入力ください。';
  }

  const phone = String(formData.get('phone') ?? '').trim();
  if (phone.length > PHONE_MAX_LENGTH) {
    fieldErrors.phone = `電話番号は${PHONE_MAX_LENGTH}文字以内で入力してください。`;
  }

  const subjectRaw = String(formData.get('subject') ?? '');
  if (!SUBJECT_OPTIONS.includes(subjectRaw as SubjectOption)) {
    fieldErrors.subject = 'お問い合わせ種別をお選びください。';
  }

  const message = String(formData.get('message') ?? '').trim();
  if (!message) {
    fieldErrors.message = 'お問い合わせ内容を入力してください。';
  } else if (message.length > MESSAGE_MAX_LENGTH) {
    fieldErrors.message = `お問い合わせ内容は${MESSAGE_MAX_LENGTH}文字以内で入力してください。`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { values: null, fieldErrors };
  }

  return {
    values: {
      name,
      email,
      phone,
      subject: subjectRaw as SubjectOption,
      message,
    },
    fieldErrors: {},
  };
}
