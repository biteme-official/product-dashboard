import * as XLSX from 'xlsx';
import type { SkuData } from '../types';

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
