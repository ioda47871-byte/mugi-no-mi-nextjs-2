/**
 * WillowDecoration.tsx / WheatDecoration.tsx専用の、3次ベジェ曲線上の
 * 座標・接線角度を求める純粋関数群。柳の葉/小麦の粒を「枝(茎)の上の
 * 実際の位置・向き」に沿って配置するために使う(固定座標の手打ちを避け、
 * 曲線の形を変えても葉/粒の位置が自動的に追従するようにするため)。
 */

export type Point = readonly [number, number];

export function cubicPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const mt = 1 - t;
  const x = mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0];
  const y = mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1];
  return [x, y];
}

/** 接線の角度(度)。0度=+x方向、90度=+y方向(SVG座標系) */
export function cubicTangentAngleDeg(p0: Point, p1: Point, p2: Point, p3: Point, t: number): number {
  const mt = 1 - t;
  const dx = 3 * mt ** 2 * (p1[0] - p0[0]) + 6 * mt * t * (p2[0] - p1[0]) + 3 * t ** 2 * (p3[0] - p2[0]);
  const dy = 3 * mt ** 2 * (p1[1] - p0[1]) + 6 * mt * t * (p2[1] - p1[1]) + 3 * t ** 2 * (p3[1] - p2[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * 「重力で垂れる」柳らしい曲線: 根元(origin)付近はほぼ真っ直ぐ垂れ、
 * 中盤から先端(end)に向けて横に大きく流れる。複数の枝を同じ原点から
 * 扇状に配置するcanopy/corner variantで、根元から放射状に広がる
 * 「打ち上げ花火」的な見え方にならないよう、序盤の横方向の制御点を
 * 意図的に小さく抑えている(根元付近はほぼ平行に垂れ、先端側でだけ
 * 大きく流れる)。制御点2つを持つ3次ベジェのd文字列(先頭の"M"含む)を返す。
 */
function droopControlOffsets(origin: Point, end: Point): [Point, Point] {
  const [ox, oy] = origin;
  const [ex, ey] = end;
  const c1: Point = [ox + (ex - ox) * 0.05, oy + (ey - oy) * 0.24];
  const c2: Point = [ox + (ex - ox) * 0.58, oy + (ey - oy) * 0.64];
  return [c1, c2];
}

export function droopPath(origin: Point, end: Point): string {
  const [ox, oy] = origin;
  const [c1, c2] = droopControlOffsets(origin, end);
  return `M${ox} ${oy} C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${end[0]} ${end[1]}`;
}

export function droopControlPoints(origin: Point, end: Point): [Point, Point, Point, Point] {
  const [c1, c2] = droopControlOffsets(origin, end);
  return [origin, c1, c2, end];
}

/** 4点を明示指定した3次ベジェのd文字列(先頭の"M"含む)を返す */
export function bezierPath(p0: Point, p1: Point, p2: Point, p3: Point): string {
  return `M${p0[0]} ${p0[1]} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${p3[0]} ${p3[1]}`;
}

/**
 * 細長い柳の葉1枚(先端が尖った披針形の輪郭)のpath(先頭の"M"含む)を返す。
 * originを基点に、angleDeg方向へlength分伸びる。widthは葉の最大幅。
 * 最大幅の位置を根元寄り(35%)に置き、先端に向けて長く細く尖らせることで、
 * 左右対称の「紡錘形アイコン」ではなく、柳らしい披針形の葉に近づけている。
 * strokeで描く線画のため、塗りつぶしではなく輪郭線として使う想定。
 */
export function willowLeafPath(origin: Point, angleDeg: number, length: number, width: number): string {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // 進行方向に垂直なベクトル
  const px = -dy;
  const py = dx;
  const tipX = origin[0] + dx * length;
  const tipY = origin[1] + dy * length;
  const wideT = 0.36;
  const wideX = origin[0] + dx * length * wideT;
  const wideY = origin[1] + dy * length * wideT;
  const halfW = width / 2;
  const leftX = wideX + px * halfW;
  const leftY = wideY + py * halfW;
  const rightX = wideX - px * halfW;
  const rightY = wideY - py * halfW;
  return `M${origin[0].toFixed(1)} ${origin[1].toFixed(1)} Q${leftX.toFixed(1)} ${leftY.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)} Q${rightX.toFixed(1)} ${rightY.toFixed(1)} ${origin[0].toFixed(1)} ${origin[1].toFixed(1)}`;
}
