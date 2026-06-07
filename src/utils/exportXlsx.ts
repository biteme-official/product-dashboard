import * as XLSX from 'xlsx';
import type { SkuData } from '../types';

function todayYymmdd(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** 엑셀 다운로드 및 클립보드 복사에 공통으로 쓰이는 2D 배열 생성 */
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
 * 발주표를 탭 구분 텍스트(TSV)로 클립보드에 복사.
 * Google Sheets / Excel에 붙여넣기 하면 표 형태로 들어감.
 */
export async function copySkuOrderToClipboard(sku: SkuData): Promise<void> {
  const rows = buildSkuOrderRows(sku);
  const tsv  = rows
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
    allRows.push(...buildSkuOrderRows(sku));
    if (i < skus.length - 1) allRows.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '발주량 상세');
  XLSX.writeFile(wb, `${todayYymmdd()}_${category}_발주량일괄.xlsx`);
}
