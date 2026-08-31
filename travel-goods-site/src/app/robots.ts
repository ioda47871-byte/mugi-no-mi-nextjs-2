import type { MetadataRoute } from 'next';

// output: 'export' ではビルド時に生成する必要がある。
export const dynamic = 'force-static';
import { siteConfig, shouldAllowIndexing } from '@/config/site';

/**
 * プレビュー、または正規URL未設定のあいだは全面的にクロールを拒否する。
 * 機密を含むプレビューは noindex だけに頼らずアクセス自体を制限すること（計画書 9節）。
 */
export default function robots(): MetadataRoute.Robots {
  if (!shouldAllowIndexing) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${siteConfig.baseUrl}/sitemap.xml`,
    host: siteConfig.baseUrl ?? undefined,
  };
}
