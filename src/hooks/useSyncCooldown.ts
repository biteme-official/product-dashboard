import { useRef } from 'react';

/**
 * CPO 자동 동기화 훅들(useCpoOptionSync/useCpoPriceSync/useCpoThumbnailSync/useCpoFieldSync)이
 * 공유하는 저장 재시도 제한 장치.
 *
 * 이 훅들은 전부 [skus, cpoProjects] 전체를 지켜보고 있어서, 앱 어디서든(다른 SKU 편집 포함)
 * 무언가 바뀔 때마다 다시 실행된다. 불일치 하나가 지속되는데(예: Firestore 쓰기 실패) 매번
 * 무조건 재시도하게 두면, 그 재시도 자체가 다시 onSnapshot을 트리거해 즉시 다음 재실행을
 * 부르는 자기증식 루프가 된다 — 2026-09-01/02 산리오 하네스_27 sizeCount 사고가 정확히
 * 이 구조였다(할당량 초과로 매 리셋 직후 20,000건을 몇 분~1시간 안에 다 태움).
 *
 * shouldAttempt(id)는 같은 id에 대해 cooldownMs 안에는 두 번째 시도를 걸러 false를 반환한다.
 * 최악의 경우(모든 SKU가 동시에 불일치)에도 쓰기 속도가 "SKU 수 × (1 / cooldown)"으로
 * 상한이 걸려, 하루 할당량(20,000건)을 절대 재현 못 하게 만드는 게 목적 — 완벽한 해결이
 * 아니라 사고 규모를 무해한 수준으로 줄이는 안전망이다. 근본 해결(불일치 자체 정리)은
 * 여전히 필요하지만, 그게 안 됐을 때 최악의 시나리오를 막아준다.
 */
export function useSyncCooldown(cooldownMs: number) {
  const lastAttempt = useRef<Map<string, number>>(new Map());
  return function shouldAttempt(id: string): boolean {
    const now = Date.now();
    const last = lastAttempt.current.get(id) ?? 0;
    if (now - last < cooldownMs) return false;
    lastAttempt.current.set(id, now);
    return true;
  };
}
