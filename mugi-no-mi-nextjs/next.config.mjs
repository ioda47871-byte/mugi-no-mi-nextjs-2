// 環境変数からSupabase StorageのホストをremotePatternsへ自動追加する。
// プロジェクトRefをコード内にハードコードせずに済むよう、
// NEXT_PUBLIC_SUPABASE_URL からホスト名を動的に導出している。
function getSupabaseStorageHostname() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const supabaseHostname = getSupabaseStorageHostname();

const remotePatterns = [
  // 仮素材として使用しているストック写真サービス。
  {
    protocol: 'https',
    hostname: 'images.pexels.com',
    pathname: '/photos/**',
  },
  {
    protocol: 'https',
    hostname: 'images.unsplash.com',
  },
];

// Supabase Storage(products-imagesバケット、公開URL配下)を許可する。
// NEXT_PUBLIC_SUPABASE_URL が未設定のビルド環境(Supabase未設定でJSONフォールバック
// のみで動かす場合)では追加されない。
if (supabaseHostname) {
  remotePatterns.push({
    protocol: 'https',
    hostname: supabaseHostname,
    pathname: '/storage/v1/object/public/**',
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // next/image で許可する外部画像ドメインを、実際に使用するものだけに限定しています。
    // ワイルドカード(hostname: '**')は使用しません。
    //
    // 内訳:
    //   - images.pexels.com / images.unsplash.com: 仮素材(ストック写真)用
    //   - {NEXT_PUBLIC_SUPABASE_URLのホスト}: 管理画面からアップロードした
    //     商品画像(Supabase Storage / products-images バケットの公開URL)用
    //
    // それ以外の未許可ドメインの画像URLが登録された場合、
    // next/imageは画像の最適化・表示を拒否します(意図的な制限です)。
    remotePatterns,
  },
};

export default nextConfig;
