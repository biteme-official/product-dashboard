export type Category = '식품' | '용품' | '잡화' | '의류' | '장난감';
export type SkuType = '시즈널' | '스테디' | '미해당';
export type Month = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export const CATEGORIES: Category[] = ['식품', '용품', '잡화', '의류', '장난감'];
export const SKU_TYPES: SkuType[] = ['시즈널', '스테디', '미해당'];
export const BRANDS = ['바잇미', 'SSFW', '그외'] as const;
export type Brand = typeof BRANDS[number];
export const CHANNELS = ['자사몰', '스스', '위탁', '쿠팡', 'B2B', '사입및페어', '글로벌', '일본'] as const;
export type Channel = typeof CHANNELS[number];
export const B2C_CHANNELS: readonly Channel[] = ['자사몰', '스스', '위탁'];
export const B2B_CHANNELS: readonly Channel[] = ['쿠팡', 'B2B', '사입및페어', '글로벌', '일본'];
/**
 * SKU별 비활성 채널 목록 (채널 구조는 유지하되 수량 0 고정).
 * 쿠팡은 기본 비활성 — SkuData.coupangEnabled가 true인 SKU만 예외적으로 활성화됨.
 */
export function getDisabledChannels(sku: { coupangEnabled?: boolean }): readonly Channel[] {
  return sku.coupangEnabled ? [] : ['쿠팡'];
}

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
/** 기본 시즌 8개월 (7월 출시 기준 — 하위 호환용). 컴포넌트에서는 getSkuMonths() 사용 권장 */
export const MONTHS: Month[] = [7, 8, 9, 10, 11, 12, 1, 2];

/** SKU 출시일 기준 8개월 윈도우를 반환. releaseDate 없으면 7월 시작 기본값 */
export function getSkuMonths(releaseDate: string | undefined | null): Month[] {
  const rm = getReleaseMonth(releaseDate ?? '');
  const start: number = rm ?? 7;
  const result: Month[] = [];
  for (let i = 0; i < 8; i++) {
    result.push(((start - 1 + i) % 12 + 1) as Month);
  }
  return result;
}

/** 해당 월이 출시연도 기준 익년인지 여부 (출시월보다 숫자가 작으면 익년으로 wrap된 것) */
export function isNextYearMonth(month: Month, releaseDate: string | undefined | null): boolean {
  const rm = getReleaseMonth(releaseDate ?? '') ?? 7;
  return month < rm;
}

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
  skuName: string;
  skuType: SkuType;
  releaseDate: string;              // 'YYYY-MM-DD'
  arrivalDate?: string;             // 입고예정일
  shootingDate?: string;            // 촬영예정일
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
  monthlySplit: MonthlySplit[];     // 출시월 기준 8개월분 (getSkuMonths 윈도우)
  step2OptionQty?: Record<string, number>;
  marketingBrief?: MarketingBrief;
  marketingMonthQty?: { [month: number]: number }; // 마케팅 채널 월별 수량 (원가×수량 = 비용)
  isPriceConfirmed?: boolean;                       // 가격 확정 여부 (master만 변경 가능)
  specialMaxRate?: 20 | 15 | 10;                    // 특가 최대할인율(%), 기본 20 (master만 변경 가능)
  regularMaxRate?: 15 | 10 | 5;                     // 상시 최대할인율(%), 기본 15 (master만 변경 가능)
  seasonOffRate?: 25 | 30;                          // 시즌오프(의류전용) 할인율(%), 기본 25 (master만 변경 가능)
  pricingMemo?: string;                             // 프라이싱 모달 B2C 시나리오 메모 (master/platform_md/brand_md만 변경 가능)
  channelOpenSchedule?: ChannelOpenScheduleEntry; // 채널별 오픈일정
  step2InitBaselineQty?: ChannelMonthQtyEntry[]; // 초기화 시 계산된 수량 (비교 기준값, 영구 보존)
  channelQtyDerivedFromCompareSkus?: string[]; // channelMonthQty를 마지막으로 자동세팅한 대응SKU 목록 (재선택 감지용)
  coupangEnabled?: boolean; // true면 이 SKU만 쿠팡 채널 활성화 (관리자 탭에서 설정, 기본 false)
  finalOrderQty?: Record<string, number>;
  finalOrderConfirmedAt?: string | null;
  step2PlatformConfirmed?: boolean;
  step2BrandConfirmed?: boolean;
  step2GlobalConfirmed?: boolean;
  scheduleConfirmed?: boolean;               // 채널 오픈일정 확정 여부 (master/PM 변경 가능)
  ownMallSetup?: boolean;                    // 자사몰 세팅 완료 여부 (master/PM만 변경)
  isExpanded: boolean;
  _initialSnapshot: Omit<SkuData, 'isExpanded' | '_initialSnapshot'>;
}

export interface ChannelOpenScheduleEntry {
  플랫폼?: string | null;   // YYYY-MM-DD | 'NONE' | null(=SKU 오픈일 기본값)
  스스?: string | null;
  위탁?: string | null;
  B2B?: string | null;
  글로벌?: string | null;
  기타Label?: string;       // 기타 채널명 (직접 입력)
  기타?: string | null;
  memo?: string;            // HTML (bold/italic 지원)
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

export interface TrashItem {
  trashId: string;   // Firestore 'trash' 컬렉션 doc ID
  skuId: string;
  skuName: string;
  category: Category;
  brand: string;
  deletedAt: string;  // ISO string
  deletedBy: string;  // role
  expiresAt: string;  // ISO string (deletedAt + 15일)
}

export interface LogChange {
  field: string;
  label: string;
  from: string;
  to: string;
}

export interface ActivityLog {
  id: string;
  skuId: string;
  skuName: string;
  role: string;
  changedAt: string; // ISO string
  changes: LogChange[];
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

/** 연도+월 쌍 (채널별 요약 탭 동적 월 범위용) */
export type YearMonth = { year: number; month: Month };

/** 포맷: "26.06" */
export function fmtYearMonth(ym: YearMonth): string {
  return `${String(ym.year).slice(2)}.${String(ym.month).padStart(2, '0')}`;
}

/**
 * 전달된 SKU 목록의 출시일 기준 8개월 윈도우를 union하여
 * 연도 포함 정렬된 YearMonth 배열로 반환
 */
export function getYearMonthRange(skus: SkuData[]): YearMonth[] {
  const seen = new Set<string>();
  const result: YearMonth[] = [];
  for (const sku of skus) {
    const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : 2026;
    const skuMonths = getSkuMonths(sku.releaseDate);
    for (const month of skuMonths) {
      const year = isNextYearMonth(month, sku.releaseDate) ? releaseYear + 1 : releaseYear;
      const key = `${year}-${month}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ year, month });
      }
    }
  }
  result.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  return result;
}

/**
 * 특정 YearMonth가 해당 SKU의 8개월 윈도우 안에 있는지 확인
 * (year까지 체크 — 같은 month 번호라도 연도가 다르면 false)
 */
export function isSkuActiveForYearMonth(sku: SkuData, ym: YearMonth): boolean {
  const releaseYear = sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : 2026;
  const skuMonths = getSkuMonths(sku.releaseDate);
  if (!skuMonths.includes(ym.month)) return false;
  const expectedYear = isNextYearMonth(ym.month, sku.releaseDate) ? releaseYear + 1 : releaseYear;
  return expectedYear === ym.year;
}
