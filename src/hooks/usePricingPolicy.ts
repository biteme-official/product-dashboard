import { useEffect, useState } from 'react';
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

export function usePricingPolicy(): { policy: PricingPolicy; loaded: boolean } {
  const [state, setState] = useState<{ policy: PricingPolicy; loaded: boolean }>({ policy: DEFAULT_PRICING_POLICY, loaded: false });
  useEffect(() => onSnapshot(
    POLICY_DOC,
    (snap) => setState({ policy: withDefaults(snap.exists() ? (snap.data() as Partial<PricingPolicy>) : undefined), loaded: true }),
    (err) => { console.error('[pricingPolicy] 구독 실패', err); setState((s) => ({ ...s, loaded: true })); },
  ), []);
  return state;
}

/** 바뀐 항목만 merge 저장 (예: { brands: { SSFW: { openRate: 10 } } }) */
export function savePricingPolicy(patch: Partial<{ brands: Partial<Record<string, Partial<PricingPolicy['brands']['바잇미']>>>; common: Partial<PricingPolicy['common']>; weeks: Partial<PricingPolicy['weeks']> }>): Promise<void> {
  return setDoc(POLICY_DOC, patch, { merge: true });
}
