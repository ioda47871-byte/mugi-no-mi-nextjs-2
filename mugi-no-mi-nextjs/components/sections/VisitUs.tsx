import { PhotoFrame } from '@/components/ui/PhotoFrame';
import { RevealOnScroll } from '@/components/ui/RevealOnScroll';
import { Button } from '@/components/ui/Button';
import { siteContent } from '@/lib/placeholder-content';
import { getSitePhoto } from '@/lib/site-photos';

export async function VisitUs() {
  const entrancePhoto = await getSitePhoto('entrance');
  return (
    <section className="bg-white px-8 py-24 max-[640px]:px-5 max-[640px]:py-16">
      <div className="mx-auto max-w-container">
        <RevealOnScroll>
          <div className="grid grid-cols-[0.9fr_1.1fr] items-center gap-16 max-[860px]:grid-cols-1 max-[860px]:gap-9">
            <PhotoFrame src={entrancePhoto.url} alt={entrancePhoto.alt} aspect="aspect-[4/5]" />

            <div>
              <span className="eyebrow">Visit Us</span>
              <h2 className="mt-3.5 text-2xl">ご来店のご案内</h2>

              <table className="mt-1 w-full border-collapse">
                <tbody>
                  <tr className="border-b border-line">
                    <td className="w-[110px] py-3 align-top font-accent text-sm italic text-brand-text">住所</td>
                    <td className="py-3 align-top text-sm">{siteContent.address.value}</td>
                  </tr>
                  <tr className="border-b border-line">
                    <td className="w-[110px] py-3 align-top font-accent text-sm italic text-brand-text">営業時間</td>
                    <td className="py-3 align-top text-sm">{siteContent.hours.value}</td>
                  </tr>
                  <tr className="border-b border-line">
                    <td className="w-[110px] py-3 align-top font-accent text-sm italic text-brand-text">定休日</td>
                    <td className="py-3 align-top text-sm">{siteContent.closedDay.value}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-5 rounded-[8px] border border-line bg-ivory px-5 py-4">
                <p className="font-accent text-sm italic tracking-wide text-brand-text">駐車場のご案内</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-kura">{siteContent.parking.value}</p>
              </div>

              <div className="mt-4 rounded-[8px] border border-brand/30 border-l-[3px] border-l-brand bg-ivory px-5 py-4">
                <p className="font-accent text-sm italic tracking-wide text-brand-text">パンのご予約・お取り置き</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-kura">
                  パンのご予約・お取り置きは、お電話にて承っております。ご希望の商品・個数、お名前、お電話番号をお伝えください。
                </p>
                <Button
                  href={`tel:${siteContent.phoneHref.value}`}
                  variant="primary"
                  className="mt-4 max-[860px]:w-full max-[860px]:justify-center"
                >
                  電話で予約する
                </Button>
              </div>

              <p className="mt-3 text-[12.5px] text-kura">
                ※パンが売り切れ次第、営業終了となります。最新の営業情報はInstagramをご確認ください。
              </p>

              <div className="mt-6 overflow-hidden rounded-2xl border border-line shadow-lg shadow-ink/5">
                <iframe
                  title={`${siteContent.brandName.value} 簡易地図`}
                  loading="lazy"
                  src={siteContent.mapEmbedUrl.value}
                  className="h-[180px] w-full grayscale-[15%] sepia-[8%]"
                />
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-5">
                <a
                  href={`tel:${siteContent.phoneHref.value}`}
                  className="inline-flex min-h-[44px] items-center border-b border-gold pb-0.5 text-[15px] tracking-wide text-ink transition-colors hover:text-brand-deep max-[860px]:min-h-[48px] max-[860px]:gap-2 max-[860px]:rounded-[2px] max-[860px]:border-b-0 max-[860px]:bg-brand max-[860px]:px-7 max-[860px]:text-[13px] max-[860px]:tracking-[0.12em] max-[860px]:text-ink"
                >
                  {siteContent.phone.value} に電話する
                </a>
                <Button href="/access" variant="outline" className="min-h-[48px]">道順・詳細地図を見る</Button>
              </div>
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
