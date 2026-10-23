import { useEffect } from 'react';
import { useStore } from '../store';
import { useCpoSync } from '../store/cpoSync';
import { buildSizesFromLabels, cpoSizeLabels, mapSizeLabels, remapSizeKeys, type SizeKeyRemap } from '../utils/sizeLabels';
import { MAX_SIZES } from '../types';
import type { ColorEntry } from '../types';
import { useSyncCooldown } from './useSyncCooldown';

/**
 * CPO의 컬러 목록(이름)과 사이즈(라벨·개수)를 Product SKU에 단방향으로 반영한다.
 * 컬러명·사이즈 라벨은 CPO가 정본 — Product 쪽에서는 더 이상 직접 편집하지 않고
 * (SizeDistColumn UI에서 읽기전용 처리) 컬러별/사이즈별 수량·비율만 로컬에서 편집한다.
 *
 * 이 방향은 productSync 병합 경로(useCpoFieldSync)를 타지 않는 순수 읽기 동기화라
 * CPO 쪽 코드/Firestore 규칙 변경이 필요 없고, isLocalFieldEditPending류의 "로컬 편집
 * 보호"도 필요 없다 — 애초에 로컬에서 편집할 수 없는 값이라 되돌려쓰기(원상복구) 버그가
 * 생길 여지가 없다.
 *
 * 컬러는 id 기준으로 CPO와 병합한다: CPO에 있는 id는 이름만 덮어쓰고 수량은 로컬 값을
 * 그대로 유지, CPO에 새로 생긴 id는 수량 0으로 추가, CPO에서 사라진 id는 수량이 있으면
 * archived로 표시만 해서 이미 입력된 수량 데이터가 조용히 사라지지 않게 하고, 수량이 0이면
 * 보존할 게 없으므로 바로 제거한다(수량 0 archived 항목이 "(삭제됨)"으로 계속 남던 문제).
 */
export function useCpoOptionSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const persistSizeKeyRemap = useStore((s) => s.persistSizeKeyRemap);
  const shouldAttempt = useSyncCooldown(5 * 60 * 1000); // SKU당 5분에 한 번만 저장 재시도

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
        // 보존할 수량이 없으면 archived로 남기지 않고 바로 제거 — 이미 archived인 수량 0 항목도 여기서 정리됨
        if (local.quantity <= 0) { colorsChanged = true; return; }
        if (local.archived) { merged.push(local); return; } // 이미 archived — 변경 없음
        merged.push({ ...local, archived: true });
        colorsChanged = true;
      });

      if (colorsChanged) patch.colors = merged;

      const hasColors = cpoColors.length > 0;
      if (hasColors !== sku.hasColors) patch.hasColors = hasColors;

      // ── 사이즈: CPO가 고른 라벨 그대로(M·L·XL, XS 포함 등) ──
      // 예전엔 개수만 받고 라벨은 S부터 연속 프리셋(SIZE_LABELS)을 붙여서 M·L·XL을 골라도 S·M·L로 보였다(#44).
      // 라벨이 바뀌면 비율과 라벨로 저장된 수동 수량 키(step2OptionQty·finalOrderQty)도 같이 옮긴다 —
      // 프리셋 라벨이던 SKU(sizeLabelsFromCpo 없음)는 칸 위치가 실제 CPO 사이즈였으므로 위치 기준,
      // 이미 맞춘 SKU는 CPO에서 사이즈를 추가/삭제한 것이므로 이름 기준.
      const cpoLabels = cpoSizeLabels(cpo.sizes, MAX_SIZES);
      const localLabels = sku.sizes.slice(0, sku.sizeCount).map((s) => s.label);
      const labelsChanged = cpoLabels.join('|') !== localLabels.join('|');
      let keyRemap: { step2OptionQty?: SizeKeyRemap; finalOrderQty?: SizeKeyRemap } | null = null;
      if (labelsChanged) {
        const mapping = mapSizeLabels(localLabels, cpoLabels, !sku.sizeLabelsFromCpo);
        patch.sizeCount = cpoLabels.length;
        patch.sizes = buildSizesFromLabels(sku.sizes, localLabels, cpoLabels, mapping, MAX_SIZES);
        const step2 = remapSizeKeys(sku.step2OptionQty, mapping);
        const final = remapSizeKeys(sku.finalOrderQty, mapping);
        if (step2.changed) patch.step2OptionQty = step2.next;
        if (final.changed) patch.finalOrderQty = final.next;
        if (step2.changed || final.changed) {
          keyRemap = { ...(step2.changed ? { step2OptionQty: step2 } : {}), ...(final.changed ? { finalOrderQty: final } : {}) };
        }
      }
      if (!sku.sizeLabelsFromCpo) patch.sizeLabelsFromCpo = true;

      if (Object.keys(patch).length === 0) return;
      if (!shouldAttempt(sku.id)) return; // 쿨다운 중 — 무한 재시도 방지

      updateSku(sku.id, patch);
      persistSku(sku.id)
        .then(() => (keyRemap ? persistSizeKeyRemap(sku.id, keyRemap) : undefined))
        .catch((err) => console.error('[useCpoOptionSync] CPO 옵션 동기화 저장 실패', sku.id, err));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, cpoProjects]);
}
