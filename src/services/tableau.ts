/**
 * Tableau REST API 연동 – "출고데이터 MCP 연결용" 뷰 (SKU 토탈)에서
 * SKU별 월간 출고량을 가져와 대응 SKU 검색 자동완성에 활용합니다.
 */

const BASE = ((import.meta.env.VITE_TABLEAU_PROXY_ORIGIN as string | undefined) || '') + '/api/tableau';
const SITE_ID = 'e37a53a0-ec5f-43c5-8847-f84c92e5a44d';
const VIEW_ID = '8290e9a5-8596-499b-b45a-40a52f81611d';
// 채널별 출고 데이터 뷰 – .env.local 의 VITE_TABLEAU_CHANNEL_VIEW_ID 에 설정
const CHANNEL_VIEW_ID = (import.meta.env.VITE_TABLEAU_CHANNEL_VIEW_ID as string | undefined) || '';

export interface SkuShipmentInfo {
  name: string;
  annualShipment: number;  // 직전 12개월 총출고량
  monthlyShipment: number; // 직전 12개월 월평균
  latestYear: number;
  /** year → month(1~12) → qty */
  byYearMonth: Record<number, Record<number, number>>;
}

let authToken: string | null = null;
let authTokenExpiresAt = 0;          // PAT 토큰 만료 시각 (ms)
let authPromise: Promise<string> | null = null;
let shipmentCache: SkuShipmentInfo[] | null = null;
let shipmentCacheAt = 0;
let fetchPromise: Promise<SkuShipmentInfo[]> | null = null;

/** 캐시 유효 시간: 55분 (Tableau maxAge=60 보다 약간 짧게) */
const CACHE_TTL = 55 * 60 * 1000;
/** PAT 토큰 선제 만료 시간: 3.5시간 (Tableau 기본 4시간보다 30분 여유) */
const TOKEN_TTL = 210 * 60 * 1000;

/** fetch + AbortController 타임아웃 (기본 20초) */
async function fetchWithTimeout(url: string, opts: RequestInit, ms = 20_000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function getAuthToken(): Promise<string> {
  // 토큰이 유효하면 그대로 사용
  if (authToken && Date.now() < authTokenExpiresAt) return authToken;
  // 동시 요청이 있으면 그 Promise를 공유
  if (authPromise) return authPromise;
  // 만료된 토큰 제거
  authToken = null;
  authPromise = (async () => {
    try {
      const patName = import.meta.env.VITE_TABLEAU_PAT_NAME as string;
      const patSecret = import.meta.env.VITE_TABLEAU_PAT_SECRET as string;
      const res = await fetchWithTimeout(`${BASE}/api/3.21/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          credentials: {
            personalAccessTokenName: patName,
            personalAccessTokenSecret: patSecret,
            site: { contentUrl: 'biteme01' },
          },
        }),
      }, 15_000);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('[Tableau] 인증 실패', res.status, body.slice(0, 200));
        throw new Error(`Tableau auth failed: ${res.status}`);
      }
      const json = await res.json();
      authToken = json.credentials.token as string;
      authTokenExpiresAt = Date.now() + TOKEN_TTL;
      return authToken;
    } finally {
      // 성공/실패/네트워크에러 어떤 경우에도 반드시 해제 (아니면 rejected Promise를 재사용해 영구 불능)
      authPromise = null;
    }
  })();
  return authPromise;
}

function parseQty(raw: string): number {
  return parseInt(raw.replace(/,/g, ''), 10) || 0;
}

/** "3월" → 3 */
function monthLabelToNum(label: string): number {
  return parseInt(label.replace('월', ''), 10);
}

function parseLine(line: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { fields.push(cur); cur = ''; }
    else { cur += ch; }
  }
  fields.push(cur);
  return fields;
}

function parseCSV(csv: string): Array<{ skuName: string; monthNum: number; year: number; qty: number }> {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const rows: Array<{ skuName: string; monthNum: number; year: number; qty: number }> = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    if (fields.length < 4) continue;

    const year = parseInt(fields[2].trim(), 10);
    if (isNaN(year)) continue; // Tableau "All" 합계 행 스킵

    const monthNum = monthLabelToNum(fields[0].trim());
    if (isNaN(monthNum)) continue;

    rows.push({
      monthNum,
      skuName: fields[1].trim(),
      year,
      qty: parseQty(fields[3].trim()),
    });
  }
  return rows;
}

// 채널 차트·집계에서 제외할 채널
const EXCLUDED_CHANNELS = new Set(['협찬', '기타', 'CS', '공구', '팝업']);

// 가중 분배: { channel, ratio } 배열 → 수량을 비중대로 나눔
type WeightedTarget = { channel: string; ratio: number }[];

// Tableau 채널명 → 앱 채널명 정규화
// string: 1:1 매핑 / WeightedTarget: 비중 분할
const TABLEAU_CHANNEL_NORMALIZE: Record<string, string | WeightedTarget> = {
  'SSFW 스스':    '스스',
  'SSFW 자사몰':  '스스',
  '바잇미 자사몰': '자사몰',
  '사입':         '사입및페어',
  '페어':         '사입및페어',
  '해외':         [{ channel: '글로벌', ratio: 0.4 }, { channel: '일본', ratio: 0.6 }],
};

// 대시보드에서 사용하는 채널명 집합 (미지 채널 감지용)
import { CHANNELS as APP_CHANNELS } from '../types';

// ── 채널별 데이터 타입 ───────────────────────────────────────────────────
/** channel → year → month → qty */
export type ChannelByYearMonth = Record<string, Record<number, Record<number, number>>>;
/** skuName → ChannelByYearMonth */
export type ChannelDataMap = Map<string, ChannelByYearMonth>;

let channelDataCache: ChannelDataMap | null = null;
let channelCacheAt = 0;
let channelFetchPromise: Promise<ChannelDataMap> | null = null;

/**
 * 채널 뷰 CSV 파싱 – 헤더로 열 위치를 자동 감지.
 * 예상 열: 채널, SKU명, 연도, 월, 수량 (순서 무관)
 */
function parseChannelCSV(csv: string): Array<{ channel: string; skuName: string; year: number; monthNum: number; qty: number }> {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  const find = (...kws: string[]) =>
    headers.findIndex(h => kws.some(k => h.includes(k.toLowerCase())));

  const chIdx  = find('채널', 'channel');
  const skuIdx = find('sku', '상품명', '상품', '품목');
  const yrIdx  = find('연도', 'year', '년');
  const moIdx  = find('월', 'month');
  const qIdx   = find('수량', 'qty', '출고');

  if ([chIdx, skuIdx, yrIdx, moIdx, qIdx].some(i => i < 0)) return [];

  const maxIdx = Math.max(chIdx, skuIdx, yrIdx, moIdx, qIdx);
  const rows: Array<{ channel: string; skuName: string; year: number; monthNum: number; qty: number }> = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseLine(lines[i]);
    if (f.length <= maxIdx) continue;
    const year = parseInt(f[yrIdx].trim(), 10);
    if (isNaN(year)) continue;
    const monthNum = monthLabelToNum(f[moIdx].trim());
    if (isNaN(monthNum)) continue;
    const skuName = f[skuIdx].trim();
    if (!skuName || skuName.toLowerCase() === 'all') continue; // Tableau 합계 행 제외
    rows.push({ channel: f[chIdx].trim(), skuName, year, monthNum, qty: parseQty(f[qIdx].trim()) });
  }
  return rows;
}

async function loadChannelData(retry = true): Promise<ChannelDataMap> {
  const token = await getAuthToken();
  const res = await fetchWithTimeout(
    `${BASE}/api/3.21/sites/${SITE_ID}/views/${CHANNEL_VIEW_ID}/data?maxAge=60`,
    { headers: { 'X-Tableau-Auth': token } },
  );
  if (res.status === 401 && retry) {
    authToken = null;
    authTokenExpiresAt = 0;
    authPromise = null;
    return loadChannelData(false);
  }
  if ((res.status === 502 || res.status === 503 || res.status === 504) && retry) {
    await new Promise(r => setTimeout(r, 1500));
    return loadChannelData(false);
  }
  if (!res.ok) {
    console.error('[Tableau] 채널 데이터 로드 실패', res.status);
    throw new Error(`Channel data fetch failed: ${res.status}`);
  }

  const rows = parseChannelCSV(await res.text());
  const map: ChannelDataMap = new Map();
  const unknownChannels = new Set<string>();

  for (const r of rows) {
    const rule = TABLEAU_CHANNEL_NORMALIZE[r.channel];

    // 미지 채널 감지: 정규화 규칙도 없고, 앱 채널도 아니고, 제외 목록도 아닌 경우
    if (!rule && !APP_CHANNELS.includes(r.channel as typeof APP_CHANNELS[number]) && !EXCLUDED_CHANNELS.has(r.channel)) {
      unknownChannels.add(r.channel);
    }

    if (!map.has(r.skuName)) map.set(r.skuName, {});
    const byCh = map.get(r.skuName)!;

    if (Array.isArray(rule)) {
      // 가중 분배: 각 채널에 qty × ratio 적용
      for (const { channel, ratio } of rule) {
        if (!byCh[channel]) byCh[channel] = {};
        if (!byCh[channel][r.year]) byCh[channel][r.year] = {};
        byCh[channel][r.year][r.monthNum] = (byCh[channel][r.year][r.monthNum] ?? 0) + Math.round(r.qty * ratio);
      }
    } else {
      const ch = rule ?? r.channel;
      if (!byCh[ch]) byCh[ch] = {};
      if (!byCh[ch][r.year]) byCh[ch][r.year] = {};
      byCh[ch][r.year][r.monthNum] = (byCh[ch][r.year][r.monthNum] ?? 0) + r.qty;
    }
  }

  if (unknownChannels.size > 0) {
    console.warn('[Tableau] 미매핑 채널명 (TABLEAU_CHANNEL_NORMALIZE에 추가 필요):', [...unknownChannels].sort());
  }

  return map;
}

export async function fetchChannelShipments(): Promise<ChannelDataMap | null> {
  if (!CHANNEL_VIEW_ID) return null;
  if (channelDataCache && Date.now() - channelCacheAt < CACHE_TTL) return channelDataCache;
  if (channelFetchPromise) return channelFetchPromise;
  channelFetchPromise = loadChannelData()
    .then(data => { channelDataCache = data; channelCacheAt = Date.now(); channelFetchPromise = null; return data; })
    .catch(err => { channelFetchPromise = null; throw err; });
  return channelFetchPromise;
}

/** 기간에 따른 채널별 총 수량 반환 */
export function calcChannelPeriodQty(
  byCh: ChannelByYearMonth,
  mode: 'rolling12' | 'samePeriod',
  releaseMonth: number | null,
  releaseYear: number | null,
  overrideYear: number | null = null,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [channel, byYM] of Object.entries(byCh)) {
    if (EXCLUDED_CHANNELS.has(channel)) continue;
    let qty: number;
    if (overrideYear !== null) {
      // 연도 오버라이드: 해당 연도 전체 합계
      const data = byYM[overrideYear] ?? {};
      qty = Object.values(data).reduce((s, q) => s + q, 0);
    } else {
      qty = mode === 'samePeriod' && releaseMonth && releaseYear
        ? calcSamePeriod(byYM, releaseMonth, releaseYear).annual
        : calcRolling12(byYM).annual;
    }
    if (qty > 0) result[channel] = qty;
  }
  return result;
}

/** 복수 SKU의 채널 byYearMonth 합산 */
export function aggregateChannelByYearMonth(
  skuNames: string[],
  channelMap: ChannelDataMap,
): ChannelByYearMonth {
  const result: ChannelByYearMonth = {};
  for (const name of skuNames) {
    const byCh = channelMap.get(name);
    if (!byCh) continue;
    for (const [channel, byYM] of Object.entries(byCh)) {
      if (!result[channel]) result[channel] = {};
      for (const [ys, months] of Object.entries(byYM)) {
        const y = Number(ys);
        if (!result[channel][y]) result[channel][y] = {};
        for (const [ms, qty] of Object.entries(months)) {
          const mo = Number(ms);
          result[channel][y][mo] = (result[channel][y][mo] ?? 0) + (qty as number);
        }
      }
    }
  }
  return result;
}

// ── 직전 12개월 집계 ────────────────────────────────────────────────────
export function calcRolling12(
  byYearMonth: Record<number, Record<number, number>>,
): { annual: number; monthly: number } {
  const pairs: Array<{ year: number; month: number; qty: number }> = [];
  for (const yearStr of Object.keys(byYearMonth)) {
    const year = Number(yearStr);
    for (const monthStr of Object.keys(byYearMonth[year])) {
      pairs.push({ year, month: Number(monthStr), qty: byYearMonth[year][Number(monthStr)] });
    }
  }
  // 최신순 정렬 후 상위 12개
  pairs.sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month);
  const last12 = pairs.slice(0, 12);
  const annual = last12.reduce((s, p) => s + p.qty, 0);
  return { annual, monthly: last12.length > 0 ? Math.round(annual / last12.length) : 0 };
}

// ── 동기간(출시월 기준 8개월 시즌, 익년 wrap 포함) 집계 ──────────────────
// SKU 카드 STEP1~3의 getSkuMonths()와 동일한 8개월 윈도우를, 정확히 1년 전
// 동기간(윈도우 내 각 월을 releaseMonth 기준 wrap 여부에 따라 releaseYear-1 또는
// releaseYear에서 조회)과 비교한다.
export function calcSamePeriod(
  byYearMonth: Record<number, Record<number, number>>,
  releaseMonth: number,
  releaseYear: number,
): { annual: number; monthly: number; label: string } {
  const seasonMonths: { month: number; year: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const month = ((releaseMonth - 1 + i) % 12) + 1;
    const year = month >= releaseMonth ? releaseYear - 1 : releaseYear;
    seasonMonths.push({ month, year });
  }

  const annual = seasonMonths.reduce((s, { month, year }) => s + (byYearMonth[year]?.[month] ?? 0), 0);
  const monthsWithData = seasonMonths.filter(({ month, year }) => (byYearMonth[year]?.[month] ?? 0) > 0).length;
  const monthly = monthsWithData > 0 ? Math.round(annual / monthsWithData) : 0;

  const firstYear = releaseYear - 1;
  const wrapMonths = seasonMonths.filter(({ month }) => month < releaseMonth);
  const label = wrapMonths.length > 0
    ? `${firstYear}년 ${releaseMonth}월~${releaseYear}년 ${wrapMonths[wrapMonths.length - 1].month}월`
    : `${firstYear}년 ${releaseMonth}~12월`;
  return { annual, monthly, label };
}

async function loadSkuData(retry = true): Promise<SkuShipmentInfo[]> {
  const token = await getAuthToken();
  const res = await fetchWithTimeout(
    `${BASE}/api/3.21/sites/${SITE_ID}/views/${VIEW_ID}/data?maxAge=60`,
    { headers: { 'X-Tableau-Auth': token } },
  );
  if (res.status === 401 && retry) {
    authToken = null;
    authTokenExpiresAt = 0;
    authPromise = null;
    return loadSkuData(false);
  }
  if ((res.status === 502 || res.status === 503 || res.status === 504) && retry) {
    await new Promise(r => setTimeout(r, 1500));
    return loadSkuData(false);
  }
  if (!res.ok) {
    console.error('[Tableau] SKU 출고 데이터 로드 실패', res.status);
    throw new Error(`Tableau data fetch failed: ${res.status}`);
  }

  const rows = parseCSV(await res.text());

  // SKU명 → year → month → qty 집계
  const map = new Map<string, Record<number, Record<number, number>>>();
  for (const r of rows) {
    if (!map.has(r.skuName)) map.set(r.skuName, {});
    const byYear = map.get(r.skuName)!;
    if (!byYear[r.year]) byYear[r.year] = {};
    byYear[r.year][r.monthNum] = (byYear[r.year][r.monthNum] ?? 0) + r.qty;
  }

  const result: SkuShipmentInfo[] = [];
  for (const [name, byYearMonth] of map.entries()) {
    const years = Object.keys(byYearMonth).map(Number);
    const latestYear = Math.max(...years);
    const { annual, monthly } = calcRolling12(byYearMonth);
    result.push({ name, annualShipment: annual, monthlyShipment: monthly, latestYear, byYearMonth });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  return result;
}

export async function fetchSkuShipments(): Promise<SkuShipmentInfo[]> {
  if (shipmentCache && Date.now() - shipmentCacheAt < CACHE_TTL) return shipmentCache;
  if (fetchPromise) return fetchPromise;
  fetchPromise = loadSkuData()
    .then((data) => { shipmentCache = data; shipmentCacheAt = Date.now(); fetchPromise = null; return data; })
    .catch((err) => { fetchPromise = null; throw err; });
  return fetchPromise;
}

/** 여러 SKU의 byYearMonth 데이터를 월별 합산 */
export function aggregateByYearMonth(
  skus: SkuShipmentInfo[],
): Record<number, Record<number, number>> {
  const result: Record<number, Record<number, number>> = {};
  for (const sku of skus) {
    for (const [ys, months] of Object.entries(sku.byYearMonth)) {
      const y = Number(ys);
      if (!result[y]) result[y] = {};
      for (const [ms, qty] of Object.entries(months)) {
        const mo = Number(ms);
        result[y][mo] = (result[y][mo] ?? 0) + (qty as number);
      }
    }
  }
  return result;
}

export function searchSkus(allData: SkuShipmentInfo[], query: string): SkuShipmentInfo[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return allData.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 10);
}

// ── 팀카테 변동비 데이터 ─────────────────────────────────────────────────────
const TEAM_CATE_PROFIT_VIEW_ID  = '99a72e5a-2421-48d1-a83e-e664346b1447'; // 팀카테 공헌이익
const TEAM_CATE_REVENUE_VIEW_ID = '6252f239-44f3-404f-90da-663996e6b1e6'; // 팀카테 순매출,원가

export const CATEGORY_TO_TABLEAU: Record<string, string> = {
  '의류': '의류/잡화',
  '잡화': '의류/잡화',
  '식품': '영양제/식품',
  '장난감': '장난감',
  '용품': '용품',
};

export const CHANNEL_TO_TABLEAU: Record<string, string> = {
  '자사몰': '바잇미 자사몰',
  '스스': '스스',
  '쿠팡': '쿠팡',
  'B2B': 'B2B',
  '사입및페어': '그외',
  '위탁': '그외',
  '글로벌': '해외',
  '일본': '해외',
};

interface TeamCateAgg { revenue: number; cost: number; contribution: number; }
/** key: `채널ROI용|팀구분카테|year|month` */
export type TeamCateMap = Map<string, TeamCateAgg>;

let teamCateCache: TeamCateMap | null = null;
let teamCateCacheAt = 0;
let teamCateFetchPromise: Promise<TeamCateMap> | null = null;

function tcKey(ch: string, cate: string, year: number, month: number): string {
  return `${ch}|${cate}|${year}|${month}`;
}

function parseMonthStr(s: string): number { return parseInt(s.replace('월', ''), 10); }
function parseNumStr(s: string): number { return parseFloat(s.replace(/,/g, '')) || 0; }

/** sheet0: Day of day,Month of day,Year of day,채널ROI용,팀 구분카테,sku별 공헌이익 */
function parseProfitCSV(csv: string, map: TeamCateMap): void {
  const lines = csv.trim().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const f = parseLine(lines[i]);
    if (f.length < 6) continue;
    const month = parseMonthStr(f[1].trim());
    const year  = parseInt(f[2].trim(), 10);
    const ch    = f[3].trim();
    const cate  = f[4].trim();
    if (isNaN(month) || isNaN(year) || !ch || ch === 'All' || !cate) continue;
    const contribution = parseNumStr(f[5].trim());
    const k = tcKey(ch, cate, year, month);
    const e = map.get(k);
    if (e) { e.contribution += contribution; }
    else   { map.set(k, { revenue: 0, cost: 0, contribution }); }
  }
}

/** sheet1: Day of day,Measure Names,Month of day,Year of day,채널ROI용,팀 구분카테,Measure Values */
function parseRevenueCostCSV(csv: string, map: TeamCateMap): void {
  const lines = csv.trim().split('\n');
  for (let i = 1; i < lines.length; i++) {
    const f = parseLine(lines[i]);
    if (f.length < 7) continue;
    const measure = f[1].trim();
    const month   = parseMonthStr(f[2].trim());
    const year    = parseInt(f[3].trim(), 10);
    const ch      = f[4].trim();
    const cate    = f[5].trim();
    if (isNaN(month) || isNaN(year) || !ch || ch === 'All' || !cate) continue;
    const value = parseNumStr(f[6].trim());
    const k = tcKey(ch, cate, year, month);
    if (!map.has(k)) map.set(k, { revenue: 0, cost: 0, contribution: 0 });
    const e = map.get(k)!;
    if (measure === '순매출')   e.revenue += value;
    if (measure === '매출원가') e.cost    += value;
  }
}

// 팀카테 뷰(sheet0+sheet1 조인 집계)는 SKU/채널 뷰보다 무거워 20초 기본 타임아웃을
// 종종 넘긴다 — 여유를 두고, 시간초과 자체도 502/503/504와 동일하게 1회 재시도한다.
const TEAM_CATE_TIMEOUT_MS = 30_000;

async function loadTeamCateData(retry = true): Promise<TeamCateMap> {
  const token = await getAuthToken();
  let profitRes: Response, revenueRes: Response;
  try {
    [profitRes, revenueRes] = await Promise.all([
      fetchWithTimeout(`${BASE}/api/3.21/sites/${SITE_ID}/views/${TEAM_CATE_PROFIT_VIEW_ID}/data?maxAge=60`,
        { headers: { 'X-Tableau-Auth': token } }, TEAM_CATE_TIMEOUT_MS),
      fetchWithTimeout(`${BASE}/api/3.21/sites/${SITE_ID}/views/${TEAM_CATE_REVENUE_VIEW_ID}/data?maxAge=60`,
        { headers: { 'X-Tableau-Auth': token } }, TEAM_CATE_TIMEOUT_MS),
    ]);
  } catch (err) {
    // AbortError(시간초과)도 502/503/504처럼 일시적 지연으로 간주해 1회 재시도
    if (retry && err instanceof DOMException && err.name === 'AbortError') {
      await new Promise(r => setTimeout(r, 1500));
      return loadTeamCateData(false);
    }
    throw err;
  }
  if ((profitRes.status === 401 || revenueRes.status === 401) && retry) {
    authToken = null;
    authTokenExpiresAt = 0;
    authPromise = null;
    return loadTeamCateData(false);
  }
  const isRetryableStatus = (s: number) => s === 502 || s === 503 || s === 504;
  if ((isRetryableStatus(profitRes.status) || isRetryableStatus(revenueRes.status)) && retry) {
    await new Promise(r => setTimeout(r, 1500));
    return loadTeamCateData(false);
  }
  if (!profitRes.ok || !revenueRes.ok) {
    console.error('[Tableau] 팀카테 데이터 로드 실패', profitRes.status, revenueRes.status);
    throw new Error(`TeamCate fetch failed: ${profitRes.status}/${revenueRes.status}`);
  }
  const map: TeamCateMap = new Map();
  parseProfitCSV(await profitRes.text(), map);
  parseRevenueCostCSV(await revenueRes.text(), map);
  return map;
}

export async function fetchTeamCateData(): Promise<TeamCateMap> {
  if (teamCateCache && Date.now() - teamCateCacheAt < CACHE_TTL) return teamCateCache;
  if (teamCateFetchPromise) return teamCateFetchPromise;
  teamCateFetchPromise = loadTeamCateData()
    .then(data => { teamCateCache = data; teamCateCacheAt = Date.now(); teamCateFetchPromise = null; return data; })
    .catch(err  => { teamCateFetchPromise = null; throw err; });
  return teamCateFetchPromise;
}

/**
 * 변동비 비중 = (순매출 - 원가 - 공헌이익) / 순매출
 * null 반환 시 호출부에서 0.25 fallback 사용.
 */
/** 데이터셋 전체에서 가장 최근 n개월 추출 */
function getDatasetRecentPeriods(map: TeamCateMap, n: number): { year: number; month: number }[] {
  const ymSet = new Set<string>();
  for (const k of map.keys()) {
    const p = k.split('|');
    if (p.length === 4) ymSet.add(`${p[2]}|${p[3]}`);
  }
  return [...ymSet]
    .map(s => { const [y, m] = s.split('|').map(Number); return { year: y, month: m }; })
    .sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)
    .slice(0, n);
}

export function calcVariableCostRatio(
  map: TeamCateMap,
  appCategory: string,
  appChannel: string,
  mode: 'rolling12' | 'samePeriod',
  releaseMonth: number | null,
  releaseYear: number | null,
  // 대응SKU 출고 데이터에서 추출한 직전12개월 명시 기간 (rolling12 모드 동기화용)
  explicitRolling12?: { year: number; month: number }[],
): { ratio: number; isFallback: boolean } | null {
  const tableauCate = CATEGORY_TO_TABLEAU[appCategory];
  const tableauCh   = CHANNEL_TO_TABLEAU[appChannel];
  if (!tableauCate || !tableauCh) return null;

  let periodPairs: { year: number; month: number }[];
  let isExactPeriod = true;

  if (mode === 'samePeriod' && releaseMonth !== null && releaseYear !== null) {
    // 출시월 기준 8개월 시즌(익년 wrap 포함) 전체를 1년 전 동기간과 비교
    periodPairs = [];
    for (let i = 0; i < 8; i++) {
      const month = ((releaseMonth - 1 + i) % 12) + 1;
      const year = month >= releaseMonth ? releaseYear - 1 : releaseYear;
      periodPairs.push({ year, month });
    }
  } else if (mode === 'rolling12' && explicitRolling12 && explicitRolling12.length > 0) {
    periodPairs = explicitRolling12;
  } else {
    periodPairs = getDatasetRecentPeriods(map, 12);
    isExactPeriod = false;
  }

  function sumPeriod(pairs: { year: number; month: number }[]) {
    let rev = 0, cost = 0, contrib = 0;
    for (const { year, month } of pairs) {
      const e = map.get(tcKey(tableauCh, tableauCate, year, month));
      if (e) { rev += e.revenue; cost += e.cost; contrib += e.contribution; }
    }
    return { rev, cost, contrib };
  }

  let { rev, cost, contrib } = sumPeriod(periodPairs);

  // 지정 기간에 데이터 없으면 가용 최신 데이터로 폴백
  if (rev <= 0 && isExactPeriod) {
    const fallbackPairs = getDatasetRecentPeriods(map, 12);
    ({ rev, cost, contrib } = sumPeriod(fallbackPairs));
    if (rev <= 0) return null;
    return { ratio: (rev - cost - contrib) / rev, isFallback: true };
  }

  if (rev <= 0) return null;
  return { ratio: (rev - cost - contrib) / rev, isFallback: false };
}

// ── 에러 원인 분류 (사용자에게 짧고 이해하기 쉬운 원인 표시용) ──────────────
export type TableauErrorReason = 'auth' | 'timeout' | 'notfound' | 'server' | 'network' | 'unknown';

export const TABLEAU_ERROR_MESSAGES: Record<TableauErrorReason, string> = {
  auth:     'PAT 인증 실패 (토큰 만료/설정 확인)',
  timeout:  '응답 시간 초과 (Tableau 지연)',
  notfound: '뷰를 찾을 수 없음 (뷰/사이트 ID 확인)',
  server:   'Tableau·프록시 서버 오류',
  network:  '네트워크 연결 안 됨',
  unknown:  '알 수 없는 오류 (콘솔 확인)',
};

export function classifyTableauError(err: unknown): TableauErrorReason {
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  const msg = err instanceof Error ? err.message : String(err);
  if (/auth failed:\s*401/i.test(msg) || /auth failed/i.test(msg)) return 'auth';
  if (/:\s*404\b/.test(msg)) return 'notfound';
  if (/:\s*(500|502|503|504)\b/.test(msg)) return 'server';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'network';
  return 'unknown';
}

export function invalidateCache(): void {
  shipmentCache = null;
  shipmentCacheAt = 0;
  channelDataCache = null;
  channelCacheAt = 0;
  teamCateCache = null;
  teamCateCacheAt = 0;
  fetchPromise = null;
  channelFetchPromise = null;
  teamCateFetchPromise = null;
  authToken = null;
  authTokenExpiresAt = 0;
  authPromise = null;
}
