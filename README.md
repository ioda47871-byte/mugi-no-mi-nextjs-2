# mugi-no-mi-nextjs-2

このリポジトリには、**互いに独立した2つのサイト**が入っています。
依存関係・ビルド・デプロイ先を共有していません。

| ディレクトリ | サイト | 状態 |
|---|---|---|
| [`mugi-no-mi-nextjs/`](mugi-no-mi-nextjs/) | パン屋のサイト（既存） | 稼働中 |
| [`travel-goods-site/`](travel-goods-site/) | 旅行用品の比較サイト「旅モノ比較」 | 公開準備中。いまの主軸 |

## どちらを触るか

作業は必ずどちらかのディレクトリの中で行ってください。
`npm install` も `npm run` も、リポジトリのルートではなく各ディレクトリで実行します。

```bash
cd travel-goods-site && npm install && npm run dev    # 旅行用品サイト
cd mugi-no-mi-nextjs && npm install && npm run dev    # パン屋サイト
```

各ディレクトリの README に、そのサイトの構成・コマンド・設計方針があります。

## デプロイ先

パン屋サイトと旅行用品サイトのデプロイ先は分離しています。旅行用品サイト「旅モノ比較」の
公開手順は、[Cloudflare Pages 手順](travel-goods-site/docs/cloudflare-pages-setup.md)を参照してください。

既存Vercelプロジェクトは、Cloudflareへの切替が成功するまでPreview確認用として残します。
移行期間中の確認手順は[travel-goods-site/docs/vercel-setup.md](travel-goods-site/docs/vercel-setup.md)にあります。

## 共通の CI

`.github/workflows/` にあるワークフローは、いずれもパスで対象を絞っています。

| ワークフロー | 内容 |
|---|---|
| `travel-goods-ci.yml` | 旅行用品サイトの型検査・lint・テスト・データ検証・ビルド |
| `travel-goods-audit.yml` | 旅行用品サイトの定期点検（週1回。見つかったときだけ Issue を作る） |
| `travel-goods-rakuten-sync.yml` | 楽天からのリンク取得（手動実行。資格情報が未設定なら何もしない） |
