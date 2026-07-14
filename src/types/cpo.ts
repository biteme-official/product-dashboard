// CPO 대시보드(cpo-dashboard-34fd4)에서 읽어오는 데이터의 타입.
// 이 파일은 CPO 저장소의 src/types/index.ts 중 STEP4에서 실제로 쓰는 필드만 옮겨 적은 것 —
// CPO 쪽 타입이 바뀌면 이 파일도 手동으로 맞춰줘야 함(자동 동기화 아님).

export type CpoMainStatus =
  | '기획/아이디어'
  | '시안/샘플링'
  | '제작 시작'
  | '상세 작성'
  | '사진 촬영'
  | '상세 작업중'
  | '상세 완료'
  | '오픈/완료';

export type CpoProjectStatus = CpoMainStatus | 'Holding' | 'Cancel';

/** Product에 카드가 노출되어야 하는 CPO 상태 (Cancel/Holding 제외 전부) */
export const CPO_VISIBLE_STATUSES: CpoMainStatus[] = [
  '기획/아이디어', '시안/샘플링', '제작 시작', '상세 작성', '사진 촬영', '상세 작업중', '상세 완료', '오픈/완료',
];

export interface CpoColorEntry {
  id: string;
  name: string;
}

export interface CpoPricingScenario {
  id: string;
  sellingPrice: number;
  regularPrice: number;
  confirmed: boolean;
}

export interface CpoProjectPricing {
  cost: number;
  pricingScenarios: CpoPricingScenario[];
}

export interface CpoProject {
  id: string;
  skuName: string;
  category: string;
  brand: string;
  skuType: string;
  releaseDate: string;
  arrivalDate: string;
  shootingDate: string;
  sizes: string[];
  moq: number;
  colors: CpoColorEntry[];
  pricing: CpoProjectPricing;
  status: CpoProjectStatus;
  planningManagerIds: string[];
}

export interface CpoUser {
  id: string;
  name: string;
  isActive: boolean;
}

/** CPO 대시보드의 STATUS_STYLES와 동일한 색상 — 두 앱에서 같은 상태가 같은 색으로 보이게 맞춤 */
export const CPO_STATUS_STYLES: Record<CpoProjectStatus, { bg: string; text: string; border: string }> = {
  '기획/아이디어': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  '시안/샘플링': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  '제작 시작': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  '상세 작성': { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
  '사진 촬영': { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  '상세 작업중': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  '상세 완료': { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  '오픈/완료': { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
  'Holding': { bg: 'bg-gray-100', text: 'text-gray-500', border: 'border-gray-300' },
  'Cancel': { bg: 'bg-gray-200', text: 'text-gray-500', border: 'border-gray-400' },
};

/** pricingScenarios 중 confirmed:true인 것 하나를 찾아 반환 (없으면 null, 여러 개면 첫 번째) */
export function getConfirmedPricingScenario(pricing: CpoProjectPricing | undefined): CpoPricingScenario | null {
  if (!pricing?.pricingScenarios) return null;
  return pricing.pricingScenarios.find((s) => s.confirmed) ?? null;
}

/** CPO 대시보드 배포 주소 (cpo-dashboard-alpha.vercel.app) */
export const CPO_APP_URL = 'https://cpo-dashboard-alpha.vercel.app';

/** CPO 프로젝트 상세의 프라이싱 섹션으로 자동 스크롤하는 딥링크 (CPO App.tsx의 buildHash와 동일 형식) */
export function cpoPricingDeepLink(projectId: string): string {
  return `${CPO_APP_URL}/#project/${projectId}?pricing=1`;
}

/** planningManagerIds → CPO users 컬렉션 기준 이름 목록 (없으면 '?') */
export function resolveManagerNames(managerIds: string[], cpoUsers: Record<string, CpoUser>): string[] {
  return managerIds.map((id) => cpoUsers[id]?.name ?? '?');
}
