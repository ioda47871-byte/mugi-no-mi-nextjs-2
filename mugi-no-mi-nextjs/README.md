# 麦の実 -Mugi no Mi- Boulangerie — Webサイト

Next.js (App Router) + TypeScript + Tailwind CSS で構築した、高級ベーカリーの公式サイトです。
最初の公開版は **Home / Menu / Access** を中心とした実用構成にしています。
About / Gallery / Contact はルートと基本レイアウトのみ用意しており、内容は今後拡張していきます。

---

## 1. セットアップ手順

Node.js 18.18 以降を推奨します。

```bash
# 依存パッケージのインストール
npm install

# 環境変数ファイルを作成(本番ドメインが決まったら書き換える)
cp .env.example .env.local
```

### Supabaseの設定(商品データ)

商品データ(`products`)はSupabaseから取得します。`NEXT_PUBLIC_SUPABASE_URL` と
`NEXT_PUBLIC_SUPABASE_ANON_KEY` を `.env.local` に設定していない場合は、自動的に
`data/products.json` にフォールバックするため、Supabase未設定でも `npm run dev` は動作します。

`lib/products.ts` は以下のテーブル定義を前提にしています。実際のカラム名が異なる場合は、
`lib/products.ts` 内の `mapRow()` の対応関係だけを書き換えてください(呼び出し側のコンポーネントは変更不要です)。

```sql
create table products (
  id            uuid primary key default gen_random_uuid(),
  category_id   text not null,       -- 'bread' | 'pastry' | 'savory' | 'gift'
  name          text not null,
  price         integer not null,
  description   text not null,
  image         text not null,       -- 画像URL(Supabase Storageの公開URL等)
  tag           text,                -- '定番' | '人気' | '数量限定' | null (季節限定はtagではなくis_seasonalで管理)
  is_popular    boolean not null default false,
  is_active     boolean not null default true,
  is_sold_out   boolean not null default false,
  is_seasonal   boolean not null default false,
  display_order integer not null default 0,
  created_at    timestamptz not null default now()
);
```

RLS・管理者権限・Storageの完全なセットアップSQLは、以下の3ファイルに分かれています(この順番で実行してください)。

1. `supabase/admin-setup.sql` — `admin_users`テーブル・`is_admin()`関数・productsのRLSポリシー
2. `supabase/migrate-add-is-seasonal.sql` — `is_seasonal`列の追加・既存データの移行
3. `supabase/storage-setup.sql` — 商品画像アップロード用Storageバケット・ポリシー

各ファイルの詳細は「7. 管理画面(/admin)のセットアップ」「8. 商品画像のアップロード機能」を参照してください。

`relation "products" already exists` と表示される場合は、既にテーブルが作成済みという意味です。
上記のカラム定義と一致しているかだけご確認ください。列名が違う場合は `lib/products.ts` の
`mapRow()` を実際のカラム名に合わせて調整してください。

カテゴリーのラベル(表示名)は変更頻度が低いため、`lib/products.ts` 内の `CATEGORY_LABELS`
としてコードで管理しています。カテゴリーもSupabaseで管理したい場合は、同様に
`categories` テーブルを作成し、`CATEGORY_LABELS` の読み込み元を差し替えてください。

**データの反映タイミング(ISR)**: HomeとMenuページには `export const revalidate = 60` を設定しています。
Supabase上で商品を追加・削除・価格変更しても、再デプロイなしで**最大60秒以内**にサイトへ反映されます。
即時反映させたい場合は、Supabaseのwebhook等から `revalidatePath('/menu')` を呼ぶ仕組みを後日追加してください。

**商品が0件の場合**: Supabaseの `products` テーブルにまだ行が無い場合でも、Home・Menuページは
エラーにならず「準備中です」という案内文を表示します(空の状態でも壊れて見えないようにする配慮です)。

## 2. 起動方法(開発)

```bash
npm run dev
```

`http://localhost:3000` を開いて確認してください。

- PC幅・タブレット幅・スマートフォン幅は、ブラウザの開発者ツール(デバイスツールバー)で
  それぞれ確認できます。特にモバイル固定アクションバー(電話・地図・Instagram)は、
  スマートフォン幅かつHeroセクションを過ぎたスクロール位置で表示されるかをご確認ください。

## 3. ビルド・公開手順

```bash
npm run build
npm run start   # ローカルで本番ビルドを確認する場合
```

`npm run build` を実行すると、**ビルド前に自動で仮データチェックスクリプトが走り**、
未差し替えの `isPlaceholder: true` 項目が一覧表示されます(ビルド自体は止まりません)。
公開直前には、必ずこの一覧がすべて解消されているか確認してください。

```bash
# 一覧だけを確認したい場合
npm run check:placeholders

# CI等で「仮データが残っていたらビルドを失敗させたい」場合
npm run check:placeholders:strict
```

### Vercelで公開する場合

1. GitHubリポジトリにpushする
2. [vercel.com](https://vercel.com) でリポジトリをImport
3. Environment Variablesに `NEXT_PUBLIC_SITE_URL`・`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定
4. Deploy

### Cloudflare Pagesで公開する場合

1. GitHubリポジトリを接続
2. ビルドコマンド: `npm run build`
3. ビルド出力ディレクトリ: `.next`(`@cloudflare/next-on-pages` の利用を推奨)
4. 環境変数に `NEXT_PUBLIC_SITE_URL`・`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY` を設定

---

## 4. 仮データ差し替え箇所 一覧

本番公開前に、以下をすべて実データへ差し替えてください。
より詳しい収集項目は `実店舗情報チェックリスト.md`(静的プレビュー段階で作成済み)を参照してください。

| ファイル | 内容 |
|---|---|
| `lib/placeholder-content.ts` | 店名・キャッチコピー・Heroコピー・店主情報・住所・電話・営業時間・定休日・駐車場・地図URL・Instagram・お問い合わせ送信先 |
| `data/products.json` | Supabase未設定時のフォールバック商品データ(人気商品・Menu全カテゴリー・商品名・価格・説明文・商品写真) |
| Supabase `products` テーブル | 本番の商品データ本体。追加・削除・価格変更はテーブルの行を編集するだけで反映されます |
| `data/instagram-posts.json` | Aboutページの「最新投稿一覧」仮データ(本番はInstagram Graph APIに差し替え。`lib/instagram.ts`参照) |
| `components/sections/Hero.tsx` | `HERO_IMAGE`(ファーストビュー写真) |
| `components/sections/VisitUs.tsx` | `VISIT_IMAGE`(Visit Us用の店舗写真) |
| `components/sections/InstagramGrid.tsx` | `images` 配列(投稿写真4点) |
| `app/access/page.tsx` | 店舗写真(外観・内観) |
| `public/images/` | 上記すべての実写真の保存先(詳細は `public/images/README.md`) |

**確認の仕組み**: `lib/placeholder-content.ts` と `lib/products.ts` の各項目は
`{ value, isPlaceholder }` という型で管理されています。実データに差し替えたら
`isPlaceholder: false` に変更してください。`npm run build` のたびに、まだ
`true` のままの項目が一覧表示されるため、差し替え漏れに気づけます。

### 特に確認必須の項目(重要度高)

- [ ] 電話番号(`phone` / `phoneHref`) — ヘッダー外・Visit Us・Access・モバイルアクションバーの4箇所で使用
- [ ] 住所(`address`)
- [ ] 営業時間・定休日(`hours` / `closedDay`)
- [ ] Googleマップ埋め込みURL(`mapEmbedUrl`)
- [ ] Instagramアカウント(`instagramHandle` / `instagramUrl`)
- [ ] 店主名・経歴(`founderName` / `founderQuote`)
- [ ] 商品名・価格(`lib/products.ts` 全項目)
- [ ] 全写真(Pexelsのフリー素材から実店舗写真へ)

---

## 5. ディレクトリ構成

```
app/                Next.js App Router のページ・レイアウト・metadata
components/layout/  Header・Footer・MobileActionBar
components/ui/      Button・SectionHeading・PhotoFrame・ProductCard・RevealOnScrollなど共通部品
components/sections/ Hero・MenuSection・MenuBrowser・InstagramFeedなど、ページを構成するセクション
lib/                 仮データ(型付き)・商品データ層・Instagramデータ層・サイト設定
lib/supabase/        Supabaseクライアント
data/                 JSONフォールバックデータ(products.json / instagram-posts.json)
scripts/             ビルド時の仮データチェックスクリプト
public/images/       本番写真の格納先
```

## 6. 第二段階(未実装・今後の拡張)

以下は今回のスコープ外として分離しています。必要になったタイミングで実装してください。

- パンの取り置き予約機能
- 営業日カレンダー(臨時休業のお知らせ含む)
- お知らせ・ブログ更新機能
- Instagram Graph APIとの実接続
- 管理者アカウントの追加・削除UI(現状はSQLで直接操作)
- お問い合わせフォームの実送信処理(メールAPI連携)
- About / Gallery ページの本格的なコンテンツ実装

---

## 6b. Home / Menu 構成変更・カテゴリー再編(2026-07)

デザイン・導線の見直しにより、以下を変更しました。

**Homeページ**: 「今日、選ばれている3つ」(人気商品3枚のカード紹介)セクションを削除し、
Hero(ファーストビュー)の直後に、Menuページと同じ内容(見出し「Menu」+絞り込み
フィルター+商品カード一覧)をそのまま埋め込む構成に変更しました
(`components/sections/MenuSection.tsx` を Home / Menu 両方で共有)。

**カテゴリー再編**: 「パストリー」「ギフト・季節限定」カテゴリーを廃止し、
「食パン」「惣菜パン」「菓子パン」「食事パン」の4カテゴリーに整理しました。
クロワッサン等(旧パストリー)は「食事パン」に統一しています。
「季節限定」はカテゴリーではなく `is_seasonal` フラグのままですが、Menuの
絞り込みフィルターとしてはカテゴリーと横断的に選べる特別枠として表示されます
(フィルター: すべて / 食パン / 惣菜パン / 菓子パン / 食事パン / 季節限定)。

既存のSupabaseデータがある場合は、以下の2ファイルを**この順番で**実行してカテゴリーIDを
新体系に置き換えてください。1ファイルにまとめず分割しているのは、フォールバック処理
(判定できなかった商品を一律「食パン」にする操作)を、内容を確認してから実行できるようにするためです。

1. `supabase/migrate-category-restructure-preview.sql` — 商品名から自動判定できる範囲だけを移行し、
   判定できなかった商品を一覧表示します(このファイル単体では、判定できない商品のカテゴリーは変更されません)
2. 1.の結果を確認する(実際には「食事パン」であるべき商品が含まれていないか目視確認)
3. `supabase/migrate-category-restructure-finalize.sql` — 残りの商品を「食パン」に確定し、
   移行後の件数・旧カテゴリーIDの残存有無を確認します

特に旧「食パン・食事パン」カテゴリー(`bread`)は機械的に完全分割できないため、
finalize実行後に対象商品を管理画面から手動で「食事パン」に振り分け直す作業が必要になる場合があります。

**削除したコンポーネント**: `components/sections/PopularProducts.tsx`、
`components/sections/MenuTabs.tsx`(いずれも新しい `MenuSection` / `MenuBrowser` /
`components/ui/ProductCard.tsx` に統合)。

---

## 7. 管理画面(/admin)のセットアップ

商品の追加・編集・削除・並び替え・売り切れ設定をブラウザから行える管理画面です。
ログインできる人全員が管理者になるのではなく、`admin_users` テーブルに登録された
ユーザーだけが商品を編集できます(RLSで強制)。

### 7-1. 必要なnpmパッケージ

`@supabase/ssr` を追加しています。既存プロジェクトに反映する場合は再インストールしてください。

```bash
npm install
```

### 7-2. SQLの実行

`supabase/admin-setup.sql` の内容を、SupabaseダッシュボードのSQL Editorでそのまま実行してください。
実行内容:

1. `admin_users` テーブルの作成(既存なら何もしない)
2. `products` テーブルのRLSを有効化
3. 古いポリシーの削除(あれば)
4. 新しいRLSポリシーの作成
   - 一般公開: `is_active = true` の商品のみSELECT可
   - `admin_users` に登録済みのログインユーザー: SELECT/INSERT/UPDATE/DELETEすべて可
5. `products.id` にUUID自動採番のデフォルト値を設定

### 7-2b. is_seasonal列の追加(重要)

続けて `supabase/migrate-add-is-seasonal.sql` を実行してください。「季節限定」を
`tag`列の値で代用する設計は、`tag`が単一選択のため他のタグ(定番・人気・数量限定)と
共存できず実運用で問題が出るため、専用の `is_seasonal boolean` 列に分離しています。

実行内容:

1. `products` テーブルに `is_seasonal boolean not null default false` を追加(既存データは壊さない)
2. これまで `tag = '季節限定'` だった行を `is_seasonal = true` に移行
3. `tag`列を自動でnullにするかどうかは、SQLファイル内で選択肢A(何もしない・推奨)/
   選択肢B(移行対象のみnullにする)として提案のみ記載しており、自動実行はしていません。
   運用方針に応じてご判断ください(詳細はSQLファイル内のコメントを参照)

このファイルを実行した後、`supabase/storage-setup.sql`(次の「8. 商品画像の
アップロード機能」)を実行してください。

### 7-3. 最初の管理者を登録する

1. Supabase Dashboard → **Authentication** → **Users** → **Add user** で、
   スタッフ用のメールアドレスとパスワードでユーザーを1人作成する
2. 作成したユーザーの **User UID**(UUID)をコピーする
3. SQL Editorで以下を実行する

   ```sql
   insert into public.admin_users (user_id)
   values ('コピーしたUUID');
   ```

4. 複数人を管理者にしたい場合は、同様に行を追加する

### 7-4. ローカルでの確認手順

```bash
npm install
npm run dev
```

1. `http://localhost:3000/admin` にアクセス → 未ログインなら `/admin/login` にリダイレクトされることを確認
2. 手順7-3で作成したメールアドレス・パスワードでログイン
3. 商品一覧が表示されることを確認
4. 「+ 商品を追加」から1件登録 → 一覧に反映されることを確認
5. 編集ボタンから内容を変更 → 保存後に一覧へ反映されることを確認
6. 「売り切れにする」をONにして保存 → `/menu` ページでSOLD OUT表示(画像が暗くなり、バッジが出る)になることを確認。商品自体は非表示にならないことも確認
7. 「公開する」をOFFにして保存 → `/` と `/menu` から商品が消えることを確認(管理画面には引き続き表示される)
8. 削除ボタン → 確認ダイアログが出ることを確認 → 削除後に一覧から消えることを確認
9. ログアウトボタンを押す → `/admin/login` に戻り、`/admin` に直接アクセスすると再度ログインを求められることを確認
10. admin_usersに登録**していない**ユーザーでログインしようとした場合、ログインはできるがすぐにサインアウトされ、「アクセス権がありません」と表示されることを確認(任意で別ユーザーを作成してテスト)

### 7-5. テスト項目まとめ

| # | 項目 | 期待結果 |
|---|---|---|
| 1 | 未ログインで `/admin` へアクセス | `/admin/login` にリダイレクト |
| 2 | 正しいID/PWでログイン | `/admin` の商品一覧が表示される |
| 3 | 誤ったID/PWでログイン | エラーメッセージが表示され、ログインできない |
| 4 | admin_users未登録のユーザーでログイン | 自動的にサインアウトされ、アクセス権エラーが表示される |
| 5 | 商品追加(全項目入力) | 一覧に反映され、Home/Menuにも反映される(公開設定の場合) |
| 6 | 商品追加(必須項目を空欄) | 保存されず、該当欄にエラーメッセージが表示される |
| 7 | 価格に負の数・小数を入力 | エラーメッセージが表示され保存されない |
| 8 | 商品編集 | 変更内容が一覧・公開ページに反映される |
| 9 | 売り切れON | 公開Menuページで画像が暗くなり「SOLD OUT」表示。非表示にはならない |
| 9b | 季節限定ON(一覧のワンクリック切替、または編集フォーム) | 公開Home/Menuページで「季節限定」バッジが表示される。タグ(定番/人気/数量限定)はそのまま残る |
| 10 | 公開OFF | Home/Menuから消えるが、管理画面には残る |
| 11 | 削除 | 確認ダイアログ→削除→一覧・公開ページから消える |
| 12 | ログアウト | `/admin/login` に戻り、以後 `/admin` は再ログインを要求される |
| 13 | スマートフォン幅での操作 | ボタン・入力欄が指で押しやすいサイズ(44px以上)になっている |
| 14 | 管理画面ヘッダー(PC・スマホ両方) | メールアドレスは表示されず、ユーザーアイコン+ログアウトボタンのみ。折り返し・崩れが起きない |

### 7-6. 既知の制限(今回のスコープ外)

- **画像アップロード**: 実装済みです。詳細は「8. 商品画像のアップロード機能(Supabase Storage)」を参照してください。
- **Instagram Graph API連携は未実装**(Aboutページの投稿一覧は引き続き仮データです)
- **パンの取り置き予約・営業日カレンダーは未実装**
- **管理者の追加・削除は管理画面からできません**(SQL Editorから `admin_users` テーブルを直接操作する運用です)。管理者管理UIが必要な場合は次フェーズで検討してください
- **パスワードリセット画面は未実装**です。忘れた場合はSupabase DashboardのAuthentication画面から手動でパスワードを再設定してください
- カテゴリー(`bread`/`pastry`/`savory`/`gift`)は現状コード側の固定値です。カテゴリーを増減したい場合は `lib/admin/validation.ts` の `CATEGORY_OPTIONS` と `lib/products.ts` の `CATEGORY_LABELS` の両方を変更してください

---

## 8. 商品画像のアップロード機能(Supabase Storage)

商品画像は、管理画面(`/admin/products/new`・`/admin/products/[id]/edit`)から直接アップロードできます。
Supabaseを開いてURLをコピーする必要はありません。

### 8-1. Storageバケットの作成方法

`supabase/storage-setup.sql` の内容を、SupabaseダッシュボードのSQL Editorでそのまま実行してください
(`supabase/admin-setup.sql` を先に実行し、`admin_users` テーブルと `is_admin()` 関数が存在している必要があります)。

実行内容:

1. `products-images` という名前のバケットを作成(既にあれば何もしない)
2. バケットを **公開(public)** に設定
3. `storage.objects` への読み取り・書き込みポリシーを作成

SQLを使わず、Dashboardから手動でバケットを作る場合は以下の設定にしてください。

- Storage → **New bucket**
- Name: `products-images`
- **Public bucket** をON

その場合も、ポリシー部分(3.以降)は `supabase/storage-setup.sql` を実行して作成してください
(Dashboard UIだけでは管理者限定のアップロード制限までは設定できないためです)。

### 8-2. 公開設定について

「公開(public)バケット」にすると、そのバケット内のファイルは誰でもURLを知っていれば閲覧できます
(閲覧に関しては認証不要)。これは商品写真を公開サイトに表示するためには必要な設定です。

一方で、**アップロード・更新・削除は公開されません**。`supabase/storage-setup.sql` のポリシーにより、
`admin_users` に登録された管理者のログインユーザーだけが書き込みできるように制限しています。

### 8-3. Storageポリシー(SQL)

`supabase/storage-setup.sql` に完全版があります。要点は以下の通りです。

| 操作 | 許可されるロール | 条件 |
|---|---|---|
| SELECT(閲覧) | `public`(全員) | `bucket_id = 'products-images'` |
| INSERT(アップロード) | `authenticated`かつ`is_admin()=true` | `bucket_id = 'products-images'` |
| UPDATE(上書き) | `authenticated`かつ`is_admin()=true` | `bucket_id = 'products-images'` |
| DELETE(削除) | `authenticated`かつ`is_admin()=true` | `bucket_id = 'products-images'` |

`is_admin()` は `supabase/admin-setup.sql` で作成したSECURITY DEFINER関数と同じものを再利用しています。
管理者判定のロジックが1箇所(DB関数)に集約されているため、判定基準がProducts本体のRLSとズレることがありません。

### 8-4. 画像ファイルの保存形式

- 保存先パス: `products/{ランダムなUUID}.{拡張子}`(例: `products/3f2a1c9e-....jpg`)
- 許可する拡張子/形式: `jpg` / `jpeg` / `png` / `webp`
- 最大サイズ: 5MB
- 検証はブラウザ側(アップロード前)で行われ、条件を満たさない場合はアップロードされず、
  フォーム上にエラーメッセージが表示されます

### 8-5. 動作確認方法

```bash
npm run dev
```

1. `/admin/products/new` を開く
2. 「画像を選択」ボタンから、5MB以下のjpg/png/webp画像を選ぶ
3. 「アップロード中…」の表示に切り替わり、完了後にプレビュー画像が表示されることを確認
4. 対応していない形式(gifなど)や5MBを超えるファイルを選ぶとエラーメッセージが出て、アップロードされないことを確認
5. 商品名などの必須項目を入力し、「追加する」で保存
6. `/menu` ページで、アップロードした画像が表示されることを確認
7. 編集画面(`/admin/products/[id]/edit`)を開き、「画像を差し替える」から別の画像に変更できることを確認
8. Supabase Dashboard → Storage → `products-images` → `products/` フォルダに、アップロードしたファイルが実際に保存されていることを確認

### 8-6. トラブルシューティング

| 症状 | 想定される原因 | 対処 |
|---|---|---|
| 「アップロードに失敗しました」と表示される | `supabase/storage-setup.sql` が未実行、またはログインユーザーが `admin_users` に未登録 | SQLを実行したか確認し、`admin_users` にUUIDが登録されているか確認する |
| アップロードは成功するが、公開ページ(`/menu`など)で画像が表示されない | `next.config.mjs` の `images.remotePatterns` にSupabaseのホストが追加されていない | `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` が正しく設定されているか確認する(`next.config.mjs` はこの値からホスト名を自動導出しています)。設定後は開発サーバーの再起動が必要です |
| プレビュー画像は表示されるが保存できない(「画像URLを入力してください」エラー) | アップロードが完了する前にフォームを送信した | アップロード完了(プレビュー表示)を待ってから保存してください |
| Storageのバケットが見つからないというエラーが出る | バケット名の typo、または `storage-setup.sql` 未実行 | バケット名が `products-images` になっているか、SQL Editorでバケット一覧を確認する: `select id, public from storage.buckets;` |
| 管理者なのにアップロードできない(403エラー) | ログインセッションが古い、または `admin_users` への登録直後でセッションが更新されていない | 一度ログアウトして再ログインする |
| 同じ画像を選び直しても反応しない | ブラウザのファイル選択の仕様上、同一ファイルの再選択イベントが発火しないことがある | 実装では選択後に毎回inputの値をリセットしているため通常は発生しませんが、再現する場合はページを再読み込みしてください |

## 9. Instagram連携(最新投稿の自動表示・トークン自動更新)

トップページ下部にInstagramの最新投稿6件を自動表示します。表示に使うアクセストークンは
Supabaseに保存され、Vercel Cronが約30日ごとに自動更新するため、手動でのトークン更新は
基本的に不要です。

### 9-1. 初回トークンの設定方法

1. Meta for Developersで、投稿を取得したいInstagram Business/Creatorアカウントに対する
   **長期アクセストークン(Long-lived Access Token、有効期間 約60日)** を発行する
   (短期トークンをそのまま使うことはできません。短期トークンから長期トークンへの
   交換は、Instagram Graph APIの `access_token` エンドポイントで行います)。
2. 発行したトークンを `INSTAGRAM_INITIAL_ACCESS_TOKEN` として、対象アカウントの
   ユーザーIDを `INSTAGRAM_USER_ID` としてVercelの環境変数に設定する。
3. 初回アクセス時、Supabaseにまだトークンが保存されていなければ
   `INSTAGRAM_INITIAL_ACCESS_TOKEN` が使用され、可能であれば自動的に
   `instagram_credentials` テーブルへ保存されます。以後はSupabase側のトークンが
   正となり、`INSTAGRAM_INITIAL_ACCESS_TOKEN` は(次に空のSupabaseへ再セットアップ
   する場合を除き)参照されなくなります。

### 9-2. Supabaseマイグレーションの適用方法

`supabase/instagram-credentials-setup.sql` の内容を、SupabaseダッシュボードのSQL Editorで
そのまま実行してください。実行内容:

1. `instagram_credentials` テーブルの作成(`id`列を1に固定するCHECK制約により、
   常に1件のみ保持する「singleton table」)
2. RLSの有効化(ポリシーは0件。anon/authenticatedからは一切アクセス不可)
3. テーブルへの直接権限を`public`/`anon`/`authenticated`から明示的に剥奪

このテーブルへの読み書きは、`SUPABASE_SERVICE_ROLE_KEY` を使うサーバー専用コード
(`lib/instagram/token-store.ts`)経由のみに限定されています。

### 9-3. Vercelに設定する環境変数一覧

| 変数名 | 公開範囲 | 用途 |
|---|---|---|
| `INSTAGRAM_USER_ID` | サーバー専用 | 投稿取得対象のInstagramユーザーID |
| `INSTAGRAM_INITIAL_ACCESS_TOKEN` | サーバー専用 | 初回のみ使用する初期長期アクセストークン |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー専用 | Supabaseのservice_roleキー(RLSを完全にバイパスするため取り扱い注意) |
| `CRON_SECRET` | サーバー専用 | Vercel Cronエンドポイントの保護用秘密値 |

いずれも `NEXT_PUBLIC_` を付けず、ブラウザには一切公開されません。

### 9-4. Cronの仕組み

`vercel.json` の `crons` 設定により、Vercelが `/api/cron/refresh-instagram-token`
(`app/api/cron/refresh-instagram-token/route.ts`)を **毎月1日 0:00 UTC** に自動的に
呼び出します(cron式は「30日ごと」を厳密には表現できないため、実運用上ほぼ同等な
「毎月1日」を採用しています。トークンは発行から24時間以内は更新できない仕様のため、
毎日実行する必要はありません)。

Vercelは、プロジェクトに `CRON_SECRET` が設定されている場合、Cronからのリクエストへ
自動的に `Authorization: Bearer {CRON_SECRET}` ヘッダーを付与します。ルート側では
このヘッダーを検証し、一致しない場合は401を返します。

処理の流れ:

1. Supabaseに保存済みのトークン(無ければ`INSTAGRAM_INITIAL_ACCESS_TOKEN`)を取得
2. Instagram公式の `GET https://graph.instagram.com/refresh_access_token
   ?grant_type=ig_refresh_token&access_token=...` を呼び出す
3. 新しい `access_token` / `expires_at` / `last_refreshed_at` / `updated_at` を
   Supabaseへ保存
4. 投稿一覧のキャッシュ(約1時間)を即時に無効化し、次回アクセス時に新しいトークンで
   再取得されるようにする

レスポンス・ログのいずれにも、アクセストークンの値そのものは一切含まれません
(成功時は `success` / `refreshedAt` / `expiresAt` のみを返します)。

### 9-5. 自動更新に失敗した場合の手動復旧方法

1. Vercelの当該Cron実行のログを確認し、`no_token_to_refresh` / `save_failed` /
   `refresh_failed` のいずれのエラーかを確認する
2. Instagram側でトークンが無効化されている場合(後述9-6)は、9-1の手順で
   長期アクセストークンを再発行し、Supabase SQL Editorから直接
   `instagram_credentials` テーブルを更新する:
   ```sql
   update public.instagram_credentials
   set access_token = '再発行したトークン',
       expires_at = now() + interval '60 days',
       last_refreshed_at = now(),
       updated_at = now()
   where id = 1;
   ```
3. Supabase自体に問題がある場合は、`INSTAGRAM_INITIAL_ACCESS_TOKEN` を新しいトークンに
   更新した上で `instagram_credentials` の行を削除すれば、次回アクセス時に
   初期トークンが再登録されます
4. 復旧までの間、サイトは技術的なエラーを表示せず、「最新情報はInstagramをご覧
   ください。」という案内とボタンのみを表示し続けます(9-6も参照)

### 9-6. 運用上の注意点

- 長期アクセストークン・初期トークンのいずれも**永久に有効ではありません**。
  Cronによる自動更新は「有効なトークンを、期限が切れる前に新しいトークンへ
  差し替え続ける」仕組みであり、トークンそのものが失効しないことを保証するものでは
  ありません。
- Instagram側でパスワードを変更した場合、連携アプリの権限を取り消した場合、
  Meta for Developers側のアプリ設定を変更・削除した場合などは、既存のトークンが
  即座に無効化され、Cronでのリフレッシュも失敗します。この場合は9-1の手順で
  改めて認証・トークン発行をやり直す必要があります。
- 上記いずれの場合も、サイトの他の機能(商品一覧・お問い合わせ・管理画面など)には
  一切影響しません。Instagramセクションのみがフォールバック表示に切り替わります。


