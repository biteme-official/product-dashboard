/**
 * 발주량 검토의 SKU별 계산 + 문제 목록. 대체값을 쓰거나 값을 믿을 수 없으면 반드시 여기서 문제로 돌려준다.
 * 오류 = 값을 믿을 수 없어 공헌이익 합계에서 빠지고 발주 확정 불가 / 경고 = 계산은 되지만 대체값이 들어간 상태.
 */
import { CHANNELS, disabledChannelQty, getSkuMonths, type SkuData } from '../types';
import type { ChannelDataMap, SkuShipmentInfo, TableauErrorReason, TeamCateMap } from '../services/tableau';
import { TABLEAU_ERROR_MESSAGES } from '../services/tableau';
import { buildCompareData, calcVarCostResults, compareNamesOf, type CompareData } from './compareData';
import { priceOptOf, qtyOf, skuMoney, type MoneyBasis, type Pricer, type SkuMoney, type VarCostResults } from './reviewSku';
import { isKnownStep1Opt, step1Pricer } from './step1Price';
import type { PricingPolicy } from './pricingV2';

export type IssueLevel = 'error' | 'warn';
export interface ReviewIssue { level: IssueLevel; what: string; effect: string; fix: string }

export interface ReviewCtx {
  policy: PricingPolicy;
  policyIsDefault: boolean;
  fx: { usd: number; jpy: number; live: boolean };
  shipments: SkuShipmentInfo[];
  channelMap: ChannelDataMap | null;
  teamCate: TeamCateMap | null;
  loading: boolean;
  errors: { shipments: TableauErrorReason | null; channel: TableauErrorReason | null; teamCate: TableauErrorReason | null };
}

export interface SkuReview { money: SkuMoney; compare: CompareData; issues: ReviewIssue[]; pricer: Pricer; varCost: VarCostResults | null }

/** 태블로 없이 판단하는 오류 — SKU 카드의 발주 확정도 이 기준으로 막는다 */
export function dataIssues(sku: SkuData): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const add = (what: string, effect: string, fix: string) => out.push({ level: 'error', what, effect, fix });
  if (!sku.cost) add('원가 없음', '공헌이익 · 발주금액 합계 제외', '기본정보 또는 CPO에서 원가 입력');
  if (!sku.price) add('판매가 없음', '순매출 계산 불가', '기본정보 또는 CPO에서 판매가 입력');
  if (!sku.releaseDate) add('오픈일 없음', '월 계산 불가', 'CPO에서 오픈일 입력');
  if (sku.hasColors) {
    const sum = sku.colors.reduce((a, c) => a + (c.archived ? 0 : c.quantity), 0);
    if (sum !== sku.totalOrderQty) add(`컬러 합계 ${sum.toLocaleString()} ≠ 발주량 ${sku.totalOrderQty.toLocaleString()}`, '옵션별 수량을 믿을 수 없음', 'SKU 카드에서 컬러 수량 확인');
  }
  return out;
}

function reviewSku(sku: SkuData, ctx: ReviewCtx, basis: MoneyBasis): SkuReview {
  const pricer = step1Pricer(sku, ctx.policy, { usd: ctx.fx.usd, jpy: ctx.fx.jpy });
  const compare = buildCompareData(sku, ctx.shipments, ctx.channelMap);
  const varCost = ctx.teamCate ? calcVarCostResults(ctx.teamCate, sku, compare.mode, compare.channelYM) : null;
  const money = skuMoney(sku, { pricer, varCost, basis });
  const issues = dataIssues(sku);
  const add = (level: IssueLevel, what: string, effect: string, fix: string) => issues.push({ level, what, effect, fix });

  const names = compareNamesOf(sku);
  if (!ctx.errors.shipments && !ctx.loading) {
    if (names.length === 0) add('warn', '대응SKU 없음', '증감 비교 불가 · 변동비 기간은 최근 12개월', '이 화면에서 대응SKU 추가');
    names.filter((n) => !ctx.shipments.some((s) => s.name === n))
      .forEach((n) => add('warn', `대응SKU "${n}" 태블로에 없음`, '이 이름은 실적 합계에서 빠짐', '이름 다시 선택'));
  }
  if (money.planQty === 0) add('warn', '판매 목표 미입력', '순매출 · 공헌이익 0', '월 계획 입력 또는 대응SKU로 채우기');

  const sold = money.channels.filter((c) => c.planQty > 0);
  const dflt = sold.filter((c) => c.varSource === 'default').map((c) => c.channel);
  if (dflt.length) add('warn', `${dflt.join('·')} 변동비 데이터 없음`, '해당 채널만 25%로 대체 계산', '태블로 팀카테 데이터 확인');
  const period = sold.filter((c) => c.varSource === 'period').map((c) => c.channel);
  if (period.length) add('warn', `${period.join('·')} 지정 기간 변동비 없음`, '가장 최근 데이터로 대체 계산', '비교 기간 변경 또는 데이터 확인');

  const months = getSkuMonths(sku.releaseDate);
  const unknown = CHANNELS.filter((c) => months.some((m) => qtyOf(sku, c, m) > 0 && !isKnownStep1Opt(priceOptOf(sku, c, m))));
  if (unknown.length) add('warn', `${unknown.join('·')} 알 수 없는 판매가 선택지`, '기본 판매가로 계산', '채널 판매가 다시 선택');

  const hidden = disabledChannelQty(sku);
  if (hidden > 0) add('error', `비운영 채널에 수량 ${hidden.toLocaleString()}개`, '합계에서 제외되어 값이 다름', '관리 › 채널 관리 또는 카드에서 확인');
  const splitSum = months.reduce((a, m) => a + (sku.monthlySplit.find((x) => x.month === m)?.quantity ?? 0), 0);
  if (splitSum !== money.planQty) add('warn', `월 계획 합 ${splitSum.toLocaleString()} ≠ 채널 합 ${money.planQty.toLocaleString()}`, '카드 판정 칩과 합계가 약간 다를 수 있음 · 금액은 채널 합 기준', '월 계획을 한 칸 다시 저장');
  if (![money.revenue, money.profit ?? 0, money.planQty].every(Number.isFinite)) add('error', '금액 계산 결과 숫자 아님', '합계 제외', '판매가 · 원가 · 수량 확인');
  return { money, compare, issues, pricer, varCost };
}

// 조건(ctx)이 같으면 안 바뀐 SKU는 다시 계산하지 않는다 — SKU 객체는 바뀐 것만 새로 만들어진다
const cache = new WeakMap<ReviewCtx, WeakMap<SkuData, Partial<Record<MoneyBasis, SkuReview>>>>();
export function cachedReview(sku: SkuData, ctx: ReviewCtx, basis: MoneyBasis): SkuReview {
  let byCtx = cache.get(ctx);
  if (!byCtx) { byCtx = new WeakMap(); cache.set(ctx, byCtx); }
  let bySku = byCtx.get(sku);
  if (!bySku) { bySku = {}; byCtx.set(sku, bySku); }
  return (bySku[basis] ??= reviewSku(sku, ctx, basis));
}

/** SKU와 무관한 전체 문제 */
export function globalIssues(ctx: ReviewCtx, skus: SkuData[], listenerError: string | null): ReviewIssue[] {
  const out: ReviewIssue[] = [];
  const add = (level: IssueLevel, what: string, effect: string, fix: string) => out.push({ level, what, effect, fix });
  if (listenerError) add('error', '실시간 구독 끊김', '저장과 확정 중단 · 화면 값이 최신이 아닐 수 있음', '새로고침');
  if (ctx.errors.teamCate) add('error', `변동비 데이터 로드 실패 · ${TABLEAU_ERROR_MESSAGES[ctx.errors.teamCate]}`, '공헌이익 · CM 계산 중단 · 25% 대체 안 함', '다시 시도');
  if (ctx.errors.shipments) add('warn', `대응SKU 실적 로드 실패 · ${TABLEAU_ERROR_MESSAGES[ctx.errors.shipments]}`, '대응SKU 행 · 증감 비움 · 변동비 기간은 최근 12개월', '다시 시도');
  if (ctx.errors.channel) add('warn', `채널별 실적 로드 실패 · ${TABLEAU_ERROR_MESSAGES[ctx.errors.channel]}`, '채널별 대응 실적 비움', '다시 시도');
  if (!ctx.fx.live && skus.some((s) => s.channelMonthQty.some((e) => (e.channel === '글로벌' || e.channel === '일본') && e.qty > 0))) {
    add('warn', '환율 기본값 사용 중', '글로벌 · 일본 공급가가 1,400 · 9.0 기준', '환율 API 복구 후 새로고침');
  }
  if (ctx.policyIsDefault) add('warn', '할인 정책 기본값 사용 중', '관리에서 저장한 정책 문서 없음', '관리 › 할인 정책 확인');
  return out;
}
