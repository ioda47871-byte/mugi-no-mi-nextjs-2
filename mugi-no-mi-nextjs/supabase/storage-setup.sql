-- ============================================================================
-- 麦の実 -Mugi no Mi- Boulangerie — 商品画像アップロード用 Storage セットアップSQL
-- ============================================================================
-- supabase/admin-setup.sql を実行済み(admin_users テーブル・is_admin()関数が
-- 存在すること)が前提です。まだの場合は先にそちらを実行してください。
--
-- Supabase SQL Editorで、このファイルの内容をそのまま実行してください。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. products-images バケットを作成(公開バケット)
-- ----------------------------------------------------------------------------
-- 既に同名のバケットが存在する場合は何もしません(on conflict do nothing)。
-- Dashboard の Storage 画面から手動作成していた場合は、このSQLは不要ですが、
-- 実行してもエラーにはなりません。

insert into storage.buckets (id, name, public)
values ('products-images', 'products-images', true)
on conflict (id) do nothing;

-- 念のため、既存バケットが非公開になっていた場合に備えて公開設定を強制する。
update storage.buckets
set public = true
where id = 'products-images';


-- ----------------------------------------------------------------------------
-- 2. storage.objects の古いポリシーを削除(あれば)
-- ----------------------------------------------------------------------------

drop policy if exists "public can view product images" on storage.objects;
drop policy if exists "admins can upload product images" on storage.objects;
drop policy if exists "admins can update product images" on storage.objects;
drop policy if exists "admins can delete product images" on storage.objects;


-- ----------------------------------------------------------------------------
-- 3. storage.objects の新しいポリシー(products-imagesバケットのみに限定)
-- ----------------------------------------------------------------------------
-- storage.objects は Supabase によって既定でRLSが有効化されています
-- (このSQLでは storage.objects 自体への ENABLE ROW LEVEL SECURITY は行いません)。

-- 3-1. 誰でも(未ログイン含む)このバケットの画像を閲覧できる
--      (公開バケットのため実際にはSupabaseの公開URL経由で直接配信されますが、
--       念のためAPI経由の読み取りも明示的に許可しています)
create policy "public can view product images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'products-images');

-- 3-2. 管理者のみ、このバケットへアップロード(INSERT)できる
create policy "admins can upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'products-images'
    and public.is_admin()
  );

-- 3-3. 管理者のみ、このバケットの画像を更新(上書き)できる
create policy "admins can update product images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'products-images'
    and public.is_admin()
  )
  with check (
    bucket_id = 'products-images'
    and public.is_admin()
  );

-- 3-4. 管理者のみ、このバケットの画像を削除できる
create policy "admins can delete product images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'products-images'
    and public.is_admin()
  );


-- ----------------------------------------------------------------------------
-- 4. 動作確認用クエリ(実行は任意)
-- ----------------------------------------------------------------------------
-- バケットが公開になっているか確認:
--   select id, public from storage.buckets where id = 'products-images';
--
-- ポリシー一覧を確認:
--   select policyname, cmd, roles from pg_policies
--   where tablename = 'objects' and schemaname = 'storage';
-- ============================================================================
