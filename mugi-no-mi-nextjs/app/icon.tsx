import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * ブランドの実写真とは別に、ファビコン用の簡易モノグラム(頭文字「B」)を
 * next/ogで動的生成している。favicon/appleアイコン用の実写真・ロゴ素材は
 * 未確認のため、サイトの配色(ink/brand)のみを使った最小限の意匠にしている。
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2B241D',
          borderRadius: 6,
        }}
      >
        <span style={{ fontSize: 20, fontFamily: 'serif', fontWeight: 700, color: '#D6A928' }}>B</span>
      </div>
    ),
    { ...size },
  );
}
