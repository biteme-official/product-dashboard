import { useEffect } from 'react';
import { useStore } from '../store';
import { useCpoSync } from '../store/cpoSync';
import { useSyncCooldown } from './useSyncCooldown';

/**
 * CPO가 등록한 썸네일(thumbnailUrl)을 Product SKU의 imageUrl에 단방향으로 반영한다.
 * CPO를 정본으로 취급 — CPO 썸네일이 바뀌면 Product에서 직접 올린 이미지도 덮어쓴다
 * (컬러/사이즈 동기화와 동일한 정책, useCpoOptionSync 참고).
 *
 * 단, CPO에 썸네일이 아직 없는 경우(thumbnailUrl이 비어있음)에는 절대 손대지 않는다 —
 * 대부분의 기존 CPO 프로젝트가 이 필드를 아직 안 채운 상태라, "CPO 값이 없으면 지운다"로
 * 하면 Product에서 이미 등록해둔 이미지가 전부 날아가 버린다. 그래서 이 훅은 오직
 * "CPO에 값이 있고 로컬과 다를 때"만 반영한다.
 *
 * 이 방향은 productSync 병합 경로(useCpoFieldSync)를 타지 않는 순수 읽기 동기화라
 * CPO 쪽 코드/Firestore 규칙 변경이 필요 없다 — projects 컬렉션을 이미 통째로 구독 중이라
 * thumbnailUrl도 이미 수신되고 있다.
 */
export function useCpoThumbnailSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const updateSku = useStore((s) => s.updateSku);
  const persistSku = useStore((s) => s.persistSku);
  const shouldAttempt = useSyncCooldown(5 * 60 * 1000); // SKU당 5분에 한 번만 저장 재시도

  useEffect(() => {
    skus.forEach((sku) => {
      const cpoThumbnailUrl = cpoProjects[sku.id]?.thumbnailUrl;
      if (!cpoThumbnailUrl) return;
      if (cpoThumbnailUrl === sku.imageUrl) return;
      if (!shouldAttempt(sku.id)) return; // 쿨다운 중 — 무한 재시도 방지

      updateSku(sku.id, { imageUrl: cpoThumbnailUrl });
      persistSku(sku.id).catch((err) =>
        console.error('[useCpoThumbnailSync] CPO 썸네일 동기화 저장 실패', sku.id, err),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, cpoProjects]);
}
