import { initializeApp } from 'firebase/app';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
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
