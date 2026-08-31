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

### 2-1. 楽天ウェブサービスのアプリIDを取る

1. 楽天ウェブサービス（`webservice.rakuten.co.jp`）でアプリを登録し、**アプリID
   （applicationId）** を取得します。
2. 楽天アフィリエイトに登録し、**アフィリエイトID（affiliateId）** を確認します。
   **affiliateId を渡さないと、APIは紹介URL（`affiliateUrl`）を返しません。**

### 2-2. 設定する場所

**チャットに貼らないでください。** 次のいずれかに設定します。

- ローカル: `.env.local`（git 管理外）
- GitHub Actions: リポジトリの Settings → Secrets and variables → Actions

```
RAKUTEN_APPLICATION_ID=...
RAKUTEN_AFFILIATE_ID=...
AUTOMATION_ENABLED=false   # 書き込みを行う実行だけ true にする
```

`NEXT_PUBLIC_` は付けないでください。付けるとビルド成果物に埋め込まれます。

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
| 取得先の限定 | `app.rakuten.co.jp` のみ。任意のURLを叩けない |
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

## 7. 初回に必ず確認すること

**この実装環境から楽天APIへ接続できないため、実レスポンスとの突き合わせができていません。**
初回の実行時に、次を確認してください。

- [ ] `Items` の形式（`[{Item:{…}}]` か `[{…}]` か）— どちらでも読めるようにしてありますが、
      0件しか返らない場合はレスポンス形式を確認してください。
- [ ] `affiliateUrl` が実際に返っているか（affiliateId の設定漏れだと返りません）。
- [ ] 返ってきた `affiliateUrl` のホストが `hb.afl.rakuten.co.jp` か `a.r10.to` か。
      **違うホストなら `src/lib/affiliate/rakuten.ts` の許可リストに追記が必要です**
      （現状は追記するまでリンクが拒否されます）。
- [ ] JANで検索して該当商品が出るか。出ない場合は型番での検索に切り替わります。
- [ ] APIの利用規約・レート制限の現行値（実装時点の想定と変わっている可能性があります）。

---

## 8. 費用

- 楽天APIの利用料は実装時点で確認してください。
- GitHub Actions の実行時間が消費されます（1回あたり数分程度の想定）。
- このジョブは AI/API を使いません（LLM費用は 0円）。

**ドメイン・ホスティングとは別枠の費用です。** 定期実行を有効にする前に、
実行回数と消費時間を見積もってください。
