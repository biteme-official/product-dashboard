import { useMemo } from 'react';
import { useStore } from '../store';
import { useCpoSync } from '../store/cpoSync';
import { CPO_VISIBLE_STATUSES } from '../types/cpo';
import type { SkuData } from '../types';

/**
 * CPO 기획이 Cancel/Holding 상태인 SKU를 걸러낸 목록.
 * CPO에 대응 프로젝트가 없는 SKU(레거시 수동 추가분)는 그대로 노출.
 * 데이터는 지우지 않고 화면 노출만 걸러내는 것 — CPO 상태가 복귀하면 자동으로 다시 보임.
 *
 * 관리자 탭(AdminSection)은 이 훅 대신 useStore((s) => s.skus)를 그대로 써서
 * 숨김 여부와 무관하게 전체 데이터를 관리할 수 있게 함 — 의도적 예외.
 */
export function useVisibleSkus(): SkuData[] {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  return useMemo(() => {
    return skus.filter((sku) => {
      const cpo = cpoProjects[sku.id];
      if (!cpo) return true;
      return (CPO_VISIBLE_STATUSES as string[]).includes(cpo.status);
    });
  }, [skus, cpoProjects]);
}
