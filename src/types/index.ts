export type Category = '식품' | '용품' | '잡화' | '의류' | '장난감';
export type SkuType = '시즈널' | '스테디' | '미해당';
export type Month = 1 | 2 | 7 | 8 | 9 | 10 | 11 | 12;

export const CATEGORIES: Category[] = ['식품', '용품', '잡화', '의류', '장난감'];
export const SKU_TYPES: SkuType[] = ['시즈널', '스테디', '미해당'];
export const BRANDS = ['바잇미', 'SSFW', '그외'] as const;
export type Brand = typeof BRANDS[number];
export const CHANNELS = ['자사몰', '스스', '위탁', '쿠팡', 'B2B', '사입및페어', '글로벌', '일본'] as const;
export type Channel = typeof CHANNELS[number];
export const B2C_CHANNELS: readonly Channel[] = ['자사몰', '스스', '위탁'];
export const B2B_CHANNELS: readonly Channel[] = ['쿠팡', 'B2B', '사입및페어', '글로벌', '일본'];
/** 목표량 입력이 비활성화된 채널 (채널 구조는 유지하되 수량 0 고정) */
export const DISABLED_CHANNELS: readonly Channel[] = ['쿠팡'];

export interface ChannelRatio {
  channel: Channel;
  ratio: number;
}

export const DEFAULT_CHANNEL_RATIOS: Record<Channel, number> = {
  '자사몰': 20,
  '스스': 25,
  '위탁': 10,
  '쿠팡': 0,
  'B2B': 15,
  '사입및페어': 0,
  '글로벌': 15,
  '일본': 15,
};
/** 7~12월은 당해, 1~2월은 익년 순서로 표시 */
export const MONTHS: Month[] = [7, 8, 9, 10, 11, 12, 1, 2];

/**
 * 시뮬레이션 기준 월 순서 값 (7월=7, 12월=12, 익년1월=13, 익년2월=14)
 * 출시월 이전/이후 판별에 사용
 */
export function simPosition(month: number): number {
  return month >= 7 ? month : month + 12;
}

export const SIZE_LABELS: Record<number, string[]> = {
  1: ['OS'],
  2: ['S', 'M'],
  3: ['S', 'M', 'L'],
  4: ['S', 'M', 'L', 'XL'],
  5: ['S', 'M', 'L', 'XL', '2XL'],
  6: ['S', 'M', 'L', 'XL', '2XL', '3XL'],
  7: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'],
  8: ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
};
export const MAX_SIZES = 8;

export interface ColorEntry {
  id: string;
  name: string;
  quantity: number;
}

export interface SizeRatio {
  label: string;
  ratio: number;
  quantity: number;
  isActive: boolean;
}

export interface ComparisonSku {
  name: string;              // 표시용 (단일이면 SKU명, 복수이면 "A, B, ...")
  compareSkuNames?: string[]; // 다중 선택된 개별 SKU명 목록 (재수화용)
  price: number;
  cost: number;
  monthlyShipment: number;
  annualShipment: number;
}

export interface ChannelMonthEntry {
  channel: Channel;
  month: Month;
  ratio: number; // 해당 채널×월에 총 발주량 대비 출고 비중(%)
}

export interface ChannelMonthQtyEntry {
  channel: Channel;
  month: Month;
  qty: number;
}

export interface ChannelPricing {
  channel: Channel;
  price: number;          // 채널별 판매가 (기본: sku.price)
  commissionRate: number; // 수수료% (0~100)
}

export const DEFAULT_CHANNEL_COMMISSION: Record<Channel, number> = {
  '자사몰': 3,
  '스스': 5.5,
  '위탁': 25,
  '쿠팡': 35,
  'B2B': 0,
  '사입및페어': 0,
  '글로벌': 0,
  '일본': 0,
};

export interface MonthlySplit {
  month: Month;
  ratio: number;
  quantity: number;
  revenue: number;
  contributionProfit: number;
}

export interface SkuData {
  id: string;
  category: Category;
  name: string;
  skuType: SkuType;
  releaseDate: string;              // 'YYYY-MM-DD'
  price: number;
  cost: number;
  regularPrice: number;
  contributionMarginRate: number;
  totalOrderQty: number;
  sizeCount: number;
  moq: number;
  targetSellThroughMonths: number;
  sizes: SizeRatio[];               // 길이 항상 8
  brand: Brand;                     // 브랜드
  hasColors: boolean;               // 컬러 옵션 사용 여부
  colors: ColorEntry[];             // 컬러별 수량 목록
  channelRatios: ChannelRatio[];    // 채널별 판매 비중 (PM 탭용)
  channelMonthlySplit: ChannelMonthEntry[]; // 채널×월 직접 비중 (MD 탭용)
  channelMonthQty: ChannelMonthQtyEntry[]; // 채널×월 직접 수량 (Product Dashboard용)
  channelPricing: ChannelPricing[];        // 채널별 판매가·수수료 (프라이싱 탭용)
  memo: string;                     // 자유 메모 (HTML)
  imageUrl?: string;                // Firebase Storage 이미지 URL
  pricingOpts: Record<string, string>; // STEP3 채널×월 판매가 시나리오 (key: "채널-월")
  pricingUsdRate: number;              // STEP3 USD 환율
  comparisonSku: ComparisonSku;
  monthlySplit: MonthlySplit[];     // 길이 8 (7~12월 + 익년 1~2월)
  step2OptionQty?: Record<string, number>;
  marketingBrief?: MarketingBrief;
  step2InitBaselineQty?: ChannelMonthQtyEntry[]; // 초기화 시 계산된 수량 (비교 기준값, 영구 보존)
  isConfirmed?: boolean;
  finalOrderQty?: Record<string, number>;
  finalOrderConfirmedAt?: string | null;
  platformConfirmed?: boolean;
  brandConfirmed?: boolean;
  globalConfirmed?: boolean;
  isExpanded: boolean;
  _initialSnapshot: Omit<SkuData, 'isExpanded' | '_initialSnapshot'>;
}

export interface MarketingBriefTargetProduct {
  id: string;
  productName: string;
  price: number;
  weeklyEstimatedSales: number;
}

export interface MarketingBrief {
  targetProducts: MarketingBriefTargetProduct[];
  targetCustomer: string;
  marketingProposal: string;
  psp: string;
  ksp: string;
  usp: string;
  note: string;
}

export interface AppState {
  activeCategory: Category;
  activeBrand: Brand | '전체';
  isListView: boolean;
  skus: SkuData[];
}

/** releaseDate(YYYY-MM-DD)에서 출시 월(1~12) 추출 */
export function getReleaseMonth(releaseDate: string): number | null {
  if (!releaseDate) return null;
  const m = parseInt(releaseDate.split('-')[1], 10);
  return isNaN(m) ? null : m;
}
