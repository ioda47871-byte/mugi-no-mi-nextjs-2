-- ============================================================================
-- Brot yanagi — お知らせ管理(営業時間変更・臨時休業・新商品・季節商品など)
-- 管理画面CRUD用 テーブルセットアップSQL
-- ============================================================================
-- supabase/admin-setup.sql を実行済み(admin_users テーブル・is_admin()関数が
-- 存在すること)が前提です。まだの場合は先にそちらを実行してください。
--
-- Supabase SQL Editorで、このファイルの内容をそのまま実行してください。
-- 冪等(何度実行しても安全)になるよう、IF NOT EXISTS / DROP POLICY IF EXISTS を
-- 使っています。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. announcements テーブル
-- ----------------------------------------------------------------------------
-- published_at / expires_at は timestamptz(タイムゾーン付き)。Supabase内部では
-- 常にUTCで保持される。アプリ側(lib/datetime.ts)が「日本時間の壁時計時刻」と
-- UTCのISO文字列を明示的なタイムゾーンオフセット(+09:00)付きで変換するため、
-- サーバーの実行タイムゾーン(ローカル/Vercel Preview/Production)に関わらず
-- 常に同じ時刻として保存・比較される。
--
-- expires_at はNULL許容(空欄=無期限公開)。
-- slugは現段階では追加しない(将来/news/[slug]が必要になった時点で検討)。

create table if not exists public.announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null,
  published_at  timestamptz not null default now(),
  expires_at    timestamptz,
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint announcements_expires_after_published
    check (expires_at is null or expires_at > published_at)
);

alter table public.announcements enable row level security;


-- ----------------------------------------------------------------------------
-- 2. announcements テーブル: 明示的な権限付与(anon/authenticated)
-- ----------------------------------------------------------------------------
-- products/site_photosと同様、デフォルトのスキーマ権限に暗黙的に依存せず、
-- 「どの操作をどのロールに許可するか」をここで明示する。実際の絞り込みは
-- RLSポリシー(3節)が行うが、テーブル権限とRLSの二重の防御とする。

revoke all on public.announcements from public, anon, authenticated;

grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;


-- ----------------------------------------------------------------------------
-- 3. announcements テーブル: 古いポリシーを削除(あれば)
-- ----------------------------------------------------------------------------

drop policy if exists "public can view published announcements" on public.announcements;
drop policy if exists "admins can read all announcements" on public.announcements;
drop policy if exists "admins can insert announcements" on public.announcements;
drop policy if exists "admins can update announcements" on public.announcements;
drop policy if exists "admins can delete announcements" on public.announcements;


-- ----------------------------------------------------------------------------
-- 4. announcements テーブル: 新しいRLSポリシー
-- ----------------------------------------------------------------------------

-- 4-1. 一般ユーザー・未ログインユーザー(anon含む): 公開条件を満たすお知らせのみ閲覧可能
--      公開条件: is_published = true かつ published_at <= 現在時刻 かつ
--      (expires_at が NULL、または 現在時刻 < expires_at)
--      ※ アプリ側(lib/announcements.ts)の取得クエリでも同じ条件を明示的に
--        指定しており(二重防御)、この2箇所とアプリ側の状態判定
--        (lib/admin/announcement-status.ts の computeAnnouncementStatus)は
--        すべて同じ3条件を基準にしている。
create policy "public can view published announcements"
  on public.announcements
  for select
  to public
  using (
    is_published = true
    and published_at <= now()
    and (expires_at is null or now() < expires_at)
  );

-- 4-2. 管理者: 非公開・公開予定・期限切れも含め全件閲覧可能(管理画面の一覧用)
create policy "admins can read all announcements"
  on public.announcements
  for select
  to authenticated
  using (public.is_admin());

-- 4-3. 管理者のみ、お知らせを追加できる
create policy "admins can insert announcements"
  on public.announcements
  for insert
  to authenticated
  with check (public.is_admin());

-- 4-4. 管理者のみ、お知らせを更新できる
create policy "admins can update announcements"
  on public.announcements
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 4-5. 管理者のみ、お知らせを削除できる
create policy "admins can delete announcements"
  on public.announcements
  for delete
  to authenticated
  using (public.is_admin());


-- ----------------------------------------------------------------------------
-- 5. 動作確認用クエリ(実行は任意)
-- ----------------------------------------------------------------------------
-- RLSが有効になっているか確認:
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'announcements';
--
-- テーブル権限を確認:
--   select grantee, privilege_type from information_schema.table_privileges
--   where table_name = 'announcements';
--
-- ポリシー一覧を確認:
--   select policyname, cmd, roles from pg_policies where tablename = 'announcements';
--
-- 現在公開中のお知らせを確認:
--   select id, title, published_at, expires_at
--   from public.announcements
--   where is_published = true
--     and published_at <= now()
--     and (expires_at is null or now() < expires_at)
--   order by published_at desc;
-- ============================================================================


-- ============================================================================
-- ロールバック(元に戻す)SQL — このファイルの内容をすべて取り消す
-- ============================================================================
-- 実行は慎重に。お知らせデータごと削除されます。
--
-- drop policy if exists "public can view published announcements" on public.announcements;
-- drop policy if exists "admins can read all announcements" on public.announcements;
-- drop policy if exists "admins can insert announcements" on public.announcements;
-- drop policy if exists "admins can update announcements" on public.announcements;
-- drop policy if exists "admins can delete announcements" on public.announcements;
-- revoke all on public.announcements from anon, authenticated;
-- drop table if exists public.announcements;
-- ============================================================================
