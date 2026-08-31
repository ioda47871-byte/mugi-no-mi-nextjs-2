# mugi-no-mi-nextjs-2

このリポジトリには、**互いに独立した2つのサイト**が入っています。
依存関係・ビルド・デプロイ先を共有していません。

| ディレクトリ | サイト | 状態 |
|---|---|---|
| [`mugi-no-mi-nextjs/`](mugi-no-mi-nextjs/) | パン屋のサイト（既存） | 稼働中 |
| [`travel-goods-site/`](travel-goods-site/) | 旅行用品の比較サイト「旅じたくガイド」（仮称） | 公開準備中。いまの主軸 |

## どちらを触るか

作業は必ずどちらかのディレクトリの中で行ってください。
`npm install` も `npm run` も、リポジトリのルートではなく各ディレクトリで実行します。

```bash
cd travel-goods-site && npm install && npm run dev    # 旅行用品サイト
cd mugi-no-mi-nextjs && npm install && npm run dev    # パン屋サイト
```

各ディレクトリの README に、そのサイトの構成・コマンド・設計方針があります。

## デプロイは別々のプロジェクトに分けています

Vercel のプロジェクトも2つに分けています。どちらの `vercel.json` にも同じ判定を入れてあり、
**自分のディレクトリに変更が無いコミットではビルドをスキップします**（本番ブランチは必ずビルド）。
片方のサイトのコミットで、もう片方が巻き込まれてデプロイされることはありません。

設定手順は [`travel-goods-site/docs/vercel-setup.md`](travel-goods-site/docs/vercel-setup.md) にあります。

## 共通の CI

`.github/workflows/` にあるワークフローは、いずれもパスで対象を絞っています。

| ワークフロー | 内容 |
|---|---|
| `travel-goods-ci.yml` | 旅行用品サイトの型検査・lint・テスト・データ検証・ビルド |
| `travel-goods-audit.yml` | 旅行用品サイトの定期点検（週1回。見つかったときだけ Issue を作る） |
| `travel-goods-rakuten-sync.yml` | 楽天からのリンク取得（手動実行。資格情報が未設定なら何もしない） |
