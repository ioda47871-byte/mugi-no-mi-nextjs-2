export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  /** trueの場合、pathnameの完全一致でのみアクティブ判定する(既定は前方一致) */
  exact?: boolean;
  /** 準備中(未実装)のセクション */
  comingSoon?: boolean;
}

/**
 * 管理画面サイドバー/ドロワー/ダッシュボードの共通ナビ定義。
 * 新しいセクションを追加する場合は、ここに1項目追加してページを作成するだけでよい。
 */
export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { href: '/admin', label: 'ダッシュボード', description: '管理画面のトップページ', exact: true },
  { href: '/admin/products', label: '商品管理', description: '商品の追加・編集・公開設定' },
  { href: '/admin/site-photos', label: 'サイト写真', description: '公開サイトに使われる写真の差し替え' },
  { href: '/admin/announcements', label: 'お知らせ管理', description: '営業日・臨時休業などのお知らせ' },
];
