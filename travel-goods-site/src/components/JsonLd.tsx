/**
 * 構造化データ。
 * 生HTMLを注入せず、JSON.stringify した値だけを <script type="application/ld+json"> に置く。
 * 掲載するのはページ内容と一致する Article / BreadcrumbList のみ。
 * 架空の Review・AggregateRating・価格付き Offer は作らない（計画書 9節）。
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify の結果のみを埋め込み、'<' をエスケープして早期終了を防ぐ。
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
