import { useEffect, useRef } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';
import { useStore, TRASH_COL } from '../store';
import { useCpoSync } from '../store/cpoSync';
import { CPO_VISIBLE_STATUSES } from '../types/cpo';

/**
 * CPO 기획이 새로 활성 상태(기획/아이디어 등)가 됐는데 Product에 대응 SKU 카드가 없으면
 * 자동으로 만들어주는 훅. App.tsx에서 한 번 호출하면 됨(반환값 없음, 내부에서 자체 구독).
 *
 * 안전장치: 사용자가 Product에서 일부러 삭제(휴지통 이동)한 SKU는 CPO가 아직 활성 상태여도
 * 되살리지 않음 — trash 컬렉션의 skuId를 먼저 확인한 뒤에만 생성.
 */
export function useCpoCardSync(): void {
  const skus = useStore((s) => s.skus);
  const cpoProjects = useCpoSync((s) => s.cpoProjects);
  const cpoLoaded = useCpoSync((s) => s.cpoLoaded);
  const createSkuFromCpo = useStore((s) => s.createSkuFromCpo);
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!cpoLoaded) return;

    const existingIds = new Set(skus.map((s) => s.id));
    const candidates = Object.values(cpoProjects).filter(
      (p) =>
        (CPO_VISIBLE_STATUSES as string[]).includes(p.status) &&
        !existingIds.has(p.id) &&
        !inFlight.current.has(p.id),
    );
    if (candidates.length === 0) return;

    let cancelled = false;

    (async () => {
      const idsToCheck = candidates.map((c) => c.id);
      const trashedIds = new Set<string>();
      // Firestore 'in' 쿼리는 최대 30개 — 30개씩 나눠서 조회
      for (let i = 0; i < idsToCheck.length; i += 30) {
        const chunk = idsToCheck.slice(i, i + 30);
        try {
          const snap = await getDocs(query(collection(fsdb, TRASH_COL), where('skuId', 'in', chunk)));
          snap.docs.forEach((d) => trashedIds.add(d.data().skuId as string));
        } catch (err) {
          console.error('[useCpoCardSync] 휴지통 확인 실패 — 이번 배치는 생성 보류', err);
          chunk.forEach((id) => trashedIds.add(id)); // 확인 실패 시 안전하게 생성 보류
        }
      }
      if (cancelled) return;

      candidates
        .filter((c) => !trashedIds.has(c.id))
        .forEach((c) => {
          inFlight.current.add(c.id);
          createSkuFromCpo(c);
        });
    })();

    return () => {
      cancelled = true;
    };
  }, [skus, cpoProjects, cpoLoaded, createSkuFromCpo]);
}
