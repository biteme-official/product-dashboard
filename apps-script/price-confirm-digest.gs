/**
 * 가격 확정 요청 알림 (Apps Script · 독립 프로젝트)
 *
 * 매주 월요일 15시(KST) — 오늘 ~ 3주 뒤 그 주 금요일 사이 오픈 예정이면서 가격 확정이 안 된 SKU를
 * 오픈일 → 브랜드로 묶고 카테고리(LIST VIEW 순서) 순으로 정렬해 pb_bot으로 #데이터팀에 보낸다.
 *
 * 대상: Product 대시보드 skus 컬렉션 (휴지통 SKU는 이미 빠져 있음)
 *   - isPriceConfirmed가 true가 아닌 SKU (주력 SKU 포함 · 개편 전 확정도 확정으로 봄)
 *   - 앱에서 숨기는 SKU 제외: CPO 프로젝트가 Holding · Cancel 등 비활성 상태이거나 CPO 오픈일 없음
 *   - 오픈일이 지난 SKU는 무시
 *
 * 스크립트 속성 (프로젝트 설정 › 스크립트 속성)
 *   SLACK_BOT_TOKEN  pb_bot xoxb- 토큰
 *   CHANNEL_ID       C06EMNUF5MY (#데이터팀)
 *   TEST_USER_ID     테스트 DM 받을 슬랙 사용자 ID (예: U02C3QYLRTR)
 *   TEST_MODE        true면 채널 대신 TEST_USER_ID로 보냄
 *
 * 처음 한 번: previewDigest → sendTest → setupWeeklyTrigger → TEST_MODE=false
 * 지금 바로 채널로 보내기: sendNow
 * 프로젝트 설정의 시간대는 반드시 (GMT+09:00) 서울.
 *
 * 원본: product-dashboard 레포 apps-script/price-confirm-digest.gs (편집기에 붙여넣어 사용)
 */

const PRODUCT = { apiKey: 'AIzaSyBHFoGOyILOzMaaH0AkFriZEe6p5sbWPMY', projectId: 'md-dashboard-6fd45' };
const CPO = { apiKey: 'AIzaSyDojxF2ELIqa4DzuBdip2065xsbuFcgzQg', projectId: 'cpo-dashboard-34fd4' };
const DASHBOARD_URL = 'https://product-dashboard-delta-taupe.vercel.app';
const TZ = 'Asia/Seoul';

// 앱 LIST VIEW와 같은 순서
const BRAND_ORDER = ['바잇미', 'SSFW', '그외'];
const CATEGORY_ORDER = ['식품', '장난감', '용품', '잡화', '의류'];
// src/types/cpo.ts CPO_VISIBLE_STATUSES와 같게 유지
const CPO_VISIBLE = ['기획/아이디어', '시안/샘플링', '제작 시작', '상세 작성', '사진 촬영', '상세 작업중', '상세 완료', '오픈/완료'];
const DOW = '일월화수목금토';

// ───────────────────────── 실행 함수 ─────────────────────────

/** 트리거용 — 월요일에만, 같은 날 한 번만 보냄 */
function weeklyPriceConfirmDigest() {
  const today = todayKst_();
  if (dowOf_(today) !== 1) return;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_SENT') === today) return;
  try {
    const msg = buildDigest_(collectTargets_(today), today);
    const testMode = String(props.getProperty('TEST_MODE')).toLowerCase() === 'true';
    postSlack_(testMode ? props.getProperty('TEST_USER_ID') : props.getProperty('CHANNEL_ID'), msg);
    props.setProperty('LAST_SENT', today);
  } catch (err) {
    notifyError_(err);
    throw err;
  }
}

/** 보내지 않고 로그로만 확인 (실행 로그에 메시지 · 대상 수) */
function previewDigest() {
  const today = todayKst_();
  const t = collectTargets_(today);
  const msg = buildDigest_(t, today);
  console.log(`대상 ${t.skus.length}개 · 오픈 ${t.from} ~ ${t.to}`);
  console.log(msg.text);
  console.log(JSON.stringify(msg.blocks, null, 1));
}

/** TEST_USER_ID에게 지금 바로 보내보기 (요일 · 중복 체크 없음) */
function sendTest() {
  const today = todayKst_();
  postSlack_(PropertiesService.getScriptProperties().getProperty('TEST_USER_ID'), buildDigest_(collectTargets_(today), today));
}

/** 지금 바로 #데이터팀(CHANNEL_ID)으로 보내기 (요일 · 중복 체크 · TEST_MODE 무시) */
function sendNow() {
  const today = todayKst_();
  postSlack_(PropertiesService.getScriptProperties().getProperty('CHANNEL_ID'), buildDigest_(collectTargets_(today), today));
}

/** 매주 월요일 15시 트리거 등록 (이 함수의 트리거만 다시 만듦) */
function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'weeklyPriceConfirmDigest')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyPriceConfirmDigest').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(15).nearMinute(0).everyWeeks(1).create();
  console.log('트리거 등록: 매주 월요일 15시');
}

// ───────────────────────── 대상 SKU ─────────────────────────

function collectTargets_(today) {
  const from = today;
  const to = addDays_(addDays_(today, 1 - dowOf_(today)), 21 + 4); // 이번 주 월요일 + 3주 → 그 주 금요일
  const skus = listDocs_(PRODUCT, 'skus', [
    'skuName', 'brand', 'category', 'releaseDate', 'price', 'regularPrice', 'isPriceConfirmed', 'coreSku', 'coreMainChannel', 'coreMainChannelEtc',
  ]);
  const cpo = {};
  listDocs_(CPO, 'projects', ['status', 'releaseDate']).forEach((p) => { cpo[p.id] = p; });

  const targets = skus.filter((s) => {
    const p = cpo[s.id];
    if (p && (CPO_VISIBLE.indexOf(p.status) < 0 || !p.releaseDate)) return false; // 앱에서 숨기는 SKU
    const d = s.releaseDate || '';
    return d >= from && d <= to && s.isPriceConfirmed !== true;
  });
  const rank = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? arr.length : i; };
  targets.sort((a, b) =>
    a.releaseDate.localeCompare(b.releaseDate)
    || rank(BRAND_ORDER, a.brand) - rank(BRAND_ORDER, b.brand)
    || rank(CATEGORY_ORDER, a.category) - rank(CATEGORY_ORDER, b.category)
    || String(a.skuName || '').localeCompare(String(b.skuName || '')));
  return { from, to, skus: targets };
}

// ───────────────────────── 메시지 ─────────────────────────

function buildDigest_(t, today) {
  const range = `${md_(t.from)} ~ ${md_(t.to)}`;
  if (t.skus.length === 0) {
    const text = `✅ 3주 내 오픈 예정 SKU · 가격 모두 확정 (오픈 ${range})`;
    return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
  }
  const now = Utilities.formatDate(new Date(), TZ, 'HH:mm');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '💰 가격 확정 요청 · 3주 내 오픈 예정 SKU', emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `기준 ${md_(today)} ${now} · 오픈 ${range} · 미확정 *${t.skus.length}개*` }] },
  ];
  groupBy_(t.skus, (s) => s.releaseDate).forEach(([date, list]) => {
    blocks.push({ type: 'divider' });
    const parts = [`*📅 ${md_(date)} 오픈* · ${list.length}개`];
    groupBy_(list, (s) => s.brand || '브랜드 미정').forEach(([brand, items]) => {
      parts.push(`\n*${esc_(brand)}*\n` + items.map(line_).join('\n'));
    });
    chunk_(parts, 2900).forEach((text) => blocks.push({ type: 'section', text: { type: 'mrkdwn', text } }));
  });
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `👉 *프로젝션 › 프라이싱*에서 확인 후 *[확정]* 부탁드려요 · <${DASHBOARD_URL}|대시보드 열기>` } });
  if (blocks.length > 50) blocks.splice(48, blocks.length - 49, { type: 'context', elements: [{ type: 'mrkdwn', text: '… 목록이 길어 일부 생략 · 대시보드에서 확인' }] });
  return { text: `💰 가격 확정 요청 · 3주 내 오픈 예정 미확정 SKU ${t.skus.length}개 (오픈 ${range})`, blocks };
}

function line_(s) {
  const core = s.coreSku
    ? `   ⭐ 주력${s.coreMainChannel ? ' · ' + esc_(s.coreMainChannel === '기타' ? (s.coreMainChannelEtc || '기타') : s.coreMainChannel) : ''}`
    : '';
  const cat = s.category ? `[${esc_(s.category)}] ` : '';
  return `• ${cat}*${esc_(String(s.skuName || '').trim() || '(SKU명 미입력)')}*${core}\n      정가 ${won_(s.regularPrice)} · 판매가 ${won_(s.price)}`;
}

// ───────────────────────── Firestore · Slack ─────────────────────────

/** 익명 로그인 토큰 (앱과 같은 방식 — Firestore 규칙 request.auth != null) */
function idToken_(cfg) {
  const res = UrlFetchApp.fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${cfg.apiKey}`, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ returnSecureToken: true }), muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  if (!body.idToken) throw new Error(`${cfg.projectId} 익명 로그인 실패: ${res.getContentText()}`);
  return body.idToken;
}

function listDocs_(cfg, collection, fields) {
  const token = idToken_(cfg);
  const mask = fields.map((f) => `mask.fieldPaths=${encodeURIComponent(f)}`).join('&');
  const out = [];
  let pageToken = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${collection}?pageSize=300&${mask}`
      + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = UrlFetchApp.fetch(url, { headers: { Authorization: `Bearer ${token}` }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error(`${cfg.projectId}/${collection} 읽기 실패 ${res.getResponseCode()}: ${res.getContentText().slice(0, 300)}`);
    const body = JSON.parse(res.getContentText());
    (body.documents || []).forEach((d) => {
      const o = { id: d.name.split('/').pop() };
      Object.keys(d.fields || {}).forEach((k) => { o[k] = val_(d.fields[k]); });
      out.push(o);
    });
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return out;
}

function val_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

function postSlack_(channel, msg) {
  const token = PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN');
  if (!token || !channel) throw new Error('SLACK_BOT_TOKEN · 채널 ID 스크립트 속성 확인');
  const res = UrlFetchApp.fetch('https://slack.com/api/chat.postMessage', {
    method: 'post', contentType: 'application/json; charset=utf-8', headers: { Authorization: `Bearer ${token}` },
    payload: JSON.stringify({ channel, text: msg.text, blocks: msg.blocks, unfurl_links: false }), muteHttpExceptions: true,
  });
  const body = JSON.parse(res.getContentText());
  if (!body.ok) throw new Error(`슬랙 전송 실패: ${body.error}`);
}

/** 실패 시 테스트 사용자에게 DM (실패해도 무시 — 구글 실패 메일은 별도로 감) */
function notifyError_(err) {
  try {
    const uid = PropertiesService.getScriptProperties().getProperty('TEST_USER_ID');
    if (uid) postSlack_(uid, { text: `⚠️ 가격 확정 요청 알림 실패 · ${String(err && err.message || err).slice(0, 500)}`, blocks: undefined });
  } catch (e) { console.error(e); }
}

// ───────────────────────── 날짜 · 포맷 ─────────────────────────

function todayKst_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function parse_(ymd) { const p = ymd.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function ymd_(d) { return d.toISOString().slice(0, 10); }
function addDays_(ymd, n) { const d = parse_(ymd); d.setUTCDate(d.getUTCDate() + n); return ymd_(d); }
/** 1 = 월 … 7 = 일 */
function dowOf_(ymd) { const w = parse_(ymd).getUTCDay(); return w === 0 ? 7 : w; }
function md_(ymd) { const d = parse_(ymd); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`; }
function won_(n) { return typeof n === 'number' && n > 0 ? n.toLocaleString('ko-KR') : '–'; }
/** 슬랙 mrkdwn 특수문자 */
function esc_(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*/g, '＊'); }
function groupBy_(arr, keyFn) {
  const m = [];
  arr.forEach((x) => { const k = keyFn(x); const g = m.find((e) => e[0] === k); if (g) g[1].push(x); else m.push([k, [x]]); });
  return m;
}
/** 섹션 글자 수 제한(3000)에 맞춰 묶음 단위로 나눔 */
function chunk_(parts, max) {
  const out = [];
  let cur = '';
  parts.forEach((p) => {
    if (cur && (cur + '\n' + p).length > max) { out.push(cur); cur = p.replace(/^\n/, ''); }
    else cur = cur ? cur + '\n' + p : p;
  });
  if (cur) out.push(cur);
  return out;
}
