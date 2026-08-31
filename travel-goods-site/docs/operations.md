# 運用手順

商品の追加、記事の更新、紹介リンクの差し替え、問題商品の除外、切り戻しの手順です。
どの操作も、最後に `npm run validate:content` を通してから反映します。

---

## 日常のコマンド

```bash
npm run dev                          # 開発サーバー（プレビュー・デモデータ）
npm run verify                       # 型・lint・単体テスト・データ検証・ビルド
npm run validate:content             # 現在のデータセットを検証
npm run validate:content:all         # production と demo の両方を検証
npm run build && npm run start       # 静的出力をビルドして http://localhost:3100 で確認
npm run test:e2e                     # E2E（要ビルド済み out/）
npm run check:release -- --out out   # 公開前チェック
```

デモデータで確認したいときは `CATALOG_DATASET=demo`、本番データなら `CATALOG_DATASET=production` を付けます。

---

## 商品を追加する

### 1. 出典を登録する

`datasets/production/sources.json` に追記します。

**自分で公式ページを開いて確認した場合:**

```json
{
  "id": "src-メーカー名-製品名",
  "url": "https://メーカーの仕様ページ",
  "publisher": "メーカー名",
  "checkedAt": "2026-09-01",
  "provenance": "direct-fetch",
  "importedFrom": null,
  "locator": "仕様表 / 「サイズ・重量」の欄",
  "editorialUse": "verified",
  "automatedFetch": "unverified",
  "llmInput": "unverified",
  "usageNote": "公表仕様の数値を確認のうえ引用。画像・文章の転載はしない。"
}
```

**別環境で調査された資料の提供を受けて取り込む場合:**

```json
{
  "id": "src-メーカー名-製品名",
  "url": "https://メーカーの仕様ページ",
  "publisher": "メーカー名",
  "checkedAt": "2026-09-01",
  "provenance": "provided-document",
  "importedFrom": {
    "document": "datasets/production/research-materials/2026-09-01-xxx.md",
    "importedAt": "2026-09-02"
  },
  "locator": "仕様表 / 「サイズ・重量」の欄",
  "editorialUse": "verified",
  "automatedFetch": "unverified",
  "llmInput": "unverified",
  "usageNote": "提供資料経由。この環境から当該ページへは接続していない。"
}
```

- 資料の原文を `datasets/production/research-materials/` に保存し、README の表に追記します。
  **資料なしで `provided-document` の出典を作らないでください。**
- `checkedAt` は「公式ページを確認した日」、`importedFrom.importedAt` は「取り込み作業日」です。
  この2つは別の日付です。
- **資料の提供は、自動取得の許可でも画像利用の許可でもありません。**
  `automatedFetch` と `llmInput` は確認できるまで `unverified` のままにします。

- `checkedAt` は**実際にページを見た日**です。未来の日付は検証で拒否されます。
- `editorialUse: "verified"` は「編集上、事実として採用してよいと確認した」という意味です。
  公開商品の仕様はこの状態の出典を要求します。
- `llmInput` は、**公開ページを見つけただけで `allowed` にしないでください。**
  原文を外部AIへ送ってよい権限があるかは別の確認です。
- `automatedFetch` が `allowed` でない取得元は、Phase 2 の自動取得の対象外です。

### 2. 商品を登録する

`datasets/production/products/<category>.json` に追記します。

```json
{
  "id": "brand-model-variant",
  "category": "suitcases",
  "brand": "メーカー名",
  "model": "型番",
  "variant": "38L / 機内持ち込みサイズ",
  "status": "draft",
  "summary": "公表仕様の言い換えに留める。使用感は書かない。",
  "jan": "4901234567890",
  "weightG":     { "value": 2380, "sourceId": "src-...", "checkedAt": "2026-09-01" },
  "outerSizeMm": { "value": [400, 540, 240], "sourceId": "src-...", "checkedAt": "2026-09-01" },
  "sizeBasis": "with-handle-and-wheels",
  "measurementState": "not-applicable",
  "bodySizeMm":  { "value": null, "sourceId": null, "checkedAt": null, "note": "公表なし" },
  "capacityL":   { "value": 38, "sourceId": "src-...", "checkedAt": "2026-09-01" },
  "alternateMeasurements": [],
  "specs": {
    "stopper": { "value": true, "sourceId": "src-...", "checkedAt": "2026-09-01" }
  },
  "caveats": ["航空会社ごとの持ち込み規定は各社の公式案内で確認してください。"],
  "image": null
}
```

守ること:

- 単位は **重量 g / 寸法 mm / 容量 L / 出力 W / 電力量 Wh / 電池容量 mAh**。
- 確認できない値は `null` にして `note` に理由を書く。**0・推定値・類似商品の値で埋めない。**
- **寸法は必ず測定条件を付ける。**「ハンドルを除く」と公表されている値を
  「ハンドル込み外寸」として保存しない。
  - `sizeBasis`: `with-handle-and-wheels` / `body-only` / `excludes-handle` /
    `excludes-handle-and-straps` / `unspecified`（条件が公表されていない場合）
  - `measurementState`: `not-applicable` / `normal` / `expanded` / `compressed`
  - 拡張時など別条件の値は `alternateMeasurements` に入れる（主要値と同じ状態は登録できません）:

    ```json
    "alternateMeasurements": [{
      "label": "拡張時",
      "state": "expanded",
      "sizeMm": { "value": [320, 510, 250], "sourceId": "src-...", "checkedAt": "2026-09-01" },
      "sizeBasis": "excludes-handle-and-straps",
      "capacityL": { "value": 40, "sourceId": "src-...", "checkedAt": "2026-09-01" }
    }]
    ```
- 外寸（ハンドル・キャスター込み）と本体寸法は別の項目。
- `jan` は存在し確認できる場合だけ入れる（13桁）。架空値で補わない。
- 拡張前後・容量違い・旧型と新型・単品とセットは、`variant` を分けて別商品として登録する。
- `specs` はカテゴリごとに許可キーが決まっています（`src/lib/catalog/schema.ts` の `CATEGORY_SPEC_SCHEMAS`）。未知のキーは検証で拒否されます。
- 画像は権利を確認できたものだけ。確認できなければ `null` のままで問題ありません（文字・仕様主体のカードで表示されます）。
- まず `status: "draft"` で登録し、確認が済んでから `"published"` にします。

### 3. 販売先を照合する

販売ページで**型番・容量・バリエーション**が一致することを確認してから登録します。

```json
{
  "productId": "brand-model-variant",
  "merchant": "amazon",
  "externalProductId": "ASIN10桁",
  "affiliateUrl": null,
  "matchedVariant": "38L / 機内持ち込みサイズ",
  "verifiedAt": "2026-09-01",
  "status": "verified"
}
```

- `matchedVariant` は商品の `variant` と**完全一致**させます。一致しないとリンクは表示されません。
- 楽天は `affiliateUrl` に管理画面で発行した紹介URLを入れます（`externalProductId` はショップの商品コード）。
- 照合していないものは `status: "unverified"` のままにします。表示されませんが、記録としては残ります。
- 販売終了は `status: "unavailable"` にします。

### 4. 検証して反映する

```bash
npm run validate:content
npm run build:only
```

---

## 記事を追加・更新する

### 下書きを作る

```bash
npm run create:draft -- \
  --dataset production \
  --slug my-article-slug \
  --title "記事タイトル" \
  --category suitcases \
  --products id1,id2,id3
```

- `--dry-run` を付けると、ファイルを一切変更せず生成内容だけを表示します。
- 同じ slug のファイルがあると拒否されます（`--force` で上書き）。
- 作られる記事は必ず `status: draft` です。このコマンドで公開状態にはなりません。
- 外部APIは呼びません。決定的なテンプレート生成です。

### 公開までの流れ

1. `TODO:` と `【未記入】` を埋める。残っていると公開判定で拒否されます。
2. 事実確認とレビューを行い、`reviewedAt` と `reviewer` を記入する。
   **見ていないものを「確認済み」と記録しないでください。**
3. `status: published` にし、`publishedAt` と `updatedAt` を記入する。
4. `npm run validate:content` を通す。

公開判定（`evaluatePublication`）が確認するのは次の点です。**内容が正しいことの証明ではありません。**

- `status` が `published` であること
- `reviewedAt` / `reviewer` / `publishedAt` が記入されていること
- 出典が1件以上あり、すべて `editorialUse: "verified"` であること
- 参照商品がすべて存在し、`published` であること
- 本文に生HTML・スクリプト・未記入マーカーが無いこと
- 本文が400文字以上であること

### 更新日の扱い

意味のある内容変更があったときだけ `updatedAt` を更新します。変更がないのに日付だけ書き換えないでください。

### 本文で使える記法

見出し（`##`〜`####`）、段落、箇条書き、番号付きリスト、引用（`>`）、水平線（`---`）、リンク（`[文字](URL)`）、強調（`**文字**`）、インラインコード（`` `文字` ``）、比較表の差し込み（`{{comparison}}` を単独行に置く）。

生HTMLは解釈されず、ただの文字として扱われます。`javascript:` や `data:text/html` のリンクはリンクになりません。

---

## 購入ボタンの見た目を確認する

紹介IDや紹介URLが無くても、ボタンの表示だけは確認できます。

```bash
npm run build:only     # CSS を生成するため先に必要
npm run preview:cta    # .preview/cta/index.html を生成
```

生成されるページは「両方 / 楽天のみ / Amazonのみ / どちらもなし」の4状態を並べます。
使用する ASIN・紹介URL・トラッキングIDはテスト専用の架空値で、**本番データセットには
書き込みません**。このページは `out/`（本番の静的出力）にも含まれません。

`npm run test:e2e` に含まれる `cta-preview.spec.ts` が、外部通信をすべて遮断した状態で
ボタン数・rel属性・クリック領域・キーボード操作・スマートフォンでの並びを検証します。

## 紹介リンクを登録・有効化する

管理画面で発行した紹介URLを受け取ったら、JSON を手で編集せずにコマンドで登録します。

```bash
# 楽天（発行済み紹介URL・リンク先を開いて確認した場合）
CATALOG_DATASET=production npm run link:set -- \
  --product <商品ID> --merchant rakuten --url "<紹介URL>" --verify --visual-check

# Amazon（照合済みASIN・型番一致で判断した場合）
CATALOG_DATASET=production npm run link:set -- \
  --product <商品ID> --merchant amazon --asin <ASIN10桁> --verify --identifier-match
```

**`--verify` には判断根拠の指定が必須です。**

| 指定 | 意味 |
|---|---|
| `--visual-check` | リンク先を開いて商品・サイズ・色を確認した |
| `--identifier-match` | 型番・JANの一致で判断した（リンク先は開いていない） |

リンク先を見ていないものを目視確認として記録しないでください。
自動取得ジョブが作るリンクは必ず `identifier-match` になります。

- ホストが許可リスト外なら登録を拒否します（通常の商品URLは紹介URLとして扱いません）。
- `matchedVariant` は商品の `variant` を自動で使います。
- 書き込み前にカタログ全体の検証を通します。`--dry-run` で内容確認のみ。
- `--verify` を付けない場合は `unverified` のまま登録し、画面には出しません。

登録後:

```bash
npm run validate:content -- --dataset production
CATALOG_DATASET=production npm run build:only
npm run test:e2e:production
```

最後に、**リンク先を目視で開いて商品・型番・サイズ・色が一致することを確認してください**
（購入はしません）。この照合はコマンドでは代替できません。

## 購入導線を通しで確認する（紹介URLが無くても可能）

```bash
npm run test:e2e:linkcheck
```

`datasets/production` を `.preview/linkcheck-dataset` に複製し、テスト専用の架空URLで
1件だけ `verified` にしてビルドし、カテゴリ画面・記事画面での

- ボタンの表示
- href が登録した紹介URLと完全一致すること（クエリ追加・中継なし）
- クリック計測の送信内容
- 計測が失敗してもリンクが機能すること

を確認します。外部通信はすべて遮断され、実店舗にも計測サーバーにもアクセスしません。
**本番データセットは変更されません。**

`SITE_MODE=production` では `CATALOG_DATASET_DIR` を使えないため、
この一時データから本番の配信物を作ることはできません。

## 紹介リンクを差し替える

1. `datasets/production/merchants/*.json` の該当エントリを編集する（または上の `link:set`）。
2. 型番・容量・バリエーションを再照合し、`verifiedAt` を更新する。
3. 一致しなくなった場合は `status` を `unverified` か `unavailable` に変える。**リンクを消す前にステータスを変えるだけで、画面からは消えます。**
4. `npm run validate:content && npm run build:only`。

---

## 問題が起きたとき

### 回収・リコールが判明した商品

1. 該当商品の `status` を `"retired"` にする。
2. その商品を参照している記事の `productIds` から外す。
   記事全体が成り立たなくなる場合は、記事の `status` を `"review"` に戻す。
3. 断定的な記述（おすすめ、安全に関する表現）を削除する。
4. `npm run validate:content && npm run build:only` して再公開する。

商品を参照したまま `retired` にすると、公開記事の検証で拒否されます（意図的な仕様です）。

### 特定の店舗を止めたい

- Amazon 全体を止める: `AMAZON_ASSOCIATE_TAG` を空にして再ビルド。ボタンが全ページから消えます。
- 楽天の個別リンクを止める: 該当エントリの `status` を `unverified` にする。
- どちらの場合も、記事・比較表・仕様は通常どおり表示され続けます。

### 出典が古くなった / 情報が矛盾する

- 出典間で値が矛盾している場合は、**都合のよい数値を選ばず採用を保留**します。
  該当の `Fact` を `value: null` にし、`note` に「公表値に矛盾があるため保留」と書きます。
- 商品の `status` を `"review"` に戻すのも有効です。

### 前の版に戻す（切り戻し）

```bash
git log --oneline -- travel-goods-site/datasets   # データ変更の履歴を見る
git revert <コミットID>                            # 該当の変更だけを打ち消す
npm run validate:content && npm run build:only
```

静的サイトなので、直前のビルド成果物（`out/`）を再配置するだけでも戻せます。
ホスティング側にデプロイ履歴がある場合は、そのロールバック機能が最短です。

### ビルドが通らない

1. `npm run validate:content:all` でデータの不整合を確認する。エラーには対象ID（商品ID・出典ID・記事slug）と理由が出ます。
2. `npm run typecheck` で型エラーを確認する。
3. データの問題であれば、該当商品・記事の `status` を `draft` に戻せば公開対象から外れ、ビルドは通ります。

**取得や検証に失敗した結果で、すでに公開している正常なデータを上書きしないでください。**

---

## やらないこと（Phase 1 の範囲外）

- 価格・在庫・送料・ポイントの表示
- Amazon の価格・レビュー・画像のスクレイピング
- 自動公開、日々の大量記事生成
- 独自の総合おすすめ点数、最安値保証、価格推移グラフ
- 機内持ち込み可否の自動判定
