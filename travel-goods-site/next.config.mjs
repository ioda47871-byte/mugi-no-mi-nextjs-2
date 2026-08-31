/**
 * 静的出力（output: 'export'）を前提にする。
 * 理由（計画書 8節）: 実行時DB・SSR・ISR・APIルートを持ち込まず、
 * どの静的ホストにも移せる構成にするため。
 */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  images: {
    // 静的出力では next/image の最適化サーバーが使えないため無効化する。
    unoptimized: true,
  },
  // ビルド時に型・lintを黙って素通りさせない。
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
