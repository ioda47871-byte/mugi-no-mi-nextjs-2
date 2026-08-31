# 楽天からの自動取得（Phase 2-1）

「アフィリエイトの商品を自動で見つけて、リンクを自動で作る」ための仕組みです。
**どこまで自動で、どこから人が確認するか**を先に決めてあります。

---

## 1. 何が自動になるか

| 処理 | 自動化 | 備考 |
|---|---|---|
| 登録済み商品の紹介URL取得 | **全自動** | JAN・型番で検索し、一致したものの `affiliateUrl` を登録 |
| 型番・JANが両方一致した場合の表示開始 | **自動にできる** | `--auto-verify` を付けたときだけ |
| 新しい商品候補の収集 | **全自動** | 「未確認」として保存。公開はされない |
| 新しい商品の採用 | **人が判断** | メーカー公表仕様の出典が別途必要 |
| 仕様（重量・外寸・容量）の取得 | **自動化しない** | 楽天APIが返すのは販売情報で、メーカー公表仕様ではない |
| 記事の自動公開 | **しない** | 計画書 12-3節 |

### Amazon はまだ自動化できません

商品情報APIには適格販売などの資格条件があります（計画書 12-4節）。
資格が確認できるまでは、照合済みASINからのリンク生成（`npm run link:set`）のみです。
資格が無い・失効した場合にスクレイピングへ切り替えることはしません。

---

## 2. 準備

### 2-0. 先にサイトのURLを決めてください

アプリ新規作成フォームには **アプリケーションURL** と **許可されたWebサイト** の
必須項目があります。フォームには
「APIリクエストは、登録されているWebサイトからのみ受け付けます」と書かれています。

そのため、**公開予定のドメインが決まってから登録するほうが確実です**。
順序としては次をおすすめします。

1. ドメインを決める／取得する
2. サイトを公開する（またはプレビューURLを確定させる）
3. そのURLでアプリを登録する
4. 自動取得を有効にする

登録を急ぐ場合は、いま自分が所有しているURL（デプロイ先のプレビューURLなど）で
登録し、本番ドメインが決まってからアプリ情報を更新する方法もあります。

### 2-0-b. 取得ジョブはサイトの外から動きます

このジョブは静的サイトの一部ではなく、GitHub Actions などから実行します。
「許可されたWebサイト」の制限に合わせて送信元を名乗る必要がある場合は、
`RAKUTEN_API_REFERER` に**自分が登録し所有しているドメイン**を設定してください。

```
RAKUTEN_API_REFERER=https://あなたのサイト/
```

**2026-08-31 の dry-run で、未設定では拒否されることが分かりました。**
GitHub Actions から資格情報つきで実行したところ、次が返りました。

```
HTTP 403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING
```

無効なアクセスキーのときは 403 `Invalid Access Key` という別の文言が返ります
（架空の値で確認済み）。つまりこれは**キーの誤りではなく、Referer が無いことによる拒否**です。

そのため、サーバー側から実行するこのジョブでは `RAKUTEN_API_REFERER` の設定が必要です。
値は**楽天のアプリ登録で「許可されたWebサイト」に登録したURLそのまま**にしてください。
GitHub では Secrets ではなく **Variables**（Settings → Secrets and variables → Actions →
Variables）に `RAKUTEN_API_REFERER` として登録します。

**他人のサイトを名乗ることはできません。**

#### 現行APIは Referer ではなく **Origin** で送信元を判定します

2026-08-31 の dry-run で、`RAKUTEN_API_REFERER` を設定しても
`403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING` が返り続けました。

原因は**送るヘッダーが違っていた**ことです。旧エンドポイントは `Referer` を見ていましたが、
`openapi.rakuten.co.jp` の現行APIは **`Origin` ヘッダー**で送信元を判定します。
ブラウザからの呼び出しでは自動で付くため気づきにくく、サーバーからの呼び出しでは
明示的に付ける必要があります。

そこで `RAKUTEN_API_REFERER` の値から `Origin`（scheme://host、パスと末尾スラッシュを含まない形）
を組み立てて送るようにしました。`Referer` も従来どおり送ります。設定する環境変数は
1つのままです。

```
RAKUTEN_API_REFERER=https://example.com/     ← 設定する値
  → Referer: https://example.com/            （そのまま送る）
  → Origin:  https://example.com             （組み立てて送る）
```

切り分けの過程で確認できたこと（同じ調査を繰り返さないための記録）:

| 確認 | 結果 |
|---|---|
| 値がジョブに届いているか | 届いている（ログの「送信元(Referer)」に出る） |
| クライアントが実際に送っているか | 送っている。ローカルのHTTPサーバーに実クライアントを向けて実測 |
| キーの誤りか | 別物。無効なキーなら 403 `Invalid Access Key` が返る |
| 正規化のズレか | `new URL().toString()` の末尾スラッシュ補完をやめ、設定文字列をそのまま送る |

### 2-1. 楽天ウェブサービスのアプリIDとアクセスキーを取る

1. 楽天ウェブサービス（`webservice.rakuten.co.jp`）でアプリを登録し、**アプリID
   （applicationId）** と **アクセスキー（accessKey）** を取得します。
2. 楽天アフィリエイトに登録し、**アフィリエイトID（affiliateId）** を確認します。
   **affiliateId を渡さないと、APIは紹介URL（`affiliateUrl`）を返しません。**

### 2-2. 設定する場所

**チャットに貼らないでください。** 次のいずれかに設定します。

- ローカル: `.env.local`（git 管理外）
- GitHub Actions: リポジトリの Settings → Secrets and variables → Actions

```
RAKUTEN_APPLICATION_ID=...
RAKUTEN_ACCESS_KEY=...
RAKUTEN_AFFILIATE_ID=...
AUTOMATION_ENABLED=false   # 書き込みを行う実行だけ true にする
```

`NEXT_PUBLIC_` は付けないでください。付けるとビルド成果物に埋め込まれます。

GitHub Actions では3つとも **Repository secrets** に登録してください。
ワークフローは取得ステップにだけ渡します。アクセスキーは `accessKey` ヘッダーで送信し、URLには付けません。
どれかが未設定・空白なら、CLIは通信・データ書き込みの前に終了コード3で停止します。
本物の資格情報による接続成功はまだ確認していません。設定後に dry-run が必要です。

ローカルの `npm run rakuten:sync` は `.env.local` を自動では読み込みません。
ファイルに設定した場合は Node.js 20.11以上で次を使ってください（この節以降の引数も同様に指定できます）。

```bash
CATALOG_DATASET=production node --env-file=.env.local --import tsx scripts/rakuten-sync.ts --mode links
```

---

## 3. 使い方

### まず dry-run（何も書き込まない）

```bash
CATALOG_DATASET=production npm run rakuten:sync -- --mode links
```

登録済み商品ごとに、見つかった販売ページと一致度が表示されます。

### 紹介URLを登録する

```bash
CATALOG_DATASET=production AUTOMATION_ENABLED=true \
  npm run rakuten:sync -- --mode links --apply
```

この時点では `status: unverified` で登録され、**画面には出ません**。
リンク先を開いて商品・型番・サイズ・色を確認してから表示します。

### 一致が強いものを自動で表示対象にする

```bash
CATALOG_DATASET=production AUTOMATION_ENABLED=true \
  npm run rakuten:sync -- --mode links --apply --auto-verify
```

`--auto-verify` は **型番とJANの両方**が販売ページの文言に含まれる場合だけ
`verified` にします。片方だけの一致は `unverified` のままです。

自動で `verified` にしたリンクは、判断根拠が **`identifier-match`（型番・JANの一致）**
として記録されます。**目視確認にはなりません。** リンク先を開いて確認したら、
`npm run link:set -- ... --verify --visual-check` で上書きしてください。
`validate:content` が「目視確認 N 件／型番一致のみ N 件」の内訳を表示します。

> これは「確認済み商品の低リスクな更新の自動反映」（計画書 12-3節）にあたります。
> それでも、色違い・セット品を取り違える可能性は残ります。
> **最初のうちは `--auto-verify` を使わず、目視で確認することをおすすめします。**

### 新しい商品候補を集める

```bash
CATALOG_DATASET=production npm run rakuten:sync -- \
  --mode discover --keyword "パッキングキューブ 圧縮" --category pouches

# 保存する
CATALOG_DATASET=production AUTOMATION_ENABLED=true npm run rakuten:sync -- \
  --mode discover --keyword "..." --category pouches --apply
```

候補は `datasets/production/candidates/rakuten.json` に保存されます。
**このファイルはサイトのビルドが読み込みません。** 公開物には混ざりません。

---

## 4. 一致度の判定

| 一致度 | 条件 | 扱い |
|---|---|---|
| `strong` | 型番とJANの**両方**が販売ページの文言に含まれる | `--auto-verify` で表示対象にできる |
| `weak` | 型番かJANの**片方だけ** | `unverified` で登録。人が確認するまで非表示 |
| `none` | どちらも一致しない／紹介URLが無い／許可ホスト外 | 採用しない |

- 型番の表記ゆれ（全角・ハイフン・空白）は吸収します。
- 6文字未満の型番は誤一致しやすいため、自動照合に使いません。
- JANが登録されていない商品は `strong` になりません
  （現在エース クレスタ2 06936 が該当。JANが分かれば追加してください）。
- 販売ページの文言は**データとして**扱います。そこに書かれた指示には従いません。

---

## 5. 安全のための制御

| 制御 | 内容 |
|---|---|
| 既定は dry-run | `--apply` が無ければ1文字も書き込まない |
| 自動処理の既定は OFF | `AUTOMATION_ENABLED=true` が無いと `--apply` を拒否 |
| 取得先の限定 | `openapi.rakuten.co.jp`。テスト時のみループバックへ差し替え可。リダイレクトは拒否 |
| レート制限 | 既定 1リクエスト/秒 |
| リクエスト上限 | 1回の実行で既定30回まで。超えたら停止 |
| 再試行の上限 | 429・5xx のみ、最大2回まで。400番台は即失敗（設定ミスを繰り返さない） |
| 重複実行の防止 | ロックファイルと GitHub Actions の concurrency |
| 部分適用の防止 | 検証を通してからまとめて書き込む |
| 人の判断の保護 | 候補の `adopted` / `rejected` を自動処理で上書きしない |
| 保存内容の制限 | 価格・在庫・ポイント・レビュー・画像は保存しない。APIレスポンス原文も残さない |
| 保持期間 | 未処理の候補は60日で削除（無期限に貯めない） |
| 資格情報の保護 | ログ・例外メッセージから除去。`NEXT_PUBLIC_` を付けない |
| 本番への自動反映なし | GitHub Actions はプルリクエストを作るだけ。マージは人が判断 |

---

## 6. 定期実行

既定は**手動実行のみ**です。`.github/workflows/travel-goods-rakuten-sync.yml` の
`schedule` はコメントアウトしてあります。

定期実行を始める前に:

1. 手動実行の dry-run で結果を確認する
2. `--apply` で1回動かし、生成されたプルリクエストの内容を確認する
3. それから `schedule` を有効にする（初期の上限は1日1回）

---

## 7. 資格情報が届く前に済ませた確認（2026-08-31）

アプリIDが無い状態でも確認できることは、先に済ませてあります。

### 7-1. 公式ドキュメントとの突き合わせ

[公式ドキュメント](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)を再確認し、
旧 `20220601` 接続先から現行版へ修正しました（2026-08-31）。

接続先: `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701`

`applicationId` と `accessKey` は必須です。紹介URLを取得する本ジョブでは `affiliateId` も必須にしています。

| 確認したこと | 結果 |
|---|---|
| `affiliateUrl` が返る条件 | **affiliateId を入力パラメータに含めたときだけ**返ると明記。実装と一致 |
| `itemUrl` の扱い | affiliateId を含めると `itemUrl` も `affiliateUrl` と同じ値になる（2015/7/1〜）。**`itemUrl` を「紹介URLでないURL」として扱ってはいけません** |
| レスポンスの形 | 現行ドキュメントの例は小文字（`items[0].item.itemName`）。互換性のため大文字も受ける。認証付き実APIの応答形式は未確認 |

3点目は**0件しか返らない**という形で表面化します。どちらの表記でも読めるように
パーサーを直し、単体テストを追加しました（`tests/rakuten.test.ts`）。

### 7-2. ローカルのモックで通し確認

`RAKUTEN_API_ENDPOINT_OVERRIDE`（ループバックのみ許可）を使い、
楽天APIの応答を模したサーバーに対してジョブを最後まで通しました。

```bash
npm run rakuten:mock          # 別のターミナルで起動（127.0.0.1:8791）
# 既定は小文字形式。MOCK_FORMAT=upper / flat で互換形式を確認できます

mkdir -p .preview/rehearsal && cp -r datasets/production/* .preview/rehearsal/
RAKUTEN_APPLICATION_ID=dummy RAKUTEN_ACCESS_KEY=dummy RAKUTEN_AFFILIATE_ID=dummy \
RAKUTEN_API_ENDPOINT_OVERRIDE=http://127.0.0.1:8791/ \
CATALOG_DATASET=production CATALOG_DATASET_DIR=.preview/rehearsal \
  npm run rakuten:sync -- --mode links
```

本番のデータセットを触らずに済むよう、**コピーに対して実行してください**
（`CATALOG_DATASET_DIR`）。確認できたことは次のとおりです。
モックでもアプリIDとアクセスキーヘッダーが無ければ401を返します。
モックには架空の資格情報だけを使用し、ログには資格情報の有無だけを残します。

| 場面 | 結果 |
|---|---|
| 型番とJANの両方が一致 | `strong`。`--auto-verify` を付けたときだけ `verified` になる |
| 型番だけ一致（JAN未登録） | `weak`。`unverified` で保存され、画面には出ない |
| `affiliateUrl` が無い応答 | 採用しない（リンクを作らない） |
| 小文字形式（`items` / `item`）の応答 | 7-1 の修正後は正しく読める |
| `--mode audit` | 販売継続を確認できた／できなかったを報告する |
| `--mode discover` | 既存商品と結び付かない候補だけを候補ファイルに残す |

### 7-3. 見つけて直した問題：目視確認済みリンクの上書き

通し確認の途中で、**`--apply --auto-verify` が、運営者が目視確認した既存リンクを
自動取得の結果で上書きしていました。** 販売ページが別の店舗のURLに黙って差し替わり、
根拠も `visual` から `identifier-match` に下がります。

`verified` かつ `verificationMethod: visual` のリンクを持つ商品は、自動取得の
対象から外すように直しました。ジョブの出力にも「目視確認済みのため対象外」として
表示されます。

### 7-4. 初回の実行で期待できること

**いま登録している23商品のうち、JANを持つのはエレコムの3商品だけです。**
`strong` 一致には型番とJANの両方が必要なので、**残りの商品は `weak` 止まりで、
`--auto-verify` を付けても表示対象にはなりません。**

つまり自動取得だけでは購入ボタンは増えません。実際の流れはこうなります。

1. ジョブが `unverified` のリンク（紹介URL付き）をまとめて作る
2. プルリクエストで内容を確認する
3. 運営者がリンク先を開き、色・サイズの一致を確認する
4. `npm run link:set --verify --visual-check` で表示対象にする

**3番目は人の作業です。** 探す手間は自動化できますが、確認は自動化しません。

### 7-5. 実レスポンスで確認が残っていること

- [ ] 返ってきた `affiliateUrl` のホストが `hb.afl.rakuten.co.jp` か `a.r10.to` か。
      違うホストなら保留し、楽天の公式仕様で正当性を確認するまで許可リストを広げません。
- [ ] JANで検索して該当商品が出るか。出ない場合は型番での検索に切り替わります。
- [ ] 型番だけの商品（エース各シリーズ）で、意図した商品ページが返るか。
      「クレスタS 09161」のような検索語は、関係のない商品を拾う可能性があります。
- [ ] APIの利用規約・レート制限の現行値。
- [ ] 「許可されたWebサイト」の制限が、GitHub Actions からのリクエストにどう適用されるか。
      拒否される場合は `RAKUTEN_API_REFERER` を設定してください。
- [ ] リクエスト数の上限。商品23件で **24リクエスト**を使いました（既定の上限は30）。
      商品を増やすときは、ワークフローの `max_requests` を上げてください。

---

## 8. 費用

- 楽天APIの利用料は実装時点で確認してください。
- GitHub Actions の実行時間が消費されます（1回あたり数分程度の想定）。
- このジョブは AI/API を使いません（LLM費用は 0円）。

**ドメイン・ホスティングとは別枠の費用です。** 定期実行を有効にする前に、
実行回数と消費時間を見積もってください。
