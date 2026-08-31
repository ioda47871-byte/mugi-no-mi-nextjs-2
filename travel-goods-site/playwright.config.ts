import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3210);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * 静的出力（out/）をそのまま配信して検証する。
 * 実行時サーバーに依存しないことを e2e でも保証する。
 */
/**
 * どのデータセットでビルドした out/ を検証するか。
 *   demo（既定）… site.spec.ts（絞り込み・0件・下書き非公開などを厚く確認）
 *   production   … real-data.spec.ts（取り込んだ実商品の表示を確認）
 * cta-preview.spec.ts はデータセットに依存しないため常に実行する。
 */
const DATASET =
  process.env.E2E_DATASET === 'production'
    ? 'production'
    : process.env.E2E_DATASET === 'linkcheck'
      ? 'linkcheck'
      : 'demo';

const IGNORED: Record<string, string[]> = {
  demo: ['**/real-data.spec.ts', '**/link-flow.spec.ts'],
  production: ['**/site.spec.ts', '**/link-flow.spec.ts'],
  linkcheck: ['**/site.spec.ts', '**/real-data.spec.ts'],
};

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: IGNORED[DATASET],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    // 実行環境にインストール済みの Chromium を使いたい場合に指定する。
    // 例: PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 360, height: 780 } } },
  ],
  webServer: {
    command: `npx --yes serve@14.2.6 -l ${PORT} out`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
