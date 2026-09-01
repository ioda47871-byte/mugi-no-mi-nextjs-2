# 本番公開チェックリスト

`npm run check:release -- --out out` が、この文書の内容を機械的に判定します。
未達がある間は非ゼロ終了します。**未設定を成功扱いにしません。**

---

## 0. 事前に決めること（ユーザーの判断が必要）

| 項目 | 現状 | 決めること |
|---|---|---|
| 正式名称 | 旅モノ比較 | 正式名称として使用する |
| ドメイン | `tabimono-hikaku.jp` | 取得時に利用可能か再確認する。年額費用が発生します |
| ホスティング | Cloudflare Pages Free | `docs/cloudflare-pages-setup.md` に従いGitHub連携を設定する |
| 公開用の運営者名 | 未提供 | 画面に出す名義（個人名／屋号など） |
| 公開用の連絡先 | 未提供 | 公開して差し支えないメールアドレス |

いずれも**架空の値を入れていません**。未提供の項目は画面に「未設定」と表示されます。

---

## 1. 環境変数の設定

`.env.example` をコピーして `.env.local` を作るか、ホスティング側の環境変数欄に設定します。
**`.env.local` は git 管理外です。実際のキーをコミットしないでください。**

### 必須（これが無いと本番公開できません）

| 変数 | 例 | 影響 |
|---|---|---|
| `SITE_MODE` | `production` | `preview` のあいだは全ページ noindex |
| `CATALOG_DATASET` | `production` | `demo` は本番モードで読み込めません |
| `SITE_URL` | `https://tabimono-hikaku.jp` | canonical・サイトマップの基準。末尾スラッシュなし |
| `PUBLIC_OPERATOR_NAME` | 運営者名 | 運営者情報ページに表示 |
| `PUBLIC_CONTACT_EMAIL` | 連絡先 | お問い合わせページに表示 |

### 収益化（設定した店舗だけ有効になります）

| 変数 | 影響 |
|---|---|
| `AMAZON_ASSOCIATE_TAG` | 空ならAmazonボタンは**一切出力されません**。形式が不正な値も「未設定」と同じ扱いです |
| （楽天は環境変数不要） | 商品ごとに発行済み紹介URLを `datasets/production/merchants/rakuten.json` へ登録します |

### 任意

| 変数 | 影響 |
|---|---|
| `NEXT_PUBLIC_GA_ID` | 空なら計測タグを出力せず、イベント送信も行いません |

`RAKUTEN_*` と `ANTHROPIC_API_KEY` は Phase 2 用です。Phase 1 では空のままで動きます。
**API認証キーに `NEXT_PUBLIC_` を付けないでください。** ビルド成果物に埋め込まれます。

---

## 2. アフィリエイト設定

### Amazon アソシエイト

1. アソシエイトに登録し、自分のトラッキングID（例: `yourname-22`）を取得する。
2. `AMAZON_ASSOCIATE_TAG` に設定する。
3. 商品ごとに販売ページで **ASIN・型番・容量・バリエーション**を照合し、`datasets/production/merchants/amazon.json` に登録する（`status: "verified"`, `verifiedAt` に照合日、`matchedVariant` に商品の `variant` と同じ文字列）。
4. 審査条件（登録後180日以内に3件以上の適格販売、10件以上のオリジナル投稿）を確認する。**条件を満たすことは合格の保証ではありません。**
5. 規約が求めるアソシエイト表示の文言を、公開時点の公式規約と照合して `src/app/editorial-policy/page.tsx` と `src/app/privacy/page.tsx` に反映する。

### 楽天アフィリエイト

1. アフィリエイト管理画面で商品ごとの紹介リンクを発行する。
2. 発行されたURLを**加工せずそのまま** `affiliateUrl` に登録する（独自の計測クエリを付け足さない）。
3. 許可ホストは `src/lib/affiliate/rakuten.ts` の `RAKUTEN_AFFILIATE_HOSTS` にあります（現在: `hb.afl.rakuten.co.jp`, `a.r10.to`）。
   **この一覧は実装時点の知識に基づく暫定値です。** 実際に発行したリンクのホストがこの一覧に無ければ、管理画面の表示と突き合わせたうえで追記してください。`item.rakuten.co.jp` などの通常の商品URLは紹介URLではないため許可していません。

### 共通の確認

- [ ] 紹介IDが未設定の店舗のボタンが**表示されていない**こと。
- [ ] 型番・容量・バリエーションが一致しない販売先が掲載されていないこと。
- [ ] 広告リンクに `rel="sponsored noopener noreferrer"` が付いていること。
- [ ] 少数のリンクを実際に押し、正しい商品ページへ遷移することを目視で確認する（自動購入や大量クリックはしない）。

---

## 3. データと記事

- [ ] `npm run validate:content` がエラー 0 で通る。
- [ ] 公開する商品の仕様に、出典URL・参照箇所・確認日がそろっている。
- [ ] 記事に `reviewedAt` と `reviewer` が、**実際に確認した内容**として記録されている。
- [ ] モバイルバッテリーの安全情報と航空ルールを目視レビューした。
      機内持ち込みの記述をする場合は、航空会社の公式案内・対象範囲・確認日を添える。
      過去の一般知識を使い回さない（例: ANAは2026年4月24日搭乗分から取り扱いが変更されています）。
- [ ] 掲載前にメーカーの回収・リコール情報を確認した。

---

## 4. 計測とSEO

- [ ] `NEXT_PUBLIC_GA_ID` を設定したテスト環境で、購入リンクのクリック時に `affiliate_click` イベントが届くことを確認した。
      **未確認のまま「計測できている」と記録しない。**
- [ ] Google Search Console にサイトを登録した。
- [ ] `out/robots.txt` がクロール許可になっている（プレビューでは全面 Disallow が正しい）。
- [ ] `out/sitemap.xml` に公開ページだけが入っている（下書き・保留記事が入っていない）。
- [ ] 構造化データが Article と BreadcrumbList のみで、画面内容と一致している。

---

## 5. ホスティング

- [ ] Cloudflare Pages Free をGitHub連携で設定し、`main` をProduction branch、
      `travel-goods-site` をRoot directory、`out` をBuild output directoryにする。
- [ ] `docs/cloudflare-pages-setup.md` の初回Preview、独自ドメイン、本番切替、ロールバックの手順を完了する。
- [ ] HTTPS が有効であること。
- [ ] 独自ドメイン `tabimono-hikaku.jp` が `SITE_URL` と一致していること。

### 費用の目安（いずれも未承認・未契約）

| 項目 | 目安 |
|---|---|
| ドメイン | `tabimono-hikaku.jp` の取得・更新費用 |
| 静的ホスティング | Cloudflare Pages Free（公開時点の利用条件と上限を確認） |
| LLM/API | Phase 1 は **0円**（実行時にAPIを呼びません） |

無料枠が恒久的に十分であることは保証できません。

---

## 6. 最終確認

```bash
npm run verify                      # 型・lint・テスト・データ検証・ビルド
npm run test:e2e                    # E2E（default/demo + CTA）
npm run test:e2e:production         # E2E（production + CTA）
npm run test:e2e:linkcheck          # E2E（購入導線の通し確認）
npm run check:release -- --out out  # 公開前チェック（未達があれば非ゼロ終了）
```

- [ ] リリースブランチを `main` へマージする**前に**、上記3系統のE2Eがすべて終了コード0である。
      実行環境は Node.js 22 と Chromium が利用可能であること。Chromium の配置が既定と異なる場合は
      `PW_CHROMIUM_PATH` に実行可能ファイルのパスを指定する。
- [ ] この sandbox では3系統を実行していない。Cloudflare Pages のビルドが自動でE2Eを実行する
      わけではないため、Cloudflare Preview確認用CIまたは別の browser-enabled 環境で再実行し、
      成功を記録する。マージ前にできない場合も、本番公開は3系統が成功するまでブロックする。
- [ ] `check:release` がすべて OK になっている。
- [ ] 下書きが一覧・サイトマップ・直接URLのいずれからも公開されていない。
- [ ] 配信ファイルに架空の商品、サンプルID、仮の連絡先、秘密情報が含まれていない
      （`check:release --out out` が自動で走査します）。
- [ ] PC・スマートフォンで主要導線を目視確認した。

---

## 7. 公開後

`docs/operations.md` の「更新の手順」と「問題が起きたとき」に進みます。
