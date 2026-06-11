import * as XLSX from 'xlsx';
import type { SkuData, Channel } from '../types';
import { B2C_CHANNELS, B2B_CHANNELS, MONTHS } from '../types';

function todayYymmdd(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** 엑셀 다운로드 및 클립보드 복사에 공통으로 쓰이는 2D 배열 생성 (사이즈/컬러 기반) */
export function buildSkuOrderRows(sku: SkuData): (string | number)[][] {
  const activeSizes = sku.sizes.filter((s) => s.isActive);
  const sumRatios   = activeSizes.reduce((sum, s) => sum + s.ratio, 0);
  const sizeLabels  = activeSizes.map((s) => s.label);

  if (!sku.hasColors || sku.colors.length === 0) {
    const qtys = activeSizes.map((s) => s.quantity);
    return [
      ['사이즈', ...sizeLabels, '합계'],
      ['수량',   ...qtys,       qtys.reduce((a, b) => a + b, 0)],
    ];
  }

  const header: (string | number)[] = ['컬러 \\ 사이즈', ...sizeLabels, '합계'];
  const dataRows = sku.colors.map((color) => {
    const sizeQtys = activeSizes.map((s) =>
      sumRatios > 0 ? Math.round((color.quantity * s.ratio) / sumRatios) : 0,
    );
    return [color.name, ...sizeQtys, sizeQtys.reduce((a, b) => a + b, 0)];
  });
  const totalRow: (string | number)[] = ['합계'];
  for (const size of activeSizes) {
    totalRow.push(
      sku.colors.reduce(
        (sum, color) =>
          sum + (sumRatios > 0 ? Math.round((color.quantity * size.ratio) / sumRatios) : 0),
        0,
      ),
    );
  }
  totalRow.push(sku.colors.reduce((sum, c) => sum + c.quantity, 0));
  return [header, ...dataRows, totalRow];
}

/**
 * PM 확인 최종 발주량 기준 2D 배열 생성.
 * 우선순위: finalOrderQty → step2OptionQty(스케일) → step2Total×비중 자동계산
 * step2Total이 0이면 null 반환 (fallback으로 buildSkuOrderRows 사용)
 */
export function buildFinalOrderRows(sku: SkuData): (string | number)[][] | null {
  const step2Total = sku.channelMonthQty.reduce((s, e) => s + e.qty, 0);
  const activeSizes = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
  const sumRatios = activeSizes.reduce((sum, s) => sum + s.ratio, 0);
  const activeColors = sku.hasColors ? sku.colors.filter((c) => c.name || c.quantity > 0) : [];
  const colorTotal = activeColors.reduce((s, c) => s + c.quantity, 0);
  const hasColors = activeColors.length > 0 && colorTotal > 0;
  const hasSizes = activeSizes.length > 0 && sumRatios > 0;

  if (step2Total === 0 || (!hasColors && !hasSizes)) return null;

  const csKey = (cid: string, sl: string) => `cs|${cid}|${sl}`;
  const cKey  = (cid: string) => `c|${cid}`;
  const sKey  = (sl: string)  => `s|${sl}`;

  // step2OptionQty 기반 값 (step2Total에 맞게 스케일)
  const stored2 = sku.step2OptionQty ?? {};
  const isManual2 = Object.keys(stored2).some((k) => k !== '__total__');
  const savedTotal2 = (stored2['__total__'] as number | undefined) ?? 0;
  const scale2 = isManual2 && savedTotal2 > 0 ? step2Total / savedTotal2 : 1;

  const compCS = (cQty: number, sRatio: number) =>
    sumRatios === 0 || colorTotal === 0 ? 0 : Math.round(step2Total * (cQty / colorTotal) * (sRatio / sumRatios));
  const compC  = (cQty: number) => colorTotal === 0 ? 0 : Math.round(step2Total * (cQty / colorTotal));
  const compS  = (sRatio: number) => sumRatios === 0 ? 0 : Math.round(step2Total * (sRatio / sumRatios));

  const s2CS = (cid: string, cQty: number, sl: string, sRatio: number) =>
    isManual2 && stored2[csKey(cid, sl)] !== undefined ? Math.round(stored2[csKey(cid, sl)] * scale2) : compCS(cQty, sRatio);
  const s2C  = (cid: string, cQty: number) =>
    isManual2 && stored2[cKey(cid)] !== undefined ? Math.round(stored2[cKey(cid)] * scale2) : compC(cQty);
  const s2S  = (sl: string, sRatio: number) =>
    isManual2 && stored2[sKey(sl)] !== undefined ? Math.round(stored2[sKey(sl)] * scale2) : compS(sRatio);

  // finalOrderQty 우선 적용
  const finalStored = sku.finalOrderQty ?? {};
  const isFinalManual = Object.keys(finalStored).some((k) => k !== '__total__');
  const dispCS = (cid: string, cQty: number, sl: string, sRatio: number) =>
    isFinalManual && finalStored[csKey(cid, sl)] !== undefined ? finalStored[csKey(cid, sl)] : s2CS(cid, cQty, sl, sRatio);
  const dispC  = (cid: string, cQty: number) =>
    isFinalManual && finalStored[cKey(cid)] !== undefined ? finalStored[cKey(cid)] : s2C(cid, cQty);
  const dispS  = (sl: string, sRatio: number) =>
    isFinalManual && finalStored[sKey(sl)] !== undefined ? finalStored[sKey(sl)] : s2S(sl, sRatio);

  const sizeLabels = activeSizes.map((s) => s.label);

  if (hasColors && hasSizes) {
    const header: (string | number)[] = ['컬러 \\ 사이즈', ...sizeLabels, '합계'];
    const dataRows = activeColors.map((c) => {
      const vals = activeSizes.map((s) => dispCS(c.id, c.quantity, s.label, s.ratio));
      return [c.name, ...vals, vals.reduce((a, v) => a + v, 0)];
    });
    const totalRow: (string | number)[] = ['합계',
      ...activeSizes.map((s) => activeColors.reduce((sum, c) => sum + dispCS(c.id, c.quantity, s.label, s.ratio), 0)),
      activeColors.reduce((sum, c) => sum + activeSizes.reduce((s2, s) => s2 + dispCS(c.id, c.quantity, s.label, s.ratio), 0), 0),
    ];
    return [header, ...dataRows, totalRow];
  }

  if (hasColors) {
    const vals = activeColors.map((c) => dispC(c.id, c.quantity));
    return [
      ['컬러', ...activeColors.map((c) => c.name), '합계'],
      ['수량', ...vals, vals.reduce((a, v) => a + v, 0)],
    ];
  }

  // sizes only
  const vals = activeSizes.map((s) => dispS(s.label, s.ratio));
  return [
    ['사이즈', ...sizeLabels, '합계'],
    ['수량',   ...vals,        vals.reduce((a, v) => a + v, 0)],
  ];
}

/**
 * 발주표를 탭 구분 텍스트(TSV)로 클립보드에 복사.
 * Google Sheets / Excel에 붙여넣기 하면 표 형태로 들어감.
 */
export async function copySkuOrderToClipboard(sku: SkuData): Promise<void> {
  let rows = buildSkuOrderRows(sku);
  // 합계 열(마지막 컬럼) 제거
  rows = rows.map((row) => row.slice(0, -1));
  // 컬러 모드: 합계 행(마지막 행) 제거
  if (rows.length > 0 && rows[rows.length - 1][0] === '합계') {
    rows = rows.slice(0, -1);
  }
  const tsv = rows
    .map((row) =>
      row.map((cell) => String(cell).replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t'),
    )
    .join('\n');
  await navigator.clipboard.writeText(tsv);
}

export function exportSkuOrderXlsx(sku: SkuData): void {
  const rows = buildSkuOrderRows(sku);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '발주량 상세');

  const skuName = sku.name.trim() || 'SKU';
  XLSX.writeFile(wb, `${todayYymmdd()}_${skuName}_발주량 상세.xlsx`);
}

export function exportBulkOrderXlsx(skus: SkuData[], category: string): void {
  const allRows: (string | number)[][] = [];

  skus.forEach((sku, i) => {
    allRows.push([sku.name.trim() || '(SKU명 미입력)']);
    // PM 확인 최종 발주량 기준, 없으면 사이즈/컬러 기반 fallback
    const rows = buildFinalOrderRows(sku) ?? buildSkuOrderRows(sku);
    allRows.push(...rows);
    if (i < skus.length - 1) allRows.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '발주량 상세');
  XLSX.writeFile(wb, `${todayYymmdd()}_${category}_발주량일괄.xlsx`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 채널별 시뮬레이션 엑셀 다운로드
// ─────────────────────────────────────────────────────────────────────────────

export interface SimExportParams {
  sku: SkuData;
  pricingOpts: Record<string, string>;
  compMonthlyData: Partial<Record<number, number>>;
  compChannelDist: Record<string, number> | null;
  varCostByChannel: Record<string, number>;
  usdKrw?: number;
  jpyKrw?: number;
}

/** 0-based 열 인덱스 → Excel 열 문자 (A, B, ..., Z, AA, ...) */
function colLetter(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    s = String.fromCharCode(64 + (n % 26 || 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 현재 설정된 시나리오에 따른 단가 계산 (SkuCard 내부 로직 복제) */
function simScenarioPrice(optId: string, base: number, usdKrw: number, jpyKrw: number): number {
  if (!optId) return base;
  const f10 = (x: number) => Math.floor(x / 10) * 10;
  const openSpecial = (b: number) => Math.floor((f10(b * 0.8) - 901) / 1000) * 1000 + 900;
  const map: Record<string, (b: number) => number> = {
    '오픈특가':           openSpecial,
    '신상위크':           (b) => Math.max(0, openSpecial(b) - 1000),
    '신상위크 라이브':    (b) => Math.max(0, openSpecial(b) - 2000),
    '선단독':             (b) => Math.max(0, openSpecial(b) - 1000),
    '상시 최대할인율':    (b) => f10(b * 0.85),
    '특가 최대할인율':    (b) => f10(b * 0.80),
    '시즌오프(의류전용)': (b) => f10(b * 0.75),
    'B2B 오픈 할인':      (b) => f10(b * 0.65 * 0.90),
    'B2B 상시 운영':      (b) => f10(b * 0.65),
    '사입 공급가':        (b) => f10(b * 0.50),
    '글로벌 공급가':      (b) => f10((b / 1250 * 1.6) / 2 * usdKrw),
    '일본 공급가':        (b) => f10((b / jpyKrw * 1.3) / 2 * jpyKrw),
  };
  return map[optId]?.(base) ?? base;
}

export function exportSimulationXlsx(params: SimExportParams): void {
  const {
    sku, pricingOpts, compMonthlyData, compChannelDist,
    varCostByChannel, usdKrw = 1400, jpyKrw = 9.0,
  } = params;

  const ALL_CH = [...B2C_CHANNELS, ...B2B_CHANNELS] as Channel[];
  const NUM_CH = ALL_CH.length; // 8

  // ── 셀 헬퍼 ──────────────────────────────────────────────────────────────
  const ws: XLSX.WorkSheet = {};

  function sv(r: number, c: number, v: string | number) {
    ws[XLSX.utils.encode_cell({ r, c })] = typeof v === 'number' ? { t: 'n', v } : { t: 's', v };
  }
  function sf(r: number, c: number, formula: string) {
    ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', f: formula };
  }
  function spct(r: number, c: number, v: number) {
    ws[XLSX.utils.encode_cell({ r, c })] = { t: 'n', v, z: '0.0%' };
  }
  const cl = colLetter;
  // Excel 행 번호(1-indexed) = 0-indexed + 1
  const ex = (r: number) => r + 1;

  // ── 레이아웃 상수 (0-indexed 행) ────────────────────────────────────────
  // Section 1: SKU 기본 정보
  const R_S1_TITLE = 0;
  const R_INFO     = 1;   // SKU명 | name | | 원가 | cost | | 판매가 | price
  const C_COST     = 4;   // E열
  const C_PRICE    = 7;   // H열

  // Section 2: 대응SKU 월별 실적
  const R_S2_TITLE = 3;
  const R_COMP_M_HDR  = 4;
  const R_COMP_M_DATA = 5;

  // Section 3: 대응SKU 채널별 비중
  const R_S3_TITLE    = 7;
  const R_COMP_CH_HDR  = 8;
  const R_COMP_CH_DATA = 9;

  // Section 4: 참조 테이블 (단가 + 변동비)
  const R_S4_TITLE     = 11;
  const R_PRICE_HDR    = 13;  // "채널/월 | 7월 | ... | 2월"
  const R_PRICE_START  = 14;  // 채널 0 단가 행 (14 ~ 14+7=21)
  const R_VAR_TITLE    = 23;
  const R_VAR_CH_HDR   = 24;  // 채널명 헤더 (A-H 열)
  const R_VAR_DATA     = 25;  // 변동비율 값

  // Section 5: 채널별 목표량 설정 메인 테이블
  const R_S5_TITLE   = 27;
  const R_QTY_HDR    = 28;
  const R_QTY_START  = 29;               // 채널 0 수량 행
  const R_QTY_TOTAL  = R_QTY_START + NUM_CH; // 합계 행 (= 37)

  // 수량 테이블 열
  const C_LABEL  = 0;  // A
  const C_M      = [1,2,3,4,5,6,7,8] as const; // B~I (7,8,9,10,11,12,1,2월)
  const C_QTOT   = 9;  // J 총수량
  const C_QPCT   = 10; // K 채널비중%
  const C_REV    = 11; // L 예상순매출
  const C_PROFIT = 12; // M 예상공헌이익
  const C_CM     = 13; // N CM%

  const MONTH_LABELS = ['7월','8월','9월','10월','11월','12월','1월(익년)','2월(익년)'];
  const DEFAULT_OPT_CH: Partial<Record<Channel, string>> = {
    '쿠팡': 'B2B 상시 운영', 'B2B': 'B2B 상시 운영',
    '사입및페어': 'B2B 상시 운영', '글로벌': '글로벌 공급가', '일본': '일본 공급가',
  };

  // ── Section 1 ──────────────────────────────────────────────────────────
  sv(R_S1_TITLE, 0, '▶ SKU 기본 정보');
  sv(R_INFO, 0, 'SKU명');        sv(R_INFO, 1, sku.name || '(미입력)');
  sv(R_INFO, 3, '원가(원)');    sv(R_INFO, C_COST, sku.cost);
  sv(R_INFO, 6, '판매가(원)'); sv(R_INFO, C_PRICE, sku.price);

  // ── Section 2 ──────────────────────────────────────────────────────────
  sv(R_S2_TITLE, 0, '▶ 대응 SKU 2025 월별 실적');
  sv(R_COMP_M_HDR, 0, '월');
  MONTH_LABELS.forEach((lb, i) => sv(R_COMP_M_HDR, C_M[i], lb));
  sv(R_COMP_M_HDR, C_QTOT, '합계');
  sv(R_COMP_M_DATA, 0, '출고수량');
  MONTHS.forEach((m, i) => sv(R_COMP_M_DATA, C_M[i], compMonthlyData[m] ?? 0));
  sf(R_COMP_M_DATA, C_QTOT,
    `SUM(${cl(C_M[0])}${ex(R_COMP_M_DATA)}:${cl(C_M[7])}${ex(R_COMP_M_DATA)})`);

  // ── Section 3 ──────────────────────────────────────────────────────────
  sv(R_S3_TITLE, 0, '▶ 대응 SKU 채널별 비중');
  sv(R_COMP_CH_HDR, 0, '채널');
  ALL_CH.forEach((ch, i) => sv(R_COMP_CH_HDR, i + 1, ch));
  sv(R_COMP_CH_DATA, 0, '비중%');
  const distTotal = compChannelDist
    ? ALL_CH.reduce((s, ch) => s + (compChannelDist[ch] ?? 0), 0) : 0;
  ALL_CH.forEach((ch, i) => {
    const pct = (compChannelDist && distTotal > 0) ? (compChannelDist[ch] ?? 0) / distTotal : 0;
    spct(R_COMP_CH_DATA, i + 1, pct);
  });

  // ── Section 4-A: 채널 단가 참조 ────────────────────────────────────────
  sv(R_S4_TITLE, 0, '▶ 참조 테이블 (수정 가능: 단가·변동비율)');
  sv(R_S4_TITLE + 1, 0, '[ 채널 단가 - 현재 시나리오 기준 ]');
  sv(R_PRICE_HDR, 0, '채널 / 월');
  MONTH_LABELS.forEach((lb, i) => sv(R_PRICE_HDR, C_M[i], lb));

  ALL_CH.forEach((ch, ci) => {
    const r = R_PRICE_START + ci;
    const cp = sku.channelPricing?.find((p) => p.channel === ch);
    const base = (cp?.price && cp.price > 0) ? cp.price : sku.price;
    sv(r, C_LABEL, ch);
    MONTHS.forEach((m, mi) => {
      const optId = pricingOpts[`${ch}-${m}`] ?? DEFAULT_OPT_CH[ch] ?? '';
      sv(r, C_M[mi], simScenarioPrice(optId, base, usdKrw, jpyKrw));
    });
  });

  // ── Section 4-B: 변동비율 참조 ────────────────────────────────────────
  sv(R_VAR_TITLE, 0, '[ 채널별 변동비율 - Tableau 기준, 없을 시 25% ]');
  ALL_CH.forEach((ch, i) => sv(R_VAR_CH_HDR, i, ch));
  ALL_CH.forEach((ch, i) => spct(R_VAR_DATA, i, varCostByChannel[ch] ?? 0.25));

  // ── Section 5: 채널별 목표량 설정 ──────────────────────────────────────
  sv(R_S5_TITLE, 0, '▶ 채널별 목표량 설정 (수량 수정 시 순매출·공헌이익 자동계산)');
  sv(R_QTY_HDR, C_LABEL, '채널');
  MONTH_LABELS.forEach((lb, i) => sv(R_QTY_HDR, C_M[i], lb + ' 수량'));
  sv(R_QTY_HDR, C_QTOT, '총수량');
  sv(R_QTY_HDR, C_QPCT, '채널비중%');
  sv(R_QTY_HDR, C_REV, '예상순매출(원)');
  sv(R_QTY_HDR, C_PROFIT, '예상공헌이익(원)');
  sv(R_QTY_HDR, C_CM, 'CM%');

  const TOTAL_ROW_EX = ex(R_QTY_TOTAL); // Excel 행번호 for 합계행 (절대참조용)

  ALL_CH.forEach((ch, ci) => {
    const r     = R_QTY_START + ci;
    const rowEx = ex(r);
    const priceRowEx = ex(R_PRICE_START + ci);
    // 변동비율: R_VAR_DATA에서 채널 순서대로 A,B,C... 열에 배치
    const varColLetter = cl(ci);

    sv(r, C_LABEL, ch);

    // 월별 수량 (값 — 사용자가 수정하는 셀)
    MONTHS.forEach((m, mi) => {
      const qty = sku.channelMonthQty.find((e) => e.channel === ch && e.month === m)?.qty ?? 0;
      sv(r, C_M[mi], qty);
    });

    // 총수량 =SUM(B:I)
    sf(r, C_QTOT,
      `SUM(${cl(C_M[0])}${rowEx}:${cl(C_M[7])}${rowEx})`);

    // 채널비중% =IF($J$합계행>0, J행/$J$합계행, "")
    ws[XLSX.utils.encode_cell({ r, c: C_QPCT })] = {
      t: 'n',
      f: `IF($${cl(C_QTOT)}$${TOTAL_ROW_EX}>0,${cl(C_QTOT)}${rowEx}/$${cl(C_QTOT)}$${TOTAL_ROW_EX},"")`,
      z: '0.0%',
    };

    // 예상순매출 =SUMPRODUCT($단가행, 수량행)/1.1
    sf(r, C_REV,
      `SUMPRODUCT($${cl(C_M[0])}$${priceRowEx}:$${cl(C_M[7])}$${priceRowEx},` +
      `${cl(C_M[0])}${rowEx}:${cl(C_M[7])}${rowEx})/1.1`);

    // 예상공헌이익 =순매출*(1-변동비율) - 원가*총수량
    sf(r, C_PROFIT,
      `${cl(C_REV)}${rowEx}*(1-${varColLetter}$${ex(R_VAR_DATA)})-` +
      `$${cl(C_COST)}$${ex(R_INFO)}*${cl(C_QTOT)}${rowEx}`);

    // CM% =IF(L>0, M/L, "")
    ws[XLSX.utils.encode_cell({ r, c: C_CM })] = {
      t: 'n',
      f: `IF(${cl(C_REV)}${rowEx}>0,${cl(C_PROFIT)}${rowEx}/${cl(C_REV)}${rowEx},"")`,
      z: '0.0%',
    };
  });

  // 합계 행
  const rT = R_QTY_TOTAL;
  const qStartEx = ex(R_QTY_START);
  const qEndEx   = ex(R_QTY_START + NUM_CH - 1);
  sv(rT, C_LABEL, '합계');
  C_M.forEach((c) => sf(rT, c, `SUM(${cl(c)}${qStartEx}:${cl(c)}${qEndEx})`));
  sf(rT, C_QTOT,   `SUM(${cl(C_QTOT)}${qStartEx}:${cl(C_QTOT)}${qEndEx})`);
  spct(rT, C_QPCT, 1); // 100%
  sf(rT, C_REV,    `SUM(${cl(C_REV)}${qStartEx}:${cl(C_REV)}${qEndEx})`);
  sf(rT, C_PROFIT, `SUM(${cl(C_PROFIT)}${qStartEx}:${cl(C_PROFIT)}${qEndEx})`);
  ws[XLSX.utils.encode_cell({ r: rT, c: C_CM })] = {
    t: 'n',
    f: `IF(${cl(C_REV)}${TOTAL_ROW_EX}>0,${cl(C_PROFIT)}${TOTAL_ROW_EX}/${cl(C_REV)}${TOTAL_ROW_EX},"")`,
    z: '0.0%',
  };

  // ── Section 6: 옵션별 수량 배분 ───────────────────────────────────────
  const R_S6_TITLE   = R_QTY_TOTAL + 2;
  const R_OPT_BASE   = R_S6_TITLE + 1; // 기준 총수량 행
  const R_OPT_TABLE  = R_S6_TITLE + 3; // 옵션 테이블 시작

  sv(R_S6_TITLE, 0, '▶ 옵션별 수량 배분 (수량 변경 시 자동 재계산)');
  sv(R_OPT_BASE, 0, '기준 총발주수량');
  sf(R_OPT_BASE, 1, `${cl(C_QTOT)}${TOTAL_ROW_EX}`); // =J{합계행}
  const baseRef = `$${cl(1)}$${ex(R_OPT_BASE)}`; // $B$행 — 절대참조

  const activeSizes  = sku.sizes.filter((s) => s.isActive && s.ratio > 0);
  const sumSizeRatio = activeSizes.reduce((s, sz) => s + sz.ratio, 0);
  const activeColors = sku.hasColors ? sku.colors.filter((c) => c.name || c.quantity > 0) : [];
  const totalColorQty = activeColors.reduce((s, c) => s + c.quantity, 0);

  let optR = R_OPT_TABLE;

  if (activeColors.length > 0 && activeSizes.length > 0 && sumSizeRatio > 0 && totalColorQty > 0) {
    // 컬러 × 사이즈 행렬
    const N_SZ = activeSizes.length;
    const C_SUM_OPT = N_SZ + 1;       // 합계 열
    const C_COLOR_FRAC = N_SZ + 2;    // 컬러 비율 열 (숨김용)

    sv(optR, 0, '컬러 \\ 사이즈');
    activeSizes.forEach((sz, i) => sv(optR, i + 1, sz.label));
    sv(optR, C_SUM_OPT, '합계');
    sv(optR, C_COLOR_FRAC, '컬러비율');
    optR++;

    // 사이즈 비율 행
    sv(optR, 0, '사이즈 비율');
    activeSizes.forEach((sz, i) => spct(optR, i + 1, sz.ratio / sumSizeRatio));
    const sizeRatioRowEx = ex(optR);
    optR++;

    const colorStartR = optR;
    activeColors.forEach((color) => {
      const colorFrac = color.quantity / totalColorQty;
      sv(optR, 0, color.name || '(무제)');
      spct(optR, C_COLOR_FRAC, colorFrac);
      const colorFracRef = `$${cl(C_COLOR_FRAC)}$${ex(optR)}`; // 절대

      activeSizes.forEach((_, si) => {
        const sizeRatioRef = `${cl(si + 1)}$${sizeRatioRowEx}`; // 행 절대
        sf(optR, si + 1,
          `ROUND(${baseRef}*${colorFracRef}*${sizeRatioRef},0)`);
      });
      sf(optR, C_SUM_OPT,
        `SUM(${cl(1)}${ex(optR)}:${cl(N_SZ)}${ex(optR)})`);
      optR++;
    });

    // 합계 행
    const colorEndR = optR - 1;
    sv(optR, 0, '합계');
    activeSizes.forEach((_, si) =>
      sf(optR, si + 1, `SUM(${cl(si+1)}${ex(colorStartR)}:${cl(si+1)}${ex(colorEndR)})`));
    sf(optR, C_SUM_OPT,
      `SUM(${cl(C_SUM_OPT)}${ex(colorStartR)}:${cl(C_SUM_OPT)}${ex(colorEndR)})`);
    optR++;

  } else if (activeColors.length > 0 && totalColorQty > 0) {
    // 컬러만
    sv(optR, 0, '컬러');
    activeColors.forEach((c, i) => sv(optR, i + 1, c.name || '(무제)'));
    optR++;
    sv(optR, 0, '비율(%)');
    activeColors.forEach((c, i) => spct(optR, i + 1, c.quantity / totalColorQty));
    const ratioRowEx = ex(optR);
    optR++;
    sv(optR, 0, '수량');
    activeColors.forEach((_, i) =>
      sf(optR, i + 1, `ROUND(${baseRef}*${cl(i+1)}$${ratioRowEx},0)`));
    optR++;

  } else if (activeSizes.length > 0 && sumSizeRatio > 0) {
    // 사이즈만
    sv(optR, 0, '사이즈');
    activeSizes.forEach((sz, i) => sv(optR, i + 1, sz.label));
    optR++;
    sv(optR, 0, '비율(%)');
    activeSizes.forEach((sz, i) => spct(optR, i + 1, sz.ratio / sumSizeRatio));
    const ratioRowEx = ex(optR);
    optR++;
    sv(optR, 0, '수량');
    activeSizes.forEach((_, i) =>
      sf(optR, i + 1, `ROUND(${baseRef}*${cl(i+1)}$${ratioRowEx},0)`));
    optR++;
  }

  // ── 시트 범위 및 열 너비 설정 ────────────────────────────────────────
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: optR + 1, c: 14 } });
  ws['!cols'] = [
    { wch: 20 },                          // A: 라벨/채널명
    ...Array(8).fill({ wch: 10 }),        // B-I: 월별
    { wch: 10 },                          // J: 총수량
    { wch: 9  },                          // K: 채널비중%
    { wch: 15 },                          // L: 순매출
    { wch: 15 },                          // M: 공헌이익
    { wch: 7  },                          // N: CM%
  ];

  const wb = XLSX.utils.book_new();
  const sheetName = (sku.name || 'SKU').trim().slice(0, 31) || 'SKU';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${todayYymmdd()}_${sku.name || 'SKU'}_시뮬레이션.xlsx`);
}
