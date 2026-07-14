import { useEffect } from 'react';
import { useStore } from '../store';
import { useCpoSync } from '../store/cpoSync';
import { getConfirmedPricingScenario } from '../types/cpo';

/**
 * CPO에 확정된 판매가/정가/원가가 있는 SKU는 그 값을 Product의 skus 문서에도 그대로 복사해서
 * 저장(persist)해둔다 — SkuCard의 잠금 UI가 "보여주기만" 하고 실제 값은 안 바뀌면, 이 값을 쓰는
 * 다른 화면(매출 시뮬레이션, 리비뉴 차트 등)이 옛날 값을 계속 쓰게 되므로 반드시 필요.
 *
 * ⚠️ 안전장치: CPO에 아직 확정된 시나리오가 없거나(pricingScenarios 전부 confirmed:false)
 * 원가가 0원이면, Product의 기존 값을 0으로 덮어쓰지 않고 그대로 둔다 — CPO 마이그레이션이
 * 끝나지 않은 소수 프로젝트(2026-07-10 기준 가격 미확정 4건, 원가 미입력 7건)의 데이터를
 * 실수로 지우지 않기 위함. CPO에서 값이 채워지는 순간 자동으로 동기화된다.
 */
export function useCpoPriceSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  useEffect(() => {
    skus.forEach((sku) => {
      const cpo = cpoProjects[sku.id];
      if (!cpo) return;

      const scenario = getConfirmedPricingScenario(cpo.pricing);
      const patch: Partial<typeof sku> = {};
      if (scenario) {
        if (sku.price !== scenario.sellingPrice) patch.price = scenario.sellingPrice;
        if (sku.regularPrice !== scenario.regularPrice) patch.regularPrice = scenario.regularPrice;
      }
      if (cpo.pricing?.cost > 0 && sku.cost !== cpo.pricing.cost) {
        patch.cost = cpo.pricing.cost;
      }
      if (Object.keys(patch).length === 0) return;

      updateSku(sku.id, patch);
      persistSku(sku.id).catch((err) =>
        console.error('[useCpoPriceSync] CPO 가격 동기화 저장 실패', sku.id, err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, cpoProjects]);
}
