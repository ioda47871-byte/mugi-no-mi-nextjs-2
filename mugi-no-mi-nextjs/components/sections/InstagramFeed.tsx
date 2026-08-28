import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { InstagramEmbedPost } from './InstagramEmbedPost';
import { siteContent } from '@/lib/placeholder-content';
import { getLatestInstagramPosts } from '@/lib/instagram';

/**
 * About = Instagramと連携したページ。
 * - 実投稿の写真グリッド(取得できた場合のみ。件数はInstagram側のAPIレスポンス次第)
 * - 公式oEmbed(実投稿URLがある場合)またはプレースホルダーカード
 * - 「最新情報はこちら」バナー
 * - フォローボタン
 * 写真グリッドはHomeのInstagramGrid.tsxと同じlib/instagram経由の取得ロジックを
 * 再利用しており(取得失敗・未設定時は空配列→グリッド非表示という既存の安全な
 * フォールバック挙動もそのまま)、新しいデータ取得ロジックは追加していない。
 */
export async function InstagramFeed() {
  const hasFeaturedPost = Boolean(siteContent.instagramFeaturedPostUrl.value);
  const posts = await getLatestInstagramPosts();

  return (
    <section className="bg-brand-pale px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mb-14 text-center">
            <span className="eyebrow justify-center">Instagram</span>
            <h2 className="mt-3.5 text-2xl">{siteContent.instagramHandle.value}</h2>
            <p className="mx-auto mt-4 max-w-md text-[14px] text-kura">
              毎日の焼き上がりや店内の様子は、Instagramで一番早くお届けしています。
            </p>
          </div>
        </RevealOnScroll>

        {posts.length > 0 && (
          <RevealOnScroll>
            <div className="mb-14 grid grid-cols-4 gap-3 max-[640px]:grid-cols-2">
              {posts.slice(0, 4).map((post) => (
                <a key={post.id} href={post.permalink} target="_blank" rel="noreferrer" aria-label={post.caption || 'Instagramの投稿を見る'}>
                  <PhotoFrame
                    src={post.imageUrl}
                    alt={post.caption || 'Instagramの投稿'}
                    aspect="aspect-square"
                    sizes="(max-width: 640px) 45vw, 22vw"
                  />
                </a>
              ))}
            </div>
          </RevealOnScroll>
        )}

        {/* 最新情報はこちら バナー */}
        <RevealOnScroll>
          <a
            href={siteContent.instagramUrl.value}
            className="mb-14 flex flex-col items-center justify-between gap-4 rounded-2xl border border-brand/40 bg-white px-8 py-6 text-center transition-colors hover:border-brand max-[640px]:px-6 sm:flex-row sm:text-left"
          >
            <div>
              <p className="font-display text-lg">最新情報はこちら</p>
              <p className="mt-1.5 text-[13.5px] text-kura">今日焼いたパンや、売り切れ状況をリアルタイムでお知らせしています。</p>
            </div>
            <span className="link-gold shrink-0 text-sm">Instagramを見る →</span>
          </a>
        </RevealOnScroll>

        {/* 公式oEmbed(特定の投稿URLが確定している場合のみ表示。未確定の間は何も表示しない) */}
        {hasFeaturedPost && (
          <RevealOnScroll>
            <div className="mb-14">
              <InstagramEmbedPost url={siteContent.instagramFeaturedPostUrl.value as string} />
            </div>
          </RevealOnScroll>
        )}

        {/* フォローボタン */}
        <RevealOnScroll>
          <div className="mt-12 text-center">
            <a
              href={siteContent.instagramUrl.value}
              className="inline-flex min-h-[48px] items-center gap-2.5 rounded-full bg-ink px-8 text-[13px] tracking-[0.14em] text-brand-pale transition-all duration-300 ease-signature hover:bg-brand hover:text-ink"
            >
              <InstagramIcon />
              {siteContent.instagramHandle.value} をフォローする
            </a>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
