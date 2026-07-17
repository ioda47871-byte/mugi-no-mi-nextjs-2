import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductForm } from '@/components/admin/ProductForm';
import { getAdminProductById } from '@/lib/admin/products';
import { updateProductAction } from '@/app/admin/(protected)/actions';

export const metadata = {
  title: '商品を編集 | 管理画面',
};

export default async function EditProductPage({ params }: { params: { id: string } }) {
  const product = await getAdminProductById(params.id);

  if (!product) {
    notFound();
  }

  const boundAction = updateProductAction.bind(null, product.id);

  return (
    <div>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-kura hover:text-ink">
          ← 商品一覧に戻る
        </Link>
      </div>
      <h1 className="mb-8 font-display text-2xl text-ink">商品を編集</h1>
      <ProductForm action={boundAction} initialValues={product} submitLabel="更新する" />
    </div>
  );
}
