// SKU 카드 직링크 — `#sku/<id>` 해시로 특정 SKU 카드를 바로 연다.
// 이름 대신 문서 ID를 써서 SKU명이 바뀌어도 링크가 유지된다.
// portal_token(쿼리)과 겹치지 않도록 해시만 사용.

const PREFIX = '#sku/';

export function buildSkuLink(skuId: string): string {
  return `${window.location.origin}/${PREFIX}${encodeURIComponent(skuId)}`;
}

export function readSkuLinkId(): string | null {
  const { hash } = window.location;
  if (!hash.startsWith(PREFIX)) return null;
  const id = decodeURIComponent(hash.slice(PREFIX.length)).trim();
  return id || null;
}

// 프로젝션 › 프라이싱 직링크 — 슬랙 가격 확정 요청 알림의 [프라이싱 바로가기]에서 사용 (apps-script/price-confirm-digest.gs와 같은 값)
const PRICING_HASH = '#projection/pricing';

export function isPricingLink(): boolean {
  return window.location.hash === PRICING_HASH;
}

export function clearSkuLink(): void {
  history.replaceState(history.state, '', window.location.pathname + window.location.search);
}

export async function copySkuLink(skuId: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildSkuLink(skuId));
    return true;
  } catch {
    return false;
  }
}
