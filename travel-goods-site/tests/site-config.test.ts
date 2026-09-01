import { afterEach, describe, expect, it, vi } from 'vitest';

const KEYS = [
  'SITE_NAME',
  'SITE_URL',
  'SITE_MODE',
  'PUBLIC_OPERATOR_NAME',
  'PUBLIC_CONTACT_EMAIL',
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe('site config', () => {
  it('SITE_NAME 未設定でも正式名称を使い、名称を公開不足に数えない', async () => {
    for (const key of KEYS) delete process.env[key];
    vi.resetModules();

    const { DEFAULT_SITE_NAME, missingLaunchSettings, siteConfig } = await import('@/config/site');

    expect(DEFAULT_SITE_NAME).toBe('旅モノ比較');
    expect(siteConfig.name).toBe('旅モノ比較');
    expect(siteConfig).not.toHaveProperty('nameIsProvisional');
    expect(missingLaunchSettings()).toEqual([
      'SITE_URL（正規URL。canonical・サイトマップに必要）',
      'PUBLIC_OPERATOR_NAME（公開用の運営者名）',
      'PUBLIC_CONTACT_EMAIL（公開用の問い合わせ先）',
    ]);
  });

  it('SITE_NAME が設定されていれば環境別の表示名として上書きする', async () => {
    process.env.SITE_NAME = '旅モノ比較 Preview';
    vi.resetModules();

    const { siteConfig } = await import('@/config/site');
    expect(siteConfig.name).toBe('旅モノ比較 Preview');
  });
});
