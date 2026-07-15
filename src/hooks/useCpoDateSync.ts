import { useEffect } from 'react';
import { useStore } from '../store';
import { useCpoSync, isLocalDateEditPending, SYNCED_DATE_FIELDS } from '../store/cpoSync';

/**
 * 오픈일/입고예정일/촬영예정일 3개 필드는 CPO⇄Product 양방향 수정 대상이다.
 * Product→CPO 방향은 persistSku가 productSync 문서로 요청을 보내고, CPO 앱이 그걸
 * 실제 projects 문서에 병합해준다(cpo-dashboard 저장소 구현) — 그렇게 CPO의 값이
 * 바뀌면 이 훅이 그 값을 다시 Product의 sku 문서로 복사해서 최종 반영한다.
 *
 * ⚠️ 안전장치: 방금 Product에서 직접 고친 필드는 CPO가 productSync를 병합할 때까지
 * 잠깐(수 초) 시간차가 있는데, 그 사이 이 훅이 "아직 옛날 값인 CPO"를 보고 방금 수정한
 * 값을 도로 덮어써버리면 사용자 입장에선 "고쳤는데 순간적으로 원상복구됐다가 다시 바뀌는"
 * 깜빡임이 생긴다. isLocalDateEditPending으로 그 유예 시간 동안은 스킵한다.
 */
export function useCpoDateSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  useEffect(() => {
    skus.forEach((sku) => {
      const cpo = cpoProjects[sku.id];
      if (!cpo) return;

      const patch: Partial<typeof sku> = {};
      for (const field of SYNCED_DATE_FIELDS) {
        const cpoVal = cpo[field] ?? '';
        const localVal = sku[field] ?? '';
        if (!cpoVal || cpoVal === localVal) continue;
        if (isLocalDateEditPending(sku.id, field)) continue;
        patch[field] = cpoVal;
      }
      if (Object.keys(patch).length === 0) return;

      updateSku(sku.id, patch);
      persistSku(sku.id).catch((err) =>
        console.error('[useCpoDateSync] CPO 날짜 동기화 저장 실패', sku.id, err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, cpoProjects]);
}
