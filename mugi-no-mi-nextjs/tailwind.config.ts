import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ivory: '#FAF6EF',
        ink: '#2B241D',
        kura: '#5C4A38',
        gold: {
          DEFAULT: '#B79456',
          soft: 'rgba(183,148,86,0.35)',
        },
        brand: {
          DEFAULT: '#D6A928', // ブランドイエロー: CTA・ラベル・ホバー・アイコン専用
          deep: '#B98C1E',
          pale: '#F3E7BD',
          // brand.deepをivory/白地の本文サイズテキストに使うとコントラスト比2.85:1で
          // WCAG AA(4.5:1)を満たさない。同系色でより暗い、テキスト専用の代替色
          // (ivory上で約5.7:1)。アイコン・背景・ホバー時のみの色にはbrand.deepのままでよい。
          text: '#7C5C13',
        },
        line: 'rgba(43,36,29,0.10)',
      },
      fontFamily: {
        display: ['var(--font-zen-old-mincho)', 'serif'],
        accent: ['var(--font-cormorant)', 'serif'],
        body: ['var(--font-noto-sans-jp)', 'sans-serif'],
      },
      maxWidth: {
        container: '1240px',
      },
      transitionTimingFunction: {
        signature: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};

export default config;
