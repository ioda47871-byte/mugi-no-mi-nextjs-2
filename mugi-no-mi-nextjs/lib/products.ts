import productsData from '@/data/products.json';
import { getSupabaseClient } from '@/lib/supabase/client';

/**
 * 商品データ層(公開サイト用・Supabase接続版)
 * ----------------------------------------------------------------
 * Supabaseの `products` テーブルから、is_active=true の商品のみを取得します。
 * .env.local に NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY が
 * 設定されていない場合は、自動的に `data/products.json` にフォールバックします。
 *
 * 管理画面(/admin)用の全件取得(非公開商品も含む)は lib/admin/products.ts を
 * 使用してください。こちらは公開サイト専用です。
 *
 * 【カテゴリー構成(2026-07改訂)】
 * 「パストリー」「ギフト」カテゴリーは廃止し、「食パン」「惣菜パン」「菓子パン」
 * 「食事パン」の4カテゴリーに整理しました。「季節限定」はカテゴリーではなく
 * is_seasonal(boolean)によるタグですが、Menuの絞り込みフィルターとしては
 * 他のカテゴリーと横断的に選べる特別な選択肢として扱っています
 * (MENU_FILTERS を参照)。
 *
 * 【tag と is_seasonal の関係について】
 * tag(text)は「定番」「人気」「数量限定」などの表示用タグで、単一選択です。
 * 季節限定は is_seasonal(boolean)という独立した列で管理しています。
 * ----------------------------------------------------------------
 */

export type ProductTag = '定番' | '人気' | '数量限定' | '季節限定';

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description: string;
  image: string;
  tag?: ProductTag;
  isPopular: boolean;
  isActive: boolean;
  isSoldOut: boolean;
  isSeasonal: boolean;
  isFeaturedHome: boolean;
  displayOrder: number;
}

/** 実際の商品カテゴリー(products.category_id に対応)。表示順もこの並び。 */
export const CATEGORY_LABELS: { id: string; label: string }[] = [
  { id: 'shokupan', label: '食パン' },
  { id: 'savory', label: '惣菜パン' },
  { id: 'sweet', label: '菓子パン' },
  { id: 'meal-bread', label: '食事パン' },
];

export type MenuFilterKey = 'all' | 'shokupan' | 'savory' | 'sweet' | 'meal-bread' | 'seasonal';

/** Menuページ・Home埋め込みMenuセクション共通の絞り込みフィルター選択肢 */
export const MENU_FILTERS: { key: MenuFilterKey; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'shokupan', label: '食パン' },
  { key: 'savory', label: '惣菜パン' },
  { key: 'sweet', label: '菓子パン' },
  { key: 'meal-bread', label: '食事パン' },
  { key: 'seasonal', label: '季節限定' },
];

/** 商品が指定フィルターに合致するか('季節限定'はカテゴリー横断でis_seasonalを見る) */
export function matchesMenuFilter(product: Product, key: MenuFilterKey): boolean {
  if (key === 'all') return true;
  if (key === 'seasonal') return product.isSeasonal;
  return product.categoryId === key;
}

const MENU_FILTER_KEY_VALUES = MENU_FILTERS.map((f) => f.key) as string[];

/**
 * URLクエリパラメータ(?category=...)などの外部入力を検証し、
 * 有効なMenuFilterKeyであればそれを、そうでなければ'all'を返す。
 * トップページのカテゴリーカード(CraftMiniCards)から/menuへの遷移で、
 * 不正・存在しないcategory値が渡された場合に「すべて」へ安全に
 * フォールバックするために使用する。
 */
export function parseMenuFilterKey(value: string | null | undefined): MenuFilterKey {
  if (value && MENU_FILTER_KEY_VALUES.includes(value)) {
    return value as MenuFilterKey;
  }
  return 'all';
}

interface SupabaseProductRow {
  id: string;
  category_id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  tag: string | null;
  is_popular: boolean;
  is_active: boolean;
  is_sold_out: boolean;
  is_seasonal: boolean;
  is_featured_home: boolean;
  display_order: number;
}

function mapRow(row: SupabaseProductRow): Product {
  return {
    id: row.id,
    categoryId: row.category_id,
    name: row.name,
    price: row.price,
    description: row.description,
    image: row.image,
    // 過去データに tag='季節限定' が残っている可能性があるため、表示用タグとしては
    // そのまま通す(is_seasonalバッジと重複しないよう、表示側(コンポーネント)で
    // 制御しています)。
    tag: (row.tag ?? undefined) as ProductTag | undefined,
    isPopular: row.is_popular,
    isActive: row.is_active,
    isSoldOut: row.is_sold_out,
    isSeasonal: row.is_seasonal,
    isFeaturedHome: row.is_featured_home,
    displayOrder: row.display_order,
  };
}

interface JsonRawProduct {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  description: string;
  image: string;
  tag: ProductTag | null;
  isPopular: boolean;
  isActive: boolean;
  isSoldOut?: boolean;
  isSeasonal?: boolean;
  isFeaturedHome?: boolean;
  displayOrder?: number;
}

interface ProductsJson {
  categories: { id: string; label: string }[];
  products: JsonRawProduct[];
}

function getFromJsonFallback(): Product[] {
  const raw = productsData as ProductsJson;
  return raw.products.map((p, index) => ({
    ...p,
    tag: p.tag ?? undefined,
    isSoldOut: p.isSoldOut ?? false,
    isSeasonal: p.isSeasonal ?? false,
    isFeaturedHome: p.isFeaturedHome ?? false,
    displayOrder: p.displayOrder ?? index,
  }));
}

/**
 * トップページの「おすすめ商品セクション」用に、is_featured_home=trueの商品を
 * 表示順(displayOrder)で最大6件返す。既にgetAllProducts()で取得済みの
 * (is_active=trueの)商品リストに対して絞り込むだけで、追加のSupabase問い合わせは
 * 行わない。
 */
export function getFeaturedHomeProducts(products: Product[], limit = 6): Product[] {
  return products.filter((p) => p.isFeaturedHome).slice(0, limit);
}

/**
 * ENABLE_PRODUCT_LISTINGが'true'の場合のみ商品一覧を取得する。
 *
 * Brot yanagiへのリブランド時点では、Supabaseのproductsテーブルに
 * 旧「麦の実」の架空商品データが残っている可能性があるが、
 * Supabase側のデータは削除・変更しない方針のため、公開ページ側で
 * 商品取得そのものを既定で無効化している。実際の商品データが確認でき、
 * 表示してよい状態になったら、環境変数を 'true' に設定してください。
 *
 * この値はNEXT_PUBLIC_接頭辞が無いためビルド時に固定されない(リクエストごとに
 * process.envを読む)が、Vercelで環境変数を変更した場合は対象環境の
 * 再デプロイ(Redeploy)を行わないと反映されない点に注意。
 */
const PRODUCT_LISTING_ENABLED = process.env.ENABLE_PRODUCT_LISTING === 'true';

/**
 * 公開中(isActive: true)の全商品を表示順(displayOrder)で取得する。
 * Supabaseが未設定の場合は data/products.json にフォールバックする。
 */
export async function getAllProducts(): Promise<Product[]> {
  if (!PRODUCT_LISTING_ENABLED) {
    return [];
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return getFromJsonFallback()
      .filter((p) => p.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  const { data, error } = await supabase
    .from('products')
    .select(
      'id, category_id, name, price, description, image, tag, is_popular, is_active, is_sold_out, is_seasonal, is_featured_home, display_order',
    )
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[Supabase] products取得に失敗しました。JSONフォールバックを使用します:', error.message);
    return getFromJsonFallback()
      .filter((p) => p.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  return (data as SupabaseProductRow[]).map(mapRow);
}

/** idから1商品を取得する(存在しない場合はundefined。非公開商品は対象外) */
export async function getProductById(id: string): Promise<Product | undefined> {
  const products = await getAllProducts();
  return products.find((p) => p.id === id);
}
