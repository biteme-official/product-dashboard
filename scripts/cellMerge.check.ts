// 칸 단위 병합 검증: node scripts/cellMerge.check.ts
import { mergeQtyEntries, mergeRecord } from '../src/utils/cellMerge.ts';
let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { fail++; console.error('FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', name);
};
const E = (channel: string, month: number, qty: number) => ({ channel, month, qty });
const base = [E('자사몰', 10, 100), E('스스', 10, 50)];
// 플랫폼MD: 자사몰만 수정 / 그 사이 브랜드MD가 서버에 스스 수정
const local = [E('자사몰', 10, 120), E('스스', 10, 50)];
const server = [E('자사몰', 10, 100), E('스스', 10, 70)];
eq('다른 채널 동시 수정은 둘 다 유지', mergeQtyEntries(base, local, server), [E('자사몰', 10, 120), E('스스', 10, 70)]);
eq('같은 칸은 나중 저장이 이김', mergeQtyEntries(base, [E('자사몰', 10, 130), E('스스', 10, 50)], [E('자사몰', 10, 110), E('스스', 10, 50)]), [E('자사몰', 10, 130), E('스스', 10, 50)]);
eq('안 바꾼 탭은 서버 값 그대로', mergeQtyEntries(base, base, server), server);
eq('base에 없던 칸 추가', mergeQtyEntries([], [E('일본', 11, 5)], [E('자사몰', 10, 1)]), [E('자사몰', 10, 1), E('일본', 11, 5)]);
eq('판매가 시나리오 병합', mergeRecord({ '자사몰-10': '판매가', '스스-10': '판매가' }, { '자사몰-10': '오픈특가', '스스-10': '판매가' }, { '자사몰-10': '판매가', '스스-10': '신상위크' }), { '자사몰-10': '오픈특가', '스스-10': '신상위크' });
eq('마케팅 숫자 키', mergeRecord<number>({ '10': 5 }, { '10': 5, '11': 3 }, { '10': 8 }), { '10': 8, '11': 3 });
eq('지운 키는 서버에서도 지움', mergeRecord({ '자사몰-1': '오픈특가', '스스-1': '판매가' }, { '스스-1': '판매가' }, { '자사몰-1': '오픈특가', '스스-1': '신상위크' }), { '스스-1': '신상위크' });
if (fail) { console.error(`${fail}건 실패`); process.exit(1); }
console.log('전부 통과');
