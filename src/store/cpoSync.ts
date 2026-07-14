import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { cpoFsdb, ensureCpoAuth } from '../lib/cpoFirebase';
import type { CpoProject, CpoUser } from '../types/cpo';

interface CpoSyncState {
  /** CPO 프로젝트 id → 데이터. 아직 로딩 전이면 빈 객체. */
  cpoProjects: Record<string, CpoProject>;
  /** CPO 사용자 id → 데이터 (기획 담당자 이름 표시용) */
  cpoUsers: Record<string, CpoUser>;
  /** CPO 구독이 최초 1회라도 수신했는지 — false일 땐 "아직 모름"과 "CPO에 없음"을 구분해야 함 */
  cpoLoaded: boolean;
}

interface CpoSyncActions {
  /** CPO 구독 시작. App.tsx useEffect에서 호출하고 반환값을 cleanup으로 사용 */
  loadCpoSync: () => () => void;
}

export const useCpoSync = create<CpoSyncState & CpoSyncActions>((set) => ({
  cpoProjects: {},
  cpoUsers: {},
  cpoLoaded: false,

  loadCpoSync: () => {
    let unsubProjects = () => {};
    let unsubUsers = () => {};
    let cancelled = false;

    ensureCpoAuth()
      .then(() => {
        if (cancelled) return;
        unsubProjects = onSnapshot(
          collection(cpoFsdb, 'projects'),
          (snapshot) => {
            const map: Record<string, CpoProject> = {};
            snapshot.docs.forEach((d) => {
              map[d.id] = { ...(d.data() as Omit<CpoProject, 'id'>), id: d.id };
            });
            set({ cpoProjects: map, cpoLoaded: true });
            console.info(`[cpoSync] CPO 프로젝트 ${snapshot.docs.length}건 수신 완료`);
          },
          (err) => console.error('[cpoSync] projects 구독 실패 — CPO 값 표시가 비어있을 수 있음', err),
        );
        unsubUsers = onSnapshot(
          collection(cpoFsdb, 'users'),
          (snapshot) => {
            const map: Record<string, CpoUser> = {};
            snapshot.docs.forEach((d) => {
              map[d.id] = { ...(d.data() as Omit<CpoUser, 'id'>), id: d.id };
            });
            set({ cpoUsers: map });
            console.info(`[cpoSync] CPO 사용자 ${snapshot.docs.length}건 수신 완료`);
          },
          (err) => console.error('[cpoSync] users 구독 실패 — 담당자 이름 표시가 비어있을 수 있음', err),
        );
      })
      .catch((err) => console.error('[cpoSync] CPO 익명 인증 실패', err));

    return () => {
      cancelled = true;
      unsubProjects();
      unsubUsers();
    };
  },
}));
