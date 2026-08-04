-- ============================================================================
-- Brot yanagi — サイト写真(Hero/外観/入口/店内/ショーケース/雑貨/ディスプレイ)
-- 管理画面アップロード用 テーブル・Storage セットアップSQL
-- ============================================================================
-- supabase/admin-setup.sql を実行済み(admin_users テーブル・is_admin()関数が
-- 存在すること)が前提です。まだの場合は先にそちらを実行してください。
--
-- Supabase SQL Editorで、このファイルの内容をそのまま実行してください。
-- 冪等(何度実行しても安全)になるよう、IF NOT EXISTS / DROP POLICY IF EXISTS /
-- ON CONFLICT DO UPDATE を使っています。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. site_photos テーブル
-- ----------------------------------------------------------------------------
-- 7つのスロット(hero/exterior/entrance/interior/showcase/goods-corner/
-- display-accent)は固定です。行の追加・削除は行わず、既存7行のUPDATEのみで
-- 運用します(下記3節でINSERT/DELETEポリシーをあえて作らないのはこのため)。
--
-- image_url / storage_path は「最適化済み(WebP・長辺3000px)」ファイルを指します。
-- 公開サイトが参照するのはこの2列のみです。
-- original_storage_path はアップロードされたオリジナルファイル(temp/配下に
-- 保持し続ける)のパスで、公開サイトからは一切参照しません。

create table if not exists public.site_photos (
  slot                 text primary key check (slot in (
    'hero', 'exterior', 'entrance', 'interior',
    'showcase', 'goods-corner', 'display-accent'
  )),
  image_url            text,
  storage_path          text,
  original_storage_path text,
  alt_text             text,
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id)
);

alter table public.site_photos enable row level security;

-- 7行を初期投入する(既に存在する場合は何もしない)。
-- これ以降、アプリ側は既存行のUPDATEのみを行い、INSERT/DELETEは行いません。
insert into public.site_photos (slot) values
  ('hero'),
  ('exterior'),
  ('entrance'),
  ('interior'),
  ('showcase'),
  ('goods-corner'),
  ('display-accent')
on conflict (slot) do nothing;


-- ----------------------------------------------------------------------------
-- 2. site_photos テーブル: 明示的な権限付与(anon/authenticated)
-- ----------------------------------------------------------------------------
-- Supabaseのデフォルトスキーマ権限に暗黙的に依存せず、目的(公開読み取り・
-- 管理者更新)が分かるよう明示する。実際の絞り込みはRLSポリシー(3節)が
-- 行うが、まず「どの操作をどのロールに許可するか」をここで宣言する。
-- productsテーブルと同様、INSERT/DELETEはどちらのロールにも許可しない。

revoke all on public.site_photos from public, anon, authenticated;

grant select on public.site_photos to anon, authenticated;
grant update on public.site_photos to authenticated;
-- insert/deleteは意図的に付与しない(3節のRLSポリシーとあわせて二重に防御)。


-- ----------------------------------------------------------------------------
-- 3. site_photos テーブル: 古いポリシーを削除(あれば)
-- ----------------------------------------------------------------------------

drop policy if exists "anyone can view site photos" on public.site_photos;
drop policy if exists "admins can update site photos" on public.site_photos;


-- ----------------------------------------------------------------------------
-- 4. site_photos テーブル: 新しいRLSポリシー
-- ----------------------------------------------------------------------------
-- INSERT/DELETEポリシーは意図的に作成しません。
-- スロットの追加・削除は運用上想定しておらず、万一アプリ側やセッションに
-- 問題があっても行の追加・削除自体が構造的に不可能な状態にしています
-- (7行固定を守るための安全策)。2節のGRANTでもinsert/deleteを許可していない
-- ため、テーブル権限・RLSの両方で二重に防いでいます。

-- 4-1. 誰でも閲覧可能(公開サイトが表示に使うため)
create policy "anyone can view site photos"
  on public.site_photos
  for select
  to public
  using (true);

-- 4-2. 管理者のみ、既存行を更新できる
create policy "admins can update site photos"
  on public.site_photos
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());


-- ----------------------------------------------------------------------------
-- 5. site-photos バケットを作成(公開バケット・アップロード制限つき)
-- ----------------------------------------------------------------------------
-- file_size_limit(バイト単位)・allowed_mime_typesは、アプリ側のクライアント
-- 検証・Server Action側の再検証に加えた「第3の防御層」。Storage API自体が
-- これらを超えるアップロードを拒否する。既に同名バケットが存在する場合も
-- 設定値を最新に揃えるため on conflict do update を使用している。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-photos',
  'site-photos',
  true,
  10485760, -- 10MB = 10 * 1024 * 1024
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];


-- ----------------------------------------------------------------------------
-- 6. storage.objects の古いポリシーを削除(あれば)
-- ----------------------------------------------------------------------------

drop policy if exists "public can view site photos" on storage.objects;
drop policy if exists "admins can upload site photos" on storage.objects;
drop policy if exists "admins can delete site photos" on storage.objects;


-- ----------------------------------------------------------------------------
-- 7. storage.objects の新しいポリシー(site-photosバケットのみに限定)
-- ----------------------------------------------------------------------------
-- UPDATEポリシーは現時点では意図的に作成しません。アップロードは常に新しい
-- UUIDパスへのINSERTで行い(upsertしない)、既存オブジェクトの上書きは
-- 発生しない設計のためです。TUS(再開可能アップロード)の実機テストで
-- 権限エラーが発生した場合のみ、エラー内容とSupabase公式仕様を確認した上で
-- UPDATEポリシーの追加を検討してください(先回りしての付与はしません)。

-- 7-1. 誰でも(未ログイン含む)閲覧できる
create policy "public can view site photos"
  on storage.objects
  for select
  to public
  using (bucket_id = 'site-photos');

-- 7-2. 管理者のみアップロード(INSERT)できる
create policy "admins can upload site photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'site-photos'
    and public.is_admin()
  );

-- 7-3. 管理者のみ削除できる(差し替え時の旧ファイル削除・失敗時のロールバック・
--      孤立ファイル自動削除cronからの削除に使用)
create policy "admins can delete site photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'site-photos'
    and public.is_admin()
  );


-- ----------------------------------------------------------------------------
-- 8. 動作確認用クエリ(実行は任意)
-- ----------------------------------------------------------------------------
-- 7行が揃っているか確認:
--   select slot, image_url is not null as has_image, updated_at
--   from public.site_photos order by slot;
--
-- RLSが有効になっているか確認:
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'site_photos';
--
-- テーブル権限を確認:
--   select grantee, privilege_type from information_schema.table_privileges
--   where table_name = 'site_photos';
--
-- ポリシー一覧を確認:
--   select policyname, cmd, roles from pg_policies where tablename = 'site_photos';
--   select policyname, cmd, roles from pg_policies
--   where tablename = 'objects' and schemaname = 'storage' and policyname like '%site photos%';
--
-- バケット制限を確認:
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'site-photos';
-- ============================================================================


-- ============================================================================
-- ロールバック(元に戻す)SQL — このファイルの内容をすべて取り消す
-- ============================================================================
-- 実行は慎重に。バケット内にオブジェクトが残っている場合、
-- storage.bucketsの削除は失敗します(先にバケット内のファイルを
-- すべて削除してから実行してください)。
--
-- drop policy if exists "public can view site photos" on storage.objects;
-- drop policy if exists "admins can upload site photos" on storage.objects;
-- drop policy if exists "admins can delete site photos" on storage.objects;
--
-- delete from storage.buckets where id = 'site-photos';
-- -- ↑ バケット内にオブジェクトが残っている場合は先に以下で全削除してから実行:
-- --   delete from storage.objects where bucket_id = 'site-photos';
--
-- drop policy if exists "anyone can view site photos" on public.site_photos;
-- drop policy if exists "admins can update site photos" on public.site_photos;
-- revoke all on public.site_photos from anon, authenticated;
-- drop table if exists public.site_photos;
-- ============================================================================
