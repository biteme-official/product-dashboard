import type { SkuData, SizeRatio, MonthlySplit, ChannelRatio } from '../types';
// ColorEntry is intentionally not used here — both dummies have no colors
import { MAX_SIZES, SIZE_LABELS, MONTHS, BRANDS, CHANNELS, DEFAULT_CHANNEL_RATIOS } from '../types';

function buildChannelRatios(): ChannelRatio[] {
  return CHANNELS.map((channel) => ({ channel, ratio: DEFAULT_CHANNEL_RATIOS[channel] }));
}

function buildSizes(count: number, ratios: number[], totalQty: number): SizeRatio[] {
  const labels = SIZE_LABELS[count];
  const sumRatios = ratios.reduce((a, b) => a + b, 0);
  return Array.from({ length: MAX_SIZES }, (_, i) => {
    const isActive = i < count;
    const ratio = isActive ? ratios[i] : 0;
    const quantity =
      isActive && sumRatios > 0 ? Math.round((totalQty * ratio) / sumRatios) : 0;
    return { label: isActive ? labels[i] : '-', ratio, quantity, isActive };
  });
}

function buildMonthlySplit(): MonthlySplit[] {
  return MONTHS.map((month) => ({
    month,
    ratio: 0,
    quantity: 0,
    revenue: 0,
    contributionProfit: 0,
  }));
}

function buildSnapshot(
  data: Omit<SkuData, '_initialSnapshot' | 'isExpanded'>
): SkuData['_initialSnapshot'] {
  return JSON.parse(JSON.stringify(data));
}

const paddingBase = {
  id: 'dummy-padding-001',
  category: '의류' as const,
  name: '패딩 점퍼',
  skuType: '시즈널' as const,
  releaseDate: '2024-10-01',
  price: 79000,
  cost: 12000,
  contributionMarginRate: 35,
  totalOrderQty: 2000,
  sizeCount: 5,
  moq: 100,
  targetSellThroughMonths: 3,
  sizes: buildSizes(5, [15, 30, 35, 15, 5], 2000),
  brand: BRANDS[0],
  hasColors: false,
  colors: [],
  comparisonSku: {
    name: '구형 패딩 점퍼',
    price: 75000,
    cost: 11500,
    monthlyShipment: 400,
    annualShipment: 1200,
  },
  channelRatios: buildChannelRatios(),
  monthlySplit: buildMonthlySplit(),
  memo: '',
};

const tshirtBase = {
  id: 'dummy-tshirt-001',
  category: '의류' as const,
  name: '베이직 티셔츠',
  skuType: '스테디' as const,
  releaseDate: '2024-04-15',
  price: 32000,
  cost: 8000,
  contributionMarginRate: 30,
  totalOrderQty: 1000,
  sizeCount: 5,
  moq: 50,
  targetSellThroughMonths: 6,
  sizes: buildSizes(5, [15, 35, 30, 15, 5], 1000),
  brand: BRANDS[0],
  hasColors: false,
  colors: [],
  comparisonSku: {
    name: '구형 베이직 티셔츠',
    price: 29000,
    cost: 7500,
    monthlyShipment: 100,
    annualShipment: 600,
  },
  channelRatios: buildChannelRatios(),
  monthlySplit: buildMonthlySplit(),
  memo: '',
};

export const DUMMY_SKUS: SkuData[] = [
  {
    ...paddingBase,
    isExpanded: true,
    _initialSnapshot: buildSnapshot(paddingBase),
  },
  {
    ...tshirtBase,
    isExpanded: false,
    _initialSnapshot: buildSnapshot(tshirtBase),
  },
];
