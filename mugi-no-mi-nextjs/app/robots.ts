import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

/**
 * VERCEL_ENVが'production'の場合のみクロールを許可する。
 * それ以外(Preview / Development / ローカルなどVERCEL_ENV未設定)は
 * 提案・デモ用サイトが検索エンジンに登録されないよう、常にクロールを禁止する
 * (安全側のデフォルト)。
 */
export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === 'production';

  if (!isProduction) {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    };
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
