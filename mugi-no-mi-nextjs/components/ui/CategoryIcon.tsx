import type { MenuFilterKey } from '@/lib/products';

interface CategoryIconProps {
  category: Exclude<MenuFilterKey, 'all'>;
  className?: string;
}

/**
 * カテゴリー導線(Home「パンのカテゴリ」)用の細い線画アイコン。
 * lib/products.tsのMENU_FILTERSのキーと1:1で対応させている。
 */
export function CategoryIcon({ category, className = '' }: CategoryIconProps) {
  const props = {
    viewBox: '0 0 32 32',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  };

  switch (category) {
    case 'shokupan':
      return (
        <svg {...props}>
          <path d="M6 14c0-5 3-9 10-9s10 4 10 9v11a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z" />
          <path d="M6 14h20" />
        </svg>
      );
    case 'savory':
      return (
        <svg {...props}>
          <path d="M4 18c0-7 5-12 12-12s12 5 12 12-5 9-12 9-12-2-12-9z" />
          <path d="M11 14c2-2 8-2 10 0" />
          <path d="M10 19c3-1.5 9-1.5 12 0" />
        </svg>
      );
    case 'sweet':
      return (
        <svg {...props}>
          <path d="M16 6c-6 2-10 7-10 13a10 10 0 0 0 20 0c0-6-4-11-10-13z" />
          <path d="M16 6c2 2 2 4 0 6" />
          <path d="M11 24h10" />
        </svg>
      );
    case 'meal-bread':
      return (
        <svg {...props}>
          <path d="M5 15 16 6l11 9" />
          <path d="M7 14v11h18V14" />
          <path d="M13 25v-7h6v7" />
        </svg>
      );
    case 'seasonal':
      return (
        <svg {...props}>
          <path d="M16 4v24" />
          <path d="M6 9l20 14" />
          <path d="M26 9 6 23" />
          <path d="M16 4l-3 3M16 4l3 3M16 28l-3-3M16 28l3-3" />
          <path d="M6 9l1 4M6 9l4-1" />
          <path d="M26 23l-1-4M26 23l-4 1" />
        </svg>
      );
  }
}
