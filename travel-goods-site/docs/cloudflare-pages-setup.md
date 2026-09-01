# Cloudflare Pages 公開手順

## 1. GitHub連携

- Repository: `ioda47871-byte/mugi-no-mi-nextjs-2`
- Production branch: `main`
- Root directory: `travel-goods-site`
- Build command: `npm run build`
- Build output directory: `out`
- Framework preset: `Next.js (Static HTML Export)`
- Node.js: `22`

Cloudflare Workers & Pages GitHub App の Repository access は
`mugi-no-mi-nextjs-2` だけに限定する。Cloudflare API token は作らない。

## 2. 初回Preview

Production と Preview の両環境へ、最初は次だけを設定する。

| Variable | Value |
|---|---|
| `SITE_MODE` | `preview` |
| `CATALOG_DATASET` | `production` |
| `SITE_NAME` | `旅モノ比較` |

`SITE_URL`、公開用運営者情報、GA4、Amazon、楽天API資格情報は入れない。
初回は `robots.txt` が `Disallow: /`、sitemap URL数が0、画面上部が
「未公開プレビューです」であることを確認する。

## 3. 独自ドメイン

1. `tabimono-hikaku.jp` を取得する。
2. Cloudflareへzoneを追加する。
3. レジストラのネームサーバーをCloudflare指定値へ変更する。
4. Pages > Custom domains で `tabimono-hikaku.jp` を追加する。
5. `www.tabimono-hikaku.jp` をapexへ恒久転送する。
6. TLSが有効であることを確認する。

## 4. 本番切替

Production 環境だけに次を設定し、再デプロイする。

| Variable | Value |
|---|---|
| `SITE_MODE` | `production` |
| `CATALOG_DATASET` | `production` |
| `SITE_NAME` | `旅モノ比較` |
| `SITE_URL` | `https://tabimono-hikaku.jp` |
| `PUBLIC_OPERATOR_NAME` | 公開を承認した運営者名 |
| `PUBLIC_CONTACT_EMAIL` | 公開を承認した連絡先 |

Preview 環境の `SITE_MODE=preview` は変更しない。`*.pages.dev` の Production URL は
独自ドメインへ転送する。

## 5. 本番確認

- 旧名称「旅じたくガイド」が出ない
- canonicalが `https://tabimono-hikaku.jp` を指す
- robotsがクロールを許可する
- sitemapが本番URLだけを含む
- 照合済み楽天CTAが14件、未照合CTAが0件
- CTAの `rel` が `nofollow sponsored noopener`
- デモ・Preview文言・資格情報が出ない

## 6. ロールバック

Cloudflare Pages > Deployments から直前の成功デプロイへRollbackする。
DNSをVercelへ戻さない。問題のある楽天リンクだけならリンクを `unverified` に戻し、
サイト全体を停止しない。
