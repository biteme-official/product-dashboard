import { useEffect } from 'react';
import { useStore } from '../store';
import { useCpoSync } from '../store/cpoSync';
import { buildSizesFromCount } from '../utils/calc';
import { MAX_SIZES } from '../types';
import type { ColorEntry } from '../types';

/**
 * CPO의 컬러 목록(이름)과 사이즈 개수를 Product SKU에 단방향으로 반영한다.
 * 컬러명·사이즈 개수는 CPO가 정본 — Product 쪽에서는 더 이상 직접 편집하지 않고
 * (SizeDistColumn UI에서 읽기전용 처리) 컬러별/사이즈별 수량·비율만 로컬에서 편집한다.
 *
 * 이 방향은 productSync 병합 경로(useCpoFieldSync)를 타지 않는 순수 읽기 동기화라
 * CPO 쪽 코드/Firestore 규칙 변경이 필요 없고, isLocalFieldEditPending류의 "로컬 편집
 * 보호"도 필요 없다 — 애초에 로컬에서 편집할 수 없는 값이라 되돌려쓰기(원상복구) 버그가
 * 생길 여지가 없다.
 *
 * 컬러는 id 기준으로 CPO와 병합한다: CPO에 있는 id는 이름만 덮어쓰고 수량은 로컬 값을
 * 그대로 유지, CPO에 새로 생긴 id는 수량 0으로 추가, CPO에서 사라진 id는 즉시 삭제하지
 * 않고 archived로 표시만 해서 이미 입력된 수량 데이터가 조용히 사라지지 않게 한다.
 */
export function useCpoOptionSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);

  useEffect(() => {
    skus.forEach((sku) => {
      const cpo = cpoProjects[sku.id];
      if (!cpo) return;

      const patch: Partial<typeof sku> = {};

      // ── 컬러: CPO를 정본으로 id 기준 병합 ──
      const cpoColors = cpo.colors ?? [];
      const cpoIds = new Set(cpoColors.map((c) => c.id));
      const localById = new Map(sku.colors.map((c) => [c.id, c]));

      let colorsChanged = false;
      const merged: ColorEntry[] = [];

      cpoColors.forEach((cc) => {
        const local = localById.get(cc.id);
        if (!local) {
          merged.push({ id: cc.id, name: cc.name, quantity: 0 });
          colorsChanged = true;
        } else if (local.name !== cc.name || local.archived) {
          merged.push({ ...local, name: cc.name, archived: false });
          colorsChanged = true;
        } else {
          merged.push(local);
        }
      });
      sku.colors.forEach((local) => {
        if (cpoIds.has(local.id)) return; // 위에서 이미 처리됨
        if (local.archived) { merged.push(local); return; } // 이미 archived — 변경 없음
        merged.push({ ...local, archived: true });
        colorsChanged = true;
      });

      if (colorsChanged) patch.colors = merged;

      const hasColors = cpoColors.length > 0;
      if (hasColors !== sku.hasColors) patch.hasColors = hasColors;

      // ── 사이즈 개수: CPO sizes.length ──
      // CPO는 사이즈를 자유 조합(XS 포함/비연속)으로 고를 수 있지만 실사용은 대부분
      // S부터 연속인 프리셋이라, 개수만 반영하고 라벨 시퀀스는 기존 SIZE_LABELS를 그대로 쓴다.
      const cpoSizeCount = Math.min(Math.max(cpo.sizes?.length ?? 1, 1), MAX_SIZES);
      if (cpoSizeCount !== sku.sizeCount) {
        patch.sizeCount = cpoSizeCount;
        patch.sizes = buildSizesFromCount(sku.sizes, cpoSizeCount, sku.totalOrderQty);
      }

      if (Object.keys(patch).length === 0) return;

      updateSku(sku.id, patch);
      persistSku(sku.id).catch((err) =>
        console.error('[useCpoOptionSync] CPO 옵션 동기화 저장 실패', sku.id, err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, cpoProjects]);
}
