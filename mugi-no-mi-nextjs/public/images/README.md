# /public/images

本番の実店舗写真は、このディレクトリに保存してください。

## 命名の目安

```
hero.jpg              Homeファーストビュー
product-shokupan.jpg  商品写真(商品IDに合わせる。lib/products.ts の id を参照)
product-croissant.jpg
visit-storefront.jpg  Visit Us / Access 用の外観・内観
founder-portrait.jpg  店主ポートレート(任意)
instagram-01.jpg 〜   Instagramグリッド用
```

## コンポーネント側の差し替え方法

現在は仮写真として Pexels の画像URL(`https://images.pexels.com/...`)を
直接コンポーネント内に記述しています。実写真に差し替える際は、

1. このディレクトリに画像ファイルを保存する
2. 該当コンポーネント(例: `components/sections/Hero.tsx` の `HERO_IMAGE`定数)の
   URL文字列を `/images/hero.jpg` のようなローカルパスに書き換える

だけで反映されます。`next/image` はローカルパス・リモートURLのどちらにも
対応しているため、`next.config.mjs` の `remotePatterns` 設定以外に
変更は不要です。
