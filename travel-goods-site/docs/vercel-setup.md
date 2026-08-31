# Vercel プロジェクトの分離手順

1つのリポジトリに2サイトが入っているため、**Vercel プロジェクトも2つに分けます。**

| サイト | ディレクトリ | Vercel プロジェクト |
|---|---|---|
| パン屋（既存） | `mugi-no-mi-nextjs` | 既存のプロジェクト（変更不要） |
| 旅行用品比較（新規） | `travel-goods-site` | **これから作る** |

Vercel の操作は運営者が行ってください。Claude は Vercel にアクセスできません。

---

## 0. 先に決めること：本番ブランチをどうするか

**`main` にはまだ `travel-goods-site/` がありません。** そのまま Root Directory を
指定すると、本番ビルドが「ディレクトリが無い」で失敗します。

| 方法 | 内容 | 向いている場面 |
|---|---|---|
| **A. 先に main へマージする** | 作業ブランチを main に入れてから作る | そのまま進めるなら推奨 |
| **B. 本番ブランチを作業ブランチにする** | Vercel の Production Branch に `claude/phase-1-implementation-preview-82nryt` を指定 | main をまだ触りたくない場合 |

A を選んでも**パン屋には影響しません**。`mugi-no-mi-nextjs/vercel.json` の判定は
「本番（main）は必ずビルド」なので、これまでどおり動きます。

---

## 1. プロジェクトを作る

Vercel で **New Project** → このリポジトリ `ioda47871-byte/mugi-no-mi-nextjs-2` を選ぶ。

**同じリポジトリから2つ目のプロジェクトを作る形になります。** 既存のパン屋プロジェクトは
そのまま残してください。

### 設定する値

| 項目 | 値 |
|---|---|
| Project Name | 任意（例: `travel-goods-site`） |
| **Root Directory** | **`travel-goods-site`** ← 最重要 |
| Framework Preset | Next.js（自動検出されるはず） |
| Build Command | 既定のまま（`npm run build` が使われます） |
| Output Directory | **既定のまま。触らないでください** |
| Install Command | 既定のまま |
| Node.js Version | 20 以上（22 を推奨） |

`npm run build` は `validate:content` を実行してから `next build` します。
**データに不整合があるとビルドが止まります。** これは意図した動作です。

---

## 2. 環境変数を設定する

最初のデプロイは **プレビュー扱い**（全ページ noindex）にします。

| 変数 | 最初に入れる値 | 意味 |
|---|---|---|
| `SITE_MODE` | `preview` | 全ページ noindex。robots.txt も全面 Disallow |
| `CATALOG_DATASET` | `production` | **これを入れないとデモデータ（架空商品）が表示されます** |

`CATALOG_DATASET` を忘れると、実商品ではなくデモデータのサイトが出ます。
画面上部に「デモデータ表示中」と出るのですぐ分かります。

### 公開の準備が整ってから追加する

| 変数 | 例 | 備考 |
|---|---|---|
| `SITE_NAME` | 正式名称 | 未設定なら仮称「旅じたくガイド」 |
| `SITE_URL` | `https://例.com` | 末尾スラッシュなし。canonical と sitemap の基準 |
| `PUBLIC_OPERATOR_NAME` | 運営者名 | 未設定なら「準備中」と表示 |
| `PUBLIC_CONTACT_EMAIL` | 連絡先 | 同上 |
| `AMAZON_ASSOCIATE_TAG` | `yourname-22` | 空ならAmazonボタンは出力されません |
| `NEXT_PUBLIC_GA_ID` | `G-XXXXXXXXXX` | 空なら計測タグを出力しません |
| `SITE_MODE` | `production` | **最後に切り替える。`check:release` を通してから** |

**`RAKUTEN_APPLICATION_ID` などのAPIキーは Vercel に入れないでください。**
サイトの表示には使いません。取得ジョブ（GitHub Actions）側の Secrets に入れます。

---

## 3. デプロイして確認する

- [ ] ビルドが成功する
- [ ] トップページが表示される
- [ ] 上部に「未公開プレビューです」と出る（「デモデータ表示中」なら `CATALOG_DATASET` 未設定）
- [ ] `/categories/pouches/` に楽天ボタンが1つ出る
- [ ] `/robots.txt` が `Disallow: /` になっている
- [ ] `/sitemap.xml` が空（プレビューでは正しい）

404 が出る場合は、Root Directory が `travel-goods-site` になっているか確認してください。
それでも直らない場合のみ、Output Directory に `out` を指定してみてください
（`next.config.mjs` で `output: 'export'` を使っています）。

---

## 4. 相互に巻き込まないための仕組み

両方のディレクトリに `vercel.json` を置いてあります。

```
{ 本番なら必ずビルド } ;
{ 直近のコミットがこのディレクトリを変更していなければスキップ } ;
{ 判定できなければビルド（安全側） }
```

これにより:

| プッシュ内容 | パン屋 | 旅行サイト |
|---|---|---|
| 旅行サイトだけ変更 | スキップ | ビルド |
| パン屋だけ変更 | ビルド | スキップ |
| 本番ブランチ | ビルド | ビルド |

**注意**: プレビュー用ブランチに複数コミットをまとめてプッシュしたとき、
最後のコミットが対象ディレクトリを変更していないとスキップされます。
その場合は Vercel の画面から Redeploy してください。本番ブランチは常にビルドされます。

---

## 5. 料金について

**Vercel Hobby は個人・非商用向けと案内されています。**
アフィリエイトサイトの本番運用の前提にしないでください。

- プレビュー段階（`SITE_MODE=preview`・noindex・収益化なし）でどう扱われるかは、
  公開前に Vercel の現行の規約で確認してください。
- 商用利用が必要な場合は有料プランになります。**金額を確認してから加入してください。**
- **未承認の課金は行わないでください。** Claude が代わりに契約することはありません。

静的出力（`out/`）だけのサイトなので、Vercel 固有の機能に依存していません。
Cloudflare Pages、Netlify、GitHub Pages、レンタルサーバーへも移せます。
料金が見合わない場合は移行を検討してください。

---

## 6. 分離した後にやること

- [ ] パン屋プロジェクトのデプロイ一覧を見て、旅行サイトのコミットで増えていないことを確認
- [ ] 旅行サイトプロジェクトのデプロイ一覧を見て、パン屋のコミットで増えていないことを確認
- [ ] `docs/launch-checklist.md` に戻り、公開の準備を進める
