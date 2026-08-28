interface WillowDecorationProps {
  className?: string;
  /** trueの場合、左右反転して表示する */
  flip?: boolean;
}

/**
 * 柳の枝が垂れる線画装飾。店・空間・土地としてのBrot yanagiらしさを表す
 * モチーフ(装飾の使い分けはWheatDecoration.tsxのコメントを参照)。
 * 汎用的な葉っぱ素材やオリーブ・ユーカリ調にならないよう、細く垂れる
 * 3本の枝+小さな葉の刻みのみで構成している。色・不透明度・サイズは
 * 呼び出し側でclassName(text-*, opacity-*, w-*, h-*)から制御する。
 */
export function WillowDecoration({ className = '', flip = false }: WillowDecorationProps) {
  return (
    <svg
      viewBox="0 0 100 220"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      aria-hidden="true"
      className={`${flip ? '-scale-x-100' : ''} ${className}`}
    >
      <path d="M50 0 C48 60, 38 150, 35 220" />
      <path d="M50 0 C50 80, 50 150, 50 220" />
      <path d="M50 0 C52 60, 62 150, 66 220" />

      {/* 左の枝の葉の刻み */}
      <path d="M47 40 l-7 -4" />
      <path d="M44 78 l-7 -3" />
      <path d="M40 118 l-7 -2" />
      <path d="M37 158 l-7 -2" />
      <path d="M35 196 l-7 -1" />

      {/* 中央の枝の葉の刻み */}
      <path d="M50 50 l6 4" />
      <path d="M50 90 l-6 4" />
      <path d="M50 130 l6 3" />
      <path d="M50 170 l-6 3" />

      {/* 右の枝の葉の刻み */}
      <path d="M53 40 l7 -4" />
      <path d="M57 78 l7 -3" />
      <path d="M61 118 l7 -2" />
      <path d="M64 158 l7 -2" />
      <path d="M66 196 l7 -1" />
    </svg>
  );
}
