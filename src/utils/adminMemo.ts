import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';

const MEMO_DOC = doc(fsdb, 'config', 'adminMemo');

export interface AdminMemo {
  content: string;
  updatedAt: string | null;
}

export function subscribeAdminMemo(cb: (memo: AdminMemo) => void): () => void {
  return onSnapshot(MEMO_DOC, (snap) => {
    const data = snap.exists() ? (snap.data() as Partial<AdminMemo>) : {};
    cb({ content: data.content ?? '', updatedAt: data.updatedAt ?? null });
  });
}

export async function saveAdminMemo(content: string): Promise<void> {
  await setDoc(MEMO_DOC, { content, updatedAt: new Date().toISOString() });
}
