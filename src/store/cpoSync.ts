import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { cpoFsdb, ensureCpoAuth } from '../lib/cpoFirebase';
import type { CpoProject, CpoUser } from '../types/cpo';

export const SYNCED_DATE_FIELDS = ['releaseDate', 'arrivalDate', 'shootingDate'] as const;
export type SyncedDateField = (typeof SYNCED_DATE_FIELDS)[number];

/**
 * "Product에서 방금 이 필드를 고쳤다"는 사실을 잠깐 기억해두는 용도.
 * CPO가 productSync 문서를 실제 projects에 병합하기까지는 실시간 리스너로도 1~2초 정도
 * 걸리는데, 그 사이에 useCpoDateSync가 "아직 옛날 값인 CPO"를 보고 방금 수정한 값을
 * 도로 덮어써버리는 걸 막기 위한 유예 시간(grace window)이다. zustand state가 아니라
 * 모듈 전역 Map으로 두는 이유: 이 값 자체가 바뀐다고 리렌더가 필요한 게 아니라, 이미
 * skus/cpoProjects 변화로 재실행되는 useCpoDateSync effect 안에서 참고만 하면 되기 때문.
 */
const DATE_EDIT_GRACE_MS = 10_000;
const pendingDateEdits = new Map<string, number>();

function pendingKey(skuId: string, field: SyncedDateField) {
  return `${skuId}:${field}`;
}

export function markLocalDateEdit(skuId: string, field: SyncedDateField): void {
  pendingDateEdits.set(pendingKey(skuId, field), Date.now());
}

export function isLocalDateEditPending(skuId: string, field: SyncedDateField): boolean {
  const key = pendingKey(skuId, field);
  const ts = pendingDateEdits.get(key);
  if (ts === undefined) return false;
  if (Date.now() - ts > DATE_EDIT_GRACE_MS) {
    pendingDateEdits.delete(key);
    return false;
  }
  return true;
}

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
