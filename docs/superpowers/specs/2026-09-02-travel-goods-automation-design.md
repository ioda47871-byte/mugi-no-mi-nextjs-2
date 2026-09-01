# travel-goods-site 無人運用 設計書

- **作成日**: 2026-09-02（JST）
- **対象**: `travel-goods-site/`
- **起点コミット**: `e57406d283dff20d1b405b85c9c159d0282dbbfd`（`main`。作成時点で `main` はこのコミットのまま進んでいない）
- **状態**: 設計のみ。実装コード・データ・workflow・外部設定はこの変更に含まれない
- **採用案**: 案C（ハイブリッド、重心はA側）

---

## 1. 目的と非目的

### 1.1 目的

追加費用 0 円のまま、`travel-goods-site` を次の状態にする。

1. 通常時は人が関与しない。
2. 確実だと機械的に確定できるものだけを自動公開する。
3. 判断できないものは非公開のまま保留し、勝手に公開しない。
4. 1 件の失敗で全体を止めない。
5. 通知は例外時だけに絞る（7 日継続する故障、安全問題、自動 revert、自動マージ不能など）。
6. 状態と変更履歴を Git だけで監査・復元できる。

### 1.2 採用する基本案

**案C（ハイブリッド）。ただし重心は明確に A 側。**

- GitHub Actions を主系のオーケストレータとする。
- **公開可否の判定はすべて決定的ルールで行う。**
- Workers AI と Browser Run は補助に限定し、**公開判定に一切入れない**。
- **新しい Cloudflare Worker・KV・D1・Cloudflare Cron は作らない。**

### 1.3 非目的（この設計では扱わない）

| 項目 | 理由 |
|---|---|
| 価格・在庫数・ポイント・レビューの取り込みと表示 | 現行が意図的に保存しない設計。静的サイトで鮮度責任を負えない |
| Amazon（PA-API）対応 | 未実装。売上実績要件があり無料枠の議論と別軸 |
| OpenAI API / Anthropic API の利用 | 費用条件により使用しない |
| Cloudflare Worker を常駐オーケストレータにする構成 | Free の CPU 制限で成立しない（2 節） |
| KV / D1 での状態管理 | Git で足りる（9 節） |
| 旅行先別記事の本番投入 | 別の公式出典が必要。7.8 節で解禁条件のみ定義 |
| `SITE_MODE=production` への切替 | 段階4。この設計書では前提条件のみ記載 |

---

## 2. 現行コードの事実

`e57406d` を読んで確認した内容。この設計の前提はすべてここから取る。

### 2.1 すでに存在し、そのまま使えるもの

| 機能 | 実体 | 内容 |
|---|---|---|
| 型番・JAN 照合 | `src/lib/rakuten/match.ts` | `strong`＝型番と JAN の**両方**が販売ページ文言に含まれる／`weak`＝片方／`none`。型番は正規化後 6 文字未満なら自動照合対象外 |
| 照合の理由・阻害要因の記録 | 同上 `MatchResult.reasons` / `.blockers` | 「JAN が登録されていない」と「JAN が見つからない」を**別の文字列で区別している** |
| 目視確認リンクの保護 | `isHumanVerifiedLink()` | `status==='verified'` かつ `verificationMethod==='visual'` を自動取得の対象外にする |
| レート制御・予算・再試行 | `RakutenClient` | 既定 1 req/秒、実行あたり最大リクエスト数、429 と 5xx のみ再試行（最大 2 回・指数バックオフ 2s→4s、上限 8s）、15 秒タイムアウト |
| 取得先の固定 | `RakutenClient.resolveEndpoint()` | 本番は `openapi.rakuten.co.jp` のみ。上書きはループバック限定。`redirect: 'error'` |
| 秘密情報の伏せ字 | `redactSecrets()` | 3 つの資格情報を出力前に置換。例外メッセージにも適用 |
| API エラーの限定出力 | `readApiErrorMessage()` | `errors.errorMessage` のみを 200 文字に切って返す |
| 候補の隔離保管 | `src/lib/rakuten/candidates.ts` | `datasets/production/candidates/rakuten.json`。人が付けた `adopted`/`rejected` を自動処理が戻さない。60 日で prune |
| CTA 表示条件 | `resolveMerchantLinks()` | 商品一致・`verified`・`matchedVariant===product.variant`・店舗有効・HTTPS 許可ドメインの 5 条件すべて |
| 公開ゲート | `scripts/check-release.ts` | 成果物走査で禁止文字列・秘密情報・robots・sitemap・ダミー CTA を検査 |
| 禁止文字列の一覧 | `src/lib/release/forbidden-output.ts` | 旧サイト名・Vercel URL・旧予定ドメイン・デモ文言・テスト値 |
| 日付ベースの点検 | `src/lib/catalog/audit.ts` | 外部アクセスなし。仕様 180 日／安全情報 90 日／出典 180 日／リンク 180 日／記事 365 日／候補 30 日 |
| 記事の公開検査 | `evaluatePublication()` | 未記入マーカー・生 HTML・本文 400 文字下限・出典 `editorialUse: verified`・参照商品が `published`・`reviewedAt`＋`reviewer` 必須 |
| 生 HTML 拒否 | `findUnsafeMarkdown()` | script/iframe/style/on属性/javascript:/data:text/html/生HTMLタグ |
| 週次点検と Issue 自動開閉 | `.github/workflows/travel-goods-audit.yml` | **所見が無ければ何も通知しない。直れば自動クローズ。すでに無人** |
| 単体テスト | `tests/` 8 ファイル | 147 件。外部通信なし（ループバックのモックのみ） |
| E2E | `tests/e2e/` 3 系統 | デモ 50 ／本番データ 42 ／購入導線 34 ＝ 126 件 |
| 楽天モックサーバー | `scripts/rakuten-mock-server.mjs` | 資格情報なしでジョブを動かせる |

### 2.2 現行データの実測（設計判断に直結する）

| 指標 | 値 | 設計への影響 |
|---|---|---|
| 商品 | 23 件（`published` 22／`review` 1） | — |
| **JAN を持つ商品** | **3 / 23 件** | **`strong` 一致がほぼ成立しない。S 判定は当面まれ**（5.5 節） |
| `sizeBasis: 'unspecified'` | 12 / 23 件 | 「測定条件不明なら公開しない」を条件に入れると過半が落ちる（17 節で測定） |
| 出典 | 24 件 | — |
| `provenance: direct-fetch` | 20 / 24 件 | 残り 4 件は提供資料由来 |
| `editorialUse: verified` | 23 / 24 件 | — |
| `automatedFetch: allowed` | 20 / 24 件（残り 4 件 `unverified`） | 自動取得の対象は 20 件が属する出版社のみ |
| **`llmInput: allowed`** | **0 / 24 件（全件 `unverified`）** | **メーカー本文を AI へ渡せない。4.4 節で整合させる** |
| 記事 | 公開 7 本／下書き 3 本 | `intentKey` は 10 件すべて相異 |
| 楽天リンク | 15 件（`verified`＋`visual` 14／`unverified` 1） | `identifier-match` の実績は 0 件 |
| ブランド表記 | 7 種類（下記） | 正規化が必要（5.2 節） |

現行の `brand` 文字列（そのまま）:
`エース（ACE）` 5 / `エース（ace. GENE LABEL）` 4 / `エース（ace. TOKYO LABEL）` 3 / `プロテカ（PROTECA）` 2 / `ワールドトラベラー（World Traveler）` 2 / `エレコム（ELECOM）` 3 / `アンカー・ジャパン（Anker）` 4

### 2.3 拡張が必要なもの

| 対象 | 現状 | 必要な拡張 |
|---|---|---|
| `--mode audit` | 「型番・JAN で再検索して 1 件でも一致すれば生存」 | **登録した店舗のページが消えても別店舗が売っていれば「確認できました」と出る。** 8 節で 6 信号に分解する |
| `--mode links` | `matchedVariant` に商品側の `variant` をそのままコピー | **販売ページ側の実際の選択肢を見ていない。** 色・容量・サイズ・セット数の検査を追加（5.6 節） |
| `--mode discover` | キーワード検索して候補を保存するだけ | メーカー公式仕様を取らないため商品登録まで到達しない（5 節） |
| `RakutenItem` 型 | `availability` をスキーマに定義していない。`.passthrough()` のため**受信できれば実行時には存在する** | 保存せず判定にだけ使う経路（8.2 節）。**ただし現行エンドポイント（`IchibaItem/Search/20260701`）が実際に `availability` を返すかは未検証**。段階1 で確認する（17.2 節） |
| `articleMetaSchema` | `.strict()`。`formatId` 等を持てない | `formatId` / `formatVersion` / `reviewMethod` の追加（7.3 節）。**スキーマ変更はコード PR** |
| `create-draft.ts` | テンプレート生成のみ。未記入マーカーを必ず残す | 検証済み `Fact` から決定的に組み立てる生成器（7 節） |
| 楽天 workflow | `workflow_dispatch` のみ（`schedule` はコメントアウト） | 日次スケジュール・予算・繰越（11 節） |
| 停止スイッチ | `AUTOMATION_ENABLED` のみ（書き込み可否） | 7 つに分割（13 節） |

### 2.4 新規実装が必要なもの

- メーカー取得アダプター層（5.3 節）
- S/A/B 判定器（5.5 節）
- 記事構成プラグイン層（7.3 節）
- リンク健全性の 6 信号と状態機械（8 節）
- Git 状態ファイル 3 本と繰越キュー（9 節）
- 自動 PR・自動マージ・公開後検査・自動 revert（12 節）

### 2.5 設計を左右する外部事実

| 事実 | 出典 | 確認日 |
|---|---|---|
| リポジトリが **public** | GitHub API `private: false` | 2026-09-02 |
| public リポジトリの標準ランナーは Actions 無料（分数無制限） | [GitHub Docs](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) | 2026-09-02 |
| Workers Free の CPU は 1 呼び出し **10 ms**、Cron Triggers は**アカウント 5 本**、リクエスト 100,000/日 | [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) | 2026-09-02 |
| **`GITHUB_TOKEN` が起こしたイベントは新しい workflow run を作らない** | [GitHub Docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow) | 2026-09-02 |

Workers Free の 10 ms CPU では 23 商品のカタログ JSON を解析して照合する処理が入らない。
Actions が public リポジトリで無料である以上、**主系を Cloudflare 側へ移す理由はない**。これが案C の重心を A 側に置く根拠である。

---

## 3. 全体アーキテクチャ

### 3.1 役割分担

| 層 | 担当 | やること | 費用 |
|---|---|---|---|
| 指揮 | **GitHub Actions** | スケジュール、予算管理、楽天 API 呼び出し、メーカー公式取得、照合、S/A/B 判定、記事生成、検証、ビルド、コミット／PR、Issue 通知、公開後検査、自動 revert | 無料（public） |
| 状態 | **Git 上の JSON** | 繰越キュー、日次予算、リンク健全性 | 0 円 |
| 配信 | **Cloudflare Pages** | `main` 更新で自動デプロイ | 500 ビルド/月 |
| 補助（任意） | **Browser Rendering REST** | 選択式ページの初期選択状態の確認。**結果は PR の参考情報にのみ使う** | 1 日 8 分（自己制限） |
| 補助（任意） | **Workers AI REST** | 生成記事の再検査（補助）、重複意図の指摘。**公開判定に入れない** | 無料割当の 80%（自己制限） |

Browser Rendering も Workers AI も REST エンドポイントを持つため、**Worker を書かずに Actions から直接呼べる**。
これにより Worker の 10 ms CPU 制約、Cron 5 本制限、binding 設定、Cloudflare 側での秘密管理がすべて不要になる。

### 3.2 データの流れ（概略）

```
                    ┌──────────────────── GitHub Actions（主系）─────────────────────┐
                    │                                                                │
 楽天商品検索API ──►│ 探索 → 照合 → メーカー公式取得 → S/A/B判定 → 記事生成 → 検証   │
 メーカー公式ページ ►│                        │                                       │
                    │                        ▼                                       │
                    │        Git状態ファイル（queue / budget / link-health）          │
                    │                        │                                       │
                    │                        ▼                                       │
                    │   自動ブランチ → 変更パス検査 → CI → PR → 自動マージ            │
                    └────────────────────────┬───────────────────────────────────────┘
                                             ▼
                                   main 更新（1日1回）
                                             ▼
                              Cloudflare Pages 自動デプロイ
                                             ▼
                          公開後検査（失敗ならその日の変更を revert）

  補助（落ちても本線は止まらない）:
    Browser Rendering REST ──► 初期選択状態の観測 ──► PR の参考情報
    Workers AI REST        ──► 生成記事の再検査    ──► PR の参考情報／保留の根拠
```

### 3.3 縮退運転

補助（Browser Run / Workers AI）が使えない場合、**その分の判定材料が得られないだけ**で、本線は止まらない。
材料が足りない対象は B 判定（非公開保留）に落ちる。**補助が落ちて公開が甘くなることはない。**

---

## 4. 信頼境界と外部入力

### 4.1 信頼境界

| 境界 | 内側（信頼する） | 外側（信頼しない） |
|---|---|---|
| リポジトリ | `main` にマージされたコードと workflow | 自動処理が作る差分（必ず CI と変更パス検査を通す） |
| データ | `validate:content` を通ったカタログ | 楽天 API の応答、メーカーページの HTML |
| 判定 | 決定的ルールの出力 | Workers AI の出力 |
| 秘密 | GitHub Secrets | それ以外すべて |

### 4.2 外部入力の扱い

楽天の `itemName` / `itemCaption`、メーカーページの HTML は**すべて外部の書き手が書いた文字列**である。

1. **指示として解釈しない。** Zod スキーマを通し、既知のフィールドだけ取り出す（実装済み）。
2. **メーカーサイトの本文全体を保存しない。** 保存するのは次だけ:
   - 構造化した仕様値（`weightG` / `outerSizeMm` / `capacityL` / `sizeBasis` / `measurementState` / `specs`）
   - 公式 URL
   - 確認日（`checkedAt`）
   - 抽出対象範囲の**内容ハッシュ**（SHA-256、変化検知用）
   - 取得失敗理由（HTTP ステータスと分類コードのみ。本文は残さない）
3. **外部レスポンス本文を Git に保存しない。**
4. **取得先ホストを許可リストで固定**し、リダイレクト追従を拒否（実装済み）。
5. 記事本文への生 HTML 混入は `findUnsafeMarkdown()` が拒否（実装済み）。

### 4.3 ブロックを迂回しない

- `robots.txt` が拒否しているパスは取得しない。
- HTTP 403 / 429 を受けたら、**User-Agent の偽装、IP の切替、間隔の短縮などの回避手段を取らない。**
- 403 が続くドメインは取得対象から外し、メーカー単位の故障として扱う（13.2 節）。
- レート制限は緩和申請の有無にかかわらず、設計値（1 req/秒）を下回らない。

### 4.4 `llmInput` と AI 利用の整合

**現在、24 出典すべてが `llmInput: 'unverified'` である。**
`Source` 型のコメントは「原文を外部AIへ渡してよいか。公開ページを見つけただけでは allowed にしない」と定めている。

この設計は次の方針でこれと整合する。

> **メーカーサイトの本文を Workers AI に渡さない。**
> Workers AI に渡すのは、**自サイトが生成した構造化データと生成済み記事本文**だけである。

具体的に AI へ渡してよいもの／渡さないもの:

| 渡す | 渡さない |
|---|---|
| 自サイトが生成した記事本文（自分が書いた文字列） | メーカーページの HTML・本文 |
| `Fact` の数値と単位（構造化済み） | 楽天の `itemCaption` 全文 |
| 商品の `brand` / `model` / `variant`（自サイトの登録値） | 取得した外部レスポンスの生データ |
| 既存記事の `intentKey` とタイトル | 出典ページの引用文 |

この方針であれば、`llmInput` を `allowed` に変更しなくても Workers AI を使える。
**`llmInput` の変更は、この設計の前提ではない。** 将来メーカー本文を渡したくなった時点で、出版社ごとに判断する（17 節）。

---

## 5. 商品発見・仕様取得・S/A/B 判定

### 5.1 全体の流れ

```
週2回（月・木）
 1. 楽天API で候補収集（--mode discover の拡張）
 2. 決定的な足切り（型番/JAN 抽出、中古・訳あり・セット語の除外）
 3. ブランド正規化 → 許可メーカーか判定
 4. メーカー公式ページの特定（許可メーカーのみ）
 5. robots.txt 確認 → 取得 → アダプターで構造化抽出
 6. S/A/B 判定
 7. S → published で登録 ／ A → review で登録し翌日再確認 ／ B → 候補のまま保留
```

**週 3 件まで**（新規登録の上限）。超過分はキューへ繰り越す。

### 5.2 対象メーカーとブランド正規化

初期の許可メーカーは 5 グループ。現行の `brand` 文字列を正規化して扱う。

| 正規化キー | 表示名 | 現行 `brand` からのマッピング | 公式ドメイン |
|---|---|---|---|
| `ace` | ACE / ace. / ace.TOKYO | `エース（ACE）`, `エース（ace. GENE LABEL）`, `エース（ace. TOKYO LABEL）` | `store.ace.jp` |
| `proteca` | PROTECA | `プロテカ（PROTECA）` | `store.ace.jp`（プロテカ公式通販） |
| `world-traveler` | WORLD TRAVELER | `ワールドトラベラー（World Traveler）` | `store.ace.jp`（ワールドトラベラー公式通販） |
| `elecom` | ELECOM | `エレコム（ELECOM）` | `elecom.co.jp` |
| `anker` | Anker | `アンカー・ジャパン（Anker）` | `ankerjapan.com` |

正規化は**明示的な対応表**で行う。文字列の部分一致による推測はしない。
表に無いブランドの候補は、**そこで停止して候補のまま**にする（自動登録しない）。

> **注記**: `elecom.co.jp` は過去に取得が HTTP 403 で拒否された実績がある（`docs/status.md`）。
> アダプターは実装するが、**取得できないメーカーは自動的に「メーカー単位の故障」として扱い、候補を保留する**（13.2 節）。

### 5.3 メーカー取得アダプター

```
src/lib/manufacturers/
  registry.ts        … 正規化キー → アダプターの対応表
  types.ts           … アダプターの契約
  ace.ts             … ACE / PROTECA / WORLD TRAVELER（同一ドメイン、レイアウト別）
  elecom.ts
  anker.ts
```

各アダプターの契約:

| 項目 | 内容 |
|---|---|
| `manufacturerId` | 正規化キー |
| `allowedHosts` | このアダプターが取得してよいホスト（完全一致） |
| `findProductUrl(model, variant)` | 型番から公式商品ページ URL を組み立てる／検索する |
| `extract(html)` | 構造化仕様を返す。**取れない項目は `null`。推定で埋めない** |
| `extractedRangeHash(html)` | 抽出対象範囲だけの SHA-256。ページ全体のハッシュではない |
| `recallTerms` | このメーカーのリコール告知ページで使われる語 |

アダプターは**メーカーサイト本文全体を返さない**。返すのは構造化仕様・公式 URL・確認日・内容ハッシュ・失敗理由のみ（4.2 節）。

取得の順序:

1. `robots.txt` を取得し、対象 URL が `Disallow` に該当しないか確認する。該当すれば取得しない。
2. `Source.automatedFetch` が `'not-allowed'` の出版社は取得しない。
3. 1 リクエスト/秒を超えない。同一ドメインへの連続取得は 2 秒間隔。
4. HTTP 403 / 429 を受けたら**その場で諦める**（4.3 節）。

### 5.4 判定に使う信号

| 信号 | 取得元 | 決定的か |
|---|---|---|
| 型番一致 | `matchProduct()` の `reasons` | 決定的 |
| JAN 一致 | 同上 | 決定的 |
| JAN の有無 | `blockers` の「商品に JAN が登録されていない」 | 決定的 |
| 色・容量・サイズ・セット数 | `variant` トークンと `itemName`＋`itemCaption` の正規化照合 | 決定的 |
| 正規の楽天紹介 URL | `itemPageUrlFromAffiliateUrl()` が `https://item.rakuten.co.jp/` を返す | 決定的 |
| 初期選択状態 | 6a: Browser Rendering REST（規約確認後）／ 6b: 販売ページ文言に他バリエーション表記が無いこと | 6b は決定的だが**推定**。6a も 6b も使えなければ B（5.5 節） |
| 公式仕様の URL・確認日 | アダプター | 決定的 |
| リコール・販売停止 | メーカー公式のリコール告知ページの語検査 | 決定的 |
| 重複 | `brand`＋`model`＋`variant` の完全一致 | 決定的 |

### 5.5 S / A / B 判定

#### S 判定 → **即時自動公開**

次を**すべて**満たす。

1. ブランドが許可メーカーに正規化できる
2. メーカー公式商品ページを取得でき、構造化仕様を抽出できた
3. 型番一致 **かつ** JAN 一致（＝ `matchProduct` が `strong`）
4. 色・容量・サイズ・セット数のトークンが `variant` と一致し、矛盾する別表記がない
5. `affiliateUrl` の `pc` から `https://item.rakuten.co.jp/` の URL を取り出せる
6. **別商品の初期選択がない**。次の 6a または 6b のいずれかで確認する:
   - **6a（観測。規約確認後）**: Browser Rendering で販売ページを描画し、初期選択が対象バリエーションと一致することを観測する。
     **これは楽天の商品ページを取得する行為であり、17 節 未解決事項1 の解決が前提**である。
   - **6b（推定。段階2 の既定）**: 販売ページ文言（`itemName`＋`itemCaption`）に、
     対象バリエーション以外の色・容量・サイズ・セット数の表記が**一切現れない**。
     すなわち選択式ページである徴候が無い。**これは観測ではなく推定であり、6a より弱い根拠である。**
7. 公式仕様の URL と確認日を `Source`（`provenance: 'direct-fetch'`）として登録できる
8. リコール・販売停止の対象でない（メーカー公式のリコール告知に該当語がない）
9. `brand`＋`model`＋`variant` が既存商品と重複しない

> **現実の見積り**: 現在 JAN を持つ商品は 23 件中 3 件しかない。条件 3 により、
> **S 判定は当面まれにしか成立しない。** これは設計の欠陥ではなく、
> 「JAN が確認できる商品だけを即時公開する」という厳しさをそのまま反映した結果である。
> 段階1 の観察運転で S/A/B の実際の分布を測定する（17 節）。

#### A 判定 → **24 時間後の再取得で同一結果なら自動公開**

次を**すべて**満たす。

1. S 判定の条件 1・2・4・5・6・7・8・9 を満たす
2. **JAN が未公表**（`blockers` が「商品に JAN が登録されていない」であり、「JAN が見つからない」ではない）
3. 型番が**完全一致**（正規化後の文字列が販売ページ文言に含まれる。かつ正規化後 6 文字以上）
4. メーカー公式仕様と楽天販売ページの情報が矛盾しない（容量・サイズ・色の表記が両方に現れ、食い違わない）
5. **24 時間後の再取得で、公式仕様の内容ハッシュと楽天の照合結果が同一**

再取得は翌日のジョブが行う。`status: 'review'` で登録し、翌日の一致確認後に `published` へ上げる。
不一致なら B へ落とし、`review` のまま保留する。

初回観測（公式仕様の内容ハッシュ、楽天の `itemCode` と照合結果）は
`automation/queue.json` に `kind: 'tier-a-recheck'` として記録し、翌日のジョブがこれと突き合わせる。
記録するのはハッシュと判定結果だけで、**取得した本文は保存しない**（4.2 節）。

#### B 判定 → **非公開保留**

次の**いずれか**に該当したら B。

1. 色・サイズ・セット数が不明（`variant` のトークンが販売ページ文言に見つからない）
2. 初期選択が別バリエーション、または 6a／6b のどちらでも確認できなかった
   （6a が使える場合に観測できなかったとき、および 6b で他バリエーションの表記が見つかったとき）
3. 公式情報を取得できない（403、robots.txt 拒否、アダプター未対応、抽出失敗）
4. 仕様矛盾（公式と楽天で容量・サイズ・色が食い違う／公式内で単位換算が合わない）
5. リコール情報を確認できない（リコール告知ページ自体を取得できない）
6. 型番が曖昧（正規化後 6 文字未満、または複数商品に一致）
7. ページ取得拒否
8. **AI（補助）とルールの判定が一致しない**

B は **`automation/queue.json`** に `kind: 'candidate'` として残す。商品としては登録しない。
60 日を過ぎた未処理の候補はキューから落とす（既存 `pruneCandidates()` と同じ保持期間）。

> **既存の `datasets/production/candidates/rakuten.json` は自動処理では使わない。**
> 自動変更を許可するパス（12.2 節）に含まれていないためである。
> 既存ファイルと `--mode discover --apply` の手動実行経路はそのまま残すが、
> 定期実行が書き込むのは `automation/queue.json` だけとする。この保存先の変更は段階0 のコード変更で行う。

#### 判定の優先順位

**B の条件に 1 つでも該当したら、S/A の条件を満たしていても B。** 保留側が常に勝つ。

### 5.6 `matchedVariant` の扱い（現行の欠陥の修正）

現行の `--mode links` は `matchedVariant: product.variant` と**商品側の値をコピーしているだけ**で、
販売ページ側の実際の選択肢を見ていない。CTA 表示条件（`resolveMerchantLinks`）は
`link.matchedVariant !== product.variant` を弾くが、コピーである以上**必ず一致してしまい、この検査が実質無効**である。

修正: `matchedVariant` には**販売ページ文言から抽出したトークンを結合した文字列**を入れる。
抽出できなければ `null` にはできない（型が `string`）ため、
**抽出できない場合はリンクを `unverified` のままにして書き込まない**。

なお、購入導線に出している案内
「色・サイズが選択式の場合は、販売ページで対象の仕様を選択してください。」（`MerchantActions.tsx`）は、
この検査を入れても**外さない**。6b が推定にとどまる以上、読者側の最後の確認手段として残す。

---

## 6. 将来のカテゴリ拡張

### 6.1 方針

- 楽天の旅行用品全般を候補収集の対象にする（既存 4 カテゴリに限定しない）。
- **既存 4 カテゴリ**（`suitcases` / `backpacks` / `pouches` / `power-banks`）の商品は S/A/B 判定後に公開できる。
- **新カテゴリの商品は公開しない。候補として蓄積するだけ。**

### 6.2 カテゴリ追加 PR の自動作成条件

次を**すべて**満たしたとき、カテゴリ追加 PR を自動作成する。

1. 同種の**有効候補が 5 商品以上**（有効＝許可メーカー、型番抽出可、公式ページ取得可）
2. その 5 商品に**共通する比較仕様が 3 項目以上**（例: 重量・容量・外寸がすべて非 null）
3. 公式情報を**安定して取得できる**（直近 14 日で同一メーカーの取得成功率 80% 以上）

### 6.3 カテゴリ追加 PR の扱い

**このPR だけは自動マージしない。** 理由:

- `CATEGORIES` は `src/lib/catalog/types.ts` の `const` であり、**コード変更**になる。
- 12.2 節の原則「自動処理はコードを変更しない」に抵触する。

したがってカテゴリ追加 PR は、**変更内容の提案（差分の下書き）を含む Issue または Draft PR** として作成し、
人がコード PR として起こす。カテゴリ追加後の商品運用は無人化する。

---

## 7. 記事企画・構成プラグイン・生成・検査

### 7.1 方針

- **機械検査を通った記事は人間確認なしで自動公開する。**
- **週 2 本まで。**
- 商品は複数記事で重複してよい。重複判定は商品ではなく**検索意図**（`intentKey`）で行う。
- 商品数は 3 件に固定しない。
- **無理に件数を合わせるための商品追加は禁止。**
- 根拠のないおすすめ順を作らない。軽さ・容量・拡張性など**役割で分ける**。

### 7.2 商品数と形式の対応

| 対象商品数 | 取りうる形式 |
|---:|---|
| 0 | **生成しない** |
| 1 | 仕様解説（`spec-explainer` プラグインのみ） |
| 2 | 比較 |
| 3〜5 | 比較／「○選」 |
| 6 以上 | 一覧 |

「○選」形式は**全体の 40% 程度を上限**とする。固定比率ではなく、
直近 20 本のうち `selections` が 8 本を超えていたら、その回は他形式を選ぶ。

### 7.3 記事構成プラグイン

```
src/lib/article-formats/
  registry.ts        … formatId → プラグインの対応表
  types.ts           … プラグインの契約
  selections.ts      … ○選
  comparison.ts      … 2商品以上の比較／条件別比較
  purpose-guide.ts   … 目的別・選び方ガイド
  trip-duration.ts   … 旅行日数別
  destination.ts     … 旅行先別（7.8 節。初期は無効）
  spec-explainer.ts  … 1商品の仕様解説
```

各プラグインが持つもの:

| 項目 | 内容 |
|---|---|
| `formatId` | 形式の識別子（例 `selections`） |
| `formatVersion` | 構成の版（例 `1`）。**上げても既存記事を書き換えない** |
| `eligibility(catalog)` | この形式を生成してよいかの判定 |
| `minProducts` / `maxProducts` | 必要商品数 |
| `requiredSpecs` | 全対象商品で非 null が必要な仕様 |
| `buildTitle(context)` | タイトル生成 |
| `outline(context)` | 見出し構成 |
| `selectProducts(catalog, context)` | 商品選定（役割で分ける。順位を付けない） |
| `forbiddenExpressions` | 禁止表現（形式固有） |
| `validate(article, context)` | 専用検証 |

記事には `formatId`・`formatVersion`・`intentKey` を保存する。
`articleMetaSchema` は `.strict()` なので、これらの追加には**スキーマ変更（コード PR）が必要**である。

**構成更新で既存記事を無条件に書き換えない。** `formatVersion` を上げた場合、
既存記事は旧版のまま残り、次回の週次再検査で不合格になった場合にのみ再生成の候補になる。

**新構成の追加はコード PR として行う。自動コンテンツ処理がコードを変更することは禁止する。**

### 7.4 初期に有効化する形式

| `formatId` | 説明 | 段階3 で有効 |
|---|---|---|
| `selections` | ○選 | ○ |
| `comparison` | 2商品以上の比較・条件別比較 | ○ |
| `trip-duration` | 旅行日数別 | ○ |
| `purpose-guide` | 目的別・選び方ガイド | ○ |
| `spec-explainer` | 重量・容量・寸法・機能別の仕様解説（1商品可） | ○ |
| `destination` | 旅行先別 | **×**（7.8 節） |

### 7.5 `intentKey` と重複判定

`intentKey` は「検索意図」を表す識別子で、次の軸の組み合わせから決定的に組み立てる。

`{カテゴリ}-{比較軸}-{旅行日数}-{国内/海外}-{移動手段}-{目的}`（該当しない軸は省略）

- 同じ商品でも、**旅行先・日数・移動手段・目的・カテゴリ・比較軸が異なれば別記事としてよい。**
- `intentKey` が既存記事と一致したら生成しない。
- **本文だけを言い換えた実質同一記事は拒否する。** 判定は次の決定的検査:
  - 本文の 3-gram Jaccard 係数が既存記事のいずれかと **0.60 以上**なら拒否
  - 比較表の「対象商品 ID 集合 × 比較軸集合」が既存記事と完全一致したら拒否

閾値 0.60 は初期値であり、段階1 の観察運転で調整する（17 節）。

### 7.6 生成

1. 導入文はカテゴリ・形式ごとの**固定文**。
2. 比較表は `Fact` から生成し、`sizeBasis` と `measurementState` をラベルに反映（既存の `sizeLabel()` を使う）。
3. 数値はすべて `Fact.value` をそのまま引用し、`sourceId` と `checkedAt` を併記する。
4. `null` は「公表なし」と表示する。**補完しない。**
5. 出典一覧は参照した `sourceId` の全件。
6. **形容詞的な評価を書かない。**

### 7.7 記事の自動検査（公開判定は決定的検査のみ）

次を**すべて**満たしたときだけ公開する。

| # | 検査 | 種別 |
|---:|---|---|
| 1 | 記事内の数値が構造化データに存在する | 決定的 |
| 2 | 型番・JAN・容量・重量・寸法が構造化データと一致する | 決定的 |
| 3 | 数値ごとに `sourceId` がある | 決定的 |
| 4 | 不明項目の補完がない（`null` を数値で埋めていない） | 決定的 |
| 5 | 実体験表現がない（「使ってみた」「持ち歩いた」等の語検査） | 決定的 |
| 6 | 根拠のない最上級・断定がない（「最強」「一番」「必ず」「おすすめ」等） | 決定的 |
| 7 | 比較表と本文が一致する（本文が言及する値が表の値と同一） | 決定的 |
| 8 | `intentKey` 重複なし | 決定的 |
| 9 | 本文の高類似を拒否（7.5 節） | 決定的 |
| 10 | 対象商品がすべて `published` | 決定的 |
| 11 | 原則 2 商品以上。1 商品形式は `spec-explainer` のみ | 決定的 |
| 12 | TODO・未設定・デモ文言がない | 決定的（既存 `DRAFT_PLACEHOLDER_MARKERS`） |
| 13 | `evaluatePublication()` が ok | 決定的（既存） |
| 14 | プラグインの `validate()` が ok | 決定的 |
| 15 | Workers AI による再検査 | **補助。不一致なら公開せず保留（B と同じ扱い）。合格を公開の根拠にはしない** |

検査 15 の位置づけ: **AI が「良い」と言っても公開しない。AI が「おかしい」と言ったら公開しない。**
AI は公開を止める方向にのみ働く。

**`reviewedAt` / `reviewer` の扱い**: `evaluatePublication()` は両方を必須とし、
コメントで「自動検査の合格を人の確認の代わりにしません」と明記している。
生成記事に限り `reviewer: 'automation:<formatId>@<formatVersion>'`、
`reviewMethod: 'derived-from-verified-facts'` を認める**契約変更**を行う。
人のレビューを機械が名乗るのではなく、**別種のレビューとして記録する**形である。
この変更は `articleMetaSchema` と `evaluatePublication()` のコード PR で行う（自動処理では変更しない）。

### 7.8 再検査と自動非公開

- **公開 24 時間後**に全検査を再実行する。
- **週次**で全公開記事に全検査を再実行する。
- **根拠が不足した記事は自動的に非公開にする**（`status: 'published'` → `'review'`）。削除はしない。
- 自動非公開が発生したら Issue を更新する（13.2 節）。

### 7.9 旅行先別記事（将来）

- **初期は無効。** `destination.ts` は登録するが `eligibility()` が常に `false` を返す。
- 気候・電源・航空ルール・持込制限・現地事情には**別の公式出典が必要**である。
- **公式情報を構造化取得できない内容を AI の知識だけで書かない。**
- 初期に安全に生成できるのは、次の軸だけを使う記事:
  旅行日数／国内・海外／移動手段／機内持込・預入／荷物量／商品仕様
- 旅行先データの構造化取得機能（航空会社の規定・電源プラグ規格など、公式出典を `Source` として登録できる仕組み）を追加した後に解禁する。

---

## 8. リンク監視・交換

### 8.1 現行の欠陥

`--mode audit` は「型番・JAN で再検索して 1 件でも一致すれば生存」としている。このため:

- 登録した店舗のページが消えても、**別店舗が売っていれば「販売を確認できました」と出る**。
- 逆に一時的に検索へ出ないだけで「販売終了の疑い」になる。

### 8.2 6 つの信号を別々に記録する

| 信号 | 取り方 | 保存先 |
|---|---|---|
| `itemCodeAlive` | 登録済み `externalProductId`（`shopCode:itemCode`）が検索結果に現れるか | `link-health.json` |
| `availability` | 楽天 API の応答フィールド。**保存するのは判定結果のみ。応答本文は保存しない** | 同上 |
| `affiliateTarget` | `affiliateUrl` の `pc` から取り出した `https://item.rakuten.co.jp/` URL が変化していないか | 同上 |
| `httpStatus` | 上記 URL への HEAD/GET の HTTP 状態（`robots.txt` を確認したうえで実施） | 同上 |
| `identifierMatch` | 型番・JAN の一致状態（`strong` / `weak` / `none`） | 同上 |
| `variantMatch` | 色・容量・サイズ・セット数のトークン一致 | 同上 |
| `consecutiveFailures` | 連続失敗日数 | 同上 |

> **楽天商品ページの取得可否について（事実の区別）**
>
> - `https://item.rakuten.co.jp/robots.txt` を確認した（2026-09-02）。`User-agent: *` に対する `Disallow` は
>   `/*?i=` `/*&i=` `/*?s=` `/*&s=` の 4 件のみで、**`Disallow: /` のような一律禁止は無く、`Crawl-delay` の指定も無い。**
>   商品ページ URL（`https://item.rakuten.co.jp/<shop>/<itemCode>/`）はクエリパラメータを含まないため、
>   **robots.txt では禁止されていない。**
> - ただし、これは **robots.txt が禁止していない**という事実にすぎず、
>   **楽天の利用規約・アフィリエイト規約が自動取得を明示的に許可していることまでは確認できていない。**
> - したがって `httpStatus` 信号は、**段階2 では有効化しない。** 規約確認（17 節 未解決事項 1）が済むまで、
>   リンク監視は楽天 API から得られる信号（`itemCodeAlive` / `availability` / `identifierMatch` / `variantMatch`）
>   と `affiliateTarget` の変化だけで行う。**これだけでも 8.3 節の状態機械は成立する。**
> - **この論点は Browser Rendering による描画にも同じく及ぶ。** 楽天の商品ページを描画して
>   初期選択状態を観測する行為（5.5 節 6a）も、規約確認が済むまで行わない。
>   段階2 では推定による 6b で代替し、6b が使えない商品は B 判定に落とす。
> - 403 / 429 を受けた場合は迂回しない（4.3 節）。

### 8.3 状態機械

| 状態 | 条件 | 動作 |
|---|---|---|
| `healthy` | `itemCodeAlive` かつ `availability=1` かつ `identifierMatch≠none` かつ `variantMatch` | 維持。`consecutiveFailures` を 0 にリセット |
| `uncertain` | API エラー・429・判定材料不足 | **翌日再確認。`consecutiveFailures` を増やさない**（外部障害を故障として数えない） |
| `hidden` | `itemCodeAlive=false` が **3 日連続** | CTA を一時非表示（`status: 'unverified'`）。データは残す |
| `replace` | `itemCodeAlive=false` が **7 日連続**（段階2 の判定）／ **または** `httpStatus` を有効化した後は「紹介 URL の遷移先が 404 と確定」でも即時（17 節 未解決事項1 の解決後） | 代替探索へ（8.4 節） |
| `manual-hold` | 同一商品と断定できない（`identifierMatch=weak` かつ `variantMatch=false` 等） | 非表示のまま保留。自動交換しない |

**一時的な売り切れ（`itemCodeAlive=true` かつ `availability=0`）だけでは即時交換しない。**
表示は維持し、14 日連続で在庫切れなら `hidden` へ移す。

### 8.4 代替リンクへの交換

| 交換先の判定 | 動作 |
|---|---|
| **S** | 自動交換 |
| **A** | 24 時間後の再確認で同一結果なら交換 |
| **B** | 交換しない。`manual-hold` |

交換先の S/A/B は 5.5 節と同じ基準を、リンクの文脈で適用する
（型番・JAN 一致、色・容量・サイズ・セット数一致、正規の紹介 URL、初期選択、中古／訳あり／並行輸入／まとめ買いの語がない）。

**目視確認済みリンク（`verified` + `visual`）の保護**:

- `isHumanVerifiedLink()` により自動取得の対象外（実装済み）。
- **異常が確定するまで保護する。** 具体的には `replace` 状態（7 日連続不在または明確な販売終了）に到達するまで一切触らない。
- `replace` に到達した場合も**自動交換せず**、交換候補を添えた PR を作る。マージは人が判断する。

---

## 9. Git 状態ファイル

### 9.1 配置

```
travel-goods-site/automation/
  queue.json         … 繰越キュー
  budget.json        … 日次予算の消費
  link-health.json   … リンク健全性
```

`src/lib/catalog/load.ts` が読むのは `datasets/<kind>/` 配下の
`products/` `sources.json` `merchants/` `articles/` `dataset.json` だけである。
`travel-goods-site/automation/` は**ビルドが読まない**ため、公開物に混ざらない。

### 9.2 内容と制約

| ファイル | 内容 | 想定サイズ |
|---|---|---|
| `queue.json` | 繰越対象の `{ kind, targetId, queuedAt, attempts, lastReason }` | 〜3 KB |
| `budget.json` | `{ date, rakutenRequests, workersAiNeurons, browserSeconds, pagesDeploysThisMonth }` | < 1 KB |
| `link-health.json` | リンクごとの 6 信号と `consecutiveFailures`、`lastHealthyAt` | 〜8 KB |

**共通の制約**:

1. **秘密情報を保存しない。** 資格情報、紹介 URL 全文、アフィリエイト ID を含めない。
2. **外部レスポンス本文を保存しない。** 判定結果と分類コードだけを持つ。
3. **キーを固定順でソートして書き出す**（`link-health.json` は `productId` 昇順、`queue.json` は `queuedAt` 昇順）。
4. **同じ状態なら同じバイト列になる**ようにし、**内容が変わらない日はコミットしない**。
   具体的には、書き出し前に既存ファイルと文字列比較し、一致すれば書き込みをスキップする。
5. タイムスタンプは**日付（`YYYY-MM-DD`）まで**とし、時刻を入れない（毎日差分が出るのを防ぐ）。
6. `budget.json` は**消費が発生した日だけ更新する**。当日の消費が 0 なら `date` も含めて書き換えない。
   これにより、自動処理が何もしなかった日にコミットが生まれない。
7. `link-health.json` の `lastHealthyAt` は日付のみを持ち、
   状態が `healthy` のまま変わらない日は**値が変わらない**（毎日更新しない）。
   状態遷移か信号の変化があった日にだけ差分が出る。

### 9.3 監査と復元

- すべての自動変更が Git のコミットとして残る。
- 自動変更は 1 日 1 コミットにまとめるため、`git revert <sha>` 1 回で丸ごと戻せる。
- `link-health.json` の履歴を辿れば、いつどの信号が変わって非表示になったかを再現できる。

---

## 10. 無料枠と処理予算

### 10.1 公式に確認した上限（すべて 2026-09-02 確認）

| サービス | 上限 | 出典 |
|---|---|---|
| GitHub Actions（public リポジトリ・標準ランナー） | 無料。分数無制限 | [GitHub Docs](https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions) |
| Cloudflare Pages ビルド | **500 ビルド/月**、同時 1、タイムアウト 20 分 | [Pages limits](https://developers.cloudflare.com/pages/platform/limits/) |
| Cloudflare Pages ファイル数 | 20,000 ファイル/サイト（Free）、1 ファイル 25 MiB | 同上 |
| Workers AI | **10,000 Neurons/日**、00:00 UTC リセット。**超過は課金ではなくエラー**（Free） | [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| Browser Rendering（Workers Free） | **10 分/日**、同時 3、新規ブラウザ起動 20 秒に 1 回、タイムアウト 60 秒 | [Browser Rendering limits](https://developers.cloudflare.com/browser-rendering/platform/limits/) |
| Workers（Free） | CPU 10 ms/呼び出し、100,000 req/日、Cron Trigger **5 本/アカウント** | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Workers KV（Free） | 100,000 読み取り/日、**1,000 書き込み/日**、1 GB | [KV limits](https://developers.cloudflare.com/kv/platform/limits/) |
| 楽天ウェブサービス | applicationId あたり **1 リクエスト/秒**。超過は HTTP 429 | [楽天ウェブサービスブログ](https://rakuten-webservice.tumblr.com/post/48111428311/%E4%BA%88%E5%91%8A-api%E3%83%AA%E3%82%AF%E3%82%A8%E3%82%B9%E3%83%88%E5%88%B6%E9%99%90%E3%81%A8%E5%88%B6%E9%99%90%E6%99%82http-status-code-%E3%81%AE%E5%A4%89%E6%9B%B4%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6) |

### 10.2 この設計の予算（自己制限）

| 資源 | 上限（自己制限） | 対公式上限 | 到達時 |
|---|---|---|---|
| 楽天 API | **30 リクエスト/日** | 1 req/秒 の範囲内（30 秒相当） | 繰越 |
| Workers AI | **8,000 Neurons/日**（割当の 80%） | 10,000/日 | ジョブは続行。記事は決定的検査 14 項目だけで判定する（10.5 節） |
| Browser Run | **8 分/日** | 10 分/日 | ジョブは続行。初期選択を観測できない商品は**すべて B 判定へ落ちる**（10.5 節） |
| Pages デプロイ | **1 日 1 回**（＝最大 31/月） | 500/月 | 自動コミット停止 |
| GitHub Actions | 実測 25 分/日程度 | 無制限 | — |
| Workers / KV / D1 / Cloudflare Cron | **使わない（0）** | — | — |

### 10.3 楽天 30 リクエスト/日 での処理能力

リンク健全性チェックは**1 リンクにつき 1 クエリ**（JAN があれば JAN、無ければ型番）で行う。
1 クエリで判定できなかったリンクだけ、予備枠を使って 2 クエリ目（もう一方の識別子）を投げる。
新規リンク取得と代替探索は 1 商品あたり最大 2 クエリ。日次の内訳（初期値）:

| 用途 | リクエスト |
|---:|---|
| リンク健全性チェック（15 リンク × 1 クエリ） | 15 |
| 新商品探索（月・木のみ、1 クエリ 30 件取得） | 2 |
| 新規リンク取得・代替探索 | 8 |
| 予備 | 5 |
| **計** | **30** |

商品が 40 件を超えたら、リンク健全性チェックを**隔日 2 分割**にするか、上限を 60/日へ引き上げる。
どちらも 1 req/秒 の範囲内であり、追加費用は発生しない。

### 10.4 現実的な処理規模

| 対象 | 日次 | 週次 | 律速 |
|---|---:|---:|---|
| リンク健全性チェック | 15 リンク | — | 楽天 30 req/日 |
| 新商品登録 | — | **3 件**（上限） | メーカーアダプターの整備状況 |
| 記事生成 | — | **2 本**（上限） | 形式の `eligibility` を満たす組み合わせ数 |
| 初期選択状態の確認 | 〜10 ページ | — | Browser Run 8 分/日 |
| Pages デプロイ | 1 回 | 7 回 | 自己制限 |

**無料枠は制約にならない。** 実際の律速は「メーカー公式から仕様を決定的に取れるか」である。

### 10.5 補助が使えないときの扱い（明示）

「補助なしで続行」が何を意味するかを資源ごとに定める。**どの場合も、公開が甘くなる方向には働かない。**

| 資源 | 使えないときの動作 | 公開への影響 |
|---|---|---|
| Browser Run | 6a（観測）を実行できない | 6b（推定）で判定できる商品は S/A になりうる。6b でも判定できない商品は**すべて B 判定（非公開保留）**。翌日キューで再試行 |
| Workers AI | 記事の検査 15（AI 再検査）を実行できない | **記事は決定的検査 1〜14 だけで判定し、公開してよい。** AI は公開を止める方向にのみ働く検査であり（7.7 節）、実行できないことは不合格の根拠にならない |
| Workers AI | 商品の B 判定条件 8（AI とルールの不一致）を評価できない | 不一致が観測されないため条件 8 は成立しない。他の条件だけで S/A/B を決める |

この非対称（商品は B へ落ち、記事はそのまま公開）は意図的である。
Browser Run が担うのは**「別バリエーションを売っていないこと」の確認**という公開の必要条件であるのに対し、
Workers AI が担うのは**決定的検査をすでに通った記事への追加の反証**だからである。

---

## 11. workflow とスケジュール

### 11.1 構成（既存 2 本 + 新規 4 本）

| workflow | 起動 | 書き込み | 通知 |
|---|---|---|---|
| `travel-goods-ci.yml`（既存） | push / PR / 手動 | なし | 失敗時のみ |
| `travel-goods-audit.yml`（既存） | 週1（JST 月 07:00）/ 手動 | なし | 所見があれば Issue |
| `automation-links.yml`（新規） | 毎日 JST 06:00 / 手動 | `link-health.json`, `merchants/` | 例外時のみ |
| `automation-discover.yml`（新規） | 月・木 JST 06:30 / 手動 | `queue.json`, `products/`, `sources.json` | 例外時のみ |
| `automation-articles.yml`（新規） | 火・金 JST 06:30 / 手動 | `articles/` | 例外時のみ |
| `automation-commit.yml`（新規） | 毎日 JST 07:30 / 手動 | 上記の変更をまとめて PR 化 | 例外時のみ |

### 11.2 スケジュール（cron は UTC）

| workflow | cron（UTC） | JST |
|---|---|---|
| `automation-links` | `0 21 * * *` | 毎日 06:00 |
| `automation-discover` | `30 21 * * 0,3` | 月・木 06:30 |
| `automation-articles` | `30 21 * * 1,4` | 火・金 06:30 |
| `automation-commit` | `30 22 * * *` | 毎日 07:30 |

> UTC 日曜 21:30 = JST 月曜 06:30。曜日がずれるため cron の day-of-week は
> JST の前日を指す（月→`0`、火→`1`、木→`3`、金→`4`）。

### 11.3 1 日の流れ

```
06:00  automation-links     … リンク点検とキュー消化。作業ブランチへコミット
06:30  automation-discover  … 新商品探索（月・木）／
       automation-articles  … 記事企画・生成（火・金）
07:30  automation-commit    … その日の全変更を1つの PR にまとめ、
                              typecheck / lint / 単体テスト / 全データ検証 /
                              build / 公開ゲート / 必要な E2E をまとめて 1 回実行
                              → 成功すれば自動マージ → Pages が1回だけデプロイ
```

**検証は 1 日の最後に 1 回だけまとめて実行する。** 各ジョブは作業ブランチへコミットするだけで、
個別に `main` を更新しない。これにより Pages デプロイが 1 日 1 回に収まる。

### 11.4 上限と繰越

各ジョブは開始時に `budget.json` を読み、当日の残予算を確認する。

- 残予算が 0 なら**正常終了**（失敗にしない）。
- 処理途中で予算に到達したら、**処理済み分は書き込み、未処理分を `queue.json` へ積んで正常終了**。
- 翌日のジョブはキューの先頭から処理する。

---

## 12. 自動 PR・マージ・デプロイ・revert

### 12.1 自動反映の流れ

1. 各ジョブが専用ブランチ `automation/daily-YYYY-MM-DD` へコミットする。
2. `automation-commit` が**変更パス検査**を行う（12.2 節）。
3. 全検証を実行する: `typecheck` / `lint` / 単体テスト / `validate:content:all` / `build:only` / `check:release -- --out out` / 必要な E2E。
4. PR を自動作成する。
5. **必須チェックがすべて成功したときだけ**、GitHub の自動マージ（auto-merge）で `main` へ入る。
6. Cloudflare Pages が `main` 更新を自動デプロイする。
7. デプロイ後に公開後検査を行う（12.4 節）。

**`main` のブランチ保護は管理者権限で回避しない。** 自動処理も人と同じ必須チェックを通る。

### 12.2 変更パス検査

自動変更を許可するパスは次だけ。

```
travel-goods-site/datasets/production/products/
travel-goods-site/datasets/production/articles/
travel-goods-site/datasets/production/merchants/
travel-goods-site/datasets/production/sources.json
travel-goods-site/automation/queue.json
travel-goods-site/automation/budget.json
travel-goods-site/automation/link-health.json
```

`git diff --name-only` の結果がこの集合の外に 1 件でも出たら、**PR を作らずに中止し Issue を上げる**。

**自動処理によるコード・workflow・設定・記事構成プラグインの変更は禁止する。**
`src/`、`scripts/`、`.github/`、`package.json`、`tests/`、`docs/` はいずれも許可パスに含まれない。

`datasets/production/candidates/` は許可パスに**含めない**。
このため自動処理の候補は `automation/queue.json` に保持する（5.5 節）。
既存の `candidates/rakuten.json` は手動実行専用の経路として残る。

### 12.3 CI が起動しない問題と最小権限の代替案

**問題**: `GITHUB_TOKEN` が作成した push / PR は**新しい workflow run を作らない**
（[GitHub Docs](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)、2026-09-02 確認）。
このため、自動 PR に対して `travel-goods-ci.yml` が起動せず、必須チェックが「未実行」のままになり自動マージできない。

**代替案（優先順）**:

| 案 | 内容 | 権限 | 評価 |
|---|---|---|---|
| **案1（推奨）** | `automation-commit` の中で**検証ステップを直接実行**し、その結果で自動マージを判断する。別の workflow run に依存しない | `GITHUB_TOKEN` の `contents: write` + `pull-requests: write` + `statuses: write` | **追加の秘密が不要。最小権限。** ただし必須チェックの設定に工夫が要る（下記） |
| 案2 | GitHub App を作り、Installation Access Token で push する | App の `contents: write` / `pull_requests: write` のみに絞る | 秘密が 2 つ増える（App ID・秘密鍵）。権限は細かく絞れる |
| 案3 | Personal Access Token（fine-grained）を Secrets に置く | 当該リポジトリの `contents: write` / `pull_requests: write` のみ | 個人アカウントに紐づく。失効管理が必要 |

**案1 を採る。**

ただし、案1 をそのまま適用すると新しい欠陥が生まれる。
`main` の必須チェックを `automation-commit` のジョブにすると、**人が出す PR がそのチェックを永久に満たせなくなる**
（`automation-commit` は人の PR では走らないため）。GitHub のブランチ保護は必須チェックを AND でしか評価できず、
「A または B」を表現できない。

したがって次の形にする。

1. **必須チェックの context をひとつに統一する**: `automation/verify`。
2. **人の PR**: `travel-goods-ci.yml` の `verify` ジョブが最後に
   `POST /repos/{owner}/{repo}/statuses/{sha}` で context `automation/verify` を `success` として付ける。
3. **自動 PR**: `automation-commit` が自前で全検証を実行し、成功したときだけ同じ context を `success` として付ける。
4. `main` のブランチ保護は必須チェックを `automation/verify` の 1 つだけにする。

これにより、両方の経路が同じ 1 つの必須チェックを満たす。
`GITHUB_TOKEN` は `statuses: write` を追加で必要とするが、**追加の秘密（PAT・GitHub App）は不要**である。
`travel-goods-ci.yml` へのこの追記は段階0 のコード変更として人が行う（自動処理は workflow を変更しない）。

**どちらの経路でも、検証に失敗すれば `automation/verify` は付かず、自動マージは成立しない。**
管理者権限による必須チェックの回避は使わない。

### 12.4 公開後検査と自動 revert

デプロイ完了後（`main` マージから 10 分後）に次を実行する。

1. 公開サイトの `robots.txt` / `sitemap.xml` / トップページが期待どおりか。
2. その日に公開した記事の全検査（7.7 節）を再実行する。
3. その日に公開した商品の CTA が正しく出ているか。

失敗したら、**その日の自動変更を revert して再デプロイする。**

**自動 revert の安全装置**:

| 装置 | 内容 |
|---|---|
| 対象の限定 | revert するのは**その日の自動マージコミット 1 つだけ**。人のコミットは対象にしない |
| 同一コミット確認 | revert 対象の SHA が、その日の `automation-commit` が作ったマージコミットと一致することを確認する |
| 件数制限 | **1 日あたり revert は 1 回まで** |
| ループ防止 | revert コミットに `[auto-revert]` を付け、**このコミットに対しては公開後検査を再実行しない**。revert の revert を作らない |
| 停止 | 自動 revert が発生したら、**その日の残りの自動処理を停止する**（`queue.json` に持ち越す） |
| 通知 | **必ず Issue を上げる**（13.2 節） |
| 連続時の停止 | 3 日以内に 2 回 revert が起きたら、`AUTOMATION_ENABLED` を落とすことを Issue で促し、それ以降の自動マージを止める |

---

## 13. 停止スイッチと通知

### 13.1 停止スイッチ

GitHub Variables に置く（秘密ではない）。**すべて既定 `false` で導入する。**

| 変数 | 制御対象 | 段階2 | 段階3 |
|---|---|---|---|
| `AUTOMATION_ENABLED` | 自動処理全体のマスタースイッチ。`false` なら全ジョブが即座に正常終了 | `true` | `true` |
| `AUTO_DISCOVER_PRODUCTS` | 新商品の探索と候補収集 | `true` | `true` |
| `AUTO_PUBLISH_PRODUCTS` | 商品の自動公開。値は `off` / `S` / `S,A` の 3 択（真偽値ではない） | `S` | `S,A` |
| `AUTO_GENERATE_ARTICLES` | 記事の生成 | `false` | `true` |
| `AUTO_PUBLISH_ARTICLES` | 生成記事の自動公開 | `false` | `true` |
| `AUTO_AUDIT_LINKS` | リンク健全性チェック | `true` | `true` |
| `AUTO_REPLACE_LINKS` | 代替リンクへの自動交換 | `false` | `true` |

スイッチを `false`（`AUTO_PUBLISH_PRODUCTS` は `off`）にすると**翌日の実行から**止まる。
即時に止めるにはワークフローを無効化する。

`AUTO_PUBLISH_PRODUCTS` だけが 3 値を取るのは、段階2 で S のみ、段階3 で S+A と
**段階的に広げるため**である。新しいスイッチを増やさずに済むよう、値で表現する。
未知の値が設定されていた場合は `off` として扱う（安全側に倒す）。

### 13.2 通知

**通常の成功は通知しない。** 次の場合だけ Issue を作成／更新する。

| 条件 | ラベル | 内容 |
|---|---|---|
| 同一の失敗が **7 日連続** | `automation-failure` | 対象、失敗の分類、連続日数 |
| **自動 revert** が発生 | `automation-revert` | revert したコミット、失敗した検査 |
| **リコール・安全情報**を検出 | `automation-safety` | 該当商品、検出元 URL |
| **自動マージ不能**（必須チェック失敗、コンフリクト） | `automation-blocked` | PR 番号、失敗したチェック |
| **メーカー単位の取得故障**（同一メーカーで 5 件連続失敗、または 7 日連続で取得成功率 0%） | `automation-adapter` | メーカー、HTTP 状態の分類 |
| **保留が 10 件以上** | `automation-backlog` | 保留の内訳（B 判定の理由別） |
| **無料枠不足が 7 日継続** | `automation-budget` | どの資源が不足しているか |

**Issue を増殖させない**: ラベルごとに**開いている Issue は最大 1 件**とし、
既存があれば本文を更新する。条件が解消したら自動的にコメントを付けて閉じる。
これは既存の `travel-goods-audit.yml` と同じ方式である。

---

## 14. テスト戦略

### 14.1 原則

- **判定関数はすべて純関数として切り出し、外部通信なしでテストする。** 現行 147 件と同じ方式。
- 外部通信を伴う経路は**ループバックのモックサーバー**でテストする（`scripts/rakuten-mock-server.mjs` を拡張）。
- **本番データセットをテストで書き換えない。** `CATALOG_DATASET_DIR` で一時ディレクトリを指す。

### 14.2 追加する単体テスト

| 対象 | テストする内容 |
|---|---|
| ブランド正規化 | 現行 7 種類の `brand` 文字列が正しい正規化キーに落ちる。未知のブランドは `null` を返す |
| S/A/B 判定器 | S/A/B の各条件について、満たす場合と満たさない場合。**B の条件が 1 つでも立てば B になる**（優先順位） |
| JAN 未公表と JAN 不一致の区別 | `blockers` の文字列で A 判定と B 判定が分かれる |
| `variant` トークン照合 | 色・容量・サイズ・セット数の一致／不一致／矛盾表記の検出 |
| リンク状態機械 | 6 信号の組み合わせから `healthy`/`uncertain`/`hidden`/`replace`/`manual-hold` が正しく決まる。**`uncertain` で連続失敗日数が増えない** |
| 目視確認リンクの保護 | `replace` 到達前は一切変更されない。到達しても自動交換されない |
| 記事の重複判定 | `intentKey` 一致、3-gram Jaccard 閾値、商品集合×比較軸の一致 |
| 記事の数値突合 | 本文の数値が `Fact.value` と一致しない場合に拒否される |
| 記事形式の選択 | 商品数 0/1/2/3-5/6+ で正しい形式になる。「○選」が 40% を超えない |
| 状態ファイルの安定性 | **同じ入力なら同じバイト列。内容が変わらなければ書き込まない** |
| 変更パス検査 | 許可パス外の変更を検出して中止する |
| 予算と繰越 | 上限到達で正常終了し、未処理分がキューに積まれる |
| 自動 revert の安全装置 | 対象コミットの同一性確認、1 日 1 回制限、`[auto-revert]` のループ防止 |

### 14.3 E2E

既存 3 系統（126 件）を維持し、次を追加する。

- 自動公開された商品の CTA が表示され、`href` が登録した紹介 URL と完全一致する。
- `hidden` 状態のリンクが CTA を出さない。
- 生成記事が公開され、比較表の数値が商品データと一致する。
- 自動非公開になった記事が一覧にも直接 URL にも出ない。

### 14.4 dry-run

**すべての新モードは `--apply` なしを既定にする**（現行の作法を踏襲）。
段階1 の観察運転は全ジョブを dry-run で 7 日間回す（15 節）。

---

## 15. 段階導入

**現在の `SITE_MODE=preview` のまま段階0〜3 を検証する。**

### 段階0 — 実装とテスト

- 実装対象: メーカーアダプター、S/A/B 判定器、記事構成プラグイン、リンク状態機械、状態ファイル、予算・繰越、変更パス検査、自動 PR／マージ／revert、停止スイッチ。
- `SITE_MODE=preview`。
- **停止スイッチはすべて `false`。自動公開は一切行わない。**
- 完了条件: 14 節の単体テストと E2E がすべて成功する。

### 段階1 — 7 日間の観察運転

- **実 API と実メーカー公式ページを使う。**
- **結果を反映しない**（dry-run。データファイルを書き換えない）。
- 測定するもの:
  - S / A / B の分布（**現在 JAN が 3/23 件しかないため、S の実出現率が最大の関心事**）
  - 誤判定率（人がサンプルを確認して測る）
  - 楽天 30 req/日 で足りるか
  - Workers AI の Neurons 消費、Browser Run の秒数
  - メーカーごとの取得成功率（特に `elecom.co.jp` の 403）
  - 記事の重複判定閾値 0.60 の妥当性
- 完了条件: 誤判定率が許容範囲であることを人が確認する（閾値は 17 節で決める）。

### 段階2 — S 判定のみ自動公開（7 日間運用）

- `AUTOMATION_ENABLED=true`、`AUTO_PUBLISH_PRODUCTS=true`（**S のみ**）、`AUTO_AUDIT_LINKS=true`。
- 記事生成・自動交換は `false` のまま。
- リンク監視を有効化。**明確な販売終了リンクの非表示のみ**行う。
- `SITE_MODE=preview` のまま（公開サイトには出ない）。
- 完了条件: 7 日間、**誤って `published` になった商品ゼロ**・自動 revert ゼロ。
  （`SITE_MODE=preview` のため公開サイトには出ない。判定の正しさをデータ上で確認する。）

### 段階3 — A 判定・記事・代替リンク交換

- `AUTO_PUBLISH_PRODUCTS` を S+A に、`AUTO_GENERATE_ARTICLES`・`AUTO_PUBLISH_ARTICLES`・`AUTO_REPLACE_LINKS` を `true`。
- 記事は週 2 本。
- S/A の代替リンク交換を有効化。
- 公開後検査と自動 revert を有効化。
- `SITE_MODE=preview` のまま。
- 完了条件: 14 日間、**誤って `published` になった商品・記事ゼロ**・自動 revert 1 回以下。

### 段階4 — 本番公開

- 公開用の運営者名・連絡先を設定する（`missingLaunchSettings()` が両方を必須にしている）。
- `SITE_MODE=production` へ切り替える。
- robots・sitemap を公開する。
- Vercel の旧デプロイを停止する。

段階4 の前提条件（現行コードが要求しているもの）:

1. `PUBLIC_OPERATOR_NAME` と `PUBLIC_CONTACT_EMAIL` の決定（**未確定**）
2. `SITE_URL=https://tabimono-hikaku.com`（設定済み）
3. XServer のネームサーバーを Cloudflare 指定値へ変更し、DNS と TLS が有効（**未実施**）
4. Cloudflare Pages の Production 環境変数を `SITE_MODE=production` / `CATALOG_DATASET=production` に設定
5. `check:release -- --out out` が Production 相当環境で終了コード 0（**確認済み**）
6. `pages.dev` から独自ドメインへの 301 リダイレクト設定
7. Vercel の自動デプロイ停止

---

## 16. 人間に残る作業

| 作業 | 頻度 | 1 回の目安 | 自動化できない理由 |
|---|---|---|---|
| 新しいメーカーのアダプター追加 | メーカー追加時 | 30〜60 分 | サイト構造は各社固有。汎用抽出は誤りを生む |
| 記事構成プラグインの追加 | 形式追加時 | 60〜120 分 | コード変更であり、自動処理に許可していない |
| カテゴリ追加 PR のコード化とマージ | カテゴリ追加時 | 30 分 | `CATEGORIES` はコード。自動マージしない（6.3 節） |
| 目視確認済みリンクの販売終了確認 | 四半期に数回 | 5 分 | 異常確定まで保護する方針 |
| モバイルバッテリーの安全情報確認 | 90 日ごと | 10〜20 分 | 既存 audit が要求。安全判断は機械に委ねない |
| Issue 対応 | 発生時のみ | — | — |
| 紹介 URL の新規発行 | 新規店舗時 | 5 分 | 楽天の管理画面操作 |
| 段階移行の判断 | 段階ごと 1 回 | — | 誤判定率の許容判断 |

段階3 まで到達した状態での想定は**月に合計 1〜2 時間程度**で、
そのほとんどが「新しいメーカーや記事形式を増やすとき」に集中する。
増やさない月は、通知が来なければ何もすることがない。

---

## 17. 未解決事項と実装前に測定する項目

### 17.1 未解決事項（人の判断が必要）

| # | 論点 | 何が決まらないと困るか | 期限 |
|---:|---|---|---|
| 1 | **楽天の商品ページを自動取得してよいか（規約）** | robots.txt は禁止していない（8.2 節）が、利用規約・アフィリエイト規約の明示的な許可は確認できていない。**確認が済むまで `httpStatus` 信号を有効化しない** | 段階2 前 |
| 2 | **機械レビューを記事の公開条件として認めるか** | `evaluatePublication()` の「自動検査の合格を人の確認の代わりにしません」を意図的に変更することになる。認めない場合、記事の自動公開は成立しない | 段階3 前 |
| 3 | **`sizeBasis: 'unspecified'` の商品を自動公開してよいか** | 現在 12/23 件が `unspecified`。「測定条件不明なら公開しない」を S/A の条件にすると過半が落ちる。**この設計の既定は「条件に入れない」**（＝ `unspecified` でも公開しうる）。既存の公開 22 件が同じ基準で公開されているため。厳しくする場合は 5.5 節に条件を追加する | 段階2 前 |
| 4 | **誤判定率の許容値** | 段階1→2、段階2→3 の移行判断に必要。「サンプル 20 件で誤り 0 件」等の具体値 | 段階1 終了時 |
| 5 | **自動公開したものを事後にどこまで見るか** | 「通常時は人が関与しない」を厳密に取ると、公開後の記事を誰も読まない状態になる。月 1 回まとめて見るかで判定条件の厳しさが変わる | 段階3 前 |
| 6 | **モバイルバッテリーを自動公開の対象にするか** | 安全情報が関わる。既存 audit は 90 日の再確認を要求している | 段階2 前 |
| 7 | 公開用の運営者名・連絡先 | 未確定のため段階4 へ進めない | 段階4 前 |
| 8 | `llmInput` を `allowed` にする出版社があるか | **この設計の前提ではない**（4.4 節）。将来メーカー本文を AI へ渡したくなった場合のみ必要 | 不要（将来） |

### 17.2 実装前ではなく段階1 で測定する項目

これらは**推測で決めず、観察運転の実データで決める**。

| 項目 | 初期値 | 測定方法 |
|---|---|---|
| S / A / B の実際の分布 | 未知 | 7 日間の dry-run で全候補を分類 |
| リンクの連続失敗しきい値 | `hidden` 3 日 / `replace` 7 日 / 在庫切れ 14 日 | 15 リンクの 7 日間の信号推移 |
| 記事の類似度しきい値 | 3-gram Jaccard 0.60 | 既存 10 記事の相互類似度を測り、明らかに別記事のペアが誤検出されない値へ調整 |
| 楽天 API の日次必要数 | 30 req/日 | 実測 |
| Workers AI の Neurons 消費 | 未知 | 記事 1 本あたりの実測。8,000/日 に収まるか |
| Browser Run の秒数 | 1 ページ 30 秒想定 | 実測。8 分/日 で何ページ確認できるか |
| メーカー別の取得成功率 | 未知 | 5 メーカーそれぞれの 7 日間成功率。80% を下回るメーカーはアダプターを見直す |
| Actions の実行時間 | 25 分/日想定 | 実測 |
| **`availability` フィールドの実在** | 現行エンドポイントが返すと仮定 | 実 API の応答で確認。**返さない場合、8.3 節の「一時的な売り切れ」の区別ができなくなる**。その場合は `itemCodeAlive` の連続日数だけで状態機械を回し、在庫切れ 14 日ルールを削除する |

---

## 18. ロールバック

### 18.1 3 段階のロールバック

| 段階 | 手段 | 影響範囲 | 所要 |
|---|---|---|---|
| **1. 即時停止** | GitHub Variables の `AUTOMATION_ENABLED` を `false`。即時に止めるならワークフローを無効化 | 以後の自動処理が止まる。公開済みの内容はそのまま | 1 分 |
| **2. 当日分の取り消し** | `git revert <その日の自動マージコミット>` → Pages が再デプロイ | その日の自動変更だけが戻る | 5 分 |
| **3. 期間の取り消し** | 対象期間の自動マージコミットを新しい順に revert | 複数日分が戻る | 15 分 |

### 18.2 ロールバックが成立する前提

- 自動変更は**1 日 1 コミット**にまとめる（11.3 節）。これにより revert の単位が明確になる。
- 自動処理は**許可パスしか変更しない**（12.2 節）。コード・workflow を巻き込まない。
- 状態ファイルも同じコミットに含まれるため、revert すると**判定の履歴も一緒に戻る**。
  これは意図的な設計で、「データだけ戻して状態ファイルが未来を指している」状態を作らない。

### 18.3 ロールバック後の再開

1. Issue で原因を確認する。
2. 原因がデータなら、該当対象を `queue.json` から外すか、候補を `rejected` にする。
3. 原因がコードなら、修正をコード PR として入れる。
4. `AUTOMATION_ENABLED` を `true` に戻す。

### 18.4 Cloudflare Pages 側のロールバック

Pages はデプロイ履歴を保持しており、過去のデプロイへ切り戻せる。
ただし**この設計では Pages の管理画面操作を自動化しない**。
Git の revert による再デプロイを正規の手段とする（外部設定の自動変更を持たないため）。

---

## 付録A: この設計で新規に必要になるもの

### GitHub

| 種別 | 名前 | 値 | 備考 |
|---|---|---|---|
| Secrets（既存） | `RAKUTEN_APPLICATION_ID` / `RAKUTEN_ACCESS_KEY` / `RAKUTEN_AFFILIATE_ID` | 設定済み | 変更不要 |
| Variables（既存） | `RAKUTEN_API_REFERER` | 設定済み | 変更不要 |
| Variables（新規） | 停止スイッチ 7 種（13.1 節） | すべて `false` で導入 | — |
| Secrets（新規・任意） | `CLOUDFLARE_API_TOKEN` | Workers AI と Browser Rendering のみに限定 | **Pages 編集権限を含めない**。補助を使う場合のみ |
| Variables（新規・任意） | `CLOUDFLARE_ACCOUNT_ID` | 秘密ではない | 同上 |
| workflow 権限 | `contents: write` + `pull-requests: write` + `statuses: write` | `automation-*` のみ | Issue を作るジョブは `issues: write` を追加。`travel-goods-ci.yml` にも `statuses: write` を追加する |
| ブランチ保護 | `main` の必須チェックを **`automation/verify` の 1 つだけ**にする | — | 人の PR は `travel-goods-ci`、自動 PR は `automation-commit` が同じ context を付ける（12.3 節）。管理者回避は使わない |

### Cloudflare

| 種別 | 必要か |
|---|---|
| 新しい Worker | **不要** |
| KV Namespace | **不要** |
| D1 Database | **不要** |
| Cloudflare Cron Trigger | **不要** |
| AI binding | **不要**（REST API を使う） |
| Browser binding | **不要**（REST API を使う） |
| API トークン | 補助を使う場合のみ 1 本（Workers AI + Browser Rendering に限定） |

**Cloudflare 側の設定変更は、補助機能を使う場合の API トークン発行だけである。**

### 新規ファイル（実装時）

```
travel-goods-site/
  automation/
    queue.json
    budget.json
    link-health.json
  src/lib/manufacturers/
    registry.ts  types.ts  ace.ts  elecom.ts  anker.ts
  src/lib/article-formats/
    registry.ts  types.ts  selections.ts  comparison.ts
    purpose-guide.ts  trip-duration.ts  destination.ts  spec-explainer.ts
  src/lib/automation/
    tier.ts          … S/A/B 判定
    link-state.ts    … リンク状態機械
    budget.ts        … 予算と繰越
    changed-paths.ts … 変更パス検査
.github/workflows/
  automation-links.yml
  automation-discover.yml
  automation-articles.yml
  automation-commit.yml
```

---

## 付録B: 参照した外部情報

すべて 2026-09-02（JST）に確認。

| 内容 | URL |
|---|---|
| GitHub Actions の課金（public リポジトリは無料） | https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions |
| `GITHUB_TOKEN` が起こしたイベントは workflow run を作らない | https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow |
| Cloudflare Pages の上限 | https://developers.cloudflare.com/pages/platform/limits/ |
| Cloudflare Workers の上限 | https://developers.cloudflare.com/workers/platform/limits/ |
| Workers AI の料金と無料割当 | https://developers.cloudflare.com/workers-ai/platform/pricing/ |
| Browser Rendering の上限 | https://developers.cloudflare.com/browser-rendering/platform/limits/ |
| Workers KV の上限 | https://developers.cloudflare.com/kv/platform/limits/ |
| 楽天ウェブサービスの API リクエスト制限 | https://rakuten-webservice.tumblr.com/post/48111428311/%E4%BA%88%E5%91%8A-api%E3%83%AA%E3%82%AF%E3%82%A8%E3%82%B9%E3%83%88%E5%88%B6%E9%99%90%E3%81%A8%E5%88%B6%E9%99%90%E6%99%82http-status-code-%E3%81%AE%E5%A4%89%E6%9B%B4%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6 |
| `item.rakuten.co.jp` の robots.txt | https://item.rakuten.co.jp/robots.txt |
