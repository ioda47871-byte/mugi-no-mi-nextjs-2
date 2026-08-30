import { useId } from 'react';
import type { MenuFilterKey } from '@/lib/products';

interface CategoryIconProps {
  category: Exclude<MenuFilterKey, 'all'>;
  className?: string;
}

/**
 * カテゴリー導線(Home「パンのカテゴリ」)用の線画アイコン。
 * 汎用的な記号ではなく、実際のパンの形(角食/惣菜パンの巻き/メロンパンの
 * クロス模様/バゲットのクープ)が判別できることを優先している。
 * 線の細さ・角の丸みはWillowDecoration/WheatDecorationと揃えている。
 */
export function CategoryIcon({ category, className = '' }: CategoryIconProps) {
  const clipId = useId();
  const props = {
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.35,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  };

  switch (category) {
    case 'shokupan':
      // 角食パン: 台形の焼き型シルエット+スライス跡
      return (
        <svg {...props}>
          <path d="M6 12.5c0-4.2 3.3-6.5 10-6.5s10 2.3 10 6.5v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" />
          <path d="M6.5 13.5h19" />
          <path d="M12 14v9.5M20 14v9.5" opacity={0.6} />
        </svg>
      );
    case 'savory':
      // 惣菜パン: 巻きのある丸いロールと、具がのぞく合わせ目
      return (
        <svg {...props}>
          <path d="M5 19c0-6 4.5-10 11-10s11 4 11 10-4.5 7-11 7-11-1-11-7z" />
          <path d="M8 14.5c3.5-3 12.5-3 16 0" opacity={0.7} />
          <path d="M10.5 20c2.5-1.6 8.5-1.6 11 0" opacity={0.7} />
        </svg>
      );
    case 'sweet':
      // 菓子パン: メロンパンのドームとクロス模様(ドーム内にクリップ)
      return (
        <svg {...props}>
          <defs>
            <clipPath id={clipId}>
              <path d="M6 19a10 10 0 0 1 20 0c0 4.6-4.5 7.5-10 7.5S6 23.6 6 19z" />
            </clipPath>
          </defs>
          <path d="M6 19a10 10 0 0 1 20 0c0 4.6-4.5 7.5-10 7.5S6 23.6 6 19z" />
          <g clipPath={`url(#${clipId})`} opacity={0.65}>
            <path d="M4 14l7 15M11 11l7 17M18 11l7 17M25 14l4 12" />
            <path d="M4 21l24-6" />
          </g>
        </svg>
      );
    case 'meal-bread':
      // 食事パン: バゲットの細長いシルエットとクープ(切れ目)
      return (
        <svg {...props}>
          <path d="M4 20c0-4.5 2.3-8.5 6.5-8.5h11c4.2 0 6.5 4 6.5 8.5s-2.3 6.5-6.5 6.5h-11C6.3 26.5 4 24.5 4 20z" />
          <path d="M10.5 13.5l2.5 6M15.5 12.5l2.5 7M20.5 13.5l2.5 6" opacity={0.7} />
        </svg>
      );
    case 'seasonal':
      // 季節限定: 小麦の穂先に小さな結晶をあしらった、季節の変わり目を示す意匠
      return (
        <svg {...props}>
          <path d="M16 27V13" />
          <path d="M16 16.5l-4-2.5M16 16.5l4-2.5M16 21l-4-2.5M16 21l4-2.5" opacity={0.7} />
          <path d="M16 5v6M13.5 7.5l5 3M18.5 7.5l-5 3" opacity={0.85} />
        </svg>
      );
  }
}
