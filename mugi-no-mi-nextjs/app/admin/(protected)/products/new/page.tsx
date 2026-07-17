import Link from 'next/link';
import { ProductForm } from '@/components/admin/ProductForm';
import { createProductAction } from '@/app/admin/(protected)/actions';

export const metadata = {
  title: '商品を追加 | 管理画面',
};

export default function NewProductPage() {
  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-kura hover:text-ink">
          ← 商品一覧に戻る
        </Link>
      </div>
      <h1 className="mb-8 font-display text-2xl text-ink">商品を追加</h1>
      <ProductForm action={createProductAction} submitLabel="追加する" />
    </div>
  );
}
