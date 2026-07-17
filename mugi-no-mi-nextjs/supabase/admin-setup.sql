-- ============================================================================
-- 麦の実 -Mugi no Mi- Boulangerie — 管理者認証・商品CRUD用セットアップSQL
-- ============================================================================
-- Supabase SQL Editorで、このファイルの内容をそのまま実行してください。
-- 既に一部が実行済みでも安全なように、可能な箇所は IF NOT EXISTS / IF EXISTS を
-- 使っています。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. admin_users テーブル
-- ----------------------------------------------------------------------------
-- ログインできる = 管理者、ではなく、このテーブルに登録された
-- auth.users のユーザーだけが管理者として扱われます。

create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- admin_users を FORCE ROW LEVEL SECURITY にはしません(意図的)。
-- 後述の is_admin() 関数は SECURITY DEFINER かつ postgres(テーブル所有者/スーパーユーザー)
-- として実行されるため、admin_usersのRLSを経由せずに直接参照できます。
-- もし admin_users を FORCE RLS にしてしまうと、関数からの参照までRLSの対象になり、
-- 「is_admin()を評価するために admin_users のポリシーを評価し、そのポリシーの
-- 評価がまた別の判定を必要とする」といった複雑化・潜在的な循環の原因になり得るため、
-- あえて素のRLS(所有者はバイパスする通常のRLS)のままにしています。

-- admin_usersに対する唯一のポリシー: 本人が自分の行だけを確認できる。
-- このポリシーは admin_users 以外のテーブルを一切参照せず、is_admin()も呼び出さない
-- ため、再帰は発生しません(is_admin()判定そのものにはこのポリシーを使っていません。
-- is_admin()はSECURITY DEFINERにより、このポリシーを経由せず直接テーブルへアクセスします)。
drop policy if exists "users can check their own admin row" on public.admin_users;
create policy "users can check their own admin row"
  on public.admin_users
  for select
  to authenticated
  using (user_id = auth.uid());

-- admin_users自体へのINSERT/UPDATE/DELETEポリシーは意図的に作成していません。
-- 管理者の追加・削除は、Supabase SQL Editor(postgresロール。RLSをバイパスする)から
-- 直接行う運用としているためです。アプリ経由でのadmin_users書き込みは一切できません。


-- ----------------------------------------------------------------------------
-- 2. is_admin() 関数(SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- 「ログイン中のユーザーが admin_users に登録されているか」だけを返す、
-- 最小権限のヘルパー関数です。productsのRLSポリシーはこの関数を経由して
-- 管理者判定を行うため、products側のポリシーが admin_users を直接
-- サブクエリ参照することがなくなり、テーブル間の参照が単純化されます。
--
-- - security definer: 関数所有者(通常はpostgres/スーパーユーザー)の権限で実行される
--   ため、admin_usersのRLSポリシーを経由せず直接参照でき、循環評価が起こりません。
-- - stable: 同一トランザクション内で結果が変わらないことを示し、プランナーが
--   不要な再評価をしないようにする(パフォーマンス上の最適化)。
-- - set search_path = public: 関数内で解決されるオブジェクト名を public スキーマに
--   固定し、search_path を悪用したなりすまし関数への差し替え攻撃を防ぐ。

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

-- 実行権限を必要最小限にする: デフォルトのPUBLIC実行権限を剥奪し、
-- ログイン済みロール(authenticated)にのみ実行を許可する。
-- anonロールはproductsのINSERT/UPDATE/DELETEポリシー自体の対象外(to authenticated)
-- なので、is_admin()の実行権限も不要。
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;


-- ----------------------------------------------------------------------------
-- 3. products テーブル: RLSを有効化
-- ----------------------------------------------------------------------------

alter table public.products enable row level security;


-- ----------------------------------------------------------------------------
-- 4. products テーブル: 既存の古いポリシーを削除(あれば)
-- ----------------------------------------------------------------------------
-- 以前のPhaseで作成したポリシー(admin_usersを直接サブクエリ参照する版を含む)が
-- 残っている場合は削除し、is_admin()を使う新しいポリシーに置き換えます。

drop policy if exists "products are publicly readable" on public.products;
drop policy if exists "public can read active products" on public.products;
drop policy if exists "admins can read all products" on public.products;
drop policy if exists "admins can insert products" on public.products;
drop policy if exists "admins can update products" on public.products;
drop policy if exists "admins can delete products" on public.products;


-- ----------------------------------------------------------------------------
-- 5. products テーブル: 新しいRLSポリシー(is_admin()関数を使用)
-- ----------------------------------------------------------------------------

-- 5-1. 一般ユーザー・未ログインユーザー(anon含む): is_active = true の商品のみ閲覧可能
create policy "public can read active products"
  on public.products
  for select
  to public
  using (is_active = true);

-- 5-2. 管理者: 全商品を閲覧可能(非公開商品(is_active=false)も含む。編集画面用)
create policy "admins can read all products"
  on public.products
  for select
  to authenticated
  using (public.is_admin());

-- 5-3. 管理者のみ、商品を追加できる
create policy "admins can insert products"
  on public.products
  for insert
  to authenticated
  with check (public.is_admin());

-- 5-4. 管理者のみ、商品を更新できる
create policy "admins can update products"
  on public.products
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 5-5. 管理者のみ、商品を削除できる
create policy "admins can delete products"
  on public.products
  for delete
  to authenticated
  using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 6. products.id に自動採番のデフォルト値を設定(未設定の場合)
-- ----------------------------------------------------------------------------
-- 商品追加フォームはidを指定せずにINSERTするため、
-- id列にデフォルトのUUID自動生成が設定されている必要があります。
-- 既に default が設定済みの場合は、このALTERを実行しても上書きされるだけで問題ありません。

create extension if not exists pgcrypto;

alter table public.products
  alter column id set default gen_random_uuid();


-- ----------------------------------------------------------------------------
-- 7. 動作確認用クエリ(実行は任意)
-- ----------------------------------------------------------------------------
-- RLSが有効になっているか確認:
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'products';
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'admin_users';
--   -- relforcerowsecurity は両方とも false のままであるべきです(意図的)。
--
-- 現在のポリシー一覧を確認:
--   select policyname, cmd, roles from pg_policies where tablename = 'products';
--   select policyname, cmd, roles from pg_policies where tablename = 'admin_users';
--
-- is_admin()の実行権限を確認:
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_name = 'is_admin';


-- ============================================================================
-- 8. 最初の管理者を登録する(このファイルの実行だけでは自動登録されません)
-- ============================================================================
-- 事前に Supabase Dashboard > Authentication > Users から、
-- スタッフ用のメールアドレス+パスワードでユーザーを1人作成してください。
-- 作成後、そのユーザーの user_id (UUID) をコピーし、以下を実行してください。
--
--   insert into public.admin_users (user_id)
--   values ('ここに作成したユーザーのUUIDを貼り付け');
--
-- 複数人を管理者にしたい場合は、行を追加してください。
-- ============================================================================
