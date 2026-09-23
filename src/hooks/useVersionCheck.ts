import { useEffect, useState } from 'react';
import { hasPendingSkuWrites } from '../store';

declare const __BUILD_ID__: string;

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // version.json 확인 주기
const IDLE_RELOAD_MS = 10 * 60 * 1000;   // 화면이 보이는 탭도 이만큼 조작이 없으면 자동 새로고침
const RELOAD_GUARD_MS = 10 * 60 * 1000;  // 자동 새로고침 후 이 시간 안에는 다시 자동 새로고침하지 않음
const RELOAD_GUARD_KEY = 'versionCheck:lastAutoReload';

/**
 * 자동 새로고침 무한 반복 방지 — 배포 전파 중이거나 캐시 때문에 새로고침해도 여전히 옛 번들을 받으면
 * version.json과 계속 어긋나 3초마다 새로고침이 반복될 수 있다(로컬 테스트에서 실제 재현).
 * 직전 자동 새로고침 후 10분 안이면 자동 새로고침은 건너뛰고 배너만 남긴다.
 */
function recentlyAutoReloaded(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? 0);
    return Date.now() - last < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

function autoReload(): void {
  try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())); } catch { /* 저장 불가여도 새로고침은 진행 */ }
  window.location.reload();
}

function isEditing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/**
 * 새 버전 배포 감지 + 자동 새로고침.
 *
 * 다른 PC에 켜둔 채 방치된 탭이 구버전 코드로 계속 돌면서 데이터를 덮어쓰는 사고(2026-09-23)를
 * 막기 위해, 빌드 때 함께 배포되는 /version.json의 buildId가 이 번들의 __BUILD_ID__와 달라지면
 * "새 버전 있음"으로 표시한다(vite.config.ts의 versionFile 플러그인).
 *
 * 자동 새로고침은 입력 유실이 없을 때만 한다:
 * - 탭이 안 보일 때(다른 탭으로 전환·절전 등) — 전환 순간 blur 저장이 출발할 시간(3초)을 준 뒤
 * - 화면이 보이는 탭은 10분간 조작이 없고, 입력칸에 커서가 없을 때
 * 둘 다 진행 중인 skus 저장이 없고, 직전 자동 새로고침 후 10분이 지났을 때만.
 * 그 외엔 배너(App.tsx)의 새로고침 버튼으로.
 */
export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (__BUILD_ID__.startsWith('local-')) return; // 로컬 dev/빌드는 확인하지 않음
    let stopped = false;

    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const { buildId } = (await res.json()) as { buildId?: string };
        if (!stopped && buildId && buildId !== __BUILD_ID__) setUpdateAvailable(true);
      } catch {
        // 네트워크 오류는 다음 주기에 다시 확인
      }
    }

    check();
    const timer = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!updateAvailable) return;
    let lastInteraction = Date.now();
    const markActive = () => { lastInteraction = Date.now(); };

    const tryReload = () => {
      if (hasPendingSkuWrites() || recentlyAutoReloaded()) return;
      const hidden = document.visibilityState === 'hidden';
      const idle = Date.now() - lastInteraction > IDLE_RELOAD_MS && !isEditing();
      if (hidden || idle) autoReload();
    };

    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onVisibility = () => {
      clearTimeout(hideTimer);
      if (document.visibilityState === 'hidden') hideTimer = setTimeout(tryReload, 3000);
    };

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, markActive, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(tryReload, 30 * 1000);
    if (document.visibilityState === 'hidden') hideTimer = setTimeout(tryReload, 3000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, markActive));
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
      clearTimeout(hideTimer);
    };
  }, [updateAvailable]);

  return updateAvailable;
}
