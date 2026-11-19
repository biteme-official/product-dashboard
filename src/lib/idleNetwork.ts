import { disableNetwork, enableNetwork, waitForPendingWrites, type Firestore } from 'firebase/firestore';

// 오래 조작이 없는 탭은 CPO Firestore(cpoFsdb) 서버 연결을 끊는다 — CPO 무료 한도(하루 읽기 5만) 절약용.
// cpo-dashboard의 src/lib/idleNetwork.ts와 같은 코드(수정 시 양쪽 같이).
// Product 자체 Firestore(fsdb)에는 적용하지 않는다.
//
// 배경(2026-11-13 확인): CPO에 브라우저 캐시 적용 후에도 밤 9시~오전 10시에 읽기 약 53만 건.
// 밤새 켜둔 탭(CPO 앱 구독 12개, Product는 CPO projects·users 2개)이 연결이 끊겼다 다시 붙을 때, 끊긴 지 30분이 넘었으면
// 구독 중인 컬렉션 전체를 새로 읽은 것으로 과금된다(캐시가 있어도 동일).
//
// 동작:
// - 마지막 조작(클릭·키 입력·마우스 휠·터치·탭 다시 보기) 후 15분이 지나면 disableNetwork.
//   끊긴 동안 화면은 캐시 값 그대로, 쓰기는 대기열에 쌓인다.
//   cpoSync의 projects 구독은 서버 확인 스냅샷만 반영하므로 끊긴 동안 SKU 자동 저장은 돌지 않는다.
// - 다시 조작하면 바로 enableNetwork — 그 사이 바뀐 내용을 받아 화면이 최신으로 돌아온다.
// - 여러 탭 캐시(persistentMultipleTabManager)에서도 탭마다 따로 적용되고, 끊긴 탭은 연결을
//   다른 활성 탭에 넘긴다.
// - 저장 중인 쓰기가 있으면 이번에는 끊지 않고 다음 확인 때 다시 본다.
//
// 테스트용: localStorage 'idleNetworkMs'에 밀리초를 넣으면 15분 대신 그 값을 쓴다(예: 60000).

const DEFAULT_IDLE_MS = 15 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;
const PENDING_WRITES_TIMEOUT_MS = 5 * 1000;
// 사람이 직접 한 조작만 인정한다. pointermove·scroll은 뺐다(2026-11-19):
// 11/18 밤 쓰기 0건인데 읽기 약 69만 건, 연결 7~10개가 밤새 유지됨 — 마우스 미세 흔들림·화면 자동 스크롤처럼
// 사람이 없는 상태에서도 생기는 이벤트가 탭을 깨워 다시 연결(=구독 전체 재읽기)시킨 것으로 의심.
// 그래서 마우스를 올리기만 해서는 다시 연결되지 않는다 — 클릭·휠·키 입력을 해야 최신 데이터로 돌아온다.
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

function idleMs(): number {
  try {
    const v = Number(localStorage.getItem('idleNetworkMs'));
    if (Number.isFinite(v) && v >= 10 * 1000) return v;
  } catch { /* 저장소 접근 불가 — 기본값 */ }
  return DEFAULT_IDLE_MS;
}

/** 저장 대기 중인 쓰기가 제한 시간 안에 서버에 반영되면 true */
async function writesSettled(db: Firestore): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => { timer = setTimeout(() => resolve(false), PENDING_WRITES_TIMEOUT_MS); });
  try {
    return await Promise.race([waitForPendingWrites(db).then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 앱 시작 시 한 번 호출. label은 콘솔 로그 구분용. */
export function startIdleNetworkGuard(db: Firestore, label: string): void {
  let lastActivity = Date.now();
  let offline = false;
  // enable/disable 호출이 겹치지 않도록 순서대로 실행
  let queue: Promise<void> = Promise.resolve();
  const run = (fn: () => Promise<void>) => { queue = queue.then(fn).catch((err) => console.error(`[idleNetwork:${label}]`, err)); };

  const goOffline = () => run(async () => {
    if (offline || Date.now() - lastActivity < idleMs()) return;
    if (!(await writesSettled(db))) return; // 저장 중 — 다음 확인 때 다시
    if (Date.now() - lastActivity < idleMs()) return; // 기다리는 사이 다시 조작함
    await disableNetwork(db);
    offline = true;
    const ms = idleMs();
    const span = ms >= 60 * 1000 ? `${Math.round(ms / 60000)}분` : `${Math.round(ms / 1000)}초`;
    console.info(`[idleNetwork:${label}] ${span} 동안 조작이 없어 서버 연결을 끊음`);
  });

  const goOnline = () => run(async () => {
    if (!offline) return;
    await enableNetwork(db);
    offline = false;
    console.info(`[idleNetwork:${label}] 조작 감지 — 서버 연결 다시 시작`);
  });

  const markActive = () => {
    lastActivity = Date.now();
    if (offline) goOnline();
  };

  ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActive, { passive: true, capture: true }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markActive();
  });
  setInterval(() => {
    if (!offline && Date.now() - lastActivity >= idleMs()) goOffline();
  }, CHECK_INTERVAL_MS);
}
