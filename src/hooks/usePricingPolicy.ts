import { useSyncExternalStore } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';
import { DEFAULT_PRICING_POLICY, type PricingPolicy } from '../utils/pricingV2';

/** 프라이싱 개편 정책 (관리 › SKU 관리 › 할인 정책) — config/pricingPolicy 한 문서 */
const POLICY_DOC = doc(fsdb, 'config', 'pricingPolicy');

/** 상세 프로모션(주력 SKU) 페이지 */
export const CORE_PROMO_URL = 'https://claude.ai/code/artifact/252c4289-79e9-41e6-a173-9191e833f20c';

function withDefaults(raw: Partial<PricingPolicy> | undefined): PricingPolicy {
  const d = DEFAULT_PRICING_POLICY;
  return {
    brands: {
      '바잇미': { ...d.brands['바잇미'], ...(raw?.brands?.['바잇미'] ?? {}) },
      'SSFW': { ...d.brands['SSFW'], ...(raw?.brands?.['SSFW'] ?? {}) },
      '그외': { ...d.brands['그외'], ...(raw?.brands?.['그외'] ?? {}) },
    },
    common: { ...d.common, ...(raw?.common ?? {}) },
    weeks: { ...d.weeks, ...(raw?.weeks ?? {}) },
  };
}

// ── 앱 전체가 정책 문서 하나를 같이 구독 (SKU 카드 수백 개가 각자 구독하지 않게) ──
// 계산 유틸(채널별 요약 · 엑셀 등)은 getPricingPolicy()로 현재값을 바로 읽음
let state: { policy: PricingPolicy; loaded: boolean } = { policy: DEFAULT_PRICING_POLICY, loaded: false };
const listeners = new Set<() => void>();
let unsub: (() => void) | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!unsub) {
    unsub = onSnapshot(
      POLICY_DOC,
      (snap) => { state = { policy: withDefaults(snap.exists() ? (snap.data() as Partial<PricingPolicy>) : undefined), loaded: true }; listeners.forEach((l) => l()); },
      (err) => { console.error('[pricingPolicy] 구독 실패', err); state = { ...state, loaded: true }; listeners.forEach((l) => l()); },
    );
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && unsub) { unsub(); unsub = null; }
  };
}

export function getPricingPolicy(): PricingPolicy {
  return state.policy;
}

export function usePricingPolicy(): { policy: PricingPolicy; loaded: boolean } {
  return useSyncExternalStore(subscribe, () => state);
}

/** 바뀐 항목만 merge 저장 (예: { brands: { SSFW: { openRate: 10 } } }) */
export function savePricingPolicy(patch: Partial<{ brands: Partial<Record<string, Partial<PricingPolicy['brands']['바잇미']>>>; common: Partial<PricingPolicy['common']>; weeks: Partial<PricingPolicy['weeks']> }>): Promise<void> {
  return setDoc(POLICY_DOC, patch, { merge: true });
}
