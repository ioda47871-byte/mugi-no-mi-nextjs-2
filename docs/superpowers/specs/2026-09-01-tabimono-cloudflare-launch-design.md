# 「旅モノ比較」Cloudflare Pages 公開設計

作成日: 2026-09-01  
対象: `travel-goods-site/`  
基準ブランチ: `claude/kore-de-ikeru-ii2tnq` (`538de6e`)

## 1. 目的

旅行用品比較サイトの正式名称を「旅モノ比較」とし、静的な Next.js サイトを
Cloudflare Pages の無料枠と独自ドメインで公開する。Vercel Hobby を商用サイトの
本番配信には使用せず、サイトの継続費用は原則としてドメイン更新料だけに抑える。

公開ドメインは `tabimono-hikaku.com` とする。当初は `tabimono-hikaku.jp` を候補と
していたが、2026-09-01 に `.com` を取得したため、以後は `.com` を正式ドメインとして
扱う。自動更新は有効、有効期限は 2027-09-02。DNS の移管（レジストラである XServer の
ネームサーバー変更）はまだ行っていない。

## 2. 採用方式

Cloudflare Pages の GitHub 連携を使用する。

- GitHub リポジトリ: `ioda47871-byte/mugi-no-mi-nextjs-2`
- Pages プロジェクト名: `tabimono-hikaku`
- Production branch: `main`
- Root directory: `travel-goods-site`
- Build command: `npm run build`
- Build output directory: `out`
- Functions: 使用しない

Cloudflare Pages は GitHub のブランチ更新を自動でビルドでき、Next.js の静的出力では
`out` を配信できる。API トークンを GitHub Actions に保存する必要がないため、
Wrangler による独自デプロイワークフローは追加しない。

## 3. ブランチとデプロイ

### Production

`main` だけを Production branch にする。現在のサイト実装は作業ブランチにあるため、
Cloudflare の初回設定だけで本番公開済みと扱わない。初回は Production 環境も
`SITE_MODE=preview` にして安全に接続を確認する。次の条件を満たしたリリース PR を
`main` にマージした後もプレビュー状態を維持し、独自ドメインの確認後に初めて
`SITE_MODE=production` へ切り替えて再デプロイする。

1. 名称変更と Cloudflare 用ドキュメントが作業ブランチへ統合済み
2. 本番用環境変数が Cloudflare の Production 環境へ登録済み
3. `npm run verify` と本番データ E2E が成功
4. `npm run check:release -- --out out` が成功
5. 独自ドメインの DNS と TLS が有効
6. `*.pages.dev` の Production URL を独自ドメインへ転送する設定が有効

### Preview

`main` 以外のブランチは Preview とする。Preview では実商品データを使うが、必ず
`SITE_MODE=preview` とし、`noindex`、空の sitemap、`robots.txt` の全面 Disallow、
「未公開プレビュー」表示を維持する。プレビュー URL を正規 URL や楽天 API の恒久的な
許可元には使用しない。

## 4. 環境変数

### Production 環境

| 変数 | 値・扱い |
|---|---|
| `SITE_MODE` | `production` |
| `CATALOG_DATASET` | `production` |
| `SITE_NAME` | `旅モノ比較` |
| `SITE_URL` | `https://tabimono-hikaku.com` |
| `PUBLIC_OPERATOR_NAME` | 運営者が公開を承認した名称。空のままではリリースしない |
| `PUBLIC_CONTACT_EMAIL` | 運営者が公開を承認した連絡先。空のままではリリースしない |
| `NEXT_PUBLIC_GA_ID` | 任意。空なら計測タグを出さない |
| `AMAZON_ASSOCIATE_TAG` | 任意。審査・取得後のみ設定する |

楽天 API の認証情報はビルドと閲覧に不要であるため、Cloudflare Pages へ登録しない。
`RAKUTEN_APPLICATION_ID`、`RAKUTEN_ACCESS_KEY`、`RAKUTEN_AFFILIATE_ID`、
`RAKUTEN_API_REFERER` は GitHub Actions 側だけで管理する。

### Preview 環境

| 変数 | 値・扱い |
|---|---|
| `SITE_MODE` | `preview` |
| `CATALOG_DATASET` | `production` |
| `SITE_NAME` | `旅モノ比較` |
| `SITE_URL` | 設定しない |
| 公開用運営者情報 | 設定しない |
| 計測・Amazon | 設定しない |

`CATALOG_DATASET_DIR` は Production と Preview のどちらにも設定しない。

## 5. 名称変更

仮称の定数と画面上の表記を「旅モノ比較」に変更する。正式名称が決まったため、
未設定時に「仮称」と扱う設計は廃止し、`SITE_NAME` は環境別の上書き用途だけにする。

変更対象は次を含む。

- `src/config/site.ts` の既定名称と公開準備判定
- ヘッダー、フッター、metadata、運営者情報、メール文面に現れるサイト名
- README、公開チェックリスト、ステータス文書
- テストの名称・仮称判定

商品データ、記事本文、紹介 URL、楽天 API 資格情報は変更しない。

## 6. 独自ドメインと DNS

取得済みの `tabimono-hikaku.com` を Cloudflare に zone として追加し、レジストラ
（XServer）側のネームサーバーを Cloudflare 指定値へ変更する。この変更は Cloudflare 接続時に
行うものであり、現時点では未実施である。その後、Pages の Custom domains から
apex ドメインを関連付ける。`www.tabimono-hikaku.com` は apex へ恒久転送する。

DNS 切替前に `*.pages.dev` の Production URL で本番相当ビルドを確認する。その段階の
Production 環境は `SITE_MODE=preview` とし、indexable なページを出さない。独自ドメインの
TLS とページ表示を確認した後に `SITE_MODE=production` を有効にして再デプロイする。
同時に `*.pages.dev` の Production URL は独自ドメインへ転送し、同じ本番サイトが
複数ホストで閲覧できる状態を残さない。ブランチ固有の Preview URL は noindex のままにする。

## 7. Vercel からの切替

Cloudflare の独自ドメインで次を確認するまでは、既存 Vercel プレビューを残す。

- 全ページが 200 または意図した 404 を返す
- canonical が `https://tabimono-hikaku.com` を指す
- sitemap に本番 URL が入り、robots がクロールを許可する
- 14件の確認済み楽天 CTA だけが表示される
- CTA の `href`、`rel`、`target` が既存検証結果と一致する
- デモ文言、プレビュー文言、秘密情報、未照合リンクが配信物に無い

確認後、Vercel の `travel-goods-site` プロジェクトは自動デプロイを停止する。
Vercel のサイトを先に削除せず、Cloudflare 側で問題が起きた場合に短時間で
プレビュー状態へ戻せるようにする。独自ドメインは Vercel へ戻さず、Cloudflare 側の
前回成功デプロイへロールバックする。

## 8. 検証

実装時に最低限、次を実行する。

```text
npm run typecheck
npm run lint
npm test
npm run validate:content:all
SITE_MODE=preview CATALOG_DATASET=production SITE_NAME=旅モノ比較 npm run build:only
CATALOG_DATASET=production npm run test:e2e:production
npm run test:e2e:linkcheck
```

本番公開候補では、公開用の環境変数を設定したうえでビルドし、次を実行する。

```text
npm run check:release -- --out out
```

追加する回帰テストでは、正式名称、canonical、robots、sitemap、プレビューの noindex、
本番配信物に Vercel URL・旧名称・未照合紹介 URL が含まれないことを確認する。

## 9. 障害時の扱い

- Cloudflare のビルド失敗: Production は前回成功デプロイを維持し、失敗したコミットを
  修正して再ビルドする。
- DNS/TLS が未完了: `SITE_MODE=preview` のままにし、検索公開へ進まない。
- リリース検査失敗: 環境変数や成果物を修正し、検査が成功するまで公開しない。
- 独自ドメイン公開後の表示不具合: Cloudflare Pages の前回成功デプロイへ戻す。
- 紹介リンクの不整合: 該当リンクを `unverified` に戻し、CTA を非表示にする。

## 10. 実装範囲外と公開前の入力

この変更では、ドメイン購入、Cloudflare アカウント作成、GitHub App の許可、公開用の
運営者名・メールアドレスの決定、Search Console 所有権確認、GA4 作成を自動実行しない。
これらは外部アカウント操作または公開情報の決定を伴うため、実装完了後に運営者が行う。

公開前に必須の入力は次の3点である。

1. `tabimono-hikaku.com` の取得完了（2026-09-01 取得済み）
2. 公開用 `PUBLIC_OPERATOR_NAME`
3. 公開用 `PUBLIC_CONTACT_EMAIL`

GA4 と Amazon は未設定でも公開できる。楽天の商品取得・リンク監査の定期実行は、
本番公開と Search Console の確認後に別工程として有効化する。

## 11. 参考資料

- Cloudflare Pages: GitHub integration  
  https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/
- Cloudflare Pages: Build configuration  
  https://developers.cloudflare.com/pages/configuration/build-configuration/
- Cloudflare Pages: Next.js static export  
  https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/
- Cloudflare Pages: Custom domains  
  https://developers.cloudflare.com/pages/configuration/custom-domains/
- Cloudflare Pages: Pricing for static assets  
  https://developers.cloudflare.com/pages/functions/pricing/
