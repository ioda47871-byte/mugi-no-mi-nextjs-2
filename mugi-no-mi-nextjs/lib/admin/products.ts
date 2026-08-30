import { createClient } from '@/lib/supabase/server';
import type { ProductTag } from '@/lib/products';

export interface AdminProduct {
  id: string;
  name: string;
  categoryId: string;
  description: string;
  price: number;
  image: string;
  tag: ProductTag | null;
  isPopular: boolean;
  isActive: boolean;
  isSoldOut: boolean;
  isSeasonal: boolean;
  isFeaturedHome: boolean;
  displayOrder: number;
  createdAt: string;
}

interface ProductRow {
  id: string;
  name: string;
  category_id: string;
  description: string;
  price: number;
  image: string;
  tag: string | null;
  is_popular: boolean;
  is_active: boolean;
  is_sold_out: boolean;
  is_seasonal: boolean;
  is_featured_home: boolean;
  display_order: number;
  created_at: string;
}

const SELECT_COLUMNS =
  'id, name, category_id, description, price, image, tag, is_popular, is_active, is_sold_out, is_seasonal, is_featured_home, display_order, created_at';

function mapRow(row: ProductRow): AdminProduct {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    description: row.description,
    price: row.price,
    image: row.image,
    tag: (row.tag as ProductTag | null) ?? null,
    isPopular: row.is_popular,
    isActive: row.is_active,
    isSoldOut: row.is_sold_out,
    isSeasonal: row.is_seasonal,
    isFeaturedHome: row.is_featured_home,
    displayOrder: row.display_order,
    createdAt: row.created_at,
  };
}

/**
 * 管理画面用: 全商品を表示順(display_order)で取得する。
 * is_active=falseの非公開商品も含めて取得する(公開用のlib/products.tsとは異なる)。
 * RLSにより、admin_usersに登録されたユーザーのセッションでのみ全件取得できる。
 */
export async function getAdminProducts(): Promise<AdminProduct[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[admin] getAdminProducts失敗:', error.message);
    throw new Error('商品一覧の取得に失敗しました。');
  }

  return (data as ProductRow[]).map(mapRow);
}

/** 管理画面の編集フォーム用: idから1商品を取得する(非公開商品も可) */
export async function getAdminProductById(id: string): Promise<AdminProduct | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[admin] getAdminProductById失敗:', error.message);
    throw new Error('商品情報の取得に失敗しました。');
  }

  return data ? mapRow(data as ProductRow) : null;
}
