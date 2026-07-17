import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { InstagramEmbedPost } from './InstagramEmbedPost';
import { getLatestInstagramPosts } from '@/lib/instagram';
import { siteContent } from '@/lib/placeholder-content';

/**
 * About = Instagramと連携したページ。
 * - 公式oEmbed(実投稿URLがある場合)またはプレースホルダーカード
 * - 最新投稿一覧(仮データ。本番はInstagram Graph APIに差し替え)
 * - 「焼きたて情報はこちら」バナー
 * - フォローボタン
 */
export function InstagramFeed() {
  const posts = getLatestInstagramPosts(6);
  const hasFeaturedPost = Boolean(siteContent.instagramFeaturedPostUrl.value);

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

        {/* 焼きたて情報はこちら バナー */}
        <RevealOnScroll>
          <a
            href={siteContent.instagramUrl.value}
            className="mb-14 flex flex-col items-center justify-between gap-4 rounded-2xl border border-brand/40 bg-white px-8 py-6 text-center transition-colors hover:border-brand max-[640px]:px-6 sm:flex-row sm:text-left"
          >
            <div>
              <p className="font-display text-lg">焼きたて情報はこちら</p>
              <p className="mt-1.5 text-[13.5px] text-kura">今日焼いたパンや、売り切れ状況をリアルタイムでお知らせしています。</p>
            </div>
            <span className="link-gold shrink-0 text-sm">Instagramを見る →</span>
          </a>
        </RevealOnScroll>

        {/* 公式oEmbed または プレースホルダー */}
        <RevealOnScroll>
          <div className="mb-14">
            {hasFeaturedPost ? (
              <InstagramEmbedPost url={siteContent.instagramFeaturedPostUrl.value as string} />
            ) : (
              <div className="mx-auto max-w-md rounded-2xl border border-dashed border-kura/30 bg-white/60 px-8 py-12 text-center">
                <p className="text-sm text-kura">
                  ここに、実際のInstagram投稿(公式埋め込み)が表示されます。
                  <br />
                  投稿URLが確定したら、<code className="text-xs">instagramFeaturedPostUrl</code> に設定してください。
                </p>
              </div>
            )}
          </div>
        </RevealOnScroll>

        {/* 最新投稿一覧(仮データ) */}
        <RevealOnScroll>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {posts.map((post) => (
              <a
                key={post.id}
                href={post.permalink ?? siteContent.instagramUrl.value}
                aria-label={post.caption}
                className="group"
              >
                <PhotoFrame src={post.image} alt={`${post.caption}(仮写真)`} aspect="aspect-square" />
              </a>
            ))}
          </div>
        </RevealOnScroll>

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
