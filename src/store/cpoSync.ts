import { create } from 'zustand';
import { collection, onSnapshot } from 'firebase/firestore';
import { cpoFsdb, ensureCpoAuth } from '../lib/cpoFirebase';
import type { CpoProject, CpoUser } from '../types/cpo';

// releaseDate/arrivalDate/shootingDate(날짜 3종) + skuName — CPO↔Product 동기화 대상 필드 목록.
// 이 중 releaseDate/arrivalDate/skuName은 양방향(Product에서 고치면 CPO로도 보냄), shootingDate는
// 2026-08-06부터 CPO→Product 단방향(Product는 받아오기만 하고, 편집 UI 자체가 잠김 — SkuCard.tsx/
// SkuOrderSection.tsx, persistSku에서 shootingDate만 제외). 촬영일은 CPO 쪽에서만 편집되는 값이라,
// Product 로컬에 남은 옛 값이 CPO의 삭제를 도로 덮어써버리는 문제가 있었다(store/index.ts 주석 참고).
// CPO의 productSync/{skuId} 문서 write는 firestore.rules의 hasOnly()로 이 필드들만 허용됨
// (cpo-dashboard 저장소, Firebase 콘솔에서 수동 게시 필요) — 여기 추가한다고 CPO가 자동으로
// 받아주는 게 아니라 그쪽 규칙도 같이 넓혀야 함.
export const SYNCED_FIELDS = ['releaseDate', 'arrivalDate', 'shootingDate', 'skuName'] as const;
export type SyncedField = (typeof SYNCED_FIELDS)[number];

/**
 * "Product에서 방금 이 필드를 고쳤다"는 사실과 그때 보낸 값을 기억해두는 용도.
 * CPO 쪽 productSync→projects 병합은 cpo-dashboard의 클라이언트 사이드 onSnapshot
 * 리스너(projectStore.ts)에서만 일어난다 — 즉 "누군가 CPO 대시보드 탭을 열어놓고 있을 때만"
 * 반영되고, 그동안 아무도 안 열어놨으면 몇 초가 아니라 몇 분~몇 시간이 걸릴 수도 있다.
 * 그래서 고정 시간(grace window)이 아니라 "CPO 값이 실제로 우리가 보낸 값을 따라잡을 때까지"
 * 보호를 유지한다 — 그 전까지 useCpoFieldSync가 "아직 옛날 값인 CPO"를 보고 방금 수정한 값을
 * 도로 덮어써버리는 걸 막는다. MAX_WAIT_MS는 CPO 쪽 병합이 영영 실패했을 때(예: productSync
 * write 자체가 막힘) 무한정 락이 걸리지 않도록 하는 안전장치일 뿐이다.
 * zustand state가 아니라 모듈 전역 Map으로 두는 이유: 이 값 자체가 바뀐다고 리렌더가 필요한
 * 게 아니라, 이미 skus/cpoProjects 변화로 재실행되는 useCpoFieldSync effect 안에서 참고만
 * 하면 되기 때문.
 */
const FIELD_EDIT_MAX_WAIT_MS = 24 * 60 * 60 * 1000; // 24시간 — CPO가 영영 안 열렸을 때의 안전 상한
const pendingFieldEdits = new Map<string, { value: string; ts: number }>();

function pendingKey(skuId: string, field: SyncedField) {
  return `${skuId}:${field}`;
}

export function markLocalFieldEdit(skuId: string, field: SyncedField, value: string): void {
  pendingFieldEdits.set(pendingKey(skuId, field), { value, ts: Date.now() });
}

/** cpoVal: 현재 CPO 쪽에서 알고 있는 이 필드 값 — 우리가 보낸 값과 같아지면 보호를 해제한다. */
export function isLocalFieldEditPending(skuId: string, field: SyncedField, cpoVal: string): boolean {
  const key = pendingKey(skuId, field);
  const entry = pendingFieldEdits.get(key);
  if (!entry) return false;
  if (entry.value === cpoVal) {
    pendingFieldEdits.delete(key);
    return false;
  }
  if (Date.now() - entry.ts > FIELD_EDIT_MAX_WAIT_MS) {
    pendingFieldEdits.delete(key);
    return false;
  }
  return true;
}

/**
 * persistSku()가 "이 필드를 CPO로 밀어보낼지" 판단할 때 쓴다 — 값이 다르다고 무조건 밀어보내면
 * 안 된다(아래 참고). 순수 조회만 하고 값 비교/삭제 등 부수효과는 없다.
 *
 * 배경: persistSku()는 가격 입력 blur, 옵션 동기화 등 이 필드와 무관한 이유로도 수시로 호출된다.
 * 그때마다 sku[field]를 cpoProjects[field]와 비교해서 다르면 무조건 CPO로 밀어보냈었는데,
 * "CPO에서 방금 값이 바뀌어서 아직 이 훅(useCpoFieldSync)이 로컬을 따라잡지 못한 그 찰나"에
 * 하필 다른 이유로 persistSku가 불리면 "아직 안 따라잡은 옛날 로컬 값"을 방금 사용자가 CPO에서
 * 고친 값 위에 그대로 되돌려써버리는 레이스가 있었다(2026-08-11 발견 — "CPO에서 고쳤는데
 * Product 창을 열어두고 있으면 오히려 CPO 값이 원상복구된다"는 증상으로 보고됨).
 * 진짜 로컬 편집(updateSku가 markLocalFieldEdit으로 남긴 마킹)이 있을 때만 밀어보내도록 좁혀서
 * 해결 — useCpoFieldSync 자신이 CPO 값을 반영하려고 부르는 updateSku는 이 마킹을 남기지 않는다
 * (updateSku의 skipCpoEditMark 옵션 참고).
 */
export function hasPendingLocalFieldEdit(skuId: string, field: SyncedField): boolean {
  return pendingFieldEdits.has(pendingKey(skuId, field));
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
