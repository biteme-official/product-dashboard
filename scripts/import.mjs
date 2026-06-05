#!/usr/bin/env node
/**
 * MD Dashboard 데이터 가져오기 스크립트
 *
 * 사용법:
 *   node scripts/import.mjs <파일.json>
 *   npm run import-data -- data.json
 *
 * 실행 후 브라우저 상단 "N개 SKU 가져오기" 버튼 클릭
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const VALID_CATEGORIES = ['식품', '용품', '잡화', '의류', '장난감'];
const VALID_SKU_TYPES  = ['시즈널', '스테디', '미해당'];
const VALID_MONTHS     = [1, 2, 7, 8, 9, 10, 11, 12];
const VALID_CHANNELS   = ['자사몰', '스스', '쿠팡', 'B2B', '위탁및사입', '글로벌', '일본'];

// ── 인자 확인 ──────────────────────────────────────────────────────────────
const inputFile = process.argv[2];
if (!inputFile) {
  console.log(`
사용법:  node scripts/import.mjs <파일.json>
예시:    node scripts/import.mjs my-skus.json
`);
  process.exit(1);
}

// ── 파일 읽기 ──────────────────────────────────────────────────────────────
let raw;
try {
  raw = JSON.parse(fs.readFileSync(path.resolve(inputFile), 'utf8'));
} catch (e) {
  console.error('❌ 파일 읽기/파싱 오류:', e.message);
  process.exit(1);
}

const skus = Array.isArray(raw) ? raw : (raw.skus ?? []);
if (skus.length === 0) {
  console.error('❌ SKU 데이터가 없습니다. skus 배열을 확인하세요.');
  process.exit(1);
}

// ── 유효성 검사 ────────────────────────────────────────────────────────────
let hasError = false;
const err = (i, name, msg) => {
  console.error(`❌ SKU[${i}] "${name}": ${msg}`);
  hasError = true;
};

skus.forEach((sku, i) => {
  const n = sku.name ?? '(이름없음)';

  if (!sku.name)
    err(i, n, 'name은 필수입니다.');

  if (!sku.category || !VALID_CATEGORIES.includes(sku.category))
    err(i, n, `category는 [${VALID_CATEGORIES.join(', ')}] 중 하나여야 합니다. 현재: "${sku.category}"`);

  if (sku.skuType && !VALID_SKU_TYPES.includes(sku.skuType))
    err(i, n, `skuType은 [${VALID_SKU_TYPES.join(', ')}] 중 하나여야 합니다. 현재: "${sku.skuType}"`);

  if (sku.sizeCount != null && (sku.sizeCount < 1 || sku.sizeCount > 8))
    err(i, n, `sizeCount는 1~8이어야 합니다. 현재: ${sku.sizeCount}`);

  if (sku.sizeRatios && sku.sizeCount && sku.sizeRatios.length !== sku.sizeCount)
    err(i, n, `sizeRatios 길이(${sku.sizeRatios.length})가 sizeCount(${sku.sizeCount})와 다릅니다.`);

  if (sku.monthlySplit) {
    const bad = Object.keys(sku.monthlySplit).filter(m => !VALID_MONTHS.includes(Number(m)));
    if (bad.length)
      err(i, n, `monthlySplit에 유효하지 않은 월: [${bad.join(', ')}]  유효: 1, 2, 7~12`);

    const total = Object.values(sku.monthlySplit).reduce((s, v) => s + v, 0);
    if (total > 100)
      err(i, n, `monthlySplit 비중 합계가 ${total}%입니다. 100% 이하여야 합니다.`);
  }

  if (sku.channelRatios) {
    const bad = Object.keys(sku.channelRatios).filter(c => !VALID_CHANNELS.includes(c));
    if (bad.length)
      err(i, n, `channelRatios에 유효하지 않은 채널: [${bad.join(', ')}]`);
  }

  if (sku.hasColors && sku.colors) {
    sku.colors.forEach((c, ci) => {
      if (c.quantity == null || c.quantity < 0)
        err(i, n, `colors[${ci}].quantity는 0 이상이어야 합니다.`);
    });
  }
});

if (hasError) {
  console.error('\n위 오류를 수정 후 다시 실행하세요.');
  process.exit(1);
}

// ── public/pending-import.json 저장 ────────────────────────────────────────
const output = {
  _id: Date.now().toString(),
  skus,
};
const outPath = path.join(ROOT, 'public', 'pending-import.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

// ── 요약 출력 ──────────────────────────────────────────────────────────────
const byCategory = {};
skus.forEach(s => { byCategory[s.category] = (byCategory[s.category] ?? 0) + 1; });

console.log(`\n✅ ${skus.length}개 SKU 준비 완료`);
Object.entries(byCategory).forEach(([cat, cnt]) =>
  console.log(`   ${cat}: ${cnt}개`)
);
console.log('\n→ 브라우저 상단의 "SKU 가져오기" 버튼을 클릭하세요.\n');
