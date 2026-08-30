import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${siteConfig.name}(${siteConfig.nameJa})`,
    short_name: siteConfig.name,
    description: siteConfig.defaultDescription,
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF6EF',
    theme_color: '#2B241D',
    lang: 'ja',
    icons: [
      { src: '/icon', sizes: '32x32', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  };
}
