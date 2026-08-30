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
      {/* ページ外側から柳の枝が入り込んでいるように見せる、Hero左端の装飾。
          テキストへ重ならないよう左端に寄せ、マスクで内側へ向かって消す。 */}
      <WillowDecoration
        variant="branch"
        className="pointer-events-none absolute -left-9 top-[150px] hidden h-[260px] w-28 text-gold/35 min-[900px]:block"
        style={{ maskImage: 'linear-gradient(100deg, black 35%, transparent 85%)', WebkitMaskImage: 'linear-gradient(100deg, black 35%, transparent 85%)' }}
      />

      <div className="relative mx-auto grid max-w-container grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] items-center gap-10 px-8 max-[900px]:grid-cols-1 max-[900px]:gap-8 max-[640px]:px-5">
        <div className="relative z-10 py-14 pr-6 max-[900px]:py-0 max-[900px]:pr-0 max-[900px]:text-center">
          <span className="eyebrow max-[900px]:justify-center">{eyebrow}</span>
          <h1 className="mt-4 text-[clamp(32px,4.6vw,52px)] leading-snug">{title}</h1>
          {description && (
            <p className="mt-5 max-w-md text-[14.5px] leading-loose text-kura max-[900px]:mx-auto">{description}</p>
          )}
          {children}
        </div>

        <div className="relative h-[360px] max-[900px]:h-[240px]">
          <div className="relative h-full w-full overflow-hidden rounded-[2px]">
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
          </div>
          {/* 写真の外(右上)から柳が覗き、実写の柳とUIの柳がつながって見えるようにする */}
          <WillowDecoration
            variant="corner"
            className="pointer-events-none absolute -right-10 -top-10 h-56 w-48 text-gold/45 max-[900px]:hidden"
          />
        </div>
      </div>
    </section>
  );
}
