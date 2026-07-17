'use client';

import { useState, type FormEvent } from 'react';

/**
 * 第二段階の想定: 実際の送信処理(メールAPI等)は未実装です。
 * lib/placeholder-content.ts の contactFormRecipient が確定したら、
 * このコンポーネントから Server Action や API Route を呼び出す実装に差し替えてください。
 */
export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const nextErrors: Record<string, boolean> = {};

    ['name', 'email', 'subject', 'message'].forEach((field) => {
      const value = String(data.get(field) ?? '').trim();
      if (!value) nextErrors[field] = true;
    });
    const email = String(data.get('email') ?? '');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = true;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-[2px] border border-brand bg-brand-pale px-7 py-6 text-sm" role="status">
        <strong>お問い合わせありがとうございます。</strong>
        <br />
        内容を確認の上、2営業日以内にご返信いたします。今しばらくお待ちください。
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-2xl">
      <div className="grid grid-cols-2 gap-7 max-[640px]:grid-cols-1">
        <Field label="お名前" name="name" error={errors.name} />
        <Field label="メールアドレス" name="email" type="email" error={errors.email} errorMessage="正しいメールアドレスをご入力ください。" />
        <Field label="電話番号" name="phone" type="tel" required={false} />
        <SelectField label="お問い合わせ種別" name="subject" error={errors.subject} />
        <TextareaField label="お問い合わせ内容" name="message" error={errors.message} className="col-span-2" />
      </div>

      <p className="mt-[18px] text-[12.5px] text-kura">
        ご入力いただいた情報は、お問い合わせへの回答にのみ使用いたします。
      </p>

      <div className="mt-8">
        <button
          type="submit"
          className="rounded-[2px] bg-brand px-8 py-4 text-[13px] tracking-[0.16em] text-ink transition-all duration-300 ease-signature hover:bg-brand-deep hover:-translate-y-0.5"
        >
          送信する
        </button>
      </div>
    </form>
  );
}

function fieldBase(error?: boolean) {
  return `w-full border-0 border-b bg-transparent px-0.5 py-3 font-body text-[15px] text-ink outline-none transition-colors focus:border-brand-deep ${
    error ? 'border-red-400' : 'border-line'
  }`;
}

function Field({
  label,
  name,
  type = 'text',
  error,
  errorMessage = `${label}をご入力ください。`,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  error?: boolean;
  errorMessage?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2.5 block text-[12.5px] tracking-wide text-kura">
        {label}
        {required && <span className="ml-1 text-brand-deep">必須</span>}
      </label>
      <input id={name} name={name} type={type} className={fieldBase(error)} />
      {error && <p className="mt-2 text-xs text-red-500">{errorMessage}</p>}
    </div>
  );
}

function SelectField({ label, name, error }: { label: string; name: string; error?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="mb-2.5 block text-[12.5px] tracking-wide text-kura">
        {label}
        <span className="ml-1 text-brand-deep">必須</span>
      </label>
      <select id={name} name={name} className={fieldBase(error)} defaultValue="">
        <option value="" disabled>選択してください</option>
        <option value="gift">ギフトのご相談</option>
        <option value="reserve">貸切・イベントについて</option>
        <option value="press">取材・お仕事のご依頼</option>
        <option value="other">その他</option>
      </select>
      {error && <p className="mt-2 text-xs text-red-500">お問い合わせ種別をお選びください。</p>}
    </div>
  );
}

function TextareaField({
  label,
  name,
  error,
  className = '',
}: {
  label: string;
  name: string;
  error?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-2.5 block text-[12.5px] tracking-wide text-kura">
        {label}
        <span className="ml-1 text-brand-deep">必須</span>
      </label>
      <textarea id={name} name={name} rows={6} className={`${fieldBase(error)} resize-y`} />
      {error && <p className="mt-2 text-xs text-red-500">お問い合わせ内容をご入力ください。</p>}
    </div>
  );
}
