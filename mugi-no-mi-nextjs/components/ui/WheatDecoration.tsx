interface WheatDecorationProps {
  className?: string;
}

/**
 * 小麦の穂の線画装飾。パン・商品・焼き上がりに関する箇所を表すモチーフ
 * (店・空間を表すWillowDecoration.tsxとは役割を分けている)。
 * 中心の茎から左右対称に短い芒(のぎ)を並べただけの、細い線画。
 * 色・不透明度・サイズは呼び出し側でclassName(text-*, opacity-*, w-*, h-*)
 * から制御する。
 */
export function WheatDecoration({ className = '' }: WheatDecorationProps) {
  return (
    <svg
      viewBox="0 0 60 200"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M30 200 L30 18" />

      <path d="M30 30 L14 18" />
      <path d="M30 30 L46 18" />
      <path d="M30 46 L15 35" />
      <path d="M30 46 L45 35" />
      <path d="M30 62 L16 52" />
      <path d="M30 62 L44 52" />
      <path d="M30 78 L17 69" />
      <path d="M30 78 L43 69" />
      <path d="M30 94 L18 86" />
      <path d="M30 94 L42 86" />
      <path d="M30 110 L19 103" />
      <path d="M30 110 L41 103" />

      <path d="M30 18 L30 8" />
    </svg>
  );
}
