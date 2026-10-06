// 프라이싱 개편 계산 검증: node scripts/pricingV2.check.ts
import { calcPricesV2, DEFAULT_PRICING_POLICY as P } from '../src/utils/pricingV2.ts';
let fail = 0;
const eq = (name: string, a: unknown, b: unknown) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { fail++; console.error('FAIL', name, a, '!=', b); } else console.log('ok', name); };
const fx = { usd: 1400, jpy: 9 };
const g = (price: number, brand: '바잇미' | 'SSFW' | '그외', core: boolean, live: boolean, overrides = {}) => calcPricesV2({ price, brand, core, live, overrides }, P, fx);
let r = g(15900, '바잇미', false, true);
eq('바잇미 15,900 일반: 오픈특가 · 선오픈 없음 · 라이브(오픈특가 기준)', [r.open, r.pre, r.live], [11900, null, 11310]);
r = g(15900, '바잇미', true, true);
eq('바잇미 15,900 주력: 선오픈 = 오픈특가 −1,000 · 라이브(선오픈 기준)', [r.open, r.pre, r.live], [11900, 10900, 10360]);
r = g(12900, '바잇미', true, true);
eq('바잇미 12,900 주력: 1만원 이하 5% (10원 올림)', [r.open, r.pre, r.live], [9900, 9410, 8940]);
r = g(49000, 'SSFW', true, true);
eq('SSFW 49,000 주력: 10% → 10원 올림', [r.open, r.pre, r.live], [44100, 43100, 42100]);
r = g(9900, '그외', false, false);
eq('그외 9,900: 상시 10% · 특가 20% · 팝업/페어 10% 버림', [r.open, r.live, r.reg, r.spec, r.popup], [8910, null, 8910, 7920, 8910]);
r = g(13990, '바잇미', false, false);
eq('팝업/페어 10원 버림 (13,990 × 90% = 12,591 → 12,590)', r.popup, 12590);
r = g(15900, '바잇미', true, true, { open: { pct: 10 } });
eq('수동 10% → 오픈특가 14,310 → 선오픈 · 라이브 이어서', [r.open, r.pre, r.live], [14310, 13310, 12650]);
r = g(15900, '바잇미', true, true, { pre: 9000 });
eq('선오픈 수동 9,000 → 라이브 8,550', [r.pre, r.live], [9000, 8550]);
r = g(15900, '바잇미', false, false);
eq('B2B 기본값 = 기존 시나리오 (상시 65% · 오픈 −10% · 사입 50%)', [r.b2b, r.b2bOpen, r.buy], [10340, 9300, 7950]);
if (fail) { console.error(`${fail}건 실패`); process.exit(1); }
console.log('전부 통과');
