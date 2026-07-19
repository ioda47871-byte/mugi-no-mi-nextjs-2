import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { Button } from '@/components/ui/Button';
import { siteContent } from '@/lib/placeholder-content';
import { getLatestInstagramPosts } from '@/lib/instagram';

/**
 * トップページ下部のInstagram連携セクション。
 * lib/instagram.ts がInstagram Graph APIから最新投稿を取得する(約1時間キャッシュ)。
 *
 * 取得に失敗した場合(環境変数未設定・API障害など)は空配列が返ってくるため、
 * エラー画面ではなく「最新情報はInstagramをご覧ください。」という案内文と
 * Instagramボタンのみを表示する。
 */
export async function InstagramGrid() {
  const posts = await getLatestInstagramPosts();

  return (
    <section className="bg-brand-pale px-8 py-20 max-[640px]:px-5 max-[640px]:py-14">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mb-10 text-center">
            <h2 className="font-display text-2xl">Instagram</h2>
            <p className="mx-auto mt-4 max-w-md text-[14px] text-kura">
              焼き上がりのパンや季節限定商品、営業日のお知らせなどをInstagramで更新しています。
            </p>
          </div>
        </RevealOnScroll>

        {posts.length > 0 ? (
          <RevealOnScroll>
            {/* PC/Tablet: 3列×2行、Mobile(640px以下): 2列×3行 */}
            <div className="grid grid-cols-3 gap-3 max-[640px]:grid-cols-2">
              {posts.map((post) => (
                <a
                  key={post.id}
                  href={post.permalink}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={post.caption || 'Instagramの投稿を見る'}
                >
                  <PhotoFrame
                    src={post.imageUrl}
                    alt={post.caption || 'Instagramの投稿'}
                    aspect="aspect-square"
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
                  />
                </a>
              ))}
            </div>
          </RevealOnScroll>
        ) : (
          <RevealOnScroll>
            <p className="mb-2 text-center text-sm text-kura">最新情報はInstagramをご覧ください。</p>
          </RevealOnScroll>
        )}

        <div className="mt-10 text-center">
          <Button href={siteContent.instagramUrl.value} variant="primary">
            Instagramを見る
          </Button>
        </div>
      </div>
    </section>
  );
}
