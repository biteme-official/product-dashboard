/**
 * Tableau REST API 연동 – "출고데이터 MCP 연결용" 뷰 (SKU 토탈)에서
 * SKU별 월간 출고량을 가져와 대응 SKU 검색 자동완성에 활용합니다.
 */

const BASE = '/api/tableau';
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
let authPromise: Promise<string> | null = null;
let shipmentCache: SkuShipmentInfo[] | null = null;
let fetchPromise: Promise<SkuShipmentInfo[]> | null = null;

async function getAuthToken(): Promise<string> {
  if (authToken) return authToken;
  // 동시 요청이 여러 개여도 PAT 로그인은 한 번만 실행
  if (authPromise) return authPromise;
  authPromise = (async () => {
    const patName = import.meta.env.VITE_TABLEAU_PAT_NAME as string;
    const patSecret = import.meta.env.VITE_TABLEAU_PAT_SECRET as string;
    const res = await fetch(`${BASE}/api/3.21/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        credentials: {
          personalAccessTokenName: patName,
          personalAccessTokenSecret: patSecret,
          site: { contentUrl: 'biteme01' },
        },
      }),
    });
    if (!res.ok) {
      authPromise = null;
      const body = await res.text().catch(() => '');
      console.error('[Tableau] 인증 실패', res.status, body.slice(0, 200));
      throw new Error(`Tableau auth failed: ${res.status}`);
    }
    const json = await res.json();
    authToken = json.credentials.token as string;
    authPromise = null;
    return authToken;
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
const EXCLUDED_CHANNELS = new Set(['협찬', '기타', 'CS']);

// ── 채널별 데이터 타입 ───────────────────────────────────────────────────
/** channel → year → month → qty */
export type ChannelByYearMonth = Record<string, Record<number, Record<number, number>>>;
/** skuName → ChannelByYearMonth */
export type ChannelDataMap = Map<string, ChannelByYearMonth>;

let channelDataCache: ChannelDataMap | null = null;
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
  const res = await fetch(
    `${BASE}/api/3.21/sites/${SITE_ID}/views/${CHANNEL_VIEW_ID}/data?maxAge=60`,
    { headers: { 'X-Tableau-Auth': token } },
  );
  if (res.status === 401 && retry) {
    // 토큰 만료 → 재인증 후 1회 재시도
    authToken = null;
    authPromise = null;
    return loadChannelData(false);
  }
  if (!res.ok) {
    console.error('[Tableau] 채널 데이터 로드 실패', res.status);
    throw new Error(`Channel data fetch failed: ${res.status}`);
  }

  const rows = parseChannelCSV(await res.text());
  const map: ChannelDataMap = new Map();
  for (const r of rows) {
    if (!map.has(r.skuName)) map.set(r.skuName, {});
    const byCh = map.get(r.skuName)!;
    if (!byCh[r.channel]) byCh[r.channel] = {};
    if (!byCh[r.channel][r.year]) byCh[r.channel][r.year] = {};
    byCh[r.channel][r.year][r.monthNum] = (byCh[r.channel][r.year][r.monthNum] ?? 0) + r.qty;
  }
  return map;
}

export async function fetchChannelShipments(): Promise<ChannelDataMap | null> {
  if (!CHANNEL_VIEW_ID) return null;
  if (channelDataCache) return channelDataCache;
  if (channelFetchPromise) return channelFetchPromise;
  channelFetchPromise = loadChannelData()
    .then(data => { channelDataCache = data; channelFetchPromise = null; return data; })
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

// ── 동기간(출시월 ~ 12월) 집계 ─────────────────────────────────────────
export function calcSamePeriod(
  byYearMonth: Record<number, Record<number, number>>,
  releaseMonth: number,
  releaseYear: number,
): { annual: number; monthly: number; label: string } {
  // 출시월부터 12월까지 (시즌 구간)
  const seasonMonths: number[] = [];
  for (let m = releaseMonth; m <= 12; m++) seasonMonths.push(m);

  const prevYear = releaseYear - 1;
  const prevData = byYearMonth[prevYear] ?? {};
  const annual = seasonMonths.reduce((s, m) => s + (prevData[m] ?? 0), 0);
  const monthsWithData = seasonMonths.filter((m) => (prevData[m] ?? 0) > 0).length;
  const monthly = monthsWithData > 0 ? Math.round(annual / monthsWithData) : 0;
  const label = `${prevYear}년 ${releaseMonth}~12월`;
  return { annual, monthly, label };
}

async function loadSkuData(retry = true): Promise<SkuShipmentInfo[]> {
  const token = await getAuthToken();
  const res = await fetch(
    `${BASE}/api/3.21/sites/${SITE_ID}/views/${VIEW_ID}/data?maxAge=60`,
    { headers: { 'X-Tableau-Auth': token } },
  );
  if (res.status === 401 && retry) {
    // 토큰 만료 → 재인증 후 1회 재시도
    authToken = null;
    authPromise = null;
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
  if (shipmentCache) return shipmentCache;
  if (fetchPromise) return fetchPromise;
  fetchPromise = loadSkuData()
    .then((data) => { shipmentCache = data; fetchPromise = null; return data; })
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

async function loadTeamCateData(retry = true): Promise<TeamCateMap> {
  const token = await getAuthToken();
  const [profitRes, revenueRes] = await Promise.all([
    fetch(`${BASE}/api/3.21/sites/${SITE_ID}/views/${TEAM_CATE_PROFIT_VIEW_ID}/data?maxAge=60`,
      { headers: { 'X-Tableau-Auth': token } }),
    fetch(`${BASE}/api/3.21/sites/${SITE_ID}/views/${TEAM_CATE_REVENUE_VIEW_ID}/data?maxAge=60`,
      { headers: { 'X-Tableau-Auth': token } }),
  ]);
  if ((profitRes.status === 401 || revenueRes.status === 401) && retry) {
    authToken = null;
    authPromise = null;
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
  if (teamCateCache) return teamCateCache;
  if (teamCateFetchPromise) return teamCateFetchPromise;
  teamCateFetchPromise = loadTeamCateData()
    .then(data => { teamCateCache = data; teamCateFetchPromise = null; return data; })
    .catch(err  => { teamCateFetchPromise = null; throw err; });
  return teamCateFetchPromise;
}

/**
 * 변동비 비중 = (순매출 - 원가 - 공헌이익) / 순매출
 * null 반환 시 호출부에서 0.25 fallback 사용.
 */
export function calcVariableCostRatio(
  map: TeamCateMap,
  appCategory: string,
  appChannel: string,
  mode: 'rolling12' | 'samePeriod',
  releaseMonth: number | null,
  releaseYear: number | null,
): number | null {
  const tableauCate = CATEGORY_TO_TABLEAU[appCategory];
  const tableauCh   = CHANNEL_TO_TABLEAU[appChannel];
  if (!tableauCate || !tableauCh) return null;

  let periodPairs: { year: number; month: number }[];
  if (mode === 'samePeriod' && releaseMonth !== null && releaseYear !== null) {
    const prevYear = releaseYear - 1;
    periodPairs = [];
    for (let m = releaseMonth; m <= 12; m++) periodPairs.push({ year: prevYear, month: m });
  } else {
    // 데이터셋 내 가장 최근 12개월
    const ymSet = new Set<string>();
    for (const k of map.keys()) {
      const p = k.split('|');
      if (p.length === 4) ymSet.add(`${p[2]}|${p[3]}`);
    }
    periodPairs = [...ymSet]
      .map(s => { const [y, m] = s.split('|').map(Number); return { year: y, month: m }; })
      .sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)
      .slice(0, 12);
  }

  let totalRevenue = 0, totalCost = 0, totalContrib = 0;
  for (const { year, month } of periodPairs) {
    const e = map.get(tcKey(tableauCh, tableauCate, year, month));
    if (e) { totalRevenue += e.revenue; totalCost += e.cost; totalContrib += e.contribution; }
  }
  if (totalRevenue <= 0) return null;
  return (totalRevenue - totalCost - totalContrib) / totalRevenue;
}

export function invalidateCache(): void {
  shipmentCache = null;
  channelDataCache = null;
  teamCateCache = null;
  fetchPromise = null;
  channelFetchPromise = null;
  teamCateFetchPromise = null;
  authToken = null;
  authPromise = null;
}
