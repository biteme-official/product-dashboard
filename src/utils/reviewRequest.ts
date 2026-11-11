// 발주량 검토 · 검토 요청 묶음 — 마스터 · PM이 SKU를 골라 채널 담당에게 "여기서부터 여기까지" 검토를 요청한다.
// 검토 완료는 별도 상태 없이 기존 채널 그룹 확정(step2*Confirmed)으로 판단한다.
// 저장: config/reviewRequests 문서 한 개의 items 맵(id → 요청). 요청마다 필드 경로로 써서 동시 저장이 서로 덮어쓰지 않는다.
import { deleteField, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { fsdb } from '../lib/firebase';
import { CHANNELS, CHANNEL_CONFIRM_GROUP, getDisabledChannels, type ChannelConfirmField, type SkuData } from '../types';
import type { Role } from './pin';

const REQ_DOC = doc(fsdb, 'config', 'reviewRequests');
const PREFIX = '#review/';

export const REVIEW_GROUPS: ChannelConfirmField[] = ['step2PlatformConfirmed', 'step2BrandConfirmed', 'step2GlobalConfirmed'];
export const REVIEW_GROUP_LABEL: Record<ChannelConfirmField, string> = {
  step2PlatformConfirmed: '플랫폼', step2BrandConfirmed: '브랜드', step2GlobalConfirmed: '글로벌',
};

export interface ReviewRequest {
  id: string;
  name: string;
  /** 고른 순서 그대로 — 화면 번호 01~n */
  skuIds: string[];
  /** 대상 그룹 — 이 그룹 확정이 검토 완료 */
  groups: ChannelConfirmField[];
  /** 기한 YYYY-MM-DD (로컬) */
  dueOn: string;
  memo: string;
  createdBy: Role;
  createdAt: string;
  closedAt: string | null;
  closedBy: Role | null;
}

export const canCreateReviewRequest = (role: Role | null | undefined) => role === 'master' || role === 'pm';

export function subscribeReviewRequests(cb: (items: ReviewRequest[]) => void, onError?: (e: Error) => void): () => void {
  return onSnapshot(REQ_DOC, (snap) => {
    const items = (snap.exists() ? (snap.data().items ?? {}) : {}) as Record<string, ReviewRequest>;
    cb(Object.values(items).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  }, (e) => { console.error('[검토 요청] 구독 실패', e); onError?.(e); });
}

export async function createReviewRequest(input: Pick<ReviewRequest, 'name' | 'skuIds' | 'groups' | 'dueOn' | 'memo' | 'createdBy'>): Promise<ReviewRequest> {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const req: ReviewRequest = { ...input, id, createdAt: new Date().toISOString(), closedAt: null, closedBy: null };
  // merge: items 맵의 다른 요청은 그대로 두고 이 id만 추가
  await setDoc(REQ_DOC, { items: { [id]: req } }, { merge: true });
  return req;
}

export async function closeReviewRequest(id: string, role: Role): Promise<void> {
  await updateDoc(REQ_DOC, { [`items.${id}.closedAt`]: new Date().toISOString(), [`items.${id}.closedBy`]: role });
}

/** 요청 묶음만 지움 · SKU · 그룹 확정값은 그대로 */
export async function deleteReviewRequest(id: string): Promise<void> {
  await updateDoc(REQ_DOC, { [`items.${id}`]: deleteField() });
}
export const canManageReviewRequest = (role: Role | null | undefined) => role === 'master';

// ── 링크 ──
export function buildReviewLink(id: string): string {
  return `${window.location.origin}/${PREFIX}${encodeURIComponent(id)}`;
}
export function readReviewLinkId(): string | null {
  const { hash } = window.location;
  if (!hash.startsWith(PREFIX)) return null;
  return decodeURIComponent(hash.slice(PREFIX.length)).trim() || null;
}
/** App이 링크를 읽고 발주량 검토로 이동한 뒤 이 이벤트로 요청을 연다 */
export const REVIEW_OPEN_EVENT = 'review-request-open';
export const REVIEW_SESSION_KEY = 'ct:review';

// ── 날짜 ──
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDaysLocal(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const shortMD = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
/** D-3 · D-day · D+2 */
export function dDay(dueOn: string, today = todayLocal()): string {
  const n = Math.round((new Date(`${dueOn}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 864e5);
  return n > 0 ? `D-${n}` : n === 0 ? 'D-day' : `D+${-n}`;
}
export const isOverdue = (r: ReviewRequest, today = todayLocal()) => !r.closedAt && today > r.dueOn;

// ── 진행률 ──
/** 그 그룹 채널을 하나라도 운영하는 SKU만 확정 대상 (글로벌 · 일본 둘 다 비운영이면 글로벌 제외) */
export function groupApplies(s: SkuData, field: ChannelConfirmField): boolean {
  const off = getDisabledChannels(s) as readonly string[];
  return CHANNELS.some((ch) => CHANNEL_CONFIRM_GROUP[ch].field === field && !off.includes(ch));
}

export interface ReviewProgress {
  groups: { field: ChannelConfirmField; done: number; total: number }[];
  doneSkus: number;
  /** 지금 화면에 있는 요청 SKU 수 (삭제 · 숨김 제외) */
  totalSkus: number;
  allDone: boolean;
}
export function reviewProgress(r: ReviewRequest, skus: SkuData[]): ReviewProgress {
  const inReq = r.skuIds.map((id) => skus.find((s) => s.id === id)).filter((s): s is SkuData => !!s);
  const groups = r.groups.map((field) => {
    const ap = inReq.filter((s) => groupApplies(s, field));
    return { field, done: ap.filter((s) => !!s[field]).length, total: ap.length };
  });
  const doneSkus = inReq.filter((s) => r.groups.every((f) => !groupApplies(s, f) || !!s[f])).length;
  return { groups, doneSkus, totalSkus: inReq.length, allDone: inReq.length > 0 && doneSkus === inReq.length };
}
