-- ============================================================================
-- Instagram長期アクセストークン 自動更新用セットアップSQL
-- ============================================================================
-- Supabase SQL Editorで、このファイルの内容をそのまま実行してください。
-- 既に一部が実行済みでも安全なように、可能な箇所は IF NOT EXISTS を
-- 使っています(何度実行しても安全です)。
--
-- 【このテーブルの役割】
-- Instagram Graph APIの長期アクセストークン(有効期間 約60日)を保存し、
-- Vercel Cron(app/api/cron/refresh-instagram-token/route.ts)が
-- 約30日ごとに自動更新した最新のトークンをここへ書き込みます。
-- 通常の投稿取得処理(lib/instagram/)は、このテーブルに保存された
-- 最新トークンを読みに来ます。
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. instagram_credentials テーブル
-- ----------------------------------------------------------------------------
-- レコードは常に1件のみとする(id列を1に固定するCHECK制約でこれを強制する。
-- 「singleton table」と呼ばれる一般的なパターンです)。

create table if not exists public.instagram_credentials (
  id                integer primary key default 1,
  access_token      text not null,
  expires_at        timestamptz not null,
  last_refreshed_at timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint instagram_credentials_singleton check (id = 1)
);


-- ----------------------------------------------------------------------------
-- 2. RLSを有効化する(ポリシーは意図的に1つも作成しない)
-- ----------------------------------------------------------------------------
-- 【なぜpublicスキーマのままでよいのか】
-- このテーブルにはanon/authenticatedロールからアクセスできる経路
-- (RPC関数やPostgRESTの公開エンドポイント)を一切用意していません。
-- 呼び出すのはservice_roleキーを使うサーバー専用コードのみです。
-- ポリシー0件+RLS有効により、anon/authenticatedを含む全ロールからの
-- SELECT/INSERT/UPDATE/DELETEがデフォルトで拒否されるため、
-- public スキーマのままでも実害はありません。
--
-- 【なぜFORCE ROW LEVEL SECURITYを設定しないのか】
-- service_role(Supabaseが標準で BYPASSRLS 属性を付与しているロール)は、
-- FORCE ROW LEVEL SECURITYの有無に関わらず常にRLSをバイパスするため、
-- FORCEを設定してもservice_role側の動作は変わりません。一方で、
-- admin-setup.sql の admin_users と同様の理由により、SQL Editor上で
-- postgresロールとして手動復旧作業(トークンの目視確認や緊急更新)を行う際に
-- 余計な制約を課さないよう、あえてFORCEは設定していません。

alter table public.instagram_credentials enable row level security;


-- ----------------------------------------------------------------------------
-- 3. テーブルへの直接権限を明示的に剥奪する(多層防御)
-- ----------------------------------------------------------------------------
-- 【なぜanon/authenticatedへテーブル権限を一切与えないのか】
-- access_token はInstagramアカウントの投稿取得に使える機密情報です。
-- RLS(2)だけでも全ロールからのアクセスは拒否されますが、
-- 「RLSの設定ミスがあっても二重に防げる」ようにするための保険として、
-- テーブルへのGRANT自体も明示的にゼロにしています。
--
-- このテーブルへの読み書きは、SUPABASE_SERVICE_ROLE_KEYを使った
-- サーバー専用コード(lib/instagram/token-store.ts)経由のみに限定されます。
-- service_roleキーは絶対にブラウザや公開リポジトリに含めないでください。

revoke all on public.instagram_credentials from public, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 4. 動作確認用クエリ(実行は任意)
-- ----------------------------------------------------------------------------
-- RLSが有効になっているか確認:
--   select relrowsecurity, relforcerowsecurity from pg_class
--   where relname = 'instagram_credentials';
--   -- relforcerowsecurity は false のままであるべきです(意図的)。
--
-- テーブルへの直接権限が誰にも無いことを確認:
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_name = 'instagram_credentials';
--   -- 何も返らなければ正常です。
--
-- 現在保存されているトークンの有効期限だけを確認したい場合
-- (トークンの値そのものは意図的に表示していません):
--   select expires_at, last_refreshed_at, updated_at
--   from public.instagram_credentials
--   where id = 1;
-- ============================================================================
