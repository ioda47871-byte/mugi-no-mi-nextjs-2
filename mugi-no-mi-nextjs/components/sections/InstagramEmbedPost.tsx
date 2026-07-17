'use client';

import Script from 'next/script';

declare global {
  interface Window {
    instgrm?: {
      Embeds: {
        process: () => void;
      };
    };
  }
}

/**
 * Instagram公式のoEmbed(blockquote + embed.js)を使った単一投稿の埋め込み。
 * 実際の投稿URLがある場合のみ使用してください(lib/placeholder-content.ts の
 * instagramFeaturedPostUrl を参照)。
 */
export function InstagramEmbedPost({ url }: { url: string }) {
  return (
    <>
      <blockquote
        className="instagram-media mx-auto"
        data-instgrm-permalink={url}
        data-instgrm-version="14"
        style={{ margin: '0 auto', maxWidth: 540, minWidth: 326, width: '100%' }}
      >
        <a href={url} target="_blank" rel="noreferrer">
          Instagramでこの投稿を見る
        </a>
      </blockquote>
      <Script
        src="https://www.instagram.com/embed.js"
        strategy="lazyOnload"
        onLoad={() => window.instgrm?.Embeds.process()}
      />
    </>
  );
}
