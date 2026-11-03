import { useMemo } from 'react';
import { usePricingPolicy } from './usePricingPolicy';
import { useTableauBase } from './useTableauBase';
import { useExchangeRates } from '../utils/useExchangeRates';
import type { ReviewCtx } from '../utils/skuReview';

/** 발주량 검토 계산에 필요한 정책 · 환율 · 태블로 — 탭과 SKU 카드가 같은 값을 본다 */
export function useReviewCtx() {
  const tableau = useTableauBase();
  const { policy, isDefault: policyIsDefault } = usePricingPolicy();
  const { usdKrw, jpyKrw, isLive } = useExchangeRates();
  const ctx = useMemo<ReviewCtx>(() => ({
    policy, policyIsDefault, fx: { usd: usdKrw, jpy: jpyKrw, live: isLive },
    shipments: tableau.shipments, channelMap: tableau.channelMap, teamCate: tableau.teamCate, loading: tableau.loading, errors: tableau.errors,
  }), [policy, policyIsDefault, usdKrw, jpyKrw, isLive, tableau.shipments, tableau.channelMap, tableau.teamCate, tableau.loading, tableau.errors]);
  return { ctx, tableau };
}
