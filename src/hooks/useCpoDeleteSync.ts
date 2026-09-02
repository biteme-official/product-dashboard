import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useCpoSync } from '../store/cpoSync';

/**
 * CPO 프로젝트가 사라진(삭제된) SKU를 Product에서도 자동으로 휴지통 이동시키는 훅.
 * useCpoCardSync(생성 쪽)의 반대 방향 — "복사/직접추가/삭제" UI를 없애고 SKU 생명주기를
 * CPO 단방향으로 통일하면서 신설(2026-09-02). App.tsx에서 한 번 호출하면 됨.
 *
 * 판단 기준: cpoLoaded(CPO 프로젝트 최초 스냅샷 수신 완료)가 true인데도 어떤 Product SKU의
 * id가 cpoProjects에 없으면 "CPO에서 삭제됐다"로 간주해 deleteSku(휴지통 이동, 15일 보관)를
 * 호출한다. cpoLoaded 가드가 없으면 앱 시작 직후(cpoProjects={}로 비어있는 한 순간) 모든 SKU가
 * "삭제됨"으로 오판되어 전부 지워지는 대참사가 날 수 있음 — 반드시 지켜야 하는 가드.
 *
 * ⚠️ 재시도 관련 안전장치 (2026-09-01 발견한 무한루프 사고의 교훈을 반영):
 * deleteSku의 Firestore write가 실패하면(예: 할당량 초과) 이 훅은 그 SKU를 "이번 세션에서는
 * 포기"로 표시하고 더 이상 재시도하지 않는다. 만약 실패 시마다 계속 재시도하게 두면, 원인이
 * 해결 안 된 채로 [skus, cpoProjects]가 다른 이유로 바뀔 때마다(이 앱의 다른 어떤 편집이든)
 * 매번 다시 삭제를 시도하는 무한 재시도 루프가 될 수 있다 — 정확히 어제 산리오 하네스_27의
 * sizeCount 교정 루프가 할당량을 매일 재소진시켰던 것과 같은 구조. 실패한 SKU는 다음 페이지
 * 새로고침(=새 세션) 때 한 번 더 시도된다.
 */
export function useCpoDeleteSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const cpoLoaded = useCpoSync((s) => s.cpoLoaded);
  const deleteSku = useStore((s) => s.deleteSku);
  const inFlight = useRef<Set<string>>(new Set());
  const gaveUp = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!cpoLoaded) return;

    const orphans = skus.filter(
      (s) => !cpoProjects[s.id] && !inFlight.current.has(s.id) && !gaveUp.current.has(s.id),
    );
    if (orphans.length === 0) return;

    orphans.forEach((sku) => {
      inFlight.current.add(sku.id);
      deleteSku(sku.id, 'CPO 삭제 동기화')
        .catch((err) => {
          console.error('[useCpoDeleteSync] 삭제 실패 — 이번 세션에서는 재시도 안 함:', sku.id, err);
          gaveUp.current.add(sku.id);
        })
        .finally(() => {
          inFlight.current.delete(sku.id);
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skus, cpoProjects, cpoLoaded, deleteSku]);
}
