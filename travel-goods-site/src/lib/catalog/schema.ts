import { z } from 'zod';
import { CATEGORIES, MEASUREMENT_STATES, PUBLICATION_STATUSES, SIZE_BASES } from './types';

/**
 * JSON の形をここで固定する。未知キーは通さない（strict）。
 * 「型としては正しいが根拠が無いデータ」は validate.ts の意味検証で弾く。
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO 8601 の日付 (YYYY-MM-DD) で書く')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), '存在しない日付');

const identifier = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,63}$/, '英小文字・数字・ハイフンのID（2〜64文字）');

const factOf = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z
    .object({
      value: valueSchema.nullable(),
      sourceId: identifier.nullable(),
      checkedAt: isoDate.nullable(),
      note: z.string().min(1).max(300).optional(),
    })
    .strict();

const positiveNumber = z
  .number()
  .finite()
  .refine((n) => n > 0, '仕様値は正の数（不明なら null）');

const sizeMm = z
  .tuple([positiveNumber, positiveNumber, positiveNumber])
  .describe('[幅, 高さ, 奥行] mm');

/** カテゴリ別に許可する specs キーと型（計画書 5-3節）。 */
export const CATEGORY_SPEC_SCHEMAS = {
  suitcases: {
    stopper: 'boolean',
    expandable: 'boolean',
    openingType: 'string',
    wheelCount: 'number',
    tsaLock: 'boolean',
    shellMaterial: 'string',
    frontOpenPocket: 'boolean',
  },
  backpacks: {
    openingType: 'string',
    laptopCompartment: 'boolean',
    chestStrap: 'boolean',
    waistStrap: 'boolean',
    packableIntoSelf: 'boolean',
    exteriorBottlePocket: 'boolean',
    luggagePassThrough: 'boolean',
  },
  pouches: {
    usageType: 'string',
    compartmentCount: 'number',
    hangingHook: 'boolean',
    compression: 'boolean',
    waterResistantMaterial: 'boolean',
    packedThicknessMm: 'number',
  },
  'power-banks': {
    capacityMah: 'number',
    ratedWh: 'number',
    maxOutputW: 'number',
    outputPorts: 'string',
    inputPorts: 'string',
    builtInCable: 'boolean',
    passThroughCharging: 'boolean',
    pseMarkStated: 'boolean',
  },
} as const satisfies Record<(typeof CATEGORIES)[number], Record<string, 'string' | 'number' | 'boolean'>>;

export type CategorySpecKey<C extends keyof typeof CATEGORY_SPEC_SCHEMAS> =
  keyof (typeof CATEGORY_SPEC_SCHEMAS)[C];

export const SPEC_LABELS: Record<string, string> = {
  stopper: 'ストッパー',
  expandable: '拡張機能',
  openingType: '開き方',
  wheelCount: 'キャスター数',
  tsaLock: 'TSAロック',
  shellMaterial: '素材',
  frontOpenPocket: 'フロントポケット',
  laptopCompartment: 'PC収納',
  chestStrap: 'チェストストラップ',
  waistStrap: 'ウエストベルト',
  packableIntoSelf: '本体に収納可',
  exteriorBottlePocket: '外側ボトルポケット',
  luggagePassThrough: 'キャリーオン通し',
  usageType: '用途',
  compartmentCount: '仕切り数',
  hangingHook: '吊り下げフック',
  compression: '圧縮機能',
  waterResistantMaterial: '撥水素材',
  packedThicknessMm: '収納時の厚み',
  capacityMah: '電池容量',
  ratedWh: '定格電力量',
  maxOutputW: '最大出力',
  outputPorts: '出力端子',
  inputPorts: '入力端子',
  builtInCable: 'ケーブル内蔵',
  passThroughCharging: 'パススルー充電',
  pseMarkStated: 'PSE表示の記載',
};

/** 数値 spec の単位表示。 */
export const SPEC_UNITS: Record<string, string> = {
  wheelCount: '個',
  compartmentCount: '室',
  packedThicknessMm: 'mm',
  capacityMah: 'mAh',
  ratedWh: 'Wh',
  maxOutputW: 'W',
};

const specFactSchema = factOf(z.union([z.string().min(1).max(120), z.number().finite(), z.boolean()]));

const alternateMeasurementSchema = z
  .object({
    label: z.string().min(1).max(40),
    state: z.enum(MEASUREMENT_STATES),
    sizeMm: factOf(sizeMm),
    sizeBasis: z.enum(SIZE_BASES),
    capacityL: factOf(positiveNumber),
  })
  .strict();

const baseProductSchema = z.object({
  id: identifier,
  category: z.enum(CATEGORIES),
  brand: z.string().min(1).max(80),
  model: z.string().min(1).max(120),
  variant: z.string().min(1).max(120),
  jan: z.string().regex(/^\d{13}$/, 'JAN は13桁の数字').nullable().optional(),
  status: z.enum(PUBLICATION_STATUSES),
  summary: z.string().min(1).max(300),
  weightG: factOf(positiveNumber),
  outerSizeMm: factOf(sizeMm),
  sizeBasis: z.enum(SIZE_BASES),
  measurementState: z.enum(MEASUREMENT_STATES),
  bodySizeMm: factOf(sizeMm).optional(),
  capacityL: factOf(positiveNumber),
  alternateMeasurements: z.array(alternateMeasurementSchema).max(4),
  specs: z.record(z.string(), specFactSchema),
  caveats: z.array(z.string().min(1).max(300)).max(10),
  image: z
    .object({
      src: z.string().min(1),
      alt: z.string().min(1).max(200),
      sourceId: identifier,
    })
    .strict()
    .nullable(),
}).strict();

/**
 * specs はカテゴリ別の許可キー・型だけを通す。
 * 未知キーや型違いを本番データへ通さないための関門（計画書 5-3節）。
 */
export const productSchema = baseProductSchema.superRefine((product, ctx) => {
  const allowed = CATEGORY_SPEC_SCHEMAS[product.category] as Record<
    string,
    'string' | 'number' | 'boolean'
  >;
  for (const [key, fact] of Object.entries(product.specs)) {
    const expected = allowed[key];
    if (!expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['specs', key],
        message: `カテゴリ ${product.category} で許可されていない spec キー: ${key}（許可: ${Object.keys(allowed).join(', ')}）`,
      });
      continue;
    }
    if (fact.value === null) continue;
    if (typeof fact.value !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['specs', key, 'value'],
        message: `spec ${key} は ${expected} 型で書く（実際: ${typeof fact.value}）`,
      });
    }
    if (expected === 'number' && typeof fact.value === 'number' && fact.value < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['specs', key, 'value'],
        message: `spec ${key} が負の数`,
      });
    }
  }
});

export const sourceSchema = z
  .object({
    id: identifier,
    url: z.string().url(),
    publisher: z.string().min(1).max(120),
    checkedAt: isoDate,
    provenance: z.enum(['direct-fetch', 'provided-document']),
    importedFrom: z
      .object({
        document: z.string().min(1).max(200),
        importedAt: isoDate,
      })
      .strict()
      .nullable(),
    locator: z.string().min(1).max(200),
    editorialUse: z.enum(['verified', 'unverified']),
    automatedFetch: z.enum(['allowed', 'not-allowed', 'unverified']),
    llmInput: z.enum(['allowed', 'not-allowed', 'unverified']),
    usageNote: z.string().min(1).max(400),
  })
  .strict();

export const merchantLinkSchema = z
  .object({
    productId: identifier,
    merchant: z.enum(['amazon', 'rakuten']),
    externalProductId: z.string().min(1).max(120),
    affiliateUrl: z.string().url().nullable(),
    matchedVariant: z.string().min(1).max(120),
    verifiedAt: isoDate.nullable(),
    status: z.enum(['verified', 'unverified', 'unavailable']),
    note: z.string().min(1).max(300).optional(),
  })
  .strict();

export const articleMetaSchema = z
  .object({
    slug: identifier,
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
    category: z.enum([...CATEGORIES, 'packing']),
    status: z.enum(PUBLICATION_STATUSES),
    productIds: z.array(identifier).max(40),
    sourceIds: z.array(identifier).max(60),
    publishedAt: isoDate.nullable(),
    updatedAt: isoDate.nullable(),
    reviewedAt: isoDate.nullable(),
    reviewer: z.string().min(1).max(120).nullable(),
    intentKey: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
  })
  .strict();

export const datasetInfoSchema = z
  .object({
    kind: z.enum(['production', 'demo']),
    label: z.string().min(1).max(120),
    notice: z.string().min(1).max(400).nullable(),
  })
  .strict();

export type ProductInput = z.infer<typeof productSchema>;
