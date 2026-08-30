'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { AdminAnnouncement } from '@/lib/admin/announcements';
import type { AnnouncementFormState } from '@/app/admin/(protected)/announcements/actions';
import { formatIsoToJstDatetimeLocal, nowAsJstDatetimeLocal } from '@/lib/datetime';

const initialAnnouncementFormState: AnnouncementFormState = {
  error: null,
  fieldErrors: {},
};

interface AnnouncementFormProps {
  action: (prevState: AnnouncementFormState, formData: FormData) => Promise<AnnouncementFormState>;
  initialValues?: AdminAnnouncement;
  submitLabel: string;
}

export function AnnouncementForm({ action, initialValues, submitLabel }: AnnouncementFormProps) {
  const [state, formAction] = useFormState(action, initialAnnouncementFormState);

  // 新規作成時は「現在の日本時間」を初期値にする(店主は必要に応じて変更できる)。
  const defaultPublishedAt = initialValues
    ? formatIsoToJstDatetimeLocal(initialValues.publishedAt)
    : nowAsJstDatetimeLocal();
  const defaultExpiresAt = initialValues?.expiresAt ? formatIsoToJstDatetimeLocal(initialValues.expiresAt) : '';

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && (
        <p className="rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <Field label="タイトル" htmlFor="title" error={state.fieldErrors.title}>
        <input
          id="title"
          name="title"
          type="text"
          defaultValue={initialValues?.title}
          className={inputClass(Boolean(state.fieldErrors.title))}
        />
      </Field>

      <Field label="本文" htmlFor="body" error={state.fieldErrors.body}>
        <textarea
          id="body"
          name="body"
          rows={6}
          defaultValue={initialValues?.body}
          className={`${inputClass(Boolean(state.fieldErrors.body))} resize-y`}
        />
      </Field>

      <div className="grid grid-cols-2 gap-6 max-[560px]:grid-cols-1">
        <Field label="公開開始日時(日本時間)" htmlFor="published_at" error={state.fieldErrors.published_at}>
          <input
            id="published_at"
            name="published_at"
            type="datetime-local"
            defaultValue={defaultPublishedAt}
            className={inputClass(Boolean(state.fieldErrors.published_at))}
          />
        </Field>

        <Field
          label="公開終了日時(日本時間・任意)"
          htmlFor="expires_at"
          error={state.fieldErrors.expires_at}
        >
          <input
            id="expires_at"
            name="expires_at"
            type="datetime-local"
            defaultValue={defaultExpiresAt}
            className={inputClass(Boolean(state.fieldErrors.expires_at))}
          />
          <p className="mt-1.5 text-xs text-kura">空欄の場合は無期限で公開されます。</p>
        </Field>
      </div>

      <label className="flex min-h-[44px] w-fit cursor-pointer items-center gap-3 rounded-[2px] border border-line px-4 text-sm text-ink">
        <input
          type="checkbox"
          name="is_published"
          defaultChecked={initialValues?.isPublished ?? false}
          className="h-5 w-5 accent-brand"
        />
        公開する
      </label>

      <SubmitButton label={submitLabel} />
    </form>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-[13px] tracking-wide text-kura">
        {label}
      </label>
      {children}
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-[48px] self-start rounded-[2px] bg-brand px-8 text-[13px] tracking-[0.14em] text-ink transition-all duration-300 ease-signature hover:bg-brand-deep disabled:opacity-60"
    >
      {pending ? '保存中…' : label}
    </button>
  );
}

function inputClass(hasError: boolean) {
  return `min-h-[44px] w-full rounded-[2px] border bg-white px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-brand-deep ${
    hasError ? 'border-red-400' : 'border-line'
  }`;
}
