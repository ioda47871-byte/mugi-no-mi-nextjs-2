import type { Metadata } from 'next';
import Link from 'next/link';
import InfoPage, { Section } from '@/components/InfoPage';
import { absoluteUrl } from '@/config/site';

export const metadata: Metadata = {
  title: '編集・広告方針',
  description:
    '商品の採用基準、比較の方法、AIの用途、広告・アフィリエイトとの関係、誤りの訂正手順を説明します。',
  alternates: absoluteUrl('/editorial-policy/')
    ? { canonical: absoluteUrl('/editorial-policy/') as string }
    : undefined,
};

export default function EditorialPolicyPage() {
  return (
    <InfoPage
      title="編集・広告方針"
      lead="どうやって商品を選び、何を根拠に比較し、広告とどう線を引いているかをまとめています。"
    >
      <Section heading="商品の採用基準">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>紹介料率の高さで採用や掲載順を決めません。</li>
          <li>想定読者（2〜3泊の旅行者）に合うか、仕様を確認できるか、販売先が信頼できるかで選びます。</li>
          <li>メーカーが仕様を公表しておらず確認できない商品は、件数を満たすためだけに採用しません。</li>
          <li>販売終了・情報不足・型番不一致の商品は掲載を見送ります。</li>
        </ul>
      </Section>

      <Section heading="比較の方法">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>単位を統一しています（重量 g、寸法 mm、容量 L、出力 W、電力量 Wh）。</li>
          <li>スーツケースは、ハンドル・キャスターを含む外寸と本体寸法を分けて掲載します。</li>
          <li>確認できなかった値は「不明」と表示し、0や推定値、類似商品の値で埋めません。</li>
          <li>「不明」の項目は、その数値による並び替えや範囲での絞り込みの対象にしません。</li>
          <li>独自の総合おすすめ点数や、根拠のないランキングは作りません。</li>
          <li>拡張前後・容量違い・旧型と新型・単品とセットは、別のバリエーションとして扱います。</li>
        </ul>
      </Section>

      <Section heading="書かないこと">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>実際に使っていない商品について「使ってみた」「疲れない」「静か」などの体験・評価は書きません。</li>
          <li>「絶対安全」「これが最強」のような断定はしません。</li>
          <li>モバイルバッテリーの mAh から、根拠なく実使用の充電回数や Wh を算出しません。</li>
          <li>圧縮ポーチが荷物の「重量」を減らすとは書きません（減るのは体積です）。</li>
          <li>機内持ち込みの可否を mAh だけで自動判定しません。航空会社・路線・適用日で異なるため、公式案内をご確認ください。</li>
          <li>商品を使ったと誤解させるAI生成画像は使いません。</li>
        </ul>
      </Section>

      <Section heading="AIの用途">
        <p>
          記事の構成づくり、下書きの整形、データの検証スクリプトの作成にAIを利用しています。
          一方で、掲載する仕様の値は、メーカーの公表情報を出典として登録し、確認日とともに記録した内容だけを使います。
          自動検査に通ったことは「内容が正しいことの証明」ではないため、公開前に人の確認を行っています。
          安全情報や航空ルールに関する記述は自動公開の対象外です。
        </p>
      </Section>

      <Section heading="広告・アフィリエイトとの関係">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>商品紹介のあるページには、広告・アフィリエイトリンクを含む旨を表示しています。</li>
          <li>販売先ボタンは、型番・容量・バリエーションの一致を確認できた商品にだけ表示します。</li>
          <li>紹介IDやリンクが未設定の店舗のボタンは表示しません（ダミーURLは使いません）。</li>
          <li>価格・在庫・送料・ポイントは当サイトでは表示せず、販売先でご確認いただく方針です。</li>
          <li>広告リンクには rel=&quot;sponsored noopener&quot; を設定し、新しいタブで開きます。</li>
          <li>公式の購入先へ直接リンクします。独自の短縮URLや中継リダイレクトは使いません。</li>
        </ul>
      </Section>

      <Section heading="訂正の方法">
        <p>
          誤りや古くなった情報を見つけた場合は、
          <Link className="link-inline" href="/contact/">お問い合わせ</Link>
          からご連絡ください。確認のうえ修正し、意味のある変更があった場合に記事の更新日を更新します。
          意味のある変更がないのに更新日だけを書き換えることはしません。
          安全性に関わる問題（回収・リコールなど）が判明した場合は、該当商品の紹介と断定的な記述を取り下げます。
        </p>
      </Section>

    </InfoPage>
  );
}
