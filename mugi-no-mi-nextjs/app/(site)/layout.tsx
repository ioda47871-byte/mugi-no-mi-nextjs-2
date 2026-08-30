import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { MobileActionBar } from '@/components/layout/MobileActionBar';

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="fixed left-[-999px] top-0 z-[1000] bg-ink px-5 py-3.5 text-brand-pale focus:left-5 focus:top-5"
      >
        本文へスキップ
      </a>
      <Header />
      <main id="main">{children}</main>
      <MobileActionBar />
      <Footer />
    </>
  );
}
