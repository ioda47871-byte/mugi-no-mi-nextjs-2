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
  // Instagram投稿画像(Instagram Graph API経由。components/sections/InstagramGrid.tsx参照)。
  // Instagram/FacebookのCDNは投稿ごと・リージョンごとに異なる多数のサブドメイン
  // (例: scontent-xxx1-1.cdninstagram.com)を使うため、個別列挙が不可能で、
  // ドメイン単位のサブドメインワイルドカード(**.cdninstagram.com / **.fbcdn.net)を
  // 使用しています。これはこの2ドメインのみに限定されたワイルドカードであり、
  // 任意のドメインを許可する全体ワイルドカード(hostname: '**')ではありません。
  // pathnameも同様の理由(署名付きURLで経路が予測不能)で制限していません。
  {
    protocol: 'https',
    hostname: '**.cdninstagram.com',
  },
  {
    protocol: 'https',
    hostname: '**.fbcdn.net',
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
    // 任意のドメインを許可する全体ワイルドカード(hostname: '**'単体)は使用しません。
    // Instagram向けの2件のみ、ドメインを固定した上でのサブドメインワイルドカード
    // (**.cdninstagram.com 等)を使用しています(理由は下記該当箇所のコメント参照)。
    //
    // 内訳:
    //   - images.pexels.com / images.unsplash.com: 仮素材(ストック写真)用
    //   - **.cdninstagram.com / **.fbcdn.net: Instagram Graph API経由の投稿画像用
    //   - {NEXT_PUBLIC_SUPABASE_URLのホスト}: 管理画面からアップロードした
    //     商品画像(Supabase Storage / products-images バケットの公開URL)用
    //
    // それ以外の未許可ドメインの画像URLが登録された場合、
    // next/imageは画像の最適化・表示を拒否します(意図的な制限です)。
    remotePatterns,
  },
};

export default nextConfig;
