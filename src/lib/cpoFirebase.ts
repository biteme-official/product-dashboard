import { initializeApp } from 'firebase/app';
import { deleteField, doc, getFirestore, setDoc } from 'firebase/firestore';
import type { ChannelOpenScheduleEntry } from '../types';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// CPO 대시보드(cpo-dashboard-34fd4) 전용 2nd Firebase app — 기본은 읽기 전용 구독용.
// apiKey는 Firebase 설계상 비밀값이 아님(브라우저 번들에 항상 노출됨) — 실제 접근 통제는
// CPO의 firestore.rules가 담당. STEP4 4단계부터 productSync 컬렉션 한정으로 쓰기도 허용됨
// (firestore.rules가 releaseDate/arrivalDate/shootingDate 3개 필드만 hasOnly로 제한).
const cpoFirebaseConfig = {
  apiKey: 'AIzaSyDojxF2ELIqa4DzuBdip2065xsbuFcgzQg',
  authDomain: 'cpo-dashboard-34fd4.firebaseapp.com',
  projectId: 'cpo-dashboard-34fd4',
  storageBucket: 'cpo-dashboard-34fd4.firebasestorage.app',
  messagingSenderId: '980490159511',
  appId: '1:980490159511:web:89dfd68bcd1a8fd346f0d2',
};

const cpoApp = initializeApp(cpoFirebaseConfig, 'cpo');
export const cpoFsdb = getFirestore(cpoApp);
const cpoAuth = getAuth(cpoApp);

/** CPO 쪽 Firestore 규칙(request.auth != null)을 만족시키기 위한 별도 익명 로그인 */
export function ensureCpoAuth(): Promise<void> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(cpoAuth, (user) => {
      unsub();
      if (user) {
        resolve();
      } else {
        signInAnonymously(cpoAuth).then(() => resolve()).catch(() => resolve());
      }
    });
  });
}

export type ProductSyncFieldPatch = Partial<{
  releaseDate: string;
  arrivalDate: string;
  shootingDate: string;
  skuName: string;
}>;

/**
 * 오픈일/입고예정일/촬영예정일/SKU명을 Product에서 고쳤을 때 CPO로 보내는 요청 채널.
 * CPO의 `projects` 컬렉션에 직접 쓰지 않고 `productSync/{skuId}` 문서로만 쓴다 — CPO 앱이
 * 이 컬렉션 변경을 감지해서 실제 projects 문서에 병합한다(cpo-dashboard 저장소 구현).
 * CPO의 firestore.rules가 이 문서에 쓸 수 있는 필드를 hasOnly()로 제한하므로, 여기 필드를
 * 늘릴 땐 그쪽 규칙도 같이 넓혀야 실제로 반영된다.
 */
export function writeProductSyncFields(skuId: string, patch: ProductSyncFieldPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return Promise.resolve();
  return setDoc(doc(cpoFsdb, 'productSync', skuId), patch, { merge: true });
}

/**
 * 채널별 오픈일정 미러 — CPO 출시일 칸에 [선오픈]/[후오픈]을 띄우기 위한 표시 전용 데이터.
 * Product → CPO 단방향이고 CPO는 이 값을 projects 문서에 병합하지 않는다(메모리에서 판정만).
 * 채널 값 의미는 ChannelOpenScheduleEntry와 동일: 'YYYY-MM-DD' | 'NONE'(미판매) | null(=기본 오픈일).
 * 메모(HTML)는 보내지 않는다.
 */
export interface ChannelScheduleMirror {
  플랫폼: string | null;
  스스: string | null;
  위탁: string | null;
  B2B: string | null;
  글로벌: string | null;
  기타: string | null;
  기타Label: string;
  confirmed: boolean;
}

export function buildChannelScheduleMirror(schedule: ChannelOpenScheduleEntry | undefined, confirmed: boolean | undefined): ChannelScheduleMirror {
  return {
    플랫폼: schedule?.플랫폼 ?? null,
    스스: schedule?.스스 ?? null,
    위탁: schedule?.위탁 ?? null,
    B2B: schedule?.B2B ?? null,
    글로벌: schedule?.글로벌 ?? null,
    기타: schedule?.기타 ?? null,
    기타Label: schedule?.기타Label ?? '',
    confirmed: !!confirmed,
  };
}

/**
 * productSync/{skuId}.channelSchedule에 미러를 쓴다(null이면 삭제). 날짜 동기화 필드와 같은 문서지만
 * 일부러 별도 write로 분리 — CPO 규칙에 이 필드가 아직 게시되지 않았을 때 이 write만 거부되고
 * 출시일 등 기존 동기화는 영향받지 않게 하기 위함.
 */
export function writeChannelScheduleMirror(skuId: string, mirror: ChannelScheduleMirror | null): Promise<void> {
  return setDoc(doc(cpoFsdb, 'productSync', skuId), { channelSchedule: mirror ?? deleteField() }, { merge: true });
}
