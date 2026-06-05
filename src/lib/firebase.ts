import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

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
