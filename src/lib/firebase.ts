import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyBHFoGOyILOzMaaH0AkFriZEe6p5sbWPMY',
  authDomain: 'md-dashboard-6fd45.firebaseapp.com',
  projectId: 'md-dashboard-6fd45',
  storageBucket: 'md-dashboard-6fd45.firebasestorage.app',
  messagingSenderId: '8712937181',
  appId: '1:8712937181:web:8269b883c5fcac42650534',
};

const app = initializeApp(firebaseConfig);
export const fsdb = getFirestore(app);
export const fbAuth = getAuth(app);

/** 앱 시작 시 익명 로그인 — Firestore 규칙의 request.auth != null 조건을 충족 */
export function ensureAuth(): Promise<void> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(fbAuth, (user) => {
      unsub();
      if (user) {
        resolve();
      } else {
        signInAnonymously(fbAuth).then(() => resolve()).catch(() => resolve());
      }
    });
  });
}
