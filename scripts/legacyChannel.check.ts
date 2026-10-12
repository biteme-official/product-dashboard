// 예전 채널명 변환 검증: node scripts/legacyChannel.check.ts
import { renameLegacyChannels } from '../src/utils/legacyChannel.ts';
let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.error('FAIL', name, JSON.stringify(a), '!=', JSON.stringify(b)); } else console.log('ok', name); };
const doc = {
  skuName: 'x',
  channelMonthQty: [{ channel: '자사몰', month: 7, qty: 10 }, { channel: '사입및페어', month: 7, qty: 5 }, { channel: '사입및페어', month: 8, qty: 3 }],
  channelRatios: [{ channel: 'B2B', ratio: 15 }, { channel: '사입및페어', ratio: 5 }],
  channelPricing: [{ channel: '사입및페어', price: 9000, commissionRate: 0 }],
  step2InitBaselineQty: [{ channel: '사입및페어', month: 7, qty: 4 }],
  pricingOpts: { '자사몰-7': '오픈특가', '사입및페어-7': '사입 공급가', '사입및페어-8': 'B2B 상시 운영' },
  _initialSnapshot: { channelRatios: [{ channel: '사입및페어', ratio: 5 }] },
};
const r = renameLegacyChannels(doc);
eq('수량: 사입및페어 → 팝업/페어', r.channelMonthQty, [{ channel: '자사몰', month: 7, qty: 10 }, { channel: '팝업/페어', month: 7, qty: 5 }, { channel: '팝업/페어', month: 8, qty: 3 }]);
eq('채널 비중 · 판매가/수수료 · 기준 수량', [r.channelRatios[1], r.channelPricing[0].channel, r.step2InitBaselineQty[0].channel], [{ channel: '팝업/페어', ratio: 5 }, '팝업/페어', '팝업/페어']);
eq('판매가 선택 키', r.pricingOpts, { '자사몰-7': '오픈특가', '팝업/페어-7': '사입 공급가', '팝업/페어-8': 'B2B 상시 운영' });
eq('초기 스냅샷 안쪽도 변환', r._initialSnapshot.channelRatios, [{ channel: '팝업/페어', ratio: 5 }]);
eq('원본은 그대로', doc.channelMonthQty[1].channel, '사입및페어');
const same = { channelMonthQty: [{ channel: '팝업/페어', month: 7, qty: 1 }], pricingOpts: { '팝업/페어-7': '팝업/페어' } };
eq('바꿀 게 없으면 같은 객체', renameLegacyChannels(same) === same, true);
const mixed = renameLegacyChannels({
  channelMonthQty: [{ channel: '사입및페어', month: 7, qty: 5 }, { channel: '팝업/페어', month: 7, qty: 9 }, { channel: '사입및페어', month: 8, qty: 2 }],
  pricingOpts: { '사입및페어-7': 'B2B 상시 운영', '팝업/페어-7': '팝업/페어' },
});
eq('두 이름이 섞여 있으면 새 이름 값 우선 · 새 이름에 없는 칸만 옮김', [mixed.channelMonthQty, mixed.pricingOpts], [[{ channel: '팝업/페어', month: 7, qty: 9 }, { channel: '팝업/페어', month: 8, qty: 2 }], { '팝업/페어-7': '팝업/페어' }]);
if (fail) { console.error(`${fail}건 실패`); process.exit(1); }
console.log('전부 통과');
