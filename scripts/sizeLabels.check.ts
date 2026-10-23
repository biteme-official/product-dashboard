/**
 * src/utils/sizeLabels.ts 검증 — 테스트 프레임워크 없이 Node 타입 스트리핑으로 실행.
 *   node scripts/sizeLabels.check.ts
 */
import assert from 'node:assert/strict';
import { buildSizesFromLabels, cpoSizeLabels, mapSizeLabels, remapSizeKeys } from '../src/utils/sizeLabels.ts';

const MAX = 8;
const sizesOf = (labels: string[], ratios: number[]) =>
  Array.from({ length: MAX }, (_, i) => ({
    label: i < labels.length ? labels[i] : '-',
    ratio: ratios[i] ?? 0,
    quantity: 0,
    isActive: i < labels.length,
  }));
const active = (s: { label: string; ratio: number; isActive: boolean }[]) =>
  s.filter((x) => x.isActive).map((x) => `${x.label}:${x.ratio}`).join(',');

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

test('CPO 라벨: 비면 OS, 8개 초과는 앞 8개만', () => {
  assert.deepEqual(cpoSizeLabels([], MAX), ['OS']);
  assert.deepEqual(cpoSizeLabels(undefined, MAX), ['OS']);
  assert.deepEqual(cpoSizeLabels(['M', 'L', 'XL'], MAX), ['M', 'L', 'XL']);
  assert.deepEqual(cpoSizeLabels(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'], MAX).length, 8);
});

test('프리셋 라벨 SKU 첫 동기화(메쉬 텐마일백): S·M·L → M·L·XL, 비율·최종발주 키 위치 그대로', () => {
  const old = ['S', 'M', 'L'];
  const next = ['M', 'L', 'XL'];
  const m = mapSizeLabels(old, next, true);
  assert.equal(active(buildSizesFromLabels(sizesOf(old, [30, 50, 20]), old, next, m, MAX)), 'M:30,L:50,XL:20');
  const r = remapSizeKeys({ 's|S': 30, 's|M': 50, 's|L': 20 }, m);
  assert.deepEqual(r.next, { 's|M': 30, 's|L': 50, 's|XL': 20 });
  assert.deepEqual(r.removed, ['s|S']);
});

test('포핏슈즈: S·M·L·XL → XS·S·M·L, 컬러×사이즈 키가 한 칸씩 밀리지 않음', () => {
  const old = ['S', 'M', 'L', 'XL'];
  const next = ['XS', 'S', 'M', 'L'];
  const m = mapSizeLabels(old, next, true);
  const r = remapSizeKeys({ 'cs|c1|S': 1, 'cs|c1|M': 2, 'cs|c1|L': 3, 'cs|c1|XL': 4, 'c|c1': 10, '__total__': 10 }, m);
  assert.deepEqual(r.next, { 'cs|c1|XS': 1, 'cs|c1|S': 2, 'cs|c1|M': 3, 'cs|c1|L': 4, 'c|c1': 10, '__total__': 10 });
  assert.deepEqual(r.removed, ['cs|c1|XL']);
});

test('1사이즈: OS → XS', () => {
  const m = mapSizeLabels(['OS'], ['XS'], true);
  assert.equal(active(buildSizesFromLabels(sizesOf(['OS'], [100]), ['OS'], ['XS'], m, MAX)), 'XS:100');
});

test('이미 맞춘 SKU에서 CPO가 앞에 XS 추가: 이름 기준 — 기존 사이즈 값 유지, 새 사이즈는 0', () => {
  const old = ['S', 'M', 'L'];
  const next = ['XS', 'S', 'M', 'L'];
  const m = mapSizeLabels(old, next, false);
  assert.equal(active(buildSizesFromLabels(sizesOf(old, [30, 50, 20]), old, next, m, MAX)), 'XS:0,S:30,M:50,L:20');
  const r = remapSizeKeys({ 's|S': 30, 's|M': 50, 's|L': 20 }, m);
  assert.equal(r.changed, false);
});

test('이미 맞춘 SKU에서 사이즈 삭제: 이름 기준 — 빠진 사이즈 키만 제거', () => {
  const m = mapSizeLabels(['S', 'M', 'L'], ['M', 'L'], false);
  const r = remapSizeKeys({ 's|S': 30, 's|M': 50, 's|L': 20 }, m);
  assert.deepEqual(r.next, { 's|M': 50, 's|L': 20 });
  assert.deepEqual(r.removed, ['s|S']);
});

test('옮길 비율이 하나도 없으면 균등 분배', () => {
  const m = mapSizeLabels(['S', 'M'], ['L', 'XL'], false);
  assert.equal(active(buildSizesFromLabels(sizesOf(['S', 'M'], [50, 50]), ['S', 'M'], ['L', 'XL'], m, MAX)), 'L:50,XL:50');
});

test('수동 수량이 없으면 변경 없음', () => {
  const r = remapSizeKeys(undefined, mapSizeLabels(['S'], ['M'], true));
  assert.equal(r.changed, false);
  assert.deepEqual(r.next, {});
});

console.log(`\n${passed}개 통과`);
