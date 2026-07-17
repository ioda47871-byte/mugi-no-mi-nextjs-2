import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { siteContent } from '@/lib/placeholder-content';

// PLACEHOLDER: Instagramアカウント・投稿写真は仮設定です。
const images = [
  'https://images.pexels.com/photos/1287277/pexels-photo-1287277.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/34040748/pexels-photo-34040748.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/12951912/pexels-photo-12951912.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/16026716/pexels-photo-16026716.jpeg?auto=compress&cs=tinysrgb&w=500',
];

export function InstagramGrid() {
  return (
    <section className="bg-brand-pale px-8 py-20 max-[640px]:px-5 max-[640px]:py-14">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="mb-10 text-center">
            <span className="eyebrow justify-center">Instagram</span>
            <h2 className="mt-3.5 text-2xl">{siteContent.instagramHandle.value}</h2>
          </div>
        </RevealOnScroll>
        <RevealOnScroll>
          <div className="grid grid-cols-4 gap-3 max-[700px]:grid-cols-2">
            {images.map((src, i) => (
              <a key={src} href={siteContent.instagramUrl.value} aria-label={`instagram投稿${i + 1}`}>
                <PhotoFrame src={src} alt={`instagram投稿${i + 1}(仮写真)`} aspect="aspect-square" />
              </a>
            ))}
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
