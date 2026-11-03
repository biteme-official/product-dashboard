import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';

/** 판매월 × 카테고리 금액 목표 — config/orderTargets 한 문서. { '2027-02': { '장난감': { rev, pro } } } */
export type OrderTargets = Record<string, Record<string, { rev?: number; pro?: number }>>;
const TARGET_DOC = doc(fsdb, 'config', 'orderTargets');

export function useOrderTargets(): OrderTargets {
  const [targets, setTargets] = useState<OrderTargets>({});
  useEffect(() => onSnapshot(
    TARGET_DOC,
    (snap) => setTargets(snap.exists() ? (snap.data() as OrderTargets) : {}),
    (err) => console.error('[orderTargets] 구독 실패', err),
  ), []);
  return targets;
}

export function saveOrderTarget(ym: string, category: string, key: 'rev' | 'pro', won: number): Promise<void> {
  return setDoc(TARGET_DOC, { [ym]: { [category]: { [key]: won } } }, { merge: true });
}
