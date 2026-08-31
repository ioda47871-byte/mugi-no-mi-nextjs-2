# travel-goods-site（仮称: 旅じたくガイド）

旅行用品（スーツケース／旅行用リュック／収納・洗面ポーチ／モバイルバッテリー）を、
**メーカーの公表仕様**から重量・サイズ・容量で比較できる静的サイトです。

このディレクトリは、同じリポジトリにある `mugi-no-mi-nextjs/`（既存の別サイト）とは
**完全に独立**しています。依存関係・ビルド・設定を共有していません。

実装計画は `docs/superpowers/plans/2026-08-31-travel-affiliate.md` にあります。

---

## いま何ができているか

現時点は **「サイト基盤完成、実データ投入を開始した段階」** です。
`docs/status.md` に、**実装完了 / 内容準備完了 / 収益化設定完了 / 本番公開完了**を
分けて記録しています。要約すると:

- 実装は完了しています（全画面・絞り込み・比較表・購入リンク解決・公開判定・CLI・テスト）。
- **実商品は 4 件**（公開3件 / review 1件）、**公開記事は 1 本**です。
  計画書の目標（約30商品・10記事）には届いていません。
- 実商品の仕様は、別環境で調査された資料の提供を受けて取り込みました。
  この実装環境から各メーカーの公式ページへは接続していません
  （`Source.provenance` で区別しています）。
- **表示できる購入リンクは 0 件**です（紹介ID・紹介URLが未提供）。
  ボタンの見た目は `npm run preview:cta` でテスト専用データを使って確認できます。
- 画面・機能を厚く確認するためのデモデータ（実在しない架空データ）は
  `datasets/demo/` に残しています。

---

## すぐ動かす

```bash
npm install
npm run dev          # http://localhost:3000（プレビュー・デモデータ）
```

静的出力を確認する場合:

```bash
npm run build        # データ検証 → 静的出力（out/）
npm run start        # http://localhost:3100 で out/ を配信
```

APIキー・紹介ID・データベースは不要です。未設定の機能は安全側（無効）に倒れます。

---

## 主なコマンド

| コマンド | 内容 |
|---|---|
| `npm run verify` | 型検査・lint・単体テスト・データ検証・ビルドを通しで実行 |
| `npm run typecheck` | TypeScript の型検査 |
| `npm run lint` | ESLint |
| `npm test` | 単体テスト（Vitest） |
| `npm run test:e2e` | E2E（デモデータ + CTA表示確認 / desktop 1440px・mobile 360px） |
| `npm run test:e2e:production` | E2E（本番データ：実商品の寸法条件・件数） |
| `npm run preview:cta` | 購入ボタン4状態の確認ページを `.preview/cta/` に生成 |
| `npm run validate:content` | 商品・出典・販売先・記事の検証 |
| `npm run validate:content:all` | production と demo の両方を検証 |
| `npm run create:draft -- ...` | 記事の下書きを生成（必ず `status: draft`） |
| `npm run check:release -- --out out` | 本番公開の前提が満たされているかを判定 |

---

## 設計の要点

### データセットを2つに分けている

| ディレクトリ | 中身 |
|---|---|
| `datasets/production/` | 出典を確認できた実データだけ。**本番モードではこれしか使えません** |
| `datasets/demo/` | 実在しない架空データ。画面・機能の確認用。本番モードでは読み込めません |
| `tests/fixtures/` | 単体テスト専用。上のどちらにも混ざりません |

デモデータ使用中は全ページ最上部に注意書きが出ます。`check:release` は
ビルド成果物を走査し、デモ文言やテスト値の混入を検出して失敗します。

### 寸法は必ず測定条件とセットで持つ

「ハンドルを除く」と公表された値を「ハンドル込み外寸」として保存できないように、
`sizeBasis`（ハンドル込み／本体のみ／ハンドルを除く／ハンドル・ベルトを除く／条件の公表なし）と
`measurementState`（通常時／拡張時／圧縮時）を必須にしています。
拡張時など別条件の値は `alternateMeasurements` に分けて保存し、
画面でも「拡張時の外寸（ハンドル・ショルダーベルトを除く）」のように条件込みで表示します。

### 出典は「自分で確認したか」を区別する

`Source.provenance` が `direct-fetch`（自分で接続して確認）か
`provided-document`（別環境で調査された資料からの取り込み）かを記録します。
後者には資料名と取込日（`importedFrom`）が必須で、資料の確認日（`checkedAt`）とは
別の日付として保持します。提供資料からの取り込みを自力確認と偽れません。

### 「不明」を「条件に合う」と扱わない

確認できなかった値は `null` として保存し、画面には「不明」と表示します。
数値条件で絞り込むと、その項目が不明な商品は結果から外れます。
並び替えでも、不明な商品には順位を付けず末尾に置きます。

### 購入リンクは条件を全部満たしたときだけ出る

商品一致・照合済み・バリエーション一致・店舗設定あり・公式ドメインのHTTPS、
すべてを満たしたリンクだけを表示します。1つでも欠ければボタンを出しません。
ダミーURLや `#` は使いません。

「紹介ID未設定」といった運営側の事情は読者向け画面には出さず、
`npm run validate:content` の出力と `docs/status.md` に記録します。

### 記事本文からHTML・JavaScriptは実行されない

Markdown は限定的な自前パーサーで React 要素に変換します。
`dangerouslySetInnerHTML` を使う経路は構造化データ（JSON.stringify した値のみ）だけです。

---

## ディレクトリ

```
src/config/       サイト設定・店舗設定
src/app/          ページ（App Router・静的出力）
src/components/   UI コンポーネント
src/lib/catalog/  型・スキーマ・検証・絞り込み・読み込み
src/lib/affiliate/ Amazon・楽天のリンク生成と解決
src/lib/content/  Markdown・記事読み込み・公開判定
datasets/         商品・出典・販売先・記事のデータ
                  production/research-materials/ に根拠資料の原文を保管
scripts/          検証・下書き作成・公開前チェックの CLI
tests/            単体テストと E2E
docs/             状態・公開手順・運用手順・調査ログ
```

---

## ドキュメント

| ファイル | 内容 |
|---|---|
| `docs/status.md` | 4区分の状態、実行した検証、実データが0件の理由 |
| `docs/launch-checklist.md` | 本番公開に必要な設定と確認項目 |
| `docs/operations.md` | 商品追加・記事更新・リンク差し替え・切り戻し |
| `docs/research-log.md` | 実施できた／できなかった調査の記録 |
