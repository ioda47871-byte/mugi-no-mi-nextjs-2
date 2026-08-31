/**
 * 広告・アフィリエイトの表示（計画書 9節）。
 * 商品紹介のあるページの分かりやすい位置（本文の前）に置く。
 */
export default function AdDisclosure({ compact = false }: { compact?: boolean }) {
  return (
    <p
      data-testid="ad-disclosure"
      className={`rounded-lg border border-paper-line bg-paper px-3 py-2 text-ink-soft ${
        compact ? 'text-[0.7rem]' : 'text-xs'
      }`}
    >
      このページには広告・アフィリエイトリンクを含みます。リンク経由で購入されると、当サイトに紹介料が支払われることがあります。
      掲載順や評価は紹介料率で決めていません。
    </p>
  );
}
