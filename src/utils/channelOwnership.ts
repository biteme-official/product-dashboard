import type { Channel, ChannelConfirmField } from '../types';
import type { Role } from './pin';

/** 수량을 입력하는 단위 — 판매 채널 + 마케팅(비용 채널) */
export type QtyChannel = Channel | '마케팅';

/**
 * 역할별 담당 채널 (2026-10-05 결정). 담당 채널만 목표량 · 판매가 시나리오를 수정할 수 있고 나머지는 보기만.
 * master · pm은 전 채널. viewer는 없음. 역할의 "채널별 목표량" 권한(관리 › 권한 관리)이 꺼져 있으면 담당이어도 수정 불가.
 */
const OWNED_CHANNELS: Partial<Record<Role, readonly QtyChannel[]>> = {
  platform_md: ['자사몰', '마케팅'],
  brand_md: ['스스', '위탁', 'B2B', '쿠팡', '사입및페어'],
  global: ['글로벌', '일본'],
};

/** 확정 그룹별로 확정 · 해제할 수 있는 역할 */
const GROUP_OWNER: Record<ChannelConfirmField, Role> = {
  step2PlatformConfirmed: 'platform_md',
  step2BrandConfirmed: 'brand_md',
  step2GlobalConfirmed: 'global',
};

/** 전 채널을 다루는 역할 — 여러 채널을 한꺼번에 바꾸는 조정(채널 비중 수정 · 다시 나누기 · 월 비중)은 이 역할만 */
export function isAllChannelRole(role: Role | null | undefined): boolean {
  return role === 'master' || role === 'pm';
}

export function ownsChannel(role: Role | null | undefined, channel: QtyChannel): boolean {
  if (!role) return false;
  if (isAllChannelRole(role)) return true;
  return OWNED_CHANNELS[role]?.includes(channel) ?? false;
}

export function ownedChannels(role: Role | null | undefined): readonly QtyChannel[] {
  if (!role) return [];
  if (isAllChannelRole(role)) return [];
  return OWNED_CHANNELS[role] ?? [];
}

export function canConfirmGroup(role: Role | null | undefined, field: ChannelConfirmField): boolean {
  if (!role) return false;
  return isAllChannelRole(role) || GROUP_OWNER[field] === role;
}
