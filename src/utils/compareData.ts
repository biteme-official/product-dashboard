/**
 * 대응SKU 실적 → STEP 1 표(월 계획 · 채널별 목표량)에 쓰는 비교 데이터 계산.
 * SKU 카드(ComparisonColumn · MonthlyTable)와 채널 목표량 페이지가 같은 함수를 써서 결과가 항상 같게 한다.
 */
import {
  adjustDistForDisabled, getDisabledChannels, getReleaseMonth, getSkuMonths, isNextYearMonth,
  B2C_CHANNELS, B2B_CHANNELS, CHANNELS,
  type Channel, type Month, type SkuData,
} from '../types';
import {
  aggregateByYearMonth, aggregateChannelByYearMonth, calcChannelPeriodQty, calcRolling12,
  calcVariableCostRatio,
  type ChannelByYearMonth, type ChannelDataMap, type SkuShipmentInfo, type TeamCateMap,
} from '../services/tableau';

export type CompareMode = 'rolling12' | 'samePeriod';

/** 대응SKU 채널 비중이 없을 때 쓰는 기본 채널 비중(%) */
export const DEFAULT_CHANNEL_RATIO_PCT: Record<Channel, number> = {
  '자사몰': 20, '스스': 30, '위탁': 5, '팝업/페어': 5,
  '쿠팡': 10, 'B2B': 15, '사입': 0, '글로벌': 5, '일본': 10,
};

/** 의류·잡화는 동기간, 나머지는 직전 12개월 (카드 기본값과 같음) */
export function defaultCompareMode(sku: Pick<SkuData, 'category'>): CompareMode {
  return sku.category === '의류' || sku.category === '잡화' ? 'samePeriod' : 'rolling12';
}

const releaseYearOf = (sku: Pick<SkuData, 'releaseDate'>): number | null =>
  sku.releaseDate ? parseInt(sku.releaseDate.split('-')[0], 10) : null;

/**
 * 월별 표에 표시할 비교 데이터를 mode에 따라 계산 (출시일 기준 8개월 동적 윈도우)
 * - 동기간: 출시월 기준 정확한 연도 매핑으로 해당 월 실적을 그대로 표시 (시즈널 비교용)
 * - 직전 12개월: 대응SKU의 출시월이 제각각이라 컬럼별 연도가 뒤섞이므로, 대응SKU 직전
 *   실적 개월수만큼의 월평균을 윈도우 전체 월에 균등 배분해서 표시
 */
export function calcMonthlyDisplayData(
  byYearMonth: Record<number, Record<number, number>>,
  compareMode: CompareMode,
  releaseDate: string | null | undefined,
  releaseYear: number | null,
): Partial<Record<number, number>> {
  const result: Partial<Record<number, number>> = {};
  const months = getSkuMonths(releaseDate);
  if (compareMode === 'rolling12') {
    const { monthly } = calcRolling12(byYearMonth);
    if (monthly > 0) {
      for (const m of months) result[m] = monthly;
    }
    return result;
  }
  for (const m of months) {
    if (!releaseYear) continue;
    const lookupYear = isNextYearMonth(m, releaseDate) ? releaseYear : releaseYear - 1;
    const qty = byYearMonth[lookupYear]?.[m];
    if (qty !== undefined) result[m] = qty;
  }
  return result;
}

export interface CompareData {
  names: string[];
  mode: CompareMode;
  modeLabel: string;
  /** 월 계획 표 "대응SKU 실적" 행 (월 → 수량) — 채널 데이터 있으면 비운영 채널 제외, 없으면 SKU 토탈 */
  monthly: Partial<Record<number, number>>;
  /** monthly가 비운영 채널 제외 값인지 (false = SKU 토탈 · 비운영 채널 포함) */
  monthlyActiveOnly: boolean;
  /** 채널×연월 원시 실적 (채널 펼침 상세 "대응SKU" 행) */
  channelYM: ChannelByYearMonth | null;
  /** 기간 내 채널별 실적 (채널 비중 기준) */
  channelDist: Record<string, number> | null;
  /** 동기간일 때 대응SKU별 기준연도 (직전 12개월이면 빈 배열) */
  bases: CompareBase[];
}

// ── 동기간 기준연도 (대응SKU별) ──────────────────────────────────────────
// 기존 계산은 모두 "출시연도−1 시즌"을 조회하므로, 대응SKU마다 정한 기준연도 시즌 실적을
// 출시연도−1 위치로 옮겨(연도 shift) 넘긴다. 그래서 하위 계산 함수는 그대로 둔다.

/** SKU명 속 출시연도 표기 → 연도 (끝 `_25`, 중간 `_25_블랙` 모두). 없으면 null */
export function suffixYearOf(name: string): number | null {
  const m = name.match(/_(\d{2})(?=_|$)/);
  return m ? 2000 + Number(m[1]) : null;
}

/** manual = 직접 지정 · suffix = SKU명 _YY · auto = 출시연도−1 실적 없어 자동 보정 · default = 출시연도−1 */
export type BaseYearSource = 'manual' | 'suffix' | 'auto' | 'default';
export interface CompareBase { name: string; year: number; source: BaseYearSource; defaultYear: number }

/** base 연도 시즌(출시월부터 8개월, 해 넘긴 달은 base+1)의 연·월 목록 */
function seasonPairs(rm: number, base: number): { year: number; month: number }[] {
  return Array.from({ length: 8 }, (_, i) => {
    const month = ((rm - 1 + i) % 12) + 1;
    return { year: month >= rm ? base : base + 1, month };
  });
}

/** 대응SKU 실적이 있는 시즌 시작 연도 목록 (최신순) — 기준연도 선택지 */
export function seasonYearsWithData(byYM: Record<number, Record<number, number>>, rm: number): number[] {
  const years = Object.keys(byYM).map(Number);
  const cands = new Set<number>();
  for (const y of years) { cands.add(y); cands.add(y - 1); }
  return [...cands]
    .filter((b) => seasonPairs(rm, b).some(({ year, month }) => (byYM[year]?.[month] ?? 0) > 0))
    .sort((a, b) => b - a);
}

/** 대응SKU 하나의 동기간 기준연도: 직접 지정 > SKU명 _YY > 출시연도−1 (비어 있으면 실적 있는 최근 시즌) */
export function resolveBaseYear(
  s: SkuShipmentInfo, rm: number, ry: number, baseYears: Record<string, number> | undefined,
): CompareBase {
  const defaultYear = ry - 1;
  const manual = baseYears?.[s.name];
  if (manual) return { name: s.name, year: manual, source: 'manual', defaultYear };
  const suffix = suffixYearOf(s.name);
  if (suffix && suffix <= defaultYear) return { name: s.name, year: suffix, source: 'suffix', defaultYear };
  const withData = seasonYearsWithData(s.byYearMonth, rm);
  if (withData.length === 0 || withData.includes(defaultYear)) return { name: s.name, year: defaultYear, source: 'default', defaultYear };
  const prev = withData.find((y) => y < defaultYear);
  return prev ? { name: s.name, year: prev, source: 'auto', defaultYear } : { name: s.name, year: defaultYear, source: 'default', defaultYear };
}

function shiftYears<T>(byYM: Record<number, T>, offset: number): Record<number, T> {
  if (offset === 0) return byYM;
  return Object.fromEntries(Object.entries(byYM).map(([y, v]) => [Number(y) + offset, v]));
}

/**
 * 동기간 비교용으로 대응SKU 실적 정렬 — 각 SKU 기준연도 시즌을 출시연도−1 시즌 자리로 옮긴다.
 * 직전 12개월이거나 출시일이 없으면 원본 그대로 (bases 빈 배열).
 */
export function alignCompareSkus(
  releaseDate: string | null | undefined,
  baseYears: Record<string, number> | undefined,
  found: SkuShipmentInfo[],
  channelMap: ChannelDataMap | null,
  mode: CompareMode,
): { shipments: SkuShipmentInfo[]; channelMap: ChannelDataMap | null; bases: CompareBase[] } {
  const rm = getReleaseMonth(releaseDate ?? '');
  const ry = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : NaN;
  if (mode !== 'samePeriod' || !rm || !ry) return { shipments: found, channelMap, bases: [] };
  const bases = found.map((s) => resolveBaseYear(s, rm, ry, baseYears));
  const shipments = found.map((s, i) => ({ ...s, byYearMonth: shiftYears(s.byYearMonth, ry - 1 - bases[i].year) }));
  let cm: ChannelDataMap | null = null;
  if (channelMap) {
    cm = new Map();
    found.forEach((s, i) => {
      const byCh = channelMap.get(s.name);
      if (!byCh) return;
      const off = ry - 1 - bases[i].year;
      cm!.set(s.name, Object.fromEntries(Object.entries(byCh).map(([ch, byYM]) => [ch, shiftYears(byYM, off)])));
    });
  }
  return { shipments, channelMap: cm, bases };
}

/** 동기간 기간 표시 — 기준연도가 하나면 "2025년 5~12월", 여러 개면 연도별로 이어 붙임 */
export function samePeriodLabelOf(rm: number, bases: CompareBase[], short = false): string {
  const years = [...new Set(bases.map((b) => b.year))].sort((a, b) => b - a);
  const yy = (y: number) => (short ? `${String(y % 100).padStart(2, '0')}년` : `${y}년`);
  const one = (y: number) => {
    const end = ((rm + 6) % 12) + 1;
    return end >= rm ? `${yy(y)} ${rm}~${end}월` : `${yy(y)} ${rm}월~${yy(y + 1)} ${end}월`;
  };
  return years.map(one).join(' · ');
}

/** 저장된 대응SKU 이름 목록 (예전 단일 name 필드 호환) */
export function compareNamesOf(sku: SkuData): string[] {
  return sku.comparisonSku.compareSkuNames ?? (sku.comparisonSku.name ? [sku.comparisonSku.name] : []);
}

/** 카드의 ComparisonColumn이 하는 계산을 저장 없이 그대로 수행 */
export function buildCompareData(
  sku: SkuData,
  shipments: SkuShipmentInfo[],
  channelMap: ChannelDataMap | null,
  mode: CompareMode = defaultCompareMode(sku),
): CompareData {
  const names = compareNamesOf(sku);
  const raw = names.map((n) => shipments.find((s) => s.name === n)).filter(Boolean) as SkuShipmentInfo[];
  const rm = getReleaseMonth(sku.releaseDate);
  const ry = releaseYearOf(sku);
  const effMode: CompareMode = mode === 'samePeriod' && rm && ry ? 'samePeriod' : 'rolling12';
  if (raw.length === 0) {
    return { names, mode: effMode, modeLabel: effMode === 'samePeriod' ? '동기간' : '직전 12개월/월평균', monthly: {}, monthlyActiveOnly: false, channelYM: null, channelDist: null, bases: [] };
  }
  // 동기간이면 대응SKU별 기준연도 시즌을 출시연도−1 자리로 옮긴 실적으로 계산
  const aligned = alignCompareSkus(sku.releaseDate, sku.comparisonSku.baseYears, raw, channelMap, effMode);
  const found = aligned.shipments;
  const aggregated = aggregateByYearMonth(found);
  const modeLabel = effMode === 'samePeriod' && rm && ry ? samePeriodLabelOf(rm, aligned.bases) : '직전 12개월/월평균';
  const monthly = calcMonthlyDisplayData(aggregated, effMode, sku.releaseDate, ry);
  let channelYM: ChannelByYearMonth | null = null;
  let channelDist: Record<string, number> | null = null;
  if (aligned.channelMap) {
    const agg = aggregateChannelByYearMonth(found.map((s) => s.name), aligned.channelMap);
    const qty = calcChannelPeriodQty(agg, effMode, rm, ry);
    channelYM = Object.keys(agg).length > 0 ? agg : null;
    channelDist = Object.keys(qty).length > 0 ? qty : null;
  }
  const active = compMonthlyActive(sku, channelYM, effMode, getSkuMonths(sku.releaseDate), ry ?? 2026);
  return { names, mode: effMode, modeLabel, monthly: active ?? monthly, monthlyActiveOnly: !!active, channelYM, channelDist, bases: aligned.bases };
}

/**
 * 채널 펼침 상세 "대응SKU" 행 값 (카드 PricingChannelTable과 같은 규칙)
 * - 동기간: 출시월 기준 연도 매핑으로 해당 월 실적
 * - 직전 12개월: 채널별 직전 실적 월평균을 윈도우 전체 월에 균등
 */
export function getCompQty(
  channelYM: ChannelByYearMonth | null | undefined,
  mode: CompareMode | undefined,
  channel: Channel,
  month: Month,
  skuMonths: Month[],
  releaseYear: number,
): number | null {
  if (!channelYM) return null;
  const byYM = channelYM[channel];
  if (!byYM) return null;
  if (mode === 'samePeriod') {
    const isNextYrM = month < skuMonths[0];
    const lookupYear = isNextYrM ? releaseYear : releaseYear - 1;
    return byYM[lookupYear]?.[month] ?? null;
  }
  const { monthly } = calcRolling12(byYM);
  return monthly > 0 ? monthly : null;
}

/**
 * 비운영 반영 대응SKU 채널×월 수량 — 대응SKU 비중 · 증감 · 대응 대비 계산용 ([대응SKU 기준 채우기]와 같은 규칙).
 * - 비운영 채널(쿠팡 미활성 · 글로벌/일본 OFF)은 null → 비중 분모에서도 빠짐
 * - 해외 한쪽만 OFF면 꺼진 쪽 실적을 남은 해외 채널로 합산 (태블로 "해외" 출고를 40/60 임의 분할한 값이라)
 * SKU카드 대응SKU 채널별 실적 차트는 참고용이라 원본 그대로 둔다.
 */
export function getCompQtyAdj(
  sku: SkuData,
  channelYM: ChannelByYearMonth | null | undefined,
  mode: CompareMode | undefined,
  channel: Channel,
  month: Month,
  skuMonths: Month[],
  releaseYear: number,
): number | null {
  const disabled = getDisabledChannels(sku);
  if (disabled.includes(channel)) return null;
  const own = getCompQty(channelYM, mode, channel, month, skuMonths, releaseYear);
  const partner: Channel | null = channel === '글로벌' ? '일본' : channel === '일본' ? '글로벌' : null;
  if (!partner || !disabled.includes(partner)) return own;
  const moved = getCompQty(channelYM, mode, partner, month, skuMonths, releaseYear);
  return own == null && moved == null ? null : (own ?? 0) + (moved ?? 0);
}

/**
 * 대응SKU 월별 실적 — 운영 채널 실적 합 (비운영 채널 제외 · 해외 한쪽 OFF면 남은 쪽 합산).
 * 운영 채널 출고를 연·월별로 먼저 합친 뒤 SKU 토탈과 같은 방식으로 계산한다
 * (직전 12개월 = 출고 있던 최근 12개월 평균 · 동기간 = 그 달 실적). 채널별 월평균을 더하면
 * 채널마다 평균 낸 달이 달라 부풀기 때문.
 * 채널 데이터가 없으면 null → 호출부에서 SKU 토탈(비운영 채널 포함)로 대체.
 */
export function compMonthlyActive(
  sku: SkuData,
  channelYM: ChannelByYearMonth | null | undefined,
  mode: CompareMode | undefined,
  skuMonths: Month[],
  releaseYear: number,
): Partial<Record<number, number>> | null {
  if (!channelYM) return null;
  const disabled = getDisabledChannels(sku);
  const partnerOf = (c: Channel): Channel | null => (c === '글로벌' ? '일본' : c === '일본' ? '글로벌' : null);
  // 해외 한쪽만 OFF면 꺼진 쪽 실적도 남은 쪽으로 합산되므로 포함
  const included = CHANNELS.filter((c) => !disabled.includes(c) || (partnerOf(c) != null && !disabled.includes(partnerOf(c)!)));
  const combined: Record<number, Record<number, number>> = {};
  for (const c of included) {
    for (const [ys, byM] of Object.entries(channelYM[c] ?? {})) {
      const y = Number(ys);
      combined[y] ??= {};
      for (const [ms, q] of Object.entries(byM)) combined[y][Number(ms)] = (combined[y][Number(ms)] ?? 0) + (q as number);
    }
  }
  const out: Partial<Record<number, number>> = {};
  if (mode === 'samePeriod') {
    for (const m of skuMonths) {
      const q = combined[m < skuMonths[0] ? releaseYear : releaseYear - 1]?.[m];
      if (q !== undefined) out[m] = q;
    }
    return out;
  }
  const { monthly } = calcRolling12(combined);
  if (monthly > 0) for (const m of skuMonths) out[m] = monthly;
  return out;
}

/** 비운영 반영 대응SKU 채널 분포 (기간 합) — 비운영 채널 0, 해외 한쪽 OFF면 남은 쪽으로 합산 */
export function compDistForShare(sku: SkuData, dist: Record<string, number>): Record<string, number> {
  const disabled = getDisabledChannels(sku);
  const adj = adjustDistForDisabled(dist, disabled);
  return Object.fromEntries(Object.entries(adj).map(([ch, q]) => [ch, (disabled as readonly string[]).includes(ch) ? 0 : q]));
}

/** 수량이 없던 칸을 채우거나 다시 나눌 때 쓰는 채널 비중 — 대응SKU 비중(비운영 반영), 없으면 기본 비중 */
export function fallbackWeightsOf(sku: SkuData, channelDist: Record<string, number> | null): Partial<Record<Channel, number>> {
  return channelDist
    ? adjustDistForDisabled(channelDist, getDisabledChannels(sku)) as Partial<Record<Channel, number>>
    : DEFAULT_CHANNEL_RATIO_PCT;
}

/** 대응SKU 출고 데이터에서 직전 12개월 기간 추출 (변동비 비중 기간 동기화용) */
export function rolling12PeriodsOf(channelYM: ChannelByYearMonth | null, mode: CompareMode): { year: number; month: number }[] {
  if (!channelYM || mode !== 'rolling12') return [];
  const ymSet = new Set<string>();
  for (const byYM of Object.values(channelYM)) {
    for (const [yearNum, months] of Object.entries(byYM)) {
      for (const [monthNum, qty] of Object.entries(months as Record<string, number>)) {
        if (qty > 0) ymSet.add(`${yearNum}|${monthNum}`);
      }
    }
  }
  return [...ymSet]
    .map((s) => { const [y, m] = s.split('|').map(Number); return { year: y, month: m }; })
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.month - a.month))
    .slice(0, 12);
}

/** 채널별 변동비율 (Tableau 팀카테 역산, 없으면 null → 화면에서 25% fallback) */
export function calcVarCostResults(
  teamCateMap: TeamCateMap | null,
  sku: SkuData,
  mode: CompareMode,
  channelYM: ChannelByYearMonth | null,
): Record<string, { ratio: number; isFallback: boolean }> {
  if (!teamCateMap) return {};
  const ry = releaseYearOf(sku) ?? 2026;
  const periods = rolling12PeriodsOf(channelYM, mode);
  const result: Record<string, { ratio: number; isFallback: boolean }> = {};
  for (const ch of [...B2C_CHANNELS, ...B2B_CHANNELS]) {
    const r = calcVariableCostRatio(teamCateMap, sku.category, ch, mode, getReleaseMonth(sku.releaseDate), ry, periods.length > 0 ? periods : undefined);
    if (r !== null) result[ch] = r;
  }
  return result;
}
