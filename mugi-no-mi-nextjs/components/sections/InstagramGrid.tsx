import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { Button } from '@/components/ui/Button';
import { siteContent } from '@/lib/placeholder-content';

/**
 * 実際の投稿写真は確認できていないため、投稿グリッドは表示せず、
 * 公式Instagramアカウントへの案内のみを表示しています。
 */
export function InstagramGrid() {
  return (
    <section className="bg-brand-pale px-8 py-20 max-[640px]:px-5 max-[640px]:py-14">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="text-center">
            <span className="eyebrow justify-center">Instagram</span>
            <h2 className="mt-3.5 text-2xl">{siteContent.instagramHandle.value}</h2>
            <p className="mx-auto mt-4 max-w-md text-[14px] text-kura">
              最新の営業情報や焼き上がりの様子は、Instagramでご確認ください。
            </p>
            <div className="mt-8">
              <Button href={siteContent.instagramUrl.value} variant="primary">
                Instagramを見る
              </Button>
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
