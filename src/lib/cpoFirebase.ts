import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// CPO 대시보드(cpo-dashboard-34fd4) 전용 2nd Firebase app — 읽기 전용 구독용.
// apiKey는 Firebase 설계상 비밀값이 아님(브라우저 번들에 항상 노출됨) — 실제 접근 통제는
// CPO의 firestore.rules가 담당. Product는 이 값으로 쓰기(write)를 하지 않음(STEP4 1~3단계 범위).
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
