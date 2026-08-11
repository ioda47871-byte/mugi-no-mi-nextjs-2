-- ============================================================================
-- Brot yanagi — site_photos に kitchen スロットを追加するマイグレーション
-- ============================================================================
-- About「OUR KITCHEN」セクションとGalleryの両方で共通利用する厨房写真用の
-- スロットを追加する。既存7スロット(hero/exterior/entrance/interior/
-- showcase/goods-corner/display-accent)の運用・データには一切影響しない
-- (RLSポリシー・Storageバケットのポリシーはslotに関わらず汎用的な条件
-- (bucket_id = 'site-photos' 等)のため、変更不要)。
--
-- 事前条件: supabase/site-photos-setup.sql が実行済みであること。
-- Supabase SQL Editorで、このファイルの内容をそのまま実行してください。
-- 冪等(何度実行しても安全)です。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. slotのCHECK制約に 'kitchen' を追加
-- ----------------------------------------------------------------------------
-- site_photos_slot_check は、site-photos-setup.sqlでslot列に付与した
-- 無名のCHECK制約に対してPostgresが自動採番した名前(規則:
-- {テーブル名}_{列名}_check)。既存の制約を一度削除し、'kitchen'を含めた
-- 同じ内容で作り直す(drop→addのため、既存行のslot値がすべて新しい
-- 許可リストに含まれている限り安全に再実行できる)。

alter table public.site_photos
  drop constraint if exists site_photos_slot_check;

alter table public.site_photos
  add constraint site_photos_slot_check
  check (slot in (
    'hero', 'exterior', 'entrance', 'interior',
    'showcase', 'goods-corner', 'display-accent', 'kitchen'
  ));


-- ----------------------------------------------------------------------------
-- 2. kitchen行をseedする(既存7行は一切変更しない)
-- ----------------------------------------------------------------------------

insert into public.site_photos (slot) values ('kitchen')
on conflict (slot) do nothing;


-- ----------------------------------------------------------------------------
-- 3. 動作確認用クエリ(実行は任意)
-- ----------------------------------------------------------------------------
-- 8スロット揃っているか確認:
--   select slot, image_url is not null as has_image, updated_at
--   from public.site_photos order by slot;
--
-- CHECK制約の内容を確認:
--   select conname, pg_get_constraintdef(oid) as definition
--   from pg_constraint
--   where conrelid = 'public.site_photos'::regclass and contype = 'c';
--
-- 既存7スロットの行が変更されていないことを確認
-- (image_url・updated_atが実行前後で変わっていないはず):
--   select slot, image_url, updated_at from public.site_photos
--   where slot != 'kitchen' order by slot;
-- ============================================================================


-- ============================================================================
-- ロールバック(元に戻す)SQL — kitchenスロットの追加のみを取り消す
-- ============================================================================
-- 実行は慎重に。kitchenの写真データ(image_url等)ごと削除されます。
-- 既存7スロットには影響しません。
--
-- delete from public.site_photos where slot = 'kitchen';
--
-- alter table public.site_photos drop constraint if exists site_photos_slot_check;
-- alter table public.site_photos add constraint site_photos_slot_check
--   check (slot in (
--     'hero', 'exterior', 'entrance', 'interior',
--     'showcase', 'goods-corner', 'display-accent'
--   ));
-- ============================================================================
