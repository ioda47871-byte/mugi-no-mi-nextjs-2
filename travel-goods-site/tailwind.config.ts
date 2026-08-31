import type { Config } from 'tailwindcss';

/**
 * 計画書 3節のデザイン方針:
 * 明るい背景 / 濃紺の文字 / 落ち着いた青緑をアクセント。
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#16243f',
          soft: '#43526f',
          faint: '#6b7891',
        },
        accent: {
          DEFAULT: '#0f7b7b',
          dark: '#0a5c5c',
          soft: '#e3f2f1',
        },
        paper: {
          DEFAULT: '#fbfcfd',
          card: '#ffffff',
          line: '#dde3ec',
        },
        warn: {
          DEFAULT: '#8a5a00',
          soft: '#fff5e0',
        },
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          '"Hiragino Kaku Gothic ProN"',
          '"Noto Sans JP"',
          'Meiryo',
          'sans-serif',
        ],
      },
      maxWidth: {
        prose: '46rem',
      },
    },
  },
  plugins: [],
};

export default config;
