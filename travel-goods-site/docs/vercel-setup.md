# Vercel Preview 確認手順

> この文書は移行期間中のPreview確認用です。本番はCloudflare Pagesを使用します。
> 新しい公開手順は `docs/cloudflare-pages-setup.md` を参照してください。

Cloudflare の独自ドメインで本番確認が成功するまで、既存の Vercel プロジェクトは
Preview確認用として残す。Vercelでの新規本番公開や独自ドメインの設定は行わない。

## 1. 既存Previewの設定を確認する

Vercel の旅行用品サイトプロジェクトで、Root Directory が `travel-goods-site` であることを
確認する。Preview環境では次だけを設定する。

| 変数 | 値 | 意味 |
|---|---|---|
| `SITE_MODE` | `preview` | 全ページ noindex。robots.txt も全面 Disallow |
| `CATALOG_DATASET` | `production` | 実商品データを表示する |
| `SITE_NAME` | `旅モノ比較` | 正式名称を表示する |

`SITE_URL`、公開用運営者情報、GA4、Amazon、楽天API資格情報は設定しない。
既存のPreviewへ実際のキーを追加せず、取得ジョブの資格情報はGitHub Actions側で管理する。

## 2. Previewを確認する

- [ ] ビルドが成功する
- [ ] トップページが表示され、上部に「未公開プレビューです」と出る
- [ ] `/robots.txt` が `Disallow: /` になっている
- [ ] `/sitemap.xml` のURL数が0である
- [ ] `SITE_URL`、公開用運営者情報、デモ文言、資格情報が配信されていない

404が出る場合は、Root Directory が `travel-goods-site` か確認する。
静的出力を確認する必要がある場合は、ビルド出力が `out` であることを確認する。

## 3. Cloudflare切替後に停止する

Cloudflareの独自ドメインで、canonical、robots、sitemap、照合済み楽天CTA、公開用運営者情報を
確認してから、Vercel旅行用品サイトプロジェクトのGit連携を停止する。これは未実施の手順である。
Vercelの旅行用品サイトプロジェクトで **Project → Settings → Git → Connected Git Repository →
Disconnect** を選び、確認画面で切断する。
問題が起きてもDNSをVercelへ戻さず、Cloudflare Pagesの直前の成功デプロイへRollbackする。
