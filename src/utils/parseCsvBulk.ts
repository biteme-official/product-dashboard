import { v4 as uuidv4 } from 'uuid';
import type { SkuData, Category, SkuType, Brand, Month } from '../types';
import {
  CHANNELS, DEFAULT_CHANNEL_RATIOS, DEFAULT_CHANNEL_COMMISSION,
  SIZE_LABELS, MAX_SIZES, getSkuMonths,
} from '../types';

const VALID_CATEGORIES = new Set<Category>(['식품', '용품', '잡화', '의류', '장난감']);
const VALID_SKU_TYPES = new Set<SkuType>(['시즈널', '스테디', '미해당']);
const VALID_BRANDS = new Set<Brand>(['바잇미', 'SSFW', '그외']);

export interface ParsedRow {
  rowNum: number;
  errors: string[];
  sku?: Omit<SkuData, '_initialSnapshot' | 'isExpanded'>;
  raw: {
    category: string; brand: string; skuType: string; skuName: string;
    releaseDate: string; sizeCount: string; cost: string;
    price: string; regularPrice: string; moq: string;
  };
}

// 헤더 행 여부 판별용 키워드
const HEADER_KEYWORDS = new Set(['카테고리', 'category', '브랜드', 'brand', 'sku명', 'sku name']);

function toNum(s: string) {
  return parseInt(s.replace(/,/g, '').trim(), 10) || 0;
}

export function parseCsvBulk(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '').trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines[0].includes('\t') ? '\t' : ',';

  // 헤더 행이면 건너뜀
  const firstCell = lines[0].split(delim)[0].trim().toLowerCase();
  const startIdx = HEADER_KEYWORDS.has(firstCell) ? 1 : 0;

  const results: ParsedRow[] = [];

  for (let i = startIdx; i < lines.length; i++) {
    const cells = lines[i].split(delim);
    const [
      rawCat = '', rawBrand = '', rawType = '', rawName = '',
      rawDate = '', rawSize = '', rawCost = '', rawPrice = '',
      rawRegular = '', rawMoq = '',
    ] = cells.map((c) => c.trim());

    const raw = {
      category: rawCat, brand: rawBrand, skuType: rawType, skuName: rawName,
      releaseDate: rawDate, sizeCount: rawSize, cost: rawCost,
      price: rawPrice, regularPrice: rawRegular, moq: rawMoq,
    };

    const errors: string[] = [];

    if (!VALID_CATEGORIES.has(rawCat as Category))
      errors.push(`카테고리 오류: "${rawCat}" (식품·용품·잡화·의류·장난감)`);
    if (!VALID_BRANDS.has(rawBrand as Brand))
      errors.push(`브랜드 오류: "${rawBrand}" (바잇미·SSFW·그외)`);
    if (!VALID_SKU_TYPES.has(rawType as SkuType))
      errors.push(`타입 오류: "${rawType}" (시즈널·스테디·미해당)`);
    if (!rawName) errors.push('SKU명 필수');

    const sizeCount = parseInt(rawSize, 10);
    if (isNaN(sizeCount) || sizeCount < 1 || sizeCount > 8)
      errors.push(`사이즈 수 오류: "${rawSize}" (1~8)`);

    if (errors.length > 0) {
      results.push({ rowNum: i - startIdx + 1, errors, raw });
      continue;
    }

    const price = toNum(rawPrice);
    const cost = toNum(rawCost);
    const regularPrice = toNum(rawRegular) || price;
    const moq = toNum(rawMoq);

    const labels = SIZE_LABELS[sizeCount];
    const defRatio = Math.floor(100 / sizeCount);
    const sizes = Array.from({ length: MAX_SIZES }, (_, idx) => ({
      label: idx < sizeCount ? labels[idx] : '-',
      ratio: idx < sizeCount ? defRatio : 0,
      quantity: 0,
      isActive: idx < sizeCount,
    }));

    const sku: Omit<SkuData, '_initialSnapshot' | 'isExpanded'> = {
      id: uuidv4(),
      category: rawCat as Category,
      skuName: rawName,
      brand: rawBrand as Brand,
      skuType: rawType as SkuType,
      releaseDate: rawDate,
      price,
      cost,
      regularPrice,
      contributionMarginRate: 0,
      totalOrderQty: 0,
      sizeCount,
      moq,
      targetSellThroughMonths: 1,
      sizes,
      hasColors: false,
      colors: [],
      channelRatios: CHANNELS.map((ch) => ({ channel: ch, ratio: DEFAULT_CHANNEL_RATIOS[ch] })),
      channelMonthlySplit: CHANNELS.flatMap((ch) =>
        getSkuMonths(rawDate).map((m) => ({ channel: ch, month: m, ratio: 0 })),
      ),
      channelMonthQty: CHANNELS.flatMap((ch) =>
        getSkuMonths(rawDate).map((m) => ({ channel: ch, month: m, qty: 0 })),
      ),
      channelPricing: CHANNELS.map((ch) => ({
        channel: ch, price: 0, commissionRate: DEFAULT_CHANNEL_COMMISSION[ch],
      })),
      memo: '',
      pricingOpts: {},
      pricingUsdRate: 1400,
      comparisonSku: { name: '', price: 0, cost: 0, monthlyShipment: 0, annualShipment: 0 },
      monthlySplit: getSkuMonths(rawDate).map((m) => ({
        month: m as Month, ratio: 0, quantity: 0, revenue: 0, contributionProfit: 0,
      })),
      step2PlatformConfirmed: false,
      step2BrandConfirmed: false,
      step2GlobalConfirmed: false,
    };

    results.push({ rowNum: i - startIdx + 1, errors: [], sku, raw });
  }

  return results;
}
