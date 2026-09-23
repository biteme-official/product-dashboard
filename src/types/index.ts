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
/** 기본 활성이지만 관리 탭에서 SKU별로 끌 수 있는 채널 (쿠팡과 반대 방향) */
export const OPTOUT_CHANNELS = ['글로벌', '일본'] as const;
export type OptOutChannel = typeof OPTOUT_CHANNELS[number];

/**
 * SKU별 비활성 채널 목록 (채널 구조는 유지하되 수량 0 고정).
 * 쿠팡은 기본 비활성 — SkuData.coupangEnabled가 true인 SKU만 예외적으로 활성화됨.
 * 글로벌/일본은 기본 활성 — SkuData.disabledChannels에 들어있는 SKU만 비활성.
 */
export function getDisabledChannels(sku: { coupangEnabled?: boolean; disabledChannels?: OptOutChannel[] }): readonly Channel[] {
  const optOut = (sku.disabledChannels ?? []).filter((ch) => (OPTOUT_CHANNELS as readonly string[]).includes(ch));
  return sku.coupangEnabled ? optOut : ['쿠팡', ...optOut];
}

/**
 * 글로벌/일본 채널 on/off를 잠글지 — 발주량 확정 또는 글로벌 확정 상태면 목표량이 확정된 것으로 보고
 * 관리 탭에서 채널 설정을 바꾸지 못하게 한다 (확정값이 조용히 0/재분배되는 것 방지).
 */
export function isChannelToggleLocked(sku: { finalOrderConfirmedAt?: string | null; step2GlobalConfirmed?: boolean }): boolean {
  return !!sku.finalOrderConfirmedAt || !!sku.step2GlobalConfirmed;
}

/** channelQtyDerivedFromCompareSkus에 넣으면 다음 STEP2 진입 때 무조건 재계산되게 하는 표식 (대응SKU 이름과 겹치지 않음) */
export const STEP2_FORCE_RECALC_MARK = '__recalc__';

/**
 * 대응SKU 채널 실적 분포를 SKU의 비활성 채널 기준으로 보정.
 * 태블로 "해외" 출고는 글로벌 40% / 일본 60%로 임의 분할돼 들어오므로, 둘 중 한쪽만 꺼진 SKU는
 * 꺼진 쪽 몫을 남은 해외 채널로 전부 옮긴다 (국내 채널로 퍼지지 않게).
 */
export function adjustDistForDisabled(
  dist: Record<string, number>,
  disabled: readonly string[],
): Record<string, number> {
  const gOff = disabled.includes('글로벌');
  const jOff = disabled.includes('일본');
  if (gOff === jOff) return dist;
  const [from, to] = gOff ? ['글로벌', '일본'] : ['일본', '글로벌'];
  return { ...dist, [to]: (dist[to] ?? 0) + (dist[from] ?? 0), [from]: 0 };
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
  archived?: boolean;    // CPO에서 삭제된 컬러 — 목록엔 남기되(수량 데이터 보존) 계산에서는 제외
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

/** 프라이싱 모달 수동 모드에서 시나리오명·실제가격을 직접 입력하는 행 (할인율/원가율은 계속 자동 계산) */
export interface ManualScenarioEntry {
  id: string;             // 자동모드 시나리오 id 그대로 유지(프로모션 버튼 연동용) 또는 신규 추가 시 crypto.randomUUID()
  section: 'B2C' | 'B2B';
  label: string;
  price: number;
  isCustom?: boolean;     // "+ 시나리오 항목 추가"로 만든 행인지 (true면 삭제 가능)
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
  hiddenPricingScenarios?: string[]; // 프라이싱 모달에서 숨긴 시나리오 행 id 목록 (참고용 표시 숨김 — 계산·STEP2 옵션에는 영향 없음, master/PM/플랫폼MD/브랜드MD만 변경 가능)
  pricingMemo?: string;                             // 프라이싱 모달 B2C 시나리오 메모 (master/platform_md/brand_md만 변경 가능)
  pricingPromoOpenSpecial?: boolean;                // 프라이싱 모달 B2C 오픈특가 프로모션 on/off, 기본 true
  pricingPromoNewWeek?: boolean;                    // 프라이싱 모달 B2C 신상위크 프로모션 on/off, 기본 false
  pricingPromoLive?: boolean;                       // 프라이싱 모달 B2C 라이브 프로모션 on/off, 기본 false
  pricingPromoExclusive?: boolean;                  // 프라이싱 모달 B2C 선단독 프로모션 on/off, 기본 false
  pricingMode?: 'auto' | 'manual';                  // 프라이싱 모달 자동/수동 모드, 기본 auto
  manualScenarios?: ManualScenarioEntry[];          // 수동 모드 시나리오명·실제가격 (최초 전환 시 자동계산값 스냅샷, 이후 독립)
  channelOpenSchedule?: ChannelOpenScheduleEntry; // 채널별 오픈일정
  step2InitBaselineQty?: ChannelMonthQtyEntry[]; // 초기화 시 계산된 수량 (비교 기준값, 영구 보존)
  channelQtyDerivedFromCompareSkus?: string[]; // channelMonthQty를 마지막으로 자동세팅한 대응SKU 목록 (재선택 감지용)
  coupangEnabled?: boolean; // true면 이 SKU만 쿠팡 채널 활성화 (관리자 탭에서 설정, 기본 false)
  disabledChannels?: OptOutChannel[]; // 이 SKU에서 운영하지 않는 채널 (관리자 탭에서 설정, 기본 빈 배열 = 전부 활성)
  /** 채널을 끌 때 백업해둔 채널×월 목표량 — 다시 켤 때 복원용. 복원/소진 후엔 빈 배열(merge 저장이라 키 삭제 대신 비움) */
  disabledChannelBackup?: Partial<Record<OptOutChannel, ChannelMonthQtyEntry[]>>;
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
  excludeOpenCompletePm: boolean;
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
