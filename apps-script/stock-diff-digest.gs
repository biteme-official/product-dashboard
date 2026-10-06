/**
 * 원가 · 판매가 · 정가 확인 요청 (stock 시트 ≠ 대시보드) — price-confirm-digest.gs와 같은 프로젝트에 추가하는 파일
 * (listDocs_ · postSlack_ · notifyError_ · todayKst_ · md_ · esc_ 등은 price-confirm-digest.gs 함수를 같이 씀)
 *
 * 매주 월요일 10:30(KST) — 오픈 전(오픈일 > 오늘) SKU 중 stock 시트와 원가 · 판매가 · 정가가 다른 SKU를 #데이터팀에 보냄.
 *   - 매칭: stock I열 SKU명 = 대시보드 SKU명 (띄어쓰기 무시) · stock 미등록 SKU는 개수만 표시
 *   - 비교: stock K 원가 · L 판매가 · R 정가 ↔ 대시보드 원가 · 판매가 · 정가
 *           어느 한쪽이 0 · 빈칸이면 그 항목은 비교 안 함 · 옵션별 값이 여러 개면 그중 하나와 같으면 같다고 봄
 *   - 앱에서 숨기는 SKU(CPO 비활성 상태 · CPO 오픈일 없음) 제외
 *
 * 처음 한 번: previewStockDiff → sendStockDiffTest → setupStockDiffTrigger
 * 지금 바로 채널로: sendStockDiffNow   (TEST_MODE · TEST_USER_ID · CHANNEL_ID 속성은 공용)
 */

const STOCK_SHEET_ID = '1SEePR_iLNhUy1ghRskkx6FTpEvJuRzUf-i3jku9RWio';
// 헤더 이름으로 열을 찾고, 없으면 지정한 열(I · K · L · R)을 씀
const STOCK_COLS = { name: ['SKU명', 9], cost: ['원가', 11], price: ['판매가', 12], reg: ['정가', 18] };
const DIFF_FIELDS = [['cost', '원가', 'cost'], ['price', '판매가', 'price'], ['reg', '정가', 'regularPrice']];

// ───────────────────────── 실행 함수 ─────────────────────────

/** 트리거용 — 월요일에만, 같은 날 한 번만 */
function weeklyStockDiffDigest() {
  const today = todayKst_();
  if (dowOf_(today) !== 1) return;
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_SENT_STOCK') === today) return;
  try {
    const msg = buildStockDiff_(collectStockDiff_(today), today);
    const testMode = String(props.getProperty('TEST_MODE')).toLowerCase() === 'true';
    postSlack_(testMode ? props.getProperty('TEST_USER_ID') : props.getProperty('CHANNEL_ID'), msg);
    props.setProperty('LAST_SENT_STOCK', today);
  } catch (err) {
    notifyError_(err);
    throw err;
  }
}

function previewStockDiff() {
  const today = todayKst_();
  const r = collectStockDiff_(today);
  console.log(`오픈 전 ${r.total}개 · stock 등록 ${r.matched}개 · 차이 ${r.diffs.length}개 · 미등록 ${r.unmatched}개`);
  console.log(buildStockDiff_(r, today).blocks.filter((b) => b.text).map((b) => b.text.text).join('\n────\n'));
}

function sendStockDiffTest() {
  const today = todayKst_();
  postSlack_(PropertiesService.getScriptProperties().getProperty('TEST_USER_ID'), buildStockDiff_(collectStockDiff_(today), today));
}

function sendStockDiffNow() {
  const today = todayKst_();
  postSlack_(PropertiesService.getScriptProperties().getProperty('CHANNEL_ID'), buildStockDiff_(collectStockDiff_(today), today));
}

/** 매주 월요일 10:30 트리거 등록 (이 함수의 트리거만 다시 만듦 · 가격 확정 알림 트리거는 그대로) */
function setupStockDiffTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'weeklyStockDiffDigest')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyStockDiffDigest').timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(10).nearMinute(30).everyWeeks(1).create();
  console.log('트리거 등록: 매주 월요일 10:30');
}

// ───────────────────────── 비교 ─────────────────────────

function collectStockDiff_(today) {
  const stock = readStock_();
  const skus = listDocs_(PRODUCT, 'skus', ['skuName', 'brand', 'category', 'releaseDate', 'cost', 'price', 'regularPrice']);
  const cpo = {};
  listDocs_(CPO, 'projects', ['status', 'releaseDate']).forEach((p) => { cpo[p.id] = p; });

  const upcoming = skus.filter((s) => {
    const p = cpo[s.id];
    if (p && (CPO_VISIBLE.indexOf(p.status) < 0 || !p.releaseDate)) return false;
    return (s.releaseDate || '') > today;
  });
  let matched = 0;
  const diffs = [];
  upcoming.forEach((s) => {
    const g = stock[normName_(s.skuName)];
    if (!g) return;
    matched++;
    const items = [];
    DIFF_FIELDS.forEach(([k, label, dashKey]) => {
      const mine = Number(s[dashKey]) || 0;
      const theirs = g[k];
      if (!mine || theirs.length === 0 || theirs.indexOf(mine) >= 0) return;
      items.push({ label, stock: theirs, dash: mine });
    });
    if (items.length) diffs.push({ sku: s, items, rows: g.rows });
  });
  const rank = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? arr.length : i; };
  diffs.sort((a, b) =>
    rank(BRAND_ORDER, a.sku.brand) - rank(BRAND_ORDER, b.sku.brand)
    || a.sku.releaseDate.localeCompare(b.sku.releaseDate)
    || rank(CATEGORY_ORDER, a.sku.category) - rank(CATEGORY_ORDER, b.sku.category)
    || String(a.sku.skuName).localeCompare(String(b.sku.skuName)));
  return { total: upcoming.length, matched, unmatched: upcoming.length - matched, diffs };
}

/** stock 시트 → { 정규화 SKU명: { cost: [..], price: [..], reg: [..], rows } } (0 · 빈칸은 빼고 옵션별 서로 다른 값만) */
function readStock_() {
  const ss = SpreadsheetApp.openById(STOCK_SHEET_ID);
  const sh = ss.getSheets().filter((x) => x.getName().toLowerCase() === 'stock')[0];
  if (!sh) throw new Error('stock 탭을 찾지 못함');
  const values = sh.getDataRange().getValues();
  const head = values[0].map((h) => String(h).trim());
  const col = {};
  Object.keys(STOCK_COLS).forEach((k) => {
    const i = head.indexOf(STOCK_COLS[k][0]);
    col[k] = i >= 0 ? i : STOCK_COLS[k][1] - 1;
  });
  const out = {};
  values.slice(1).forEach((r) => {
    const key = normName_(r[col.name]);
    if (!key) return;
    const g = out[key] || (out[key] = { cost: [], price: [], reg: [], rows: 0 });
    g.rows++;
    ['cost', 'price', 'reg'].forEach((k) => {
      const n = toNum_(r[col[k]]);
      if (n > 0 && g[k].indexOf(n) < 0) g[k].push(n);
    });
  });
  return out;
}

// ───────────────────────── 메시지 ─────────────────────────

function buildStockDiff_(r, today) {
  const foot = `stock 미등록 ${r.unmatched}개 · 0원 · 빈칸은 비교 제외`;
  if (r.diffs.length === 0) {
    const text = `✅ 오픈 전 SKU · stock과 원가 · 판매가 · 정가 모두 일치 (stock 등록 ${r.matched}개 · ${foot})`;
    return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }] };
  }
  const now = Utilities.formatDate(new Date(), TZ, 'HH:mm');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '🔍 원가 · 판매가 · 정가 확인 요청 · stock ≠ 대시보드', emoji: true } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `기준 ${md_(today)} ${now} · 오픈 전 SKU 중 stock 등록 ${r.matched}개 · 차이 *${r.diffs.length}개*` }] },
  ];
  groupBy_(r.diffs, (d) => d.sku.brand || '브랜드 미정').forEach(([brand, list]) => {
    blocks.push({ type: 'divider' });
    const parts = [`*🏷️ ${esc_(brand)}* · ${list.length}개`];
    list.forEach((d) => parts.push(diffLine_(d)));
    chunk_(parts, 2900).forEach((text) => blocks.push({ type: 'section', text: { type: 'mrkdwn', text } }));
  });
  blocks.push({ type: 'divider' });
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `👉 맞는 값으로 *stock* 또는 *대시보드(CPO)* 수정 부탁드려요 · <${DASHBOARD_URL}|대시보드 열기>` } });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `${foot} · 옵션별 값이 여러 개면 그중 하나와 같으면 일치로 봄` }] });
  if (blocks.length > 50) blocks.splice(47, blocks.length - 49, { type: 'context', elements: [{ type: 'mrkdwn', text: '… 목록이 길어 일부 생략' }] });
  return { text: `🔍 원가 · 판매가 · 정가 확인 요청 · stock과 다른 오픈 전 SKU ${r.diffs.length}개`, blocks };
}

function diffLine_(d) {
  const s = d.sku;
  const name = esc_(String(s.skuName || '').trim() || '(SKU명 미입력)');
  const head = `• *${name}*   ${s.category ? `[${esc_(s.category)}] ` : ''}${md_(s.releaseDate)} 오픈`;
  const lines = d.items.map((x) => `      ${x.label}  stock ${x.stock.map(won_).join(' / ')} · 대시보드 *${won_(x.dash)}*`);
  return [head].concat(lines).join('\n');
}

function normName_(s) { return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase(); }
function toNum_(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v == null ? '' : v).replace(/[,\s원]/g, ''));
  return isNaN(n) ? 0 : n;
}
