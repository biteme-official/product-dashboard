import type { Channel } from '../types';

export interface PricingScenario {
  id: string;
  label: string;
  hint?: string;
  calcKrwPrice: (base: number, usdRate?: number, jpyRate?: number, promoNewWeek?: boolean) => number;
  foreignAmt?: (base: number, usdRate?: number, jpyRate?: number) => { symbol: string; amount: number; decimals: number } | null;
}

export const round10 = (x: number) => Math.round(x / 10) * 10;

export const calcOpenSpecialPrice = (base: number): number => {
  const twentyOff = round10(base * 0.80);
  return Math.floor((twentyOff - 901) / 1000) * 1000 + 900;
};

// 신상위크 가격: 오픈특가 1만원 이하는 5% 할인 10원 반올림, 초과는 오픈특가-1,000원
export const calcSinSangWeekPrice = (base: number): number => {
  const openSpecial = calcOpenSpecialPrice(base);
  return openSpecial <= 10000
    ? round10(openSpecial * 0.95)
    : Math.max(0, openSpecial - 1000);
};

export const PRICING_SCENARIOS: PricingScenario[] = [
  { id: '오픈특가',           label: '오픈특가',           hint: '특가최대-900단위', calcKrwPrice: (b) => calcOpenSpecialPrice(b) },
  {
    id: '신상위크', label: '신상위크',
    hint: '1만원 이하 5%, 1만원 초과 오픈특가-1,000원',
    calcKrwPrice: (b) => calcSinSangWeekPrice(b),
  },
  {
    id: '라이브 할인', label: '라이브 할인',
    hint: '신상위크(or 오픈특가)×0.95, max -1,000원',
    calcKrwPrice: (b, _u, _j, promoNewWeek = true) => {
      const basePrice = promoNewWeek ? calcSinSangWeekPrice(b) : calcOpenSpecialPrice(b);
      return round10(basePrice - Math.min(Math.round(basePrice * 0.05), 1000));
    },
  },
  {
    id: '선단독', label: '선단독',
    hint: '1만원 이하 5%, 1만원 초과 오픈특가-1,000원',
    calcKrwPrice: (b) => calcSinSangWeekPrice(b),
  },
  { id: '상시 최대할인율',    label: '상시 최대할인율',                              calcKrwPrice: (b) => round10(b * 0.85) },
  { id: '특가 최대할인율',    label: '특가 최대할인율',                              calcKrwPrice: (b) => round10(b * 0.80) },
  { id: '시즌오프(의류전용)', label: '시즌오프(의류전용)',                           calcKrwPrice: (b) => round10(b * 0.75) },
  { id: 'B2B 오픈 할인',      label: 'B2B 오픈 할인',                               calcKrwPrice: (b) => round10(b * 0.65 * 0.90) },
  { id: 'B2B 상시 운영',      label: 'B2B 상시 운영',                               calcKrwPrice: (b) => round10(b * 0.65) },
  { id: '사입 공급가',        label: '사입 공급가',                                 calcKrwPrice: (b) => round10(b * 0.50) },
  {
    id: '글로벌 공급가', label: '글로벌 공급가', hint: 'USD 공급가',
    calcKrwPrice: (b, usdRate = 1400) => round10((b / 1250 * 1.6) / 2 * usdRate),
    foreignAmt: (b) => ({ symbol: 'USD $', amount: Math.round((b / 1250 * 1.6) / 2 * 100) / 100, decimals: 2 }),
  },
  {
    id: '일본 공급가', label: '일본 공급가', hint: 'JPY 공급가',
    calcKrwPrice: (b, _usd, jpyRate = 9.0) => round10((b / jpyRate * 1.3) / 2 * jpyRate),
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
