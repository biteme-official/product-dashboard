import type { Channel } from '../types';

export interface PricingScenario {
  id: string;
  label: string;
  hint?: string;
  calcKrwPrice: (base: number, usdRate?: number, jpyRate?: number) => number;
  foreignAmt?: (base: number, usdRate?: number, jpyRate?: number) => { symbol: string; amount: number; decimals: number } | null;
}

export const floor10 = (x: number) => Math.floor(x / 10) * 10;

export const calcOpenSpecialPrice = (base: number): number => {
  const twentyOff = floor10(base * 0.80);
  return Math.floor((twentyOff - 901) / 1000) * 1000 + 900;
};

export const PRICING_SCENARIOS: PricingScenario[] = [
  { id: '오픈특가',           label: '오픈특가',           hint: '특가최대-900단위', calcKrwPrice: (b) => calcOpenSpecialPrice(b) },
  { id: '신상위크',           label: '신상위크',           hint: '오픈특가-천원',    calcKrwPrice: (b) => Math.max(0, calcOpenSpecialPrice(b) - 1000) },
  { id: '신상위크 라이브',    label: '신상위크 라이브',    hint: '신상위크-천원',    calcKrwPrice: (b) => Math.max(0, calcOpenSpecialPrice(b) - 2000) },
  { id: '선단독',             label: '선단독',             hint: '오픈특가-천원',    calcKrwPrice: (b) => Math.max(0, calcOpenSpecialPrice(b) - 1000) },
  { id: '상시 최대할인율',    label: '상시 최대할인율',                              calcKrwPrice: (b) => floor10(b * 0.85) },
  { id: '특가 최대할인율',    label: '특가 최대할인율',                              calcKrwPrice: (b) => floor10(b * 0.80) },
  { id: '시즌오프(의류전용)', label: '시즌오프(의류전용)',                           calcKrwPrice: (b) => floor10(b * 0.75) },
  { id: 'B2B 오픈 할인',      label: 'B2B 오픈 할인',                               calcKrwPrice: (b) => floor10(b * 0.65 * 0.90) },
  { id: 'B2B 상시 운영',      label: 'B2B 상시 운영',                               calcKrwPrice: (b) => floor10(b * 0.65) },
  { id: '사입 공급가',        label: '사입 공급가',                                 calcKrwPrice: (b) => floor10(b * 0.50) },
  {
    id: '글로벌 공급가', label: '글로벌 공급가', hint: 'USD 공급가',
    calcKrwPrice: (b, usdRate = 1400) => floor10((b / 1250 * 1.6) / 2 * usdRate),
    foreignAmt: (b) => ({ symbol: 'USD $', amount: Math.round((b / 1250 * 1.6) / 2 * 100) / 100, decimals: 2 }),
  },
  {
    id: '일본 공급가', label: '일본 공급가', hint: 'JPY 공급가',
    calcKrwPrice: (b, _usd, jpyRate = 9.0) => floor10((b / jpyRate * 1.3) / 2 * jpyRate),
    foreignAmt: (b, _usd, jpyRate = 9.0) => ({ symbol: 'JPY ¥', amount: Math.round((b / jpyRate * 1.3) / 2), decimals: 0 }),
  },
];

export const PRICING_DEFAULT_OPT: Partial<Record<Channel, string>> = {
  '쿠팡':    'B2B 상시 운영',
  'B2B':     'B2B 상시 운영',
  '사입및페어': 'B2B 상시 운영',
  '글로벌':  '글로벌 공급가',
  '일본':    '일본 공급가',
};
