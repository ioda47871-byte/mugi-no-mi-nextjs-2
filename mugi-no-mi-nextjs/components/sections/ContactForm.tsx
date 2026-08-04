'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { submitContactAction } from '@/app/contact/actions';
import { initialContactFormState } from '@/lib/contact/state';

export function ContactForm() {
  const [state, formAction] = useFormState(submitContactAction, initialContactFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state.status]);

  if (state.status === 'success') {
    return (
      <div className="rounded-[2px] border border-brand bg-brand-pale px-7 py-6 text-sm" role="status">
        <strong>お問い合わせありがとうございます。</strong>
        <br />
        内容を確認の上、2営業日以内にご返信いたします。今しばらくお待ちください。
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="max-w-2xl">
      {/* ハニーポット欄: 通常の利用者には見えない。埋まっていればボットとみなす */}
      <div className="fixed left-[-999px]" aria-hidden="true">
        <label htmlFor="company">会社名</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {state.error && (
        <p className="mb-5 rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-7 max-[640px]:grid-cols-1">
        <Field label="お名前" name="name" error={state.fieldErrors.name} />
        <Field label="メールアドレス" name="email" type="email" error={state.fieldErrors.email} />
        <Field label="電話番号" name="phone" type="tel" required={false} error={state.fieldErrors.phone} />
        <SelectField label="お問い合わせ種別" name="subject" error={state.fieldErrors.subject} />
        <TextareaField label="お問い合わせ内容" name="message" error={state.fieldErrors.message} className="col-span-2" />
      </div>

      <p className="mt-[18px] text-[12.5px] text-kura">
        ご入力いただいた情報は、お問い合わせへの回答にのみ使用いたします。
      </p>

      <div className="mt-8">
        <SubmitButton />
      </div>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-[2px] bg-brand px-8 py-4 text-[13px] tracking-[0.16em] text-ink transition-all duration-300 ease-signature hover:bg-brand-deep hover:-translate-y-0.5 disabled:opacity-60"
    >
      {pending ? '送信中…' : '送信する'}
    </button>
  );
}

function fieldBase(error?: string) {
  return `w-full border-0 border-b bg-transparent px-0.5 py-3 font-body text-[15px] text-ink outline-none transition-colors focus:border-brand-deep ${
    error ? 'border-red-400' : 'border-line'
  }`;
}

function Field({
  label,
  name,
  type = 'text',
  error,
  required = true,
}: {
  label: string;
  name: string;
  type?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2.5 block text-[12.5px] tracking-wide text-kura">
        {label}
        {required && <span className="ml-1 text-brand-text">必須</span>}
      </label>
      <input id={name} name={name} type={type} required={required} className={fieldBase(error)} />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}

function SelectField({ label, name, error }: { label: string; name: string; error?: string }) {
  return (
    <div>
      <label htmlFor={name} className="mb-2.5 block text-[12.5px] tracking-wide text-kura">
        {label}
        <span className="ml-1 text-brand-text">必須</span>
      </label>
      <select id={name} name={name} required className={fieldBase(error)} defaultValue="">
        <option value="" disabled>選択してください</option>
        <option value="gift">ギフトのご相談</option>
        <option value="reserve">貸切・イベントについて</option>
        <option value="press">取材・お仕事のご依頼</option>
        <option value="other">その他</option>
      </select>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
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
  error?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={name} className="mb-2.5 block text-[12.5px] tracking-wide text-kura">
        {label}
        <span className="ml-1 text-brand-text">必須</span>
      </label>
      <textarea id={name} name={name} rows={6} required className={`${fieldBase(error)} resize-y`} />
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
