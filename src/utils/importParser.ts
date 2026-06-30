import { v4 as uuidv4 } from 'uuid';
import type { SkuData, Category, SkuType, Channel } from '../types';
import { CHANNELS, DEFAULT_CHANNEL_RATIOS, SIZE_LABELS, MAX_SIZES, getSkuMonths } from '../types';
import { recalcQuantities } from './calc';

/** 가져오기용 간략 입력 포맷 */
export interface RawSkuInput {
  category: Category;
  name: string;
  skuType?: SkuType;
  releaseDate?: string;
  price?: number;
  cost?: number;
  contributionMarginRate?: number;
  totalOrderQty?: number;
  sizeCount?: number;
  sizeRatios?: number[];
  moq?: number;
  targetSellThroughMonths?: number;
  hasColors?: boolean;
  colors?: { name: string; quantity: number }[];
  monthlySplit?: Record<string, number>;   // "7": 30, "10": 40 ...
  channelRatios?: Partial<Record<Channel, number>>;
  comparisonSku?: {
    name?: string;
    price?: number;
    cost?: number;
    monthlyShipment?: number;
    annualShipment?: number;
  };
}

export function parseImportJson(inputs: RawSkuInput[]): SkuData[] {
  return inputs.map(parseOne);
}

function parseOne(raw: RawSkuInput): SkuData {
  const sizeCount = Math.max(1, Math.min(8, raw.sizeCount ?? 1));
  const hasColors = raw.hasColors ?? false;

  // colors
  const colors = (raw.colors ?? []).map((c) => ({
    id: uuidv4(),
    name: c.name,
    quantity: c.quantity ?? 0,
  }));

  // totalOrderQty: 컬러 모드면 컬러 합계, 단색이면 입력값
  const totalOrderQty = hasColors && colors.length > 0
    ? colors.reduce((s, c) => s + c.quantity, 0)
    : (raw.totalOrderQty ?? 0);

  // sizes
  const labels = SIZE_LABELS[sizeCount];
  const sumRatios = raw.sizeRatios?.reduce((s, r) => s + r, 0) ?? 0;
  const defaultRatio = sumRatios === 0 ? Math.floor(100 / sizeCount) : 0;
  const rawSizes = Array.from({ length: MAX_SIZES }, (_, i) => ({
    label: i < sizeCount ? labels[i] : '-',
    ratio: i < sizeCount ? (raw.sizeRatios?.[i] ?? defaultRatio) : 0,
    quantity: 0,
    isActive: i < sizeCount,
  }));
  const sizes = recalcQuantities(rawSizes, totalOrderQty);

  // monthlySplit
  const msInput = raw.monthlySplit ?? {};
  const price = raw.price ?? 0;
  const cmRate = raw.contributionMarginRate ?? 0;
  const monthlySplit = getSkuMonths(raw.releaseDate).map((month) => {
    const ratio = msInput[String(month)] ?? 0;
    const quantity = Math.round(totalOrderQty * ratio / 100);
    const revenue = quantity * price;
    const contributionProfit = Math.round(revenue * cmRate / 100);
    return { month, ratio, quantity, revenue, contributionProfit };
  });

  // channelRatios
  const crInput = raw.channelRatios ?? {};
  const channelRatios = CHANNELS.map((channel) => ({
    channel,
    ratio: crInput[channel] ?? DEFAULT_CHANNEL_RATIOS[channel],
  }));

  // comparisonSku
  const comp = raw.comparisonSku;
  const comparisonSku = {
    name: comp?.name ?? '',
    price: comp?.price ?? 0,
    cost: comp?.cost ?? 0,
    monthlyShipment: comp?.monthlyShipment ?? 0,
    annualShipment: comp?.annualShipment ?? 0,
  };

  const base = {
    id: uuidv4(),
    category: raw.category,
    name: raw.name,
    skuType: raw.skuType ?? '미해당' as SkuType,
    releaseDate: raw.releaseDate ?? '',
    price,
    cost: raw.cost ?? 0,
    contributionMarginRate: cmRate,
    totalOrderQty,
    sizeCount,
    moq: raw.moq ?? 0,
    targetSellThroughMonths: raw.targetSellThroughMonths ?? 1,
    sizes,
    hasColors,
    colors,
    channelRatios,
    comparisonSku,
    monthlySplit,
  };

  return {
    ...base,
    isExpanded: true,
    _initialSnapshot: JSON.parse(JSON.stringify(base)),
  } as SkuData;
}
