/**
 * 입고 예정 알림 (제품 발주 관리 시트) — price-confirm-digest.gs와 같은 프로젝트에 추가하는 파일
 * (postSlack_ · isFirstBusinessDayOfWeek_ · todayKst_ · addDays_ · dowOf_ · md_ · esc_ · groupBy_ · chunk_ 는 price-confirm-digest.gs 함수를 같이 씀)
 *
 * 매주 첫 영업일 11시(KST, 보통 월요일 · 월요일이 공휴일이면 화요일 등 — 주말·공휴일엔 안 보냄) — 탭별로 채널에 보냄
 *   3.발주입고로그        → #상품기획팀 · 이번주 · -2주
 *   3-1.발주입고로그_패션 → #fashion · 이번주 · -1주 · -3주
 *
 * 대상: L열 예상입고일이 탭별로 정한 주간(월~일)인 행 · Q열 입고확인 Y 제외
 * 표시: 입고일 + 발주처로 묶어 한 줄 — 첫 상품명(시트 순서) 외 N건(행 단위) · K열 입고수량 합계
 *
 * 처음 한 번: previewInbound → sendInboundTest → setupInboundTrigger
 * 지금 바로 채널로: sendInboundNow   (TEST_MODE · TEST_USER_ID 속성은 공용 · LAST_SENT_INBOUND_* 는 자동)
 */

const INBOUND_SHEET_ID = '1SEePR_iLNhUy1ghRskkx6FTpEvJuRzUf-i3jku9RWio';
const INBOUND_TABS = [
  { key: 'MAIN', sheet: '3.발주입고로그', gid: '1400585731', channel: 'C02CJNZQUJE', weeks: [0, 2] }, // #상품기획팀
  { key: 'FASHION', sheet: '3-1.발주입고로그_패션', gid: '477136169', channel: 'C04H7GW1QBE', weeks: [0, 1, 3] }, // #fashion
];
// 입고까지 남은 주 수 → 표시 (탭별 weeks에 쓰는 값)
const INBOUND_WEEK_LABELS = {
  0: ['🔴', '이번주'],
  1: ['🟡', '-1주'],
  2: ['🟡', '-2주'],
  3: ['🟢', '-3주'],
};
// 시트 열(1부터) · 헤더 글자로 열이 밀리지 않았는지 확인함 — 안 맞으면 발송하지 않고 오류 DM
const INBOUND_COLS = {
  vendor: [3, '발주처'],
  name: [5, '상품명'],
  qty: [11, '입고수량'],
  date: [12, '예상입고일'],
  confirmed: [17, '입고확인'],
};

// ───────────────────────── 실행 함수 ─────────────────────────

/** 트리거용 — 그 주 첫 영업일에만, 탭별로 같은 날 한 번만 (한 탭이 실패해도 다른 탭은 보냄) */
function weeklyInboundDigest() {
  const today = todayKst_();
  if (!isFirstBusinessDayOfWeek_(today)) return;
  const props = PropertiesService.getScriptProperties();
  const testMode = String(props.getProperty('TEST_MODE')).toLowerCase() === 'true';
  let firstError = null;
  INBOUND_TABS.forEach((tab) => {
    const sentKey = `LAST_SENT_INBOUND_${tab.key}`;
    if (props.getProperty(sentKey) === today) return;
    try {
      postSlack_(testMode ? props.getProperty('TEST_USER_ID') : tab.channel, buildInbound_(tab, collectInbound_(tab, today), today));
      props.setProperty(sentKey, today);
    } catch (err) {
      firstError = firstError || err;
      notifyInboundError_(tab, err);
    }
  });
  if (firstError) throw firstError;
}

function previewInbound() {
  const today = todayKst_();
  INBOUND_TABS.forEach((tab) => {
    const msg = buildInbound_(tab, collectInbound_(tab, today), today);
    console.log(`── ${tab.sheet} → ${tab.channel} ──\n` + msg.blocks.map(inboundBlockText_).join('\n'));
  });
}

/** 두 탭 모두 TEST_USER_ID DM으로 (TEST_MODE와 무관) */
function sendInboundTest() {
  const today = todayKst_();
  const uid = PropertiesService.getScriptProperties().getProperty('TEST_USER_ID');
  INBOUND_TABS.forEach((tab) => postSlack_(uid, buildInbound_(tab, collectInbound_(tab, today), today)));
}

function sendInboundNow() {
  const today = todayKst_();
  INBOUND_TABS.forEach((tab) => postSlack_(tab.channel, buildInbound_(tab, collectInbound_(tab, today), today)));
}

/** 매일 11시 트리거 등록 — 그 주 첫 영업일인지는 weeklyInboundDigest 가 판단 (이 함수의 트리거만 다시 만듦) */
function setupInboundTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'weeklyInboundDigest')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyInboundDigest').timeBased()
    .everyDays(1).atHour(11).nearMinute(0).create();
  console.log('트리거 등록: 매일 11시 (그 주 첫 영업일에만 보냄)');
}

// ───────────────────────── 시트 읽기 · 집계 ─────────────────────────

/** 주간별 [{ offset, label, from, to, total, groups: [{ date, vendor, first, count, qty }] }] */
function collectInbound_(tab, today) {
  const rows = readInboundRows_(tab);
  const monday = addDays_(today, 1 - dowOf_(today));
  return tab.weeks.map((offset) => {
    const from = addDays_(monday, offset * 7);
    const to = addDays_(from, 6);
    const inWeek = rows
      .filter((r) => r.date >= from && r.date <= to)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.row - b.row));
    const groups = groupBy_(inWeek, (r) => `${r.date}|${r.vendor}`).map(([, list]) => ({
      date: list[0].date,
      vendor: list[0].vendor,
      first: list[0].name,
      count: list.length,
      qty: list.reduce((sum, r) => sum + r.qty, 0),
    }));
    const [icon, name] = INBOUND_WEEK_LABELS[offset];
    return { name, label: `${icon} ${name}`, from, to, total: groups.reduce((sum, g) => sum + g.qty, 0), groups };
  });
}

function readInboundRows_(tab) {
  const ss = SpreadsheetApp.openById(INBOUND_SHEET_ID);
  const sh = ss.getSheetByName(tab.sheet);
  if (!sh) throw new Error(`${tab.sheet} 탭을 찾지 못함`);
  const values = sh.getDataRange().getValues();
  const headerIdx = values.slice(0, 5).findIndex((row) => String(row[INBOUND_COLS.date[0] - 1]).includes(INBOUND_COLS.date[1]));
  if (headerIdx < 0) throw new Error(`${tab.sheet} 헤더 확인 필요: L열 「${INBOUND_COLS.date[1]}」 없음`);
  Object.keys(INBOUND_COLS).forEach((k) => {
    const [col, word] = INBOUND_COLS[k];
    if (!String(values[headerIdx][col - 1]).includes(word)) throw new Error(`${tab.sheet} 헤더 확인 필요: ${col}번째 열이 「${word}」 아님`);
  });
  const sheetTz = ss.getSpreadsheetTimeZone();
  const at = (row, k) => row[INBOUND_COLS[k][0] - 1];
  const out = [];
  values.slice(headerIdx + 1).forEach((row, i) => {
    const date = inboundDate_(at(row, 'date'), sheetTz);
    if (!date) return; // 입고일 없는 행 · 하단 메모성 행
    if (String(at(row, 'confirmed')).trim().toUpperCase() === 'Y') return;
    out.push({
      row: i,
      date,
      vendor: String(at(row, 'vendor')).trim() || '발주처 미정',
      name: String(at(row, 'name')).trim() || '상품명 없음',
      qty: inboundQty_(at(row, 'qty')),
    });
  });
  return out;
}

/** 날짜 셀 → yyyy-MM-dd · 글자로 입력된 26-11-11도 인식 · 그 외엔 null */
function inboundDate_(v, sheetTz) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v, sheetTz, 'yyyy-MM-dd');
  const m = String(v).trim().match(/^(\d{2})-(\d{2})-(\d{2})$/);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
}

function inboundQty_(v) {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return isFinite(n) ? n : 0;
}

// ───────────────────────── 메시지 ─────────────────────────

function buildInbound_(tab, weeks, today) {
  const link = `<https://docs.google.com/spreadsheets/d/${INBOUND_SHEET_ID}/edit?gid=${tab.gid}#gid=${tab.gid}|발주시트 바로가기>`;
  const monday = addDays_(today, 1 - dowOf_(today));
  const total = weeks.reduce((sum, w) => sum + w.total, 0);
  const title = `📦 입고 예정 알림 · ${md_(monday)} 주간`;
  if (weeks.every((w) => w.groups.length === 0)) {
    const text = `${title} · ${weeks.map((w) => w.name).join(' · ')} 입고 예정 없음`;
    return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `${text}\n*${link}*` } }] };
  }
  const now = Utilities.formatDate(new Date(), TZ, 'HH:mm');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `기준 ${md_(today)} ${now} · ${esc_(tab.sheet)} · 예상입고일 기준 · 입고확인 Y 제외` }] },
  ];
  weeks.forEach((w) => {
    blocks.push({ type: 'divider' });
    const range = `${md_(w.from)} ~ ${md_(w.to)}`;
    if (w.groups.length === 0) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${w.label}* · 입고 예정 없음` } });
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: range }] });
      return;
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${w.label}* · 총 *${w.total.toLocaleString('ko-KR')}개*` } });
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: range }] });
    chunk_(w.groups.map(inboundLine_), 2900).forEach((text) => blocks.push({ type: 'section', text: { type: 'mrkdwn', text } }));
  });
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${link}*` } });
  if (blocks.length > 50) blocks.splice(47, blocks.length - 49, { type: 'context', elements: [{ type: 'mrkdwn', text: '… 목록이 길어 일부 생략 · 시트에서 확인' }] });
  return { text: `${title} · 총 ${total.toLocaleString('ko-KR')}개`, blocks };
}

function inboundLine_(g) {
  const more = g.count > 1 ? ` 외 ${g.count - 1}건` : '';
  return `*${inboundYmd_(g.date)}*  *${esc_(g.vendor)}*  ${esc_(g.first)}${more} · *${g.qty.toLocaleString('ko-KR')}개*`;
}

/** 26/11/11(수) */
function inboundYmd_(ymd) {
  const p = ymd.split('-');
  return `${p[0].slice(2)}/${p[1]}/${p[2]}(${DOW[parse_(ymd).getUTCDay()]})`;
}

function inboundBlockText_(b) {
  if (b.type === 'divider') return '────';
  if (b.type === 'context') return '  ' + b.elements.map((e) => e.text).join(' ');
  return b.text.text;
}

/** 실패 시 테스트 사용자에게 DM (실패해도 무시 — 구글 실패 메일은 별도로 감) */
function notifyInboundError_(tab, err) {
  try {
    const uid = PropertiesService.getScriptProperties().getProperty('TEST_USER_ID');
    if (uid) postSlack_(uid, { text: `⚠️ 입고 예정 알림 실패 · ${tab.sheet} · ${String(err && err.message || err).slice(0, 500)}`, blocks: undefined });
  } catch (e) { console.error(e); }
}
