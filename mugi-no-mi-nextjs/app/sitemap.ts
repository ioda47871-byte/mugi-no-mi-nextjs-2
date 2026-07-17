import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/menu', '/access', '/about', '/gallery', '/contact'];

  return routes.map((route) => ({
    url: `${siteConfig.url}${route}`,
    lastModified: new Date(),
    changeFrequency: route === '/menu' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : 0.7,
  }));
}
