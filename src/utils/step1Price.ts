/**
 * STEP 1 채널×월 판매가 선택지 → 실제 가격.
 * 프라이싱 탭과 같은 가격을 씀 (미확정 = 할인 정책 · 확정 = 확정 가격). SKU별 할인율은 더 이상 쓰지 않음.
 * 예전 선택지 신상위크 · 선단독 → 주력 SKU는 선오픈 최저가, 일반 SKU는 라이브 가격.
 */
import type { SkuData } from '../types';
import { floor10, liveFrom, preFrom, calcPricesV2, shownPricesV2, type PriceKey, type PriceSet, type PricingPolicy } from './pricingV2';

export interface Step1Option { id: string; label: string; key: PriceKey | 'season'; coreOnly?: boolean }

/** 선택지 id는 예전 값을 그대로 유지(저장 데이터 호환) · 선오픈 최저가 · 팝업/페어는 새로 추가 */
export const STEP1_OPTIONS: Step1Option[] = [
  { id: '선오픈 최저가', label: '선오픈 최저가', key: 'pre', coreOnly: true },
  { id: '라이브 할인', label: '라이브', key: 'live' },
  { id: '오픈특가', label: '오픈특가', key: 'open' },
  { id: '상시 최대할인율', label: '상시 최대', key: 'reg' },
  { id: '특가 최대할인율', label: '특가 최대', key: 'spec' },
  { id: '시즌오프(의류전용)', label: '시즌오프(의류)', key: 'season' },
  { id: 'B2B 오픈 할인', label: 'B2B 오픈', key: 'b2bOpen' },
  { id: 'B2B 상시 운영', label: 'B2B 상시', key: 'b2b' },
  { id: '사입 공급가', label: '사입 공급가', key: 'buy' },
  { id: '팝업/페어', label: '팝업/페어', key: 'popup' },
  { id: '글로벌 공급가', label: '글로벌 공급가', key: 'glob' },
  { id: '일본 공급가', label: '일본 공급가', key: 'jp' },
];
const BY_ID = new Map(STEP1_OPTIONS.map((o) => [o.id, o]));
const LEGACY_IDS = new Set(['신상위크', '선단독']);

/** 예전 선택지(신상위크 · 선단독)를 새 선택지로 — 주력 SKU = 선오픈 최저가, 일반 = 라이브 */
export function normalizeStep1Opt(optId: string, core: boolean): string {
  if (LEGACY_IDS.has(optId)) return core ? '선오픈 최저가' : '라이브 할인';
  if (optId === '선오픈 최저가' && !core) return '라이브 할인';
  return optId;
}

/** SKU의 선택지 가격 계산기 — 같은 SKU의 여러 칸을 계산할 때 가격표를 한 번만 만듦 */
export function step1Pricer(sku: SkuData, policy: PricingPolicy, fx: { usd: number; jpy: number }) {
  const core = !!sku.coreSku;
  const sets = new Map<number, PriceSet>();
  // 채널 전용 판매가가 있으면 그 금액 기준으로 정책 계산 (확정 · 수동값은 SKU 판매가 기준이라 적용 안 함)
  const setFor = (base: number): PriceSet => {
    let v = sets.get(base);
    if (!v) {
      v = base === sku.price
        ? shownPricesV2(sku, policy, fx)
        : calcPricesV2({ price: base, brand: sku.brand, core, live: true }, policy, fx);
      sets.set(base, v);
    }
    return v;
  };
  return (rawOptId: string, base: number): number => {
    if (!rawOptId) return base;
    const opt = BY_ID.get(normalizeStep1Opt(rawOptId, core));
    if (!opt) return base;
    const brand = policy.brands[sku.brand] ?? policy.brands['바잇미'];
    if (opt.key === 'season') return floor10(base * (1 - brand.seasonOff / 100));
    const set = setFor(base);
    const open = set.open ?? base;
    if (opt.key === 'pre') return set.pre ?? preFrom(open, policy.common);
    if (opt.key === 'live') return set.live ?? liveFrom(set.pre ?? open, policy.common);
    return set[opt.key] ?? base;
  };
}
