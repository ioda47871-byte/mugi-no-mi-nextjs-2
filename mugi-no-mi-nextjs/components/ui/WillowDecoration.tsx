'use client';

import { useId } from 'react';
import {
  bezierPath,
  cubicPoint,
  cubicTangentAngleDeg,
  droopControlPoints,
  willowLeafPath,
  type Point,
} from '@/lib/svg-curve';

type WillowVariant = 'canopy' | 'corner' | 'branch' | 'sprig' | 'tall';

interface WillowDecorationProps {
  className?: string;
  /**
   * 装飾の規模(3階層):
   * - canopy: LEVEL1。大型の背景装飾。1本の弧を描く主枝から、長さの異なる
   *   複数の小枝が垂れ下がる「Cascading Canopy」構成。
   * - corner: LEVEL1〜2。水平に入ってから下へ流れ込む主枝+小枝の
   *   「Corner Ornament」構成。ページの角から入り込む用途向け。
   * - branch: LEVEL2。ほぼ垂直な1本の主茎から、短い葉付きの小枝が
   *   左右交互に生える「Slim Branch」構成。
   * - sprig: LEVEL3。branchをさらに短くした、小さな一本枝。
   * 既定はbranch。
   */
  variant?: WillowVariant;
  /** trueの場合、左右反転して表示する */
  flip?: boolean;
  style?: React.CSSProperties;
}

interface TwigSpec {
  /** 主茎上でこの小枝が生える位置(0〜1) */
  t: number;
  /** 小枝の長さ */
  length: number;
  /** 小枝の先端が主茎からどれだけ横にずれるか(符号で左右) */
  drift: number;
  leafCount: number;
}

interface VariantConfig {
  viewBox: string;
  /** 主茎(幹)の3次ベジェ制御点 */
  stem: [Point, Point, Point, Point];
  /** 主茎そのものに直接つける、控えめな葉の位置(0〜1)の配列 */
  stemLeafPositions: number[];
  stemLeafLen: number;
  twigs: TwigSpec[];
  strokeWidth: number;
  fade: boolean;
}

/**
 * 決定論的な疑似乱数(0〜1)。Math.random()はSSR/CSRで値がずれるため使えない。
 * indexだけから求まる、見た目に十分な「揺らぎ」を得るための簡易ハッシュ。
 */
function pseudoJitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * 小枝(茎+葉)を生成する。originから、なだらかに垂れるカーブでlength分伸びる。
 * 参考画像(柳UIモチーフ)のような密度・繊細さに寄せるため、葉は細く・多めに
 * 配置し、角度と長さにわずかな個体差(決定論的ジッター)を持たせている
 * (全ての葉が同じ形になる「SVG記号感」を避けるため)。
 */
function buildTwig(origin: Point, spec: TwigSpec, leafSpreadBase: number, seedBase: number) {
  const end: Point = [origin[0] + spec.drift, origin[1] + spec.length];
  // 枝ごとに曲線の形自体を少しずつ変える(全ての小枝が同じ形の
  // 拡大縮小コピーに見える「扇状・記号的」な見た目を避けるため)。
  const curveJitter = pseudoJitter(seedBase + 0.77) * 2 - 1;
  const [p0, p1, p2, p3] = droopControlPoints(origin, end, curveJitter);
  const stemPath = bezierPath(p0, p1, p2, p3);

  const leaves: string[] = [];
  for (let i = 0; i < spec.leafCount; i++) {
    // 葉の間隔を均等割りにせず、位置にも個体差を持たせる
    const tBase = spec.leafCount === 1 ? 0.6 : 0.2 + (i / (spec.leafCount - 1)) * 0.76;
    const tJitter = (pseudoJitter(seedBase + i * 2.3) - 0.5) * 0.07;
    const t = Math.min(Math.max(tBase + tJitter, 0.05), 0.98);
    const [x, y] = cubicPoint(p0, p1, p2, p3, t);
    const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
    // 左右交互を基本としつつ、たまに崩す(同じ角度・同じ側の繰り返しを避ける)
    const altSide = i % 2 === 0 ? 1 : -1;
    const flip = pseudoJitter(seedBase + i * 9.1) < 0.18;
    const side = flip ? -altSide : altSide;
    const jitter = pseudoJitter(seedBase + i * 3.7);
    // 先端(t大)に近づくほど、重力で垂れて広がりが収束する
    const spread = leafSpreadBase * (1 - t * 0.25) + jitter * 9;
    const leafLen = spec.length * (0.19 - t * 0.05) * (0.86 + jitter * 0.3);
    const len = Math.max(leafLen, 3.5);
    leaves.push(willowLeafPath([x, y], tangent + side * spread, len, Math.max(len * 0.15, 1)));
  }

  return { stemPath, leaves };
}

function buildStemLeaves(stem: [Point, Point, Point, Point], positions: number[], leafLen: number) {
  const [p0, p1, p2, p3] = stem;
  return positions.map((t, i) => {
    const [x, y] = cubicPoint(p0, p1, p2, p3, t);
    const tangent = cubicTangentAngleDeg(p0, p1, p2, p3, t);
    const altSide = i % 2 === 0 ? 1 : -1;
    const flip = pseudoJitter(i * 6.1 + 4) < 0.18;
    const side = flip ? -altSide : altSide;
    const jitter = pseudoJitter(i * 5.3 + 1);
    const len = leafLen * (0.88 + jitter * 0.28);
    const spread = (18 + jitter * 8) * (1 - t * 0.2);
    return willowLeafPath([x, y], tangent + side * spread, len, len * 0.16);
  });
}

const VARIANTS: Record<WillowVariant, VariantConfig> = {
  // 「Cascading Canopy」: 弧を描く主枝から、長さの異なる小枝が連続して垂れる
  canopy: {
    viewBox: '0 0 480 460',
    stem: [
      [14, 55],
      [150, 4],
      [330, 10],
      [468, 92],
    ],
    stemLeafPositions: [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88, 0.96],
    stemLeafLen: 13,
    twigs: [
      { t: 0.03, length: 190, drift: -12, leafCount: 7 },
      { t: 0.12, length: 258, drift: -10, leafCount: 9 },
      { t: 0.21, length: 320, drift: 9, leafCount: 10 },
      { t: 0.3, length: 372, drift: -11, leafCount: 11 },
      { t: 0.39, length: 404, drift: 12, leafCount: 12 },
      { t: 0.48, length: 392, drift: -9, leafCount: 11 },
      { t: 0.57, length: 356, drift: 10, leafCount: 10 },
      { t: 0.66, length: 310, drift: -10, leafCount: 10 },
      { t: 0.75, length: 262, drift: 11, leafCount: 9 },
      { t: 0.84, length: 212, drift: -9, leafCount: 7 },
      { t: 0.93, length: 168, drift: 10, leafCount: 6 },
    ],
    strokeWidth: 0.65,
    fade: true,
  },
  // 「Corner Ornament」: 水平に入ってから右下へ流れ込み、下側に小枝が垂れる
  corner: {
    viewBox: '0 0 320 380',
    stem: [
      [10, 66],
      [112, 14],
      [256, 26],
      [300, 292],
    ],
    stemLeafPositions: [0.08, 0.18, 0.28, 0.38, 0.46],
    stemLeafLen: 11,
    twigs: [
      { t: 0.5, length: 96, drift: -10, leafCount: 7 },
      { t: 0.6, length: 132, drift: 10, leafCount: 8 },
      { t: 0.7, length: 168, drift: -11, leafCount: 9 },
      { t: 0.8, length: 200, drift: 10, leafCount: 10 },
      { t: 0.9, length: 226, drift: -9, leafCount: 11 },
      { t: 0.98, length: 240, drift: 8, leafCount: 11 },
    ],
    strokeWidth: 0.65,
    fade: true,
  },
  // 「Slim Branch」: ほぼ垂直な主茎に、短い葉のまとまり(小枝というより
  // 葉の付け根に近い短いスタブ)が左右交互に生える。長く垂れる小枝ではなく、
  // 参考画像のように主茎へ密着した葉のクラスターにするため、長さをごく短くしている
  branch: {
    viewBox: '0 0 110 260',
    stem: [
      [55, 4],
      [50, 90],
      [46, 180],
      [42, 250],
    ],
    stemLeafPositions: [],
    stemLeafLen: 0,
    twigs: [
      { t: 0.12, length: 13, drift: 11, leafCount: 3 },
      { t: 0.24, length: 15, drift: -13, leafCount: 3 },
      { t: 0.36, length: 14, drift: 12, leafCount: 3 },
      { t: 0.48, length: 14, drift: -12, leafCount: 3 },
      { t: 0.6, length: 13, drift: 11, leafCount: 3 },
      { t: 0.72, length: 12, drift: -10, leafCount: 2 },
      { t: 0.84, length: 11, drift: 9, leafCount: 2 },
      { t: 0.95, length: 10, drift: -8, leafCount: 2 },
    ],
    strokeWidth: 0.65,
    fade: false,
  },
  // branchをさらに短くした、小さな一本枝
  sprig: {
    viewBox: '0 0 70 150',
    stem: [
      [35, 145],
      [33, 100],
      [28, 55],
      [24, 15],
    ],
    stemLeafPositions: [],
    stemLeafLen: 0,
    twigs: [
      { t: 0.22, length: 11, drift: 9, leafCount: 2 },
      { t: 0.42, length: 13, drift: -11, leafCount: 3 },
      { t: 0.62, length: 12, drift: 10, leafCount: 3 },
      { t: 0.82, length: 10, drift: -9, leafCount: 2 },
    ],
    strokeWidth: 0.68,
    fade: false,
  },
  // branchをさらに縦へ伸ばした、写真グリッドの左右余白などページの縦幅
  // いっぱいを使う場所向けの長尺variant。同じ「主茎+短い葉クラスター」の
  // 構造を保ったまま、クラスターの数を増やして丈の長い柳らしいシルエットにする。
  tall: {
    viewBox: '0 0 110 520',
    stem: [
      [55, 4],
      [46, 180],
      [36, 360],
      [28, 510],
    ],
    stemLeafPositions: [],
    stemLeafLen: 0,
    twigs: [
      { t: 0.05, length: 12, drift: 10, leafCount: 2 },
      { t: 0.13, length: 14, drift: -12, leafCount: 3 },
      { t: 0.21, length: 15, drift: 11, leafCount: 3 },
      { t: 0.29, length: 14, drift: -13, leafCount: 3 },
      { t: 0.37, length: 15, drift: 12, leafCount: 3 },
      { t: 0.45, length: 14, drift: -11, leafCount: 3 },
      { t: 0.53, length: 15, drift: 12, leafCount: 3 },
      { t: 0.61, length: 14, drift: -12, leafCount: 3 },
      { t: 0.69, length: 13, drift: 11, leafCount: 2 },
      { t: 0.77, length: 13, drift: -11, leafCount: 2 },
      { t: 0.85, length: 12, drift: 10, leafCount: 2 },
      { t: 0.92, length: 11, drift: -9, leafCount: 2 },
      { t: 0.97, length: 10, drift: 9, leafCount: 2 },
    ],
    strokeWidth: 0.62,
    fade: false,
  },
};

/**
 * 柳の線画装飾。店・空間・土地としてのBrot yanagiらしさを表すモチーフ
 * (装飾の使い分けはWheatDecoration.tsxのコメントを参照)。
 *
 * 単一の原点から扇状に伸ばすだけの構成(打ち上げ花火的に見えやすい)ではなく、
 * 弧を描く/垂直な「主茎」を1本置き、その上の複数の点から長さの異なる
 * 「小枝」を垂らす2階層構造にしている(参考: Cascading Canopy / Corner
 * Ornament / Slim Branch / Sprig)。各小枝にはさらに、接線方向に沿って
 * 細長い葉(willowLeafPath、輪郭線のみ・塗りつぶし無し)を複数配置しており、
 * 実際の柳のように「主茎から垂れた枝に、葉が連なって垂れ下がる」見え方に
 * なるようにしている。canopy/cornerは内部にグラデーションを持ち、
 * 先端(コンテンツに近づく側)ほど自動的に透明になる。
 */
export function WillowDecoration({ className = '', style, variant = 'branch', flip = false }: WillowDecorationProps) {
  const gradId = useId();
  const config = VARIANTS[variant];
  const { viewBox, stem, stemLeafPositions, stemLeafLen, twigs, strokeWidth, fade } = config;
  const stroke = fade ? `url(#${gradId})` : 'currentColor';
  const leafSpreadBase = variant === 'branch' || variant === 'sprig' || variant === 'tall' ? 20 : 17;

  const stemPath = bezierPath(stem[0], stem[1], stem[2], stem[3]);
  const stemLeaves = buildStemLeaves(stem, stemLeafPositions, stemLeafLen);
  const twigData = twigs.map((spec, i) => {
    const origin = cubicPoint(stem[0], stem[1], stem[2], stem[3], spec.t);
    return buildTwig(origin, spec, leafSpreadBase, i * 7.3 + 2.1);
  });

  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${flip ? '-scale-x-100' : ''} ${className}`}
      style={style}
    >
      {fade && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}

      <path d={stemPath} />
      {stemLeaves.map((d, i) => (
        <path key={`sl-${i}`} d={d} />
      ))}

      {twigData.map((twig, i) => (
        <g key={i}>
          <path d={twig.stemPath} />
          {twig.leaves.map((d, li) => (
            <path key={li} d={d} />
          ))}
        </g>
      ))}
    </svg>
  );
}
