import * as XLSX from 'xlsx';
import type { SkuData } from '../types';

function todayYymmdd(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

export function exportSkuOrderXlsx(sku: SkuData): void {
  const activeSizes = sku.sizes.filter((s) => s.isActive);
  const sumRatios = activeSizes.reduce((sum, s) => sum + s.ratio, 0);
  const sizeLabels = activeSizes.map((s) => s.label);

  let rows: (string | number)[][];

  if (!sku.hasColors || sku.colors.length === 0) {
    // 단색: 사이즈별 수량 1행
    const qtys = activeSizes.map((s) => s.quantity);
    rows = [
      ['사이즈', ...sizeLabels, '합계'],
      ['수량', ...qtys, qtys.reduce((a, b) => a + b, 0)],
    ];
  } else {
    // 컬러 모드: 컬러 × 사이즈 매트릭스
    const header = ['컬러 \\ 사이즈', ...sizeLabels, '합계'];
    const dataRows = sku.colors.map((color) => {
      const sizeQtys = activeSizes.map((s) =>
        sumRatios > 0 ? Math.round((color.quantity * s.ratio) / sumRatios) : 0,
      );
      return [color.name, ...sizeQtys, sizeQtys.reduce((a, b) => a + b, 0)];
    });
    const totalRow: (string | number)[] = ['합계'];
    for (const size of activeSizes) {
      const colSum = sku.colors.reduce(
        (sum, color) =>
          sum + (sumRatios > 0 ? Math.round((color.quantity * size.ratio) / sumRatios) : 0),
        0,
      );
      totalRow.push(colSum);
    }
    totalRow.push(sku.colors.reduce((sum, c) => sum + c.quantity, 0));
    rows = [header, ...dataRows, totalRow];
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '발주량 상세');

  const skuName = sku.name.trim() || 'SKU';
  XLSX.writeFile(wb, `${todayYymmdd()}_${skuName}_발주량 상세.xlsx`);
}

export function exportBulkOrderXlsx(skus: SkuData[], category: string): void {
  const allRows: (string | number)[][] = [];

  skus.forEach((sku, i) => {
    const activeSizes = sku.sizes.filter((s) => s.isActive);
    const sumRatios = activeSizes.reduce((sum, s) => sum + s.ratio, 0);
    const sizeLabels = activeSizes.map((s) => s.label);

    // SKU명 헤더 행
    allRows.push([sku.name.trim() || '(SKU명 미입력)']);

    if (!sku.hasColors || sku.colors.length === 0) {
      const qtys = activeSizes.map((s) => s.quantity);
      allRows.push(['사이즈', ...sizeLabels, '합계']);
      allRows.push(['수량', ...qtys, qtys.reduce((a, b) => a + b, 0)]);
    } else {
      allRows.push(['컬러 \\ 사이즈', ...sizeLabels, '합계']);
      for (const color of sku.colors) {
        const sizeQtys = activeSizes.map((s) =>
          sumRatios > 0 ? Math.round((color.quantity * s.ratio) / sumRatios) : 0,
        );
        allRows.push([color.name || '(미입력)', ...sizeQtys, sizeQtys.reduce((a, b) => a + b, 0)]);
      }
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
      allRows.push(totalRow);
    }

    // SKU 사이 빈 행 구분 (마지막 제외)
    if (i < skus.length - 1) allRows.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(allRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '발주량 상세');
  XLSX.writeFile(wb, `${todayYymmdd()}_${category}_발주량일괄.xlsx`);
}
