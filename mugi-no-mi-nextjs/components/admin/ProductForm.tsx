'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CATEGORY_OPTIONS, TAG_OPTIONS } from '@/lib/admin/validation';
import type { AdminProduct } from '@/lib/admin/products';
import type { ProductFormState } from '@/app/admin/(protected)/actions';
import { ImageUploadField } from '@/components/admin/ImageUploadField';

const initialProductFormState: ProductFormState = {
  error: null,
  fieldErrors: {},
};

interface ProductFormProps {
  action: (prevState: ProductFormState, formData: FormData) => Promise<ProductFormState>;
  initialValues?: AdminProduct;
  submitLabel: string;
}

export function ProductForm({ action, initialValues, submitLabel }: ProductFormProps) {
  const [state, formAction] = useFormState(action, initialProductFormState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error && (
        <p className="rounded-[2px] border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <Field label="商品名" htmlFor="name" error={state.fieldErrors.name}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={initialValues?.name}
          className={inputClass(Boolean(state.fieldErrors.name))}
        />
      </Field>

      <div className="grid grid-cols-2 gap-6 max-[560px]:grid-cols-1">
        <Field label="価格(円)" htmlFor="price" error={state.fieldErrors.price}>
          <input
            id="price"
            name="price"
            type="number"
            min={0}
            step={1}
            defaultValue={initialValues?.price}
            className={inputClass(Boolean(state.fieldErrors.price))}
          />
        </Field>

        <Field label="カテゴリ" htmlFor="category_id" error={state.fieldErrors.category_id}>
          <select
            id="category_id"
            name="category_id"
            defaultValue={initialValues?.categoryId ?? ''}
            className={inputClass(Boolean(state.fieldErrors.category_id))}
          >
            <option value="" disabled>
              選択してください
            </option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="説明" htmlFor="description" error={state.fieldErrors.description}>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initialValues?.description}
          className={`${inputClass(Boolean(state.fieldErrors.description))} resize-y`}
        />
      </Field>

      <ImageUploadField initialImageUrl={initialValues?.image ?? null} error={state.fieldErrors.image} />

      <div className="grid grid-cols-2 gap-6 max-[560px]:grid-cols-1">
        <Field label="タグ" htmlFor="tag" error={state.fieldErrors.tag}>
          <select
            id="tag"
            name="tag"
            defaultValue={initialValues?.tag ?? 'none'}
            className={inputClass(Boolean(state.fieldErrors.tag))}
          >
            <option value="none">なし</option>
            {TAG_OPTIONS.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
            {initialValues?.tag && !(TAG_OPTIONS as readonly string[]).includes(initialValues.tag) && (
              <option value={initialValues.tag}>{initialValues.tag}(旧データ)</option>
            )}
          </select>
          {initialValues?.tag === '季節限定' && (
            <p className="mt-1.5 text-xs text-kura">
              「季節限定」は現在タグではなく「季節限定にする」トグルで管理しています。このまま残す場合は変更不要です。他のタグに整理したい場合のみ選び直してください。
            </p>
          )}
        </Field>

        <Field label="表示順(小さいほど先頭)" htmlFor="display_order" error={state.fieldErrors.display_order}>
          <input
            id="display_order"
            name="display_order"
            type="number"
            min={0}
            step={1}
            defaultValue={initialValues?.displayOrder ?? 0}
            className={inputClass(Boolean(state.fieldErrors.display_order))}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-4 rounded-[2px] border border-line p-5 sm:flex-row sm:flex-wrap sm:gap-8">
        <Toggle name="is_popular" label="人気商品として表示する" defaultChecked={initialValues?.isPopular ?? false} />
        <Toggle name="is_seasonal" label="季節限定にする" defaultChecked={initialValues?.isSeasonal ?? false} />
        <Toggle name="is_sold_out" label="売り切れにする" defaultChecked={initialValues?.isSoldOut ?? false} />
        <Toggle name="is_active" label="公開する" defaultChecked={initialValues?.isActive ?? true} />
        <Toggle
          name="is_featured_home"
          label="ホームのおすすめ商品に表示する(最大6件)"
          defaultChecked={initialValues?.isFeaturedHome ?? false}
        />
      </div>

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

function Toggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-5 w-5 accent-brand"
      />
      {label}
    </label>
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
