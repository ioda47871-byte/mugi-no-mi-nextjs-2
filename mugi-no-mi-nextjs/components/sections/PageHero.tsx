import type { ReactNode } from 'react';
import Image from 'next/image';
import { WillowDecoration } from '@/components/ui/WillowDecoration';

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  photoUrl: string;
  photoAlt: string;
  /** 見出し・説明文の下に追加要素(お知らせ表示など)を差し込む */
  children?: ReactNode;
}

/**
 * About/Access/Contactで共通の「左テキスト+右写真(外観)」構成のページHero。
 * Homeの全画面Hero([Hero.tsx](../sections/Hero.tsx))とは別物で、こちらは
 * ページ本文の冒頭セクションとして控えめな高さで使う。
 * 写真は左端にアイボリーへの柔らかいグラデーションを重ね、本文との
 * 境界をハードに切らないようにしている。
 */
export function PageHero({ eyebrow, title, description, photoUrl, photoAlt, children }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden bg-ivory pt-[200px] max-[640px]:pt-[130px]">
      <div className="mx-auto grid max-w-container grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-10 px-8 max-[900px]:grid-cols-1 max-[900px]:gap-8 max-[640px]:px-5">
        <div className="relative z-10 py-14 pr-6 max-[900px]:py-0 max-[900px]:pr-0 max-[900px]:text-center">
          <span className="eyebrow max-[900px]:justify-center">{eyebrow}</span>
          <h1 className="mt-4 text-[clamp(32px,4.6vw,52px)] leading-snug">{title}</h1>
          {description && (
            <p className="mt-5 max-w-md text-[14.5px] leading-loose text-kura max-[900px]:mx-auto">{description}</p>
          )}
          {children}
        </div>

        <div className="relative h-[360px] overflow-hidden rounded-[2px] max-[900px]:h-[240px]">
          <Image
            src={photoUrl}
            alt={photoAlt}
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            priority
            className="object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-ivory to-transparent max-[900px]:hidden"
          />
          <WillowDecoration className="pointer-events-none absolute right-6 top-3 h-36 w-14 text-ivory/70 max-[900px]:hidden" />
        </div>
      </div>
    </section>
  );
}
