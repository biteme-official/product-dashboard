import { useEffect } from 'react';
import { useStore } from '../store';
import { useCpoSync, isLocalFieldEditPending, SYNCED_FIELDS } from '../store/cpoSync';

/**
 * 오픈일/입고예정일/촬영예정일/SKU명 4개 필드는 CPO⇄Product 양방향 수정 대상이다.
 * Product→CPO 방향은 persistSku가 productSync 문서로 요청을 보내고, CPO 앱이 그걸
 * 실제 projects 문서에 병합해준다(cpo-dashboard 저장소 구현) — 그렇게 CPO의 값이
 * 바뀌면 이 훅이 그 값을 다시 Product의 sku 문서로 복사해서 최종 반영한다.
 *
 * ⚠️ 안전장치: 방금 Product에서 직접 고친 필드는 CPO가 productSync를 병합할 때까지
 * 시간차가 있는데(CPO 대시보드 탭이 열려있어야 병합 리스너가 도는 구조라 수 초~수 시간까지
 * 걸릴 수 있음), 그 사이 이 훅이 "아직 옛날 값인 CPO"를 보고 방금 수정한 값을 도로
 * 덮어써버리면 사용자 입장에선 "고쳤는데 원상복구됐다"는 증상이 된다.
 * isLocalFieldEditPending이 "CPO 값이 우리가 보낸 값과 실제로 같아질 때까지" 스킵해준다
 * (고정된 유예 시간이 아니라 값 기준 — 자세한 이유는 store/cpoSync.ts 참고).
 */
export function useCpoFieldSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  useEffect(() => {
    skus.forEach((sku) => {
      const cpo = cpoProjects[sku.id];
      if (!cpo) return;

      const patch: Partial<typeof sku> = {};
      for (const field of SYNCED_FIELDS) {
        const cpoVal = cpo[field] ?? '';
        const localVal = sku[field] ?? '';
        // cpoVal이 빈 문자열(CPO에서 날짜를 지운 경우)도 유효한 값이라 반영해야 함
        // — truthy 체크를 넣으면 CPO 쪽 삭제가 Product에 영영 반영되지 않는다.
        // 단 skuName은 빈 값이 유효한 편집이 아니므로(정상적으로 이름을 지우는 케이스가
        // 없음) 빈 문자열로는 반영하지 않는다.
        if (field === 'skuName' && cpoVal.trim() === '') continue;
        if (cpoVal === localVal) continue;
        if (isLocalFieldEditPending(sku.id, field, cpoVal)) continue;
        patch[field] = cpoVal;
      }
      if (Object.keys(patch).length === 0) return;

      updateSku(sku.id, patch);
      persistSku(sku.id).catch((err) =>
        console.error('[useCpoFieldSync] CPO 필드 동기화 저장 실패', sku.id, err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, cpoProjects]);
}
