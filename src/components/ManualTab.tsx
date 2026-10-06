import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BRANDS, type Brand } from '../types';
import { usePricingPolicy } from '../hooks/usePricingPolicy';
import { useExchangeRates } from '../utils/useExchangeRates';
import { calcPricesV2, ROUND_LABEL, type PriceKey } from '../utils/pricingV2';

/**
 * 메뉴얼 탭 — CPO 대시보드 매뉴얼과 같은 구성(역할별 바로가기 · 고정 섹션 탭 · 카드 · 단계 흐름 · 예시 그림).
 * 스타일은 .pman 아래로만 스코프. 표는 word-break: keep-all로 한국어 단어 단위 줄바꿈.
 * 프라이싱 예시 · 계산기는 운영 할인 정책(config/pricingPolicy) · 실시간 환율로 계산.
 */

const SECTIONS = [
  { id: 'start', label: '🚪 시작하기' },
  { id: 'roles', label: '🔑 역할 · 권한' },
  { id: 'cpo', label: '🔗 CPO 연동' },
  { id: 'card', label: '🪪 SKU 카드' },
  { id: 'step1', label: '1️⃣ 월 계획' },
  { id: 'target', label: '2️⃣ 채널별 목표량' },
  { id: 'step2', label: '3️⃣ STEP 2' },
  { id: 'projection', label: '📋 프로젝션' },
  { id: 'pricing', label: '💰 프라이싱' },
  { id: 'formula', label: '🧮 계산 수식' },
  { id: 'data', label: '🔌 데이터 · 환율' },
  { id: 'summary', label: '📈 채널별 요약' },
  { id: 'admin', label: '⚙️ 관리 · 확정' },
  { id: 'etc', label: '🧭 참고' },
] as const;
type SectionId = typeof SECTIONS[number]['id'];

/** 섹션으로 이동 — 앱 고정 바 + 섹션 탭 높이만큼 띄움 */
function go(id: SectionId) {
  const el = document.getElementById(id);
  if (!el) return;
  const bar = document.querySelector<HTMLElement>('[data-app-sticky]')?.offsetHeight ?? 0;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 52, behavior: 'smooth' });
}
function Jump({ to, children }: { to: SectionId; children: ReactNode }) {
  return <button type="button" className="jump" onClick={() => go(to)}>{children}</button>;
}

const fmt = (n: number | null | undefined) => (n == null ? '–' : Math.round(n).toLocaleString('ko-KR'));
/** 판매가 대비 할인율 — 정수 반올림 (프라이싱 탭과 같음) */
const pctOf = (price: number, base: number) => (base > 0 ? Math.round(Number(((1 - price / base) * 100).toFixed(6))) : 0);

export function ManualTab() {
  const [current, setCurrent] = useState<SectionId>('start');
  const [stickyTop, setStickyTop] = useState(0);
  const navRef = useRef<HTMLDivElement>(null);

  // 앱 상단 고정 바(탭) 바로 아래에 섹션 탭을 붙임
  useLayoutEffect(() => {
    const bar = document.querySelector<HTMLElement>('[data-app-sticky]');
    if (!bar) return;
    const update = () => setStickyTop(bar.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setCurrent(e.target.id as SectionId); }),
      { rootMargin: `-${stickyTop + 60}px 0px -70% 0px` },
    );
    SECTIONS.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [stickyTop]);

  // 현재 섹션 탭이 탭 줄 가운데 오도록
  useEffect(() => {
    const nav = navRef.current;
    const btn = nav?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
    if (nav && btn) nav.scrollLeft = btn.offsetLeft - nav.clientWidth / 2 + btn.clientWidth / 2;
  }, [current]);


  return (
    <div className="pman">
      <style>{MANUAL_CSS}</style>

      {/* ── 머리말 ── */}
      <header className="hero">
        <div className="hero-inner">
          <div className="eyebrow-top">🐾 Product Dashboard · User Guide</div>
          <h1>Product 대시보드 가이드</h1>
          <p className="lede">신규 SKU 하나가 나오기까지 필요한 <b>발주 수량 · 채널별 목표 · 판매가</b>를 한 화면에 모아두는 곳. 각자 자기 파트만 채우면 예상 매출 · 이익은 자동 계산.</p>

          <div className="flow-hero" aria-label="SKU 한 개가 거치는 순서">
            {[
              ['CPO 기획', 'SKU 카드 자동 생성', 'vw', 'CPO 대시보드'],
              ['월 계획', '달마다 몇 개 팔지', 'pm', 'PM'],
              ['채널별 목표량', '어디서 몇 개 팔지', 'bmd', 'MD · 글로벌'],
              ['채널 · 오픈일정 확정', '담당 그룹별 잠금', 'bmd', 'MD · 글로벌'],
              ['프라이싱 확정', '상황별 가격 잠금', 'pmd', 'MD · PM'],
              ['최종 발주 확정', '옵션별 발주량', 'pm', 'PM'],
            ].map(([t, d, c, w], i, arr) => (
              <div key={t} className="fh-wrap">
                <div className="fh"><b>{t}</b><span>{d}</span><span className={`rb ${c}`}>{w}</span></div>
                {i < arr.length - 1 && <span className="arr">→</span>}
              </div>
            ))}
          </div>

          <div className="role-grid" aria-label="역할별 바로가기">
            <div className="role-card">
              <div><span className="rb pm">PM · CPO</span></div>
              <ul><li>SKU 기본 정보 · 월 비중 입력</li><li>전 채널 목표량 · 비중 조정</li><li>프라이싱 수정 · 확정</li><li>최종 발주 확정</li></ul>
              <div className="go"><Jump to="step1">월 계획</Jump><Jump to="pricing">프라이싱</Jump><Jump to="admin">발주 확정</Jump></div>
            </div>
            <div className="role-card">
              <div className="rbs"><span className="rb pmd">플랫폼MD</span><span className="rb bmd">브랜드MD</span><span className="rb gl">글로벌</span></div>
              <ul><li>담당 채널 목표량 입력 · 확정</li><li>채널별 오픈일정 입력 · 확정</li><li>프라이싱 수정 · 확정 (글로벌 제외)</li></ul>
              <div className="go"><Jump to="target">채널별 목표량</Jump><Jump to="projection">오픈일정</Jump><Jump to="pricing">프라이싱</Jump></div>
            </div>
            <div className="role-card">
              <div className="rbs"><span className="rb vw">VIEWER</span><span className="rb master">MASTER</span></div>
              <ul><li>VIEWER: 전부 보기만</li><li>MASTER: 전부 + PIN · 권한 · 백업 · 할인 정책</li></ul>
              <div className="go"><Jump to="summary">채널별 요약</Jump><Jump to="admin">관리 탭</Jump></div>
            </div>
          </div>
        </div>
      </header>

      {/* ── 섹션 탭 (고정) ── */}
      <nav className="nav" style={{ top: stickyTop }} aria-label="섹션">
        <div className="nav-inner" ref={navRef}>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" data-tab={s.id} className={`tab ${current === s.id ? 'current' : ''}`} onClick={() => go(s.id)}>{s.label}</button>
          ))}
        </div>
      </nav>

      <main className="body">

        {/* ═════════ 시작하기 ═════════ */}
        <Section id="start" eyebrow="Orientation" color="var(--accent)" title="🚪 시작하기" lede="상단 메인 탭 5개 · 로그인하면 항상 프로젝션 › LIST VIEW부터 시작.">
          <Card title="🗺️ 메뉴 지도">
            <Tbl minW={560} cols={['k', '', 'e']} head={['탭', '여기서 하는 일', '누가 주로']} rows={[
              ['프로젝션', 'LIST VIEW · 채널별 오픈일정 · 채널 목표량 · 프라이싱 (서브탭 4개)', '전원'],
              ['└ LIST VIEW', '전체 SKU 표 · 확정 현황 한눈에', '전원'],
              ['└ 채널별 오픈일정', '채널마다 오픈 날짜 · 선오픈 표시', 'MD · 글로벌'],
              ['└ 채널 목표량', '여러 SKU의 STEP 1을 한 화면에서 · 일괄 작업', 'PM · MD'],
              ['└ 프라이싱', '상황별 가격 비교 · 수정 · 확정', 'PM · MD'],
              ['SKU 리스트', 'SKU 카드 목록 · 카드 ↔ 표 보기 전환', 'PM · MD'],
              ['채널별 요약', '전체 SKU 채널별 수량 · 매출 · 이익 집계', 'MD · 전략'],
              ['메뉴얼', '지금 이 페이지', '전원'],
              ['관리', 'PIN · 권한 · SKU 관리(할인 정책 · 채널 관리 · 시즌 한정) · 데이터 정리 · 메모', 'MASTER'],
            ]} />
          </Card>
          <Card title="📖 자주 나오는 말">
            <Tbl minW={620} cols={['k', '', 'e']} head={['용어', '뜻', '쉽게']} rows={[
              ['SKU', '개별 제품 단위 · 판매가가 다르면 별도 SKU', '상품 하나'],
              ['대응 SKU', '새 SKU와 비슷한 기존 판매 SKU', '“이거랑 비슷하게 팔리겠지” 기준 상품'],
              ['발주량 · MOQ', '제조사 주문 수량 · 최소 주문 수량', '만드는 수량 · 최소 이만큼은 만들어야 함'],
              ['판매 목표', '출시월부터 8개월간 채널×월 목표량 합계', '팔 계획 · 리오더까지 넣으면 발주량보다 클 수 있음'],
              ['리오더 / 시즌 한정', '첫 발주 후 추가 발주 / 리오더 없는 상품 (관리 탭에서 지정)', '다시 만들 수 있나 없나'],
              ['채널', '자사몰 · 스스 · 위탁 · 쿠팡 · B2B · 사입및페어 · 글로벌 · 일본 (+ 마케팅)', '파는 곳'],
              ['순매출', '부가세 뺀 매출', '가격 ÷ 1.1 × 수량'],
              ['공헌이익 · CM%', '순매출 − 변동비 − 원가 · 그 비율', '실제로 남는 돈 · 남는 비율'],
              ['변동비율', '순매출 대비 영업비용(수수료 등) 비중 · Tableau 팀카테 기준', '팔 때마다 나가는 비용 비율'],
              ['연도별 소계', '8개월을 연도로 나눈 합계', '10월 출시 → 26년(10~12월) · 27년(1~5월)'],
              ['CPO 연동', 'CPO 대시보드 기획 문서와 연결된 SKU', '원본은 CPO · 일부 칸 잠김 (역할 “CPO”와 다른 말)'],
              ['주력 SKU', '관리 › 할인 정책에서 지정 · 선오픈 최저가 대상', '힘줘서 미는 상품'],
            ]} />
          </Card>
        </Section>

        {/* ═════════ 역할 · 권한 ═════════ */}
        <Section id="roles" eyebrow="Who does what" color="var(--accent)" title="🔑 역할 · 권한" lede="역할별 4자리 PIN 로그인 · 담당 채널만 수정 · 나머지는 보기만.">
          <Card title={<>✅ 역할별로 할 수 있는 것 <span className="sub">기본값 · 관리 › 권한 관리에서 MASTER가 변경 가능</span></>}>
            <div className="tw">
              <table style={{ minWidth: 720 }}>
                <thead><tr>
                  <th>할 수 있는 것</th>
                  <th><span className="rb master">MASTER</span></th><th><span className="rb pm">PM</span></th>
                  <th><span className="rb pmd">플랫폼MD</span></th><th><span className="rb bmd">브랜드MD</span></th>
                  <th><span className="rb gl">글로벌</span></th><th><span className="rb vw">VIEWER</span></th>
                </tr></thead>
                <tbody>
                  {([
                    ['SKU 기본 정보', 'y', 'y', '', '', '', ''],
                    ['월 계획 (월 비중)', 'y', 'y', '', '', '', ''],
                    ['채널별 목표량', '전체', '전체', '자사몰 · 마케팅', '스스 · 위탁 · B2B · 쿠팡 · 사입및페어', '글로벌 · 일본', ''],
                    ['채널 확정 · 오픈일정 확정', '전체', '전체', '플랫폼 그룹', '브랜드 그룹', '글로벌 그룹', ''],
                    ['프라이싱 수정 · 확정', 'y', 'y', 'y', 'y', '', ''],
                    ['최종 발주 확정', 'y', 'y', '', '', '', ''],
                    ['여러 채널 한꺼번에 바꾸기', 'y', 'y', '', '', '', ''],
                    ['관리 탭 (PIN · 권한 · 백업 복원 · 할인 정책)', 'y', '', '', '', '', ''],
                  ] as const).map(([k, ...v]) => (
                    <tr key={k}>
                      <td className="k">{k}</td>
                      {v.map((x, i) => (
                        <td key={i} className={`c ${x === 'y' || x === '전체' ? 'y' : x ? 'part' : 'n'}`}>{x === 'y' ? '●' : x || '–'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sub">
              * 여러 채널 한꺼번에 = [채널 비중 수정] · [대응SKU 비중으로 다시 나누기] · [판매 목표를 발주량에 맞추기]<br />
              * 권한 관리 5개 항목: SKU 기본정보 · 월 계획 · 채널별 목표량 · 오픈일정 확정 · 발주 확정 (MASTER 행은 항상 전체 고정)<br />
              * 구 마케팅 · CS 역할은 VIEWER로 통합 · 기존 PIN 자동 승계
            </p>
          </Card>
          <Callout tone="warn" icon="⚠️" title="PM 역할 이름이 화면마다 다름">
            로그인 · 상단 배지 = <b>PM</b> · 확정 이력 · 휴지통 = <b>CPO</b> · 같은 역할(<code>pm</code>) · “CPO 대시보드 연동”과 무관
          </Callout>
        </Section>

        {/* ═════════ CPO 연동 ═════════ */}
        <Section id="cpo" eyebrow="Source of truth" color="var(--accent)" title="🔗 CPO 대시보드 연동">
          <Easy>새 SKU는 대부분 CPO 대시보드에서 먼저 기획 → 자동으로 여기로 넘어옴 · <b>CPO = 원본 · 여기 = 사본</b> · 그래서 일부 칸은 CPO에서만 수정.</Easy>
          <Card title="🌈 CPO 기획 상태 8단계">
            <div className="stepper">
              {([
                ['기획/아이디어', 'rose'], ['시안/샘플링', 'warn'], ['제작 시작', 'amber'], ['상세 작성', 'ok'],
                ['사진 촬영', 'teal'], ['상세 작업중', 'sky'], ['상세 완료', 'accent'], ['오픈/완료', 'violet'],
              ] as const).map(([l, c], i) => (
                <span key={l} className="stepper-item">
                  <span className="chip" style={{ background: `var(--${c}-soft)`, color: `var(--${c})` }}><span className="d" style={{ background: `var(--${c})` }} />{l}</span>
                  {i < 7 && <span className="ar">→</span>}
                </span>
              ))}
            </div>
            <div className="legend">
              <span><i style={{ background: 'var(--faint)' }} />Holding — 잠시 보류 (카드 숨김)</span>
              <span><i style={{ background: 'var(--muted)' }} />Cancel — 완전 취소 (카드 숨김)</span>
            </div>
          </Card>
          <div className="grid2">
            <Mini title="🆕 자동 생성">CPO 기획이 8단계 중 하나 · 여기 카드 없음 → 카드 자동 생성</Mini>
            <Mini title="🙈 목록에서 숨김">Holding · Cancel · 오픈일 없음 → LIST VIEW 등에서 숨김 · 데이터는 그대로 · 조건 풀리면 다시 보임</Mini>
            <Mini title="🗑️ 자동 휴지통">CPO 기획이 사라지면 휴지통으로 (15일 뒤 영구삭제) · 직접 휴지통 보낸 카드는 안 살아남</Mini>
            <Mini title="🛠️ 관리 탭은 예외">숨김 규칙 상관없이 전체 SKU 표시 · 숨은 데이터 점검용</Mini>
          </div>
          <Card title={<>🔒 어느 칸을 어디서 고치나 <span className="sub">CPO 연동 SKU 기준</span></>}>
            <Tbl minW={560} cols={['k', '', 'e']} head={['항목', '상태', '화면에서는']} rows={[
              ['오픈일', <Pill c="sky">↔ 양방향</Pill>, '어느 쪽에서 고쳐도 서로 반영'],
              ['SKU명', <Pill c="amber">🔒 CPO 전용</Pill>, '입력칸 대신 [기획 보러가기 ↗]'],
              ['판매가 · 원가 · 정가', <Pill c="amber">🔒 CPO 전용</Pill>, '회색 읽기전용 · 미확정이면 “CPO 미확정”'],
              ['입고 · 촬영예정일', <Pill c="amber">🔒 CPO 전용</Pill>, '날짜칸 잠금'],
              ['컬러 · 사이즈 옵션 · 썸네일', <Pill c="amber">🔒 CPO 전용</Pill>, 'CPO 등록 내용 그대로'],
              ['그 외 (발주량 · MOQ · STEP 1·2 · 프라이싱)', <Pill c="ok">✏️ 여기서 수정</Pill>, 'CPO와 무관'],
            ]} />
            <p className="sub">* 카드 상단에 CPO 진행상태 배지 + 기획 담당자 이름 (읽기 전용) · CPO 미연동(예전) SKU는 잠금 없이 전부 직접 입력</p>
          </Card>
          <Callout tone="warn" icon="⚠️" title="“잠금”이 두 종류">
            <ul>
              <li><b>CPO 잠금</b> — 판매가 · 원가 · 정가 · CPO 연동 여부로 결정</li>
              <li><b>가격 확정 잠금</b> — 프로젝션 › 프라이싱에서 사람이 확정 · 프라이싱 가격 칸 잠금</li>
              <li>둘은 별개 · 동시에 걸릴 수 있음</li>
            </ul>
          </Callout>
        </Section>

        {/* ═════════ SKU 카드 ═════════ */}
        <Section id="card" eyebrow="Anatomy" color="var(--sky)" title="🪪 SKU 카드" lede="SKU 하나의 모든 계획이 들어 있는 카드 · SKU 리스트 탭 · 채널 목표량 탭에서 열림.">
          <Card title="🧩 카드 구성 (위 → 아래)">
            <Steps items={[
              ['기본 정보', 'SKU명 · 브랜드 · 카테고리 · 제품 유형 · 출시일 · 원가 · 판매가 · 총 발주량 · MOQ · 사이즈 · 컬러 수 · 🔒 가격 확정됨 배지'],
              ['대응 SKU 패널', '비교할 기존 SKU 검색 · Tableau 실적 자동 로드 · 비교 기간 선택'],
              ['STEP 탭', 'STEP 1 = 월 계획(위) + 채널별 목표량(아래) 한 화면 · STEP 2 = 채널별 수량 확인'],
              ['프라이싱 안내', '가격 보기 · 확정은 프로젝션 › 프라이싱 탭으로 이동'],
            ]} />
          </Card>
          <Card title="🔍 대응 SKU 패널">
            <ul>
              <li><b>여러 개 선택 가능</b> — 출고량 합산해서 기준으로 사용</li>
              <li><b>월평균 · 연간 출고량</b> — 선택 기간 기준 자동</li>
              <li><b>채널별 출고 비중</b> — 차트 · 채널별 목표량 첫 배분에 사용</li>
              <li><b>증감률 비교</b> — 대응SKU vs 우리 계획 · 월 출고량 = 판매 목표 ÷ 수량 있는 달 수 · 판매가 = 기본정보 판매가</li>
            </ul>
            <PeriodTimeline />
            <p className="sub">* 비교 기간 선택 = 변동비율 계산 기간도 같이 바뀜</p>
          </Card>
        </Section>

        {/* ═════════ STEP 1 월 계획 ═════════ */}
        <Section id="step1" eyebrow="STEP 1 · ① PM" color="var(--violet)" title="1️⃣ 월 계획과 발주량 커버">
          <Easy>수량의 원본은 <b>채널 × 월 표 하나</b> · PM은 <b>세로 합계(월)</b>, MD는 <b>가로 합계(채널)</b>를 만지는 손잡이 · 어디를 고쳐도 같은 표라 숫자가 안 어긋남.</Easy>
          <Card title={<>🧱 표 하나, 손잡이 둘 <Sample /></>}>
            <div className="viz" style={{ overflowX: 'auto' }}>
              <table className="matrix">
                <thead><tr><th /><th>10월</th><th>11월</th><th>12월</th><th>…</th><th className="sum">채널 합계 → MD</th></tr></thead>
                <tbody>
                  <tr><td className="rh">자사몰</td><td>60</td><td>40</td><td>30</td><td>…</td><td className="sum">200</td></tr>
                  <tr><td className="rh">스스</td><td>90</td><td>60</td><td>45</td><td>…</td><td className="sum">300</td></tr>
                  <tr><td className="rh">B2B</td><td className="cf">45 🔒</td><td className="cf">30 🔒</td><td className="cf">22 🔒</td><td>…</td><td className="sum">150</td></tr>
                  <tr><td className="rh">…</td><td>…</td><td>…</td><td>…</td><td>…</td><td className="sum">…</td></tr>
                  <tr><td className="rh" style={{ color: 'var(--accent)' }}>월 합계 → PM</td><td className="sum">300</td><td className="sum">200</td><td className="sum">150</td><td className="sum">…</td><td className="sum">1,000</td></tr>
                </tbody>
              </table>
              <p className="viz-cap">초록 🔒 = 확정된 채널 · 월 비중 · 채널 비중을 바꿔도 그대로 · 나머지 채널만 움직임</p>
            </div>
          </Card>
          <Card title={<>📋 월 계획 표 읽는 법 <span className="sub">출시월부터 8개월</span></>}>
            <Tbl minW={600} cols={['k', '', 'e']} head={['행', '뜻', '쉽게']} rows={[
              ['총 발주량', '발주량&사이즈분배에서 입력 · 월 비중의 기준선', '없으면 월 비중 입력 잠김'],
              ['대응SKU 실적', '대응SKU 월별 출고량', '참고용'],
              ['수량', '그 달 채널 합계 + 마케팅', '읽기 전용 · 표에서 자동'],
              ['비중 (입력)', '총 발주량 대비 그 달 판매 목표 %', '합계 100% 넘어도 OK · 160% = 발주량의 1.6배 판매 계획'],
              ['누적', '월별 누적 판매 목표', '발주량 넘는 달부터 주황 · “리오더 시작”(시즌 한정은 “품절 예상”)'],
              ['증감율', '대응SKU 실적 대비 월별 · 연도별', '참고용'],
            ]} />
          </Card>
          <Card title="🔁 월 비중을 고치면">
            <Steps items={[
              ['월 비중 입력', '예: 10월 30% → 40% · 칸 벗어나거나 Enter 시 반영'],
              ['그 달 수량 변경', '총 발주량 × 비중 = 1,000 × 40% = 400'],
              ['채널로 나눔', '그 달 채널 구성비 그대로 · 확정 채널 · 마케팅은 제외'],
            ]} />
            <p className="sub">* 다른 달은 영향 없음 · 비어 있던 달은 대응SKU 채널 비중(없으면 기본 채널비중)으로 채움 · 운영 채널 전부 확정 → 월 비중 입력 잠김</p>
          </Card>
          <Card title={<>🩷 발주량 커버 안내 <Sample /> <span className="sub">화면 오른쪽 위 분홍 형광펜</span></>}>
            <CoverChart />
            <Tbl minW={600} cols={['k', '', '']} head={['판매 목표 vs 발주량', '리오더 가능 (기본)', '시즌 한정']} rows={[
              ['목표 > 발주량', '발주량으로 N월까지 커버 · N월부터 리오더 약 N개', '품절 위험 · N월 조기 품절 예상 · N개 부족'],
              ['목표 = 발주량', '판매 목표 = 발주량', '판매 목표 = 발주량'],
              ['목표 < 발주량', '잔여 재고 · 시즌 후 약 N개 · 다음 시즌 이월', '과재고 위험 · 시즌 후 잔여 약 N개'],
            ]} />
            <p className="sub">
              * 시즌 한정 SKU만 [판매 목표를 발주량에 맞추기] 표시 — 월 · 채널 모양 유지 · 크기만 맞춤 (확정 채널 제외)<br />
              * 예전 “MOQ 미달!” 배지 · [비례반영] 버튼은 없어짐
            </p>
          </Card>
          <Callout tone="warn" icon="⚠️" title="시즌 한정 ≠ SKU 구분 “시즈널”">
            <ul>
              <li>리오더 여부 = <b>관리 › SKU 관리 › 시즌 한정</b>에서 SKU별 지정</li>
              <li>SKU 구분(시즈널 · 스테디 · 미해당)은 분류 표시용</li>
              <li>시즌 한정 지정한 적 없는 SKU → SKU 구분이 시즈널일 때만 시즌 한정으로 봄</li>
            </ul>
          </Callout>
        </Section>

        {/* ═════════ 채널별 목표량 ═════════ */}
        <Section id="target" eyebrow="STEP 1 · ② MD" color="var(--violet)" title="2️⃣ 채널별 목표량" lede="월 계획 바로 아래 표 · 채널 · 월별 수량과 판매가 시나리오 설정 · 예상 순매출 · 공헌이익 실시간.">
          <Card title={<>🌱 처음 채워지는 방식 <span className="sub">표가 비어 있을 때 한 번</span></>}>
            <Steps items={[
              ['월 계획', '월 비중 입력값 · 없으면 총 발주량을 8개월 균등'],
              ['채널 비중', '대응SKU 채널별 출고 비중 · 없으면 아래 기본 채널비중'],
              ['채널 × 월 목표량', '매달 월 수량을 채널 비중대로 나눔'],
            ]} />
            <DefaultMix />
            <ul>
              <li>쿠팡 비활성 SKU · 글로벌/일본 OFF SKU → 배분에서 빠지고 그 비중은 나머지 채널로</li>
              <li>대응SKU 채널 데이터를 아직 못 받았으면 자동 세팅 대기 → [대응SKU 비중으로 다시 나누기]로 채우기</li>
            </ul>
          </Card>
          <Card title="🎛️ 수량 조정 방법">
            <Tbl minW={680} cols={['k', '', 'e', 'e nw']} head={['방법', '하는 법', '결과', '권한']} rows={[
              ['칸 직접 수정', '채널 펼침 → 월별 수량 입력', '그 칸만 · 월 비중 · 채널 비중 자동 재계산', '담당 채널'],
              ['채널 비중 수정', '[채널 비중 수정] → 여러 채널 % 입력 → [저장]', '월 합계 유지 · 안 고친 채널이 남은 % 나눠 가짐 · 수정+확정 합계 100% 초과 시 저장 불가', 'MASTER · PM'],
              ['대응SKU 비중으로 다시 나누기', '버튼 클릭', '월 합계 유지 · 대응SKU 비중으로 다시 · 손으로 고친 값도 재계산', 'MASTER · PM'],
              ['판매 목표를 발주량에 맞추기', '시즌 한정 SKU만', '모양 유지 · 크기만 총 발주량에', 'MASTER · PM'],
              ['되돌리기', '조정 직후 버튼', '직전 상태로 · 카드 닫으면 불가', '—'],
            ]} />
            <Callout tone="note" icon="💡" title="대응SKU를 바꿔도 표는 그대로">“대응SKU 변경됨” 안내만 표시 · 새 비중 쓰려면 [대응SKU 비중으로 다시 나누기]</Callout>
          </Card>
          <Card title="📊 채널 표 읽는 법">
            <div className="grid2">
              <Mini title="접힌 상태 (채널 요약)">
                <ul>
                  <li>비중 — 전체 대비 그 채널 %</li>
                  <li>총수량 — 월 합산 · 기준 대비 Δ</li>
                  <li>실매출단가 — 수량 가중평균 가격</li>
                  <li>순매출 · 공헌이익 · 변동비율(~ = 근사값)</li>
                  <li>CM% — <span className="cr-g">≥40%</span> · <span className="cr-y">≥30%</span> · <span className="cr-r">&lt;30%</span></li>
                </ul>
              </Mini>
              <Mini title="펼친 상태 (채널 상세)">
                <ul>
                  <li>대응SKU 비교(회색) — 참고용</li>
                  <li>목표 수량 입력 — 옆에 대응SKU 대비 증감율</li>
                  <li>판매가 설정 — 월별 시나리오 · [일괄반영]</li>
                  <li>실 판매가 — 글로벌 · 일본은 외화 함께</li>
                  <li><span style={{ color: 'var(--sky)' }}>예상 순매출</span> · <span style={{ color: 'var(--ok)' }}>예상 공헌이익</span> · 연도별 합계</li>
                </ul>
              </Mini>
            </div>
            <p className="sub">* 변동비율 데이터 없으면 25% · 채널 수수료율 입력값은 참고용(계산 미반영)</p>
          </Card>
          <Card title="🔐 채널 확정 — 그룹 3개">
            <Tbl minW={520} cols={['k', '', 'e']} head={['확정 그룹', '대상 채널', '누가']} rows={[
              [<span className="rb pmd">플랫폼 확정</span>, '자사몰 · 마케팅', '플랫폼MD · MASTER · PM'],
              [<span className="rb bmd">브랜드 확정</span>, '스스 · 위탁 · B2B · 쿠팡 · 사입및페어', '브랜드MD · MASTER · PM'],
              [<span className="rb gl">글로벌 확정</span>, '글로벌 · 일본', '글로벌 · MASTER · PM'],
            ]} />
            <p className="sub">* 확정 = 그 그룹 수량 잠금 · 월 비중 · 채널 비중 · 다시 나누기에서 빠지고 나머지만 조정 · 전부 확정되면 비중 입력 잠김</p>
          </Card>
          <Card title={<>🎁 마케팅 채널 <span className="sub">B2C 아래 별도 · 협찬 · 샘플용</span></>}>
            <ul>
              <li>판매 아님 → 매출 0 · <b>원가 × 수량만큼 비용</b> (빨간 예상 비용)</li>
              <li>합계 행 공헌이익 = B2C+B2B 공헌이익 − 원가 × 마케팅 수량</li>
              <li>합계 CM% = 위 공헌이익 ÷ B2C+B2B 순매출</li>
              <li>카드 상단 스코어카드도 공헌이익만 마케팅 비용 차감</li>
            </ul>
          </Card>
        </Section>

        {/* ═════════ STEP 2 ═════════ */}
        <Section id="step2" eyebrow="STEP 2 · 확인용" color="var(--violet)" title="3️⃣ STEP 2 — 채널별 수량 확인">
          <Easy>STEP 1에서 정한 수량을 <b>옵션(컬러 · 사이즈)별로 쪼개 보는 화면</b> · 입력 없음 · 재무 계산 없음.</Easy>
          <Card>
            <Tbl minW={520} cols={['k', '']} head={['항목', '내용']} rows={[
              ['채널별 수량', 'B2C → 마케팅 → B2B 순'],
              ['마케팅 행 (분홍)', 'STEP 1 마케팅 수량 그대로 · 비중은 전체 합계 기준'],
              ['옵션별 수량', <>채널 월 수량 × 컬러 비중 × 사이즈 비중 <span className="sub">예: 100개 × 블랙 60% × M 50% = 30개</span></>],
              ['연도별 소계 · 전체 합계', '출시연도 · 익년 각각 · 8개월 전체 (마케팅 포함)'],
            ]} />
          </Card>
        </Section>

        {/* ═════════ 프로젝션 ═════════ */}
        <Section id="projection" eyebrow="Many SKUs at once" color="var(--sky)" title="📋 프로젝션 화면" lede="여러 SKU를 한 번에 보는 서브탭 4개 · 위 필터(카테고리 · 브랜드 · 오픈월 · 오픈/완료 제외 · 검색)는 공통.">
          <Card title="📄 LIST VIEW">
            <p className="sub">정렬: 오픈일 → 브랜드 → 카테고리(식품 → 장난감 → 용품 → 잡화 → 의류) → SKU명</p>
            <Tbl minW={520} cols={['k', '']} head={['열', '내용']} rows={[
              ['기본 정보', '카테고리 · 브랜드 · SKU명 · 판매가 · 원가 · MOQ · 총 발주량'],
              ['오픈일 · 자사몰 세팅', '확정 배지 · 자사몰 세팅 완료 체크(진행 표시용 · 계산 무관)'],
              ['입고 · 촬영예정일', '준비 일정'],
              ['채널 목표량 확정', '플랫폼 · 브랜드 · 글로벌 그룹별 배지'],
              ['발주 확정', '“PM확정” 배지'],
            ]} />
          </Card>
          <Card title="📆 채널별 오픈일정">
            <ul>
              <li>채널(플랫폼 · 스스 · 위탁 · B2B · 글로벌 · 기타)별 오픈 날짜 입력 → SKU 오픈일 대비 <b>선오픈 · 동시오픈</b> 배지 자동</li>
              <li>기타 채널 = 이름 직접 입력 + 메모 · 캘린더 [미판매로 표시] = “이 채널엔 안 팖”</li>
              <li>글로벌 OFF SKU → 글로벌 칸 자동 미판매 (다시 켜면 날짜 복원)</li>
              <li>편집: 채널별 목표량 권한 · 확정: 오픈일정 확정 권한 · 확정 후 전원 잠금</li>
            </ul>
          </Card>
          <Card title={<>🎯 채널 목표량 <span className="sub">SKU 카드 STEP 1을 여러 SKU에 걸쳐 · 오픈일로 묶음 · 오픈/완료 제외 기본 ON</span></>}>
            <Tbl minW={640} cols={['k', 'e', '']} head={['보기', '이럴 때', '내용']} rows={[
              ['SKU카드별', '한 SKU씩 꼼꼼히', '왼쪽 목록 + 오른쪽 카드 · ↑↓ 키 · [이전 · 다음] · 빈 SKU는 [대응SKU 기준 채우기]로만 채움'],
              ['채널별 설정', '한 채널을 SKU마다 비교', '채널 하나 골라 상세(대응SKU · 수량 · 증감 · 판매가 · 순매출 · 공헌이익)를 쌓아 보기 · 담당 채널만 수정'],
              ['월별 비중설정', '월 계획을 SKU마다', '월 계획 표를 쌓아 보기 · 월 계획 권한'],
            ]} />
            <div className="grid2">
              <Mini title="⚡ 일괄 작업">
                <span>SKU 체크 → 대응SKU 대비 % · 다른 SKU 월별 수량 복사(첫 달끼리 맞춤) · 일괄 증감 % · 판매가 시나리오 일괄반영 · 대응SKU 기준 채우기 · 월 비중 복사 · 그룹 확정</span>
                <span>미리보기 → 적용 → 되돌리기 · 확정 · 비운영 · 권한 없는 채널 자동 제외 · 활동 로그</span>
              </Mini>
              <Mini title="👥 동시 수정 안전">저장 시 서버 최신값 위에 <b>내가 바꾼 칸만</b> 얹음 · 같은 SKU 다른 채널을 동시에 고쳐도 안 덮음 · 같은 칸은 나중 저장 우선</Mini>
            </div>
          </Card>
          <Card title={<>💰 프라이싱 <span className="sub">→ 다음 장에서 자세히</span></>}>
            <div><Jump to="pricing">프라이싱 보러가기 →</Jump></div>
          </Card>
        </Section>

        {/* ═════════ 프라이싱 ═════════ */}
        <PricingSection />

        {/* ═════════ 계산 수식 ═════════ */}
        <Section id="formula" eyebrow="Math" color="var(--teal)" title="🧮 핵심 계산 수식">
          <Easy>매출 · 이익이 뜨는 화면은 전부 이 공식 하나 · 채널별 목표량 · SKU 카드 · 채널별 요약 모두 동일.</Easy>
          <Card title={<>💧 판매가가 공헌이익이 되기까지 <Sample /></>}>
            <Waterfall />
          </Card>
          <Card>
            <Tbl minW={620} cols={['k', 'f', 'e']} head={['항목', '계산식', '쉽게']} rows={[
              ['실매출단가', '∑(월 수량 × 시나리오 가격) ÷ 총수량', '달마다 가격이 다르면 수량으로 평균'],
              ['순매출', '실매출단가 ÷ 1.1 × 총수량', '부가세 빼고 곱하기 수량'],
              ['변동비율', '(순매출 − 원가 − 공헌이익) ÷ 순매출', 'Tableau 팀카테 실적에서 거꾸로 계산 · 없으면 25%'],
              ['공헌이익', '순매출 × (1 − 변동비율) − 원가 × 수량', '비용 · 원가 다 빼고 남는 돈'],
              ['CM%', '공헌이익 ÷ 순매출 × 100', <><span className="cr-g">≥40%</span> · <span className="cr-y">≥30%</span> · <span className="cr-r">&lt;30%</span></>],
              ['옵션별 수량', '채널 월 수량 × 컬러 비중 × 사이즈 비중', 'STEP 2 분배'],
            ]} />
          </Card>
        </Section>

        {/* ═════════ 데이터 · 환율 ═════════ */}
        <Section id="data" eyebrow="Where numbers come from" color="var(--teal)" title="🔌 데이터 · 환율">
          <Card title={<>📊 Tableau에서 가져오는 것 <span className="sub">REST API · 60분 캐시</span></>}>
            <Tbl minW={600} cols={['k', 'e', '']} head={['데이터', 'Tableau 뷰', '어디에 쓰나']} rows={[
              ['SKU 월별 출고량', '출고데이터 MCP 연결용 (SKU 토탈)', '대응SKU 자동완성 · 채널 비중 기준값'],
              ['채널별 출고량', '채널별 출고 뷰', '채널 비중 기본값'],
              ['팀카테 공헌이익', 'MCP / sheet0', '변동비율 역산'],
              ['팀카테 순매출 · 원가', 'MCP / sheet1', '변동비율 역산'],
            ]} />
          </Card>
          <Card title="🔀 채널 이름 맞추기">
            <Tbl minW={640} cols={['', 'k', 'e', 'e']} head={['Tableau 채널', '대시보드 채널', '변동비 조회용', '비고']} rows={[
              ['바잇미 자사몰', '자사몰', '바잇미 자사몰', ''],
              ['SSFW 스스 · SSFW 자사몰', '스스', '스스', ''],
              ['위탁', '위탁', '그외', ''],
              ['사입 · 페어', '사입및페어', '그외', ''],
              ['쿠팡', '쿠팡', '쿠팡', '관리 탭에서 켠 SKU만 · 기본 OFF'],
              ['B2B', 'B2B', 'B2B', ''],
              ['해외', '글로벌 · 일본', '해외', '40 : 60 분배 · 한쪽 OFF면 남은 쪽에 전부'],
              ['협찬 · 기타 · CS · 공구 · 팝업', '—', '—', '집계 제외'],
            ]} />
            <div className="chips">
              {['의류 · 잡화 → 의류/잡화', '식품 → 영양제/식품', '장난감 → 장난감', '용품 → 용품'].map((c) => <span key={c} className="chip">{c}</span>)}
            </div>
            <p className="sub">↑ 카테고리 → Tableau 팀 구분카테 (변동비 조회)</p>
          </Card>
          <Card title="📅 집계 기간">
            <div className="grid2">
              <Mini title="직전 12개월">데이터의 가장 최근 월부터 거꾸로 12개월 · 대응SKU 기준값 · 변동비 기본</Mini>
              <Mini title="동기간">출시월부터 8개월의 1년 전 같은 기간 · 동기간 설정 시 변동비에도 적용</Mini>
            </div>
          </Card>
          <Card title="💱 환율">
            <ul>
              <li>출처 open.er-api.com · 하루 1회 · 브라우저에 24시간 저장</li>
              <li>실패 시 USD 1,400 · JPY 9.0 · JPY/KRW = USD/KRW ÷ USD/JPY</li>
              <li>쓰는 곳: 글로벌 · 일본 공급가 (채널별 목표량 · 프라이싱)</li>
              <li>실 판매가 행 라벨에 현재 환율 · <span style={{ color: 'var(--accent)', fontWeight: 700 }}>인디고 = 실시간</span> · 회색 = 기본값</li>
            </ul>
          </Card>
        </Section>

        {/* ═════════ 채널별 요약 ═════════ */}
        <Section id="summary" eyebrow="Roll-up" color="var(--teal)" title="📈 채널별 요약" lede="전체 SKU 채널별 수량 · 순매출 · 공헌이익 · LIST VIEW와 같은 필터.">
          <Card>
            <div className="grid2">
              <Mini title="전체 요약">전 SKU 채널별 합계 · 월별 추이 차트</Mini>
              <Mini title="채널별 탭">채널 여러 개 체크 → 합산 · SKU별 상세 · 채널 월별 추이</Mini>
            </div>
            <Tbl minW={560} cols={['k', 'nw', 'e']} head={['SKU 카드와 비교', '일치?', '이유']} rows={[
              ['판매가 · 환율 · 순매출', <span className="y">100% 같음</span>, '같은 계산 · 같은 실시간 환율'],
              ['공헌이익 · CM%', <span className="part">소폭 차이 가능</span>, '수백 SKU라 카테고리 × 채널 공통 변동비(직전 12개월 고정) 사용 · 카드에서 “동기간”인 SKU만 차이'],
            ]} />
            <p className="sub">* 정상 연동 시 파란 “Tableau 변동비 비중 연동중” 배지</p>
          </Card>
        </Section>

        {/* ═════════ 관리 · 확정 ═════════ */}
        <Section id="admin" eyebrow="Lock it in" color="var(--teal)" title="⚙️ 관리 · 확정 · 저장">
          <Card title="🏁 발주 확정까지 3단계">
            <Steps items={[
              [<>채널별 목표량 확정 <span className="rb bmd">MD · 글로벌</span></>, '플랫폼 · 브랜드 · 글로벌 그룹별 · 확정 후 그 그룹 수량 잠금'],
              [<>채널별 오픈일정 확정 <span className="rb bmd">오픈일정 확정 권한</span></>, '프로젝션 › 채널별 오픈일정 · 확정 후 날짜 잠금'],
              [<>최종 발주 확정 <span className="rb pm">PM · MASTER</span></>, '옵션별 최종 발주량 · 기본값 = 총 발주량 × 옵션 비율 · 확정 후 총 발주량이 바뀌면 “발주량 변경됨” 경고 (판매 목표 변경은 경고 없음)'],
            ]} />
            <p className="sub">* 확정 이력(일시 · 역할)은 MASTER가 조회 · PM이 일부 화면에서 “CPO”로 보여도 같은 역할</p>
          </Card>
          <Card title={<>🛠️ 관리 탭 <span className="rb master">MASTER</span></>}>
            <Tbl minW={520} cols={['k', '']} head={['메뉴', '하는 일']} rows={[
              ['PIN 관리', '역할별 4자리 PIN'],
              ['권한 관리', '역할별 5개 항목 on/off'],
              ['SKU 관리 › 할인 정책', <>할인 정책 · 할인가능시점 · 주력 SKU 지정 <Jump to="pricing">프라이싱</Jump></>],
              ['SKU 관리 › 채널 관리', '쿠팡 SKU별 켜기 (기본 OFF) · 글로벌 · 일본 SKU별 끄기 (여러 개 한 번에)'],
              ['SKU 관리 › 시즌 한정', '리오더 없는 SKU 지정'],
              ['데이터 정리 · 메모', '데이터 점검 · 관리자 메모'],
            ]} />
            <Callout tone="note" icon="💡" title="글로벌 · 일본 끄기">
              <ul>
                <li>끈 SKU = 그 채널 목표량 0 고정 · 끄기 전 수량 백업 → 다시 켤 때 복원</li>
                <li>끌 때 재분배 선택 → 같은 달 나머지 채널로 옮김 (월 합계 유지 · 확정 채널 제외)</li>
                <li>발주 확정 · 글로벌 확정 SKU는 잠김</li>
              </ul>
            </Callout>
          </Card>
          <Card title="💾 저장 · 백업">
            <div className="chips">
              {['SKU 기본 정보', '사이즈 · 컬러 구성', '채널 × 월 목표량', '판매가 시나리오', '채널별 오픈일정', '가격 확정 · 자사몰 세팅', '쿠팡 · 글로벌 · 일본 운영 여부', '시즌 한정', '발주 확정 · 이력', '마케팅 브리프'].map((c) => <span key={c} className="chip">{c}</span>)}
            </div>
            <p className="sub">↑ 전부 서버(Firestore) 저장 · 새로고침해도 유지 · CPO 연동 칸은 원본이 CPO</p>
            <div className="grid2">
              <Mini title={<>↓ 백업 <span className="sub">전원</span></>}>모든 SKU를 JSON 파일로 · 이미지 주소 포함</Mini>
              <Mini title={<>↑ 복원 <span className="sub">MASTER</span></>}>백업 파일로 전체 교체 · 기존 데이터 지우고 다시 넣음 ⚠️</Mini>
            </div>
          </Card>
        </Section>

        {/* ═════════ 참고 ═════════ */}
        <Section id="etc" eyebrow="Reference" color="var(--muted)" title="🧭 참고">
          <Card title="🔄 새로고침 · 뒤로가기">
            <ul>
              <li><b>새로고침</b> — 메인 탭 · 프로젝션 서브탭 · 카테고리 · 브랜드 필터 복원 (브라우저 탭 닫으면 초기화)</li>
              <li><b>로그인 직후</b> — 항상 프로젝션 › LIST VIEW</li>
              <li><b>[뒤로가기]</b> — SKU 카드로 이동하기 전 탭 · 필터 · 검색어 · 펼친 카드 · 스크롤 복원 (최대 20단계)</li>
            </ul>
          </Card>
          <Card title={<>📣 마케팅 브리프 <span className="sub">CPO 미연동 예전 SKU만</span></>}>
            <p className="sub">CPO 연동 SKU(대부분)는 [기획 보러가기 ↗] → CPO 기획 문서에서 확인</p>
            <div className="chips">
              {['① 경쟁사 타겟 제품 · 가격 경쟁력', '② 타겟 고객', '③ 마케팅 제안', '④ PSP · KSP · USP', '⑤ 비고'].map((c) => <span key={c} className="chip">{c}</span>)}
            </div>
          </Card>
          <Card title="🚀 앞으로">
            <ul>
              <li>Tableau 팀카테 2025년 이전 데이터 → 변동비율 정확도 (검토중)</li>
              <li>출시 후 실판매 실적 연동 · 채널별 목표 대비 달성률</li>
              <li>모바일 레이아웃</li>
            </ul>
          </Card>
        </Section>
      </main>
      <footer className="foot">숫자 예시는 설명용 · 프라이싱 예시 · 계산기는 현재 할인 정책 · 환율 기준</footer>
    </div>
  );
}

// ── 프라이싱 (운영 정책 · 환율 사용) ──
const B2C_ROWS: { k: PriceKey; label: string }[] = [
  { k: 'pre', label: '선오픈 최저가' }, { k: 'live', label: '라이브' }, { k: 'open', label: '오픈특가' },
  { k: 'reg', label: '상시 최대' }, { k: 'spec', label: '특가 최대' },
];
const B2B_ROWS: { k: PriceKey; label: string }[] = [
  { k: 'b2bOpen', label: 'B2B 오픈' }, { k: 'b2b', label: 'B2B 상시' }, { k: 'buy', label: '사입 공급가' },
  { k: 'popup', label: '팝업/페어' }, { k: 'glob', label: '글로벌 공급가' }, { k: 'jp', label: '일본 공급가' },
];

function PricingSection() {
  const { policy } = usePricingPolicy();
  const { usdKrw, jpyKrw } = useExchangeRates();
  const fx = { usd: usdKrw, jpy: jpyKrw };
  const bm = policy.brands['바잇미'];
  const c = policy.common;

  const [price, setPrice] = useState(15900);
  const [cost, setCost] = useState(4500);
  const [brand, setBrand] = useState<Brand>('바잇미');
  const [core, setCore] = useState(true);
  const [live, setLive] = useState(true);

  const ex = calcPricesV2({ price: 15900, brand: '바잇미', core: true, live: true }, policy, fx);
  const r = calcPricesV2({ price, brand, core, live }, policy, fx);
  const p = policy.brands[brand];
  const open = r.open ?? 0;
  const lb = r.pre ?? open;
  const why: Record<PriceKey, string> = {
    pre: core ? (open <= c.preThr ? `오픈특가 × ${100 - c.prePct}% → 10원 내림` : `오픈특가 − ${fmt(c.preMinus)}`) : '주력 SKU만',
    live: live ? `${fmt(lb)} − ${fmt(Math.min(Math.round((lb * c.livePct) / 100), c.liveMax))} → 10원 내림` : '오픈라이브 OFF',
    open: `× ${100 - p.openRate}% = ${fmt(price * (1 - p.openRate / 100))} → 10원 내림${p.round === '10' ? '' : ` → ${ROUND_LABEL[p.round]}`}`,
    reg: `× ${100 - p.reg}% → 10원 내림`,
    spec: `× ${100 - p.spec}% → 10원 내림`,
    b2bOpen: `× ${p.b2bRate}% × ${100 - p.b2bOpenDisc}% → 10원 반올림`,
    b2b: `× ${p.b2bRate}% → 10원 반올림`,
    buy: `× ${p.buyRate}% → 10원 올림`,
    popup: `× ${100 - p.popupRate}% → 10원 버림`,
    glob: `$${(Math.round(((price / 1250) * 1.6) / 2 * 100) / 100).toFixed(2)} × ${fmt(usdKrw)} → 10원 올림`,
    jp: `¥${fmt(((price / jpyKrw) * 1.3) / 2)} × ${jpyKrw.toFixed(2)} → 10원 올림`,
  };
  const crCls = (x: number) => (x > 40 ? 'cr-r' : x > 30 ? 'cr-y' : 'cr-g');

  return (
    <Section id="pricing" eyebrow="Price ladder" color="var(--amber)" title="💰 프라이싱">
      <Easy>“오픈 때 얼마 · 라이브 때 얼마 · B2B 납품은 얼마”를 <b>SKU 여러 개 한 표에서 비교 → 확정</b> · 위치 <b>프로젝션 › 프라이싱</b> · 할인율 원본은 <b>관리 › 할인 정책</b>.</Easy>

      <Card title={<>🪜 가격이 계산되는 순서 <Sample /> <span className="sub">바잇미 · 판매가 15,900 · 주력 SKU · 오픈라이브 ON · 현재 정책</span></>}>
        <div className="viz">
          <div className="ladder">
            {([
              ['판매가', '', 15900, 'var(--muted)'],
              ['오픈특가', `× ${100 - bm.openRate}% → ${ROUND_LABEL[bm.round]}`, ex.open, 'var(--amber)'],
              ['선오픈 최저가', `주력 · ${(ex.open ?? 0) <= c.preThr ? `× ${100 - c.prePct}%` : `−${fmt(c.preMinus)}`}`, ex.pre, 'var(--violet)'],
              ['라이브', `−${c.livePct}% (최대 ${fmt(c.liveMax)})`, ex.live, 'var(--warn)'],
            ] as const).map(([l, s, v, col]) => (
              <div key={l} className="rung">
                <div className="lbl">{l}{s && <small>{s}</small>}</div>
                <div className="track"><div className="fill" style={{ width: `${((v ?? 0) / 15900) * 100}%`, background: col }}>{l === '판매가' || v == null ? '' : `${pctOf(v, 15900)}%`}</div></div>
                <div className="val">{fmt(v)}</div>
              </div>
            ))}
          </div>
        </div>
        <ul>
          <li>앞 칸 실제값(수동 포함) 기준으로 다음 칸 계산 → 오픈특가를 고치면 선오픈 · 라이브도 따라 바뀜</li>
          <li>선오픈 최저가 = 주력 SKU만 · 라이브 = 오픈라이브 ON일 때만</li>
        </ul>
      </Card>

      <Card title={<>🧮 직접 계산해보기 <span className="sub">현재 할인 정책 · 환율 기준</span></>}>
        <div className="calc">
          <div className="calc-form">
            <label htmlFor="mc-price">판매가 (원)<input id="mc-price" type="number" min={0} step={10} value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))} /></label>
            <label htmlFor="mc-cost">원가 (원)<input id="mc-cost" type="number" min={0} step={10} value={cost} onChange={(e) => setCost(Math.max(0, Number(e.target.value) || 0))} /></label>
            <label htmlFor="mc-brand">브랜드
              <select id="mc-brand" value={brand} onChange={(e) => setBrand(e.target.value as Brand)}>
                {BRANDS.map((b) => <option key={b}>{b}</option>)}
              </select>
            </label>
            <div className="row">
              <label className="tg" htmlFor="mc-core"><input id="mc-core" type="checkbox" checked={core} onChange={(e) => setCore(e.target.checked)} />주력 SKU</label>
              <label className="tg" htmlFor="mc-live"><input id="mc-live" type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />오픈라이브</label>
            </div>
            <p className="sub">USD {fmt(usdKrw)} · JPY {jpyKrw.toFixed(2)}</p>
          </div>
          <div className="tw">
            <table style={{ minWidth: 560 }}>
              <thead><tr><th>항목</th><th className="r">가격</th><th className="r">판매가 대비</th><th className="r">원가율</th><th>어떻게</th></tr></thead>
              <tbody>
                {[...B2C_ROWS, ...B2B_ROWS].map((x, i) => {
                  const v = r[x.k];
                  const b2b = i >= B2C_ROWS.length;
                  const cr = v ? Math.round((cost / v) * 1000) / 10 : null;
                  return (
                    <tr key={x.k} className={i === B2C_ROWS.length ? 'sep' : ''}>
                      <td className="k nw">{x.label}</td>
                      <td className="r num strong">{v == null ? <span className="n">–</span> : fmt(v)}</td>
                      <td className="r num">{v == null ? '' : `${pctOf(v, price)}%`}</td>
                      <td className="r num">{v == null || b2b || cr == null ? '' : <span className={crCls(cr)}>{cr}%</span>}</td>
                      <td className="e why">{why[x.k]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card title={<>📐 B2C 계산식 <span className="sub">괄호 = 기본값</span></>}>
        <Tbl minW={680} cols={['k', 'f', '', 'e']} head={['항목', '계산식', '끝자리', '쉽게']} rows={[
          ['오픈특가', '판매가 × (1 − 브랜드 %)', '10원 내림 → 브랜드 규칙', '바잇미 20% 후 끝자리 900 · SSFW · 그외 10% 후 10원 내림'],
          ['선오픈 최저가', <>≤10,000: 오픈특가 × 0.95<br />&gt;10,000: 오픈특가 − 1,000</>, <>≤1만: 10원 내림<br />&gt;1만: 그대로</>, '주력 SKU만 · 9,900 → 9,400 · 11,900 → 10,900'],
          ['라이브', '기준가 − min(기준가 × 5%, 1,000)', '차감액 1원 반올림 → 10원 내림', '선오픈(없으면 오픈특가)에서 5% 더 · 최대 1,000원'],
          ['상시 최대', '판매가 × (1 − 상시 %)', '10원 내림', '바잇미 15% · SSFW · 그외 10%'],
          ['특가 최대', '판매가 × (1 − 특가 %)', '10원 내림', '전 브랜드 20%'],
        ]} />
      </Card>

      <Card title={<>📦 B2B 계산식 <span className="sub">괄호 = 기본값</span></>}>
        <Tbl minW={680} cols={['k', 'f', '', 'e']} head={['항목', '계산식', '끝자리', '쉽게']} rows={[
          ['B2B 상시', '판매가 × B2B % (65)', '10원 반올림', '판매가의 65%'],
          ['B2B 오픈', '판매가 × B2B % × (1 − 추가 %) (65 · 10)', '10원 반올림', 'B2B 상시에서 10% 더'],
          ['사입 공급가', '판매가 × 사입 % (50)', '10원 올림', '판매가 절반'],
          ['팝업/페어', '판매가 × (1 − 팝업 %) (10)', '10원 버림', '판매가 10% 할인'],
          ['글로벌 공급가', '(판매가 ÷ 1250 × 1.6) ÷ 2 × USD/KRW', '원화 10원 올림 · 달러 소수 2자리', '자동 고정 · 수정 불가'],
          ['일본 공급가', '(판매가 ÷ JPY/KRW × 1.3) ÷ 2 × JPY/KRW', '원화 10원 올림 · 엔 1엔 반올림', '원화로는 판매가 × 65%와 같음'],
        ]} />
      </Card>

      <Card title="✂️ 끝자리 처리 규칙">
        <Tbl minW={600} cols={['k', '', 'num']} head={['규칙', '처리', '예시']} rows={[
          ['10원 내림', '1원 자리 버림', '14,355 → 14,350'],
          ['10원 올림', '1원 자리 있으면 10원 위로', '12,341 → 12,350'],
          ['10원 반올림', '1원 자리 5↑ 올림 · 4↓ 버림', '10,335 → 10,340 · 9,301.5 → 9,300'],
          ['900 맞춤', <>그 값 <b>아래</b>에서 끝이 900인 가장 큰 값 · 이미 ○,900이면 한 단계 아래</>, '12,720 → 11,900 · 12,910 → 12,900 · 12,900 → 11,900'],
          ['100원 내림', '100원 아래 버림 (할인 정책에서 선택 가능)', '12,790 → 12,700'],
        ]} />
      </Card>

      <Card title="🔄 할인율 ↔ 가격">
        <div className="grid2">
          <Mini title="할인율로 가격 정하기">
            <ul>
              <li>가격 칸에 <code>10%</code>처럼 입력</li>
              <li>판매가 × (100 − n)%</li>
              <li><b>B2C 칸 = 10원 내림</b> · B2B 칸 = 10원 올림</li>
              <li>예: 15,950 × 93% = 14,833.5 → B2C 14,830 · B2B 14,840</li>
              <li>소수 % 가능 · 판매가 바뀌면 같은 %로 다시 · 확정 시 금액으로 고정</li>
            </ul>
          </Mini>
          <Mini title="가격으로 할인율 보기">
            <ul>
              <li>할인율 = (1 − 가격 ÷ 판매가) × 100</li>
              <li><b>소수점 아래 반올림 → 정수</b></li>
              <li>예: 15.5% → 16% · 15.3% → 15%</li>
              <li>정가 대비도 같은 방식 · 원가율 = 원가 ÷ 가격 (소수 1자리)</li>
              <li>금액 입력은 그대로 저장 (끝자리 처리 없음) · 판매가 초과 · 0 이하 불가</li>
            </ul>
          </Mini>
        </div>
        <div className="legend"><span>원가율 색</span><span><i style={{ background: 'var(--ok)' }} />30% 이하</span><span><i style={{ background: 'var(--amber)' }} />30.1 ~ 40%</span><span><i style={{ background: 'var(--danger)' }} />40% 초과</span></div>
      </Card>

      <Card title="🖥️ 프라이싱 탭 쓰는 법">
        <div className="grid2">
          <Mini title="보기">오픈일 · 브랜드 · 오픈일+브랜드로 묶기 · [B2C | B2B] 전환 · 판매가 대비 · 정가 대비 · 원가율 · 외화 표시 · [미확정만] · [오픈/완료 제외] 기본 ON</Mini>
          <Mini title="수정">칸 클릭 → 금액 또는 % → Enter 저장 · Esc 취소 · 비우면 자동값 · <span style={{ color: 'var(--sky)', fontWeight: 700 }}>파란 숫자</span> = 수동 · [수동 n · 되돌리기]</Mini>
          <Mini title="주력 SKU">선오픈 최저가 계산 · 메인 채널 칩 · [상세 프로모션 보러가기] (확정 버튼 아래)</Mini>
          <Mini title="할인가능시점">SKU 오픈일 + 카테고리별 n주 · 장난감 4주 · 용품 8주 · 식품 · 잡화 · 의류 미정 (기본값) · SKU별 예외 가능</Mini>
        </div>
        <p className="perm"><span className="rb master">MASTER</span><span className="rb pm">PM</span><span className="rb pmd">플랫폼MD</span><span className="rb bmd">브랜드MD</span> 수정 · 확정 · 그 외 보기만</p>
      </Card>

      <Card title="🔒 가격 확정하기">
        <Steps items={[
          ['가격 확인 · 수정', '오픈라이브 ON/OFF · 필요한 칸만 수동 입력'],
          ['[확정] 또는 [묶음 일괄 확정 · 미확정 N개]', '주력 SKU 포함 · 확정된 행 = 초록 배경 · [확정됨]'],
          ['확정 시점 가격 저장', '이후 할인 정책 · 판매가가 바뀌어도 그대로 · 바뀐 경우 “정책 변경 · 현재 ○○” 표시'],
        ]} />
        <Callout tone="tip" icon="🛠️" title="개편 전에 확정된 SKU 고치기">
          <ul>
            <li>[기존 확정 · 수정하기] → 확정 해제 + 기존 가격은 수동값(파란 숫자)으로 유지</li>
            <li>기존 라이브 가격이 있으면 오픈라이브 자동 ON</li>
            <li>수정 → [확정]</li>
            <li>기존 창 [신상위크] ON SKU = 오픈라이브 ON으로 표시</li>
          </ul>
        </Callout>
      </Card>

      <Card title={<>⚙️ 할인 정책 <span className="sub">관리 › SKU 관리 › 할인 정책 · MASTER</span></>}>
        <Tbl minW={640} cols={['k', '', 'e']} head={['메뉴', '설정', '기본값']} rows={[
          ['할인 정책', '브랜드별 B2C(오픈특가 % · 끝자리 · 상시 · 특가 · 시즌오프) · B2B(B2B % · 오픈 추가 % · 사입 % · 팝업 %) · 공통(선오픈 · 라이브)', '바잇미 20 · 900 · 15 · 20 · 25 / SSFW · 그외 10 · 10원 · 10 · 20 · 25 / B2B 65 · 10 · 50 · 10'],
          ['할인가능시점', '카테고리별 오픈 후 n주 · SKU별 예외', '장난감 4 · 용품 8 · 나머지 미정'],
          ['주력 SKU 지정', '검색 → 체크 → [주력 지정 · 해제] · 메인 채널(자사몰 · 스스 · 기타) 일괄 설정', '—'],
        ]} />
        <p className="sub">* 정책 변경 → 미확정 SKU에만 바로 반영 · 확정 SKU는 확정 가격 유지</p>
      </Card>

      <Card title={<>🧾 STEP 1 판매가 선택지 <span className="sub">채널별 목표량 · 매출 계산 · 엑셀</span></>}>
        <Easy>STEP 1에서 고르는 판매가 = <b>프라이싱 탭 가격 그대로</b> · 미확정 SKU = 할인 정책 계산값(수동값 포함) · 확정 SKU = 확정 가격.</Easy>
        <Tbl minW={600} cols={['k', '', 'e']} head={['선택지', '가격', '비고']} rows={[
          ['선오픈 최저가', '프라이싱 탭 선오픈 최저가', '주력 SKU만 · 일반 SKU는 라이브로'],
          ['라이브', '프라이싱 탭 라이브', '오픈라이브 OFF여도 계산'],
          ['오픈특가 · 상시 최대 · 특가 최대', '프라이싱 탭 같은 칸', ''],
          ['시즌오프(의류)', '판매가 × (1 − 시즌오프 %) → 10원 내림', '할인 정책 브랜드별 · 기본 25%'],
          ['B2B 오픈 · B2B 상시 · 사입 · 팝업/페어 · 글로벌 · 일본', '프라이싱 탭 같은 칸', ''],
        ]} />
        <p className="sub">
          * 예전 선택지 신상위크 · 선단독 → 주력 SKU = 선오픈 최저가 · 일반 SKU = 라이브<br />
          * SKU별 할인율(특가 20/15/10 · 상시 15/10/5 · 시즌오프 25/30)은 더 이상 안 씀 → 할인 정책으로 통일<br />
          * 채널 전용 판매가가 있으면 그 금액 기준으로 할인 정책 계산 · 미설정 채널: 쿠팡 · B2B · 사입및페어 → B2B 상시 · 글로벌 → 글로벌 공급가 · 일본 → 일본 공급가
        </p>
      </Card>
    </Section>
  );
}

// ── 그림 ──
function PeriodTimeline() {
  const [mode, setMode] = useState<'r' | 's'>('r');
  // 2025년 5월 ~ 2026년 6월 (2026년 9월 출시 · 데이터 최신월 2026년 6월)
  const months = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const idx = 5 + i; // 2025년 1월 = 1
    return { idx, y: 25 + Math.floor((idx - 1) / 12), m: ((idx - 1) % 12) + 1 };
  }), []);
  const on = (idx: number) => (mode === 'r' ? idx >= 7 && idx <= 18 : idx >= 9 && idx <= 16);
  return (
    <div className="viz">
      <div className="viz-head">
        <b>비교 기간 예시 · 2026년 9월 출시</b>
        <div className="seg" role="group" aria-label="비교 기간">
          <button type="button" aria-pressed={mode === 'r'} onClick={() => setMode('r')}>직전 12개월</button>
          <button type="button" aria-pressed={mode === 's'} onClick={() => setMode('s')}>동기간</button>
        </div>
      </div>
      <div className="timeline">
        {months.map((x) => <div key={x.idx} className={`c ${on(x.idx) ? 'on' : ''}`}>{x.m === 1 ? `'${x.y} 1월` : `${x.m}월`}</div>)}
      </div>
      <p className="viz-cap">{mode === 'r'
        ? '직전 12개월 = 데이터가 있는 가장 최근 달(2026년 6월)부터 거꾸로 12개월 → 2025년 7월 ~ 2026년 6월'
        : '동기간 = 출시월(9월)부터 8개월의 1년 전 → 2025년 9월 ~ 2026년 4월'}</p>
    </div>
  );
}

function CoverChart() {
  const labels = ['10월', '11월', '12월', '1월', '2월', '3월', '4월', '5월'];
  const pct = [30, 20, 15, 15, 10, 10, 10, 10];
  const order = 1000;
  const max = 1200;
  const H = 120;
  let acc = 0;
  const cols = pct.map((p) => (acc += (order * p) / 100));
  return (
    <div className="viz">
      <div className="cover">
        {cols.map((v, i) => (
          <div key={labels[i]} className="col">
            <span className="v">{fmt(v)}</span>
            <div className={`b ${v > order ? 'over' : ''}`} style={{ height: (v / max) * H }} />
            <span className="m">{labels[i]}</span>
          </div>
        ))}
        <div className="line" style={{ bottom: (order / max) * H + 21 }}><span>발주량 1,000</span></div>
      </div>
      <p className="viz-cap">발주량 1,000 · 월 비중 30/20/15/15/10/10/10/10 (합계 120%) → <b>3월까지 커버 · 4월부터 리오더 약 200개</b></p>
    </div>
  );
}

function DefaultMix() {
  const mix: [string, number, string][] = [
    ['자사몰', 20, '#f97316'], ['스스', 30, '#10b981'], ['위탁', 5, '#14b8a6'], ['쿠팡', 10, '#ef4444'],
    ['B2B', 15, '#6366f1'], ['사입및페어', 5, '#a855f7'], ['글로벌', 5, '#0ea5e9'], ['일본', 10, '#ec4899'],
  ];
  return (
    <div className="viz">
      <b className="viz-title">기본 채널비중 (카테고리 무관 · 전 SKU 동일)</b>
      <div className="bar-stack">
        {mix.map(([l, v, col]) => <div key={l} title={`${l} ${v}%`} style={{ width: `${v}%`, background: col }}>{v >= 10 ? `${v}%` : ''}</div>)}
      </div>
      <div className="legend">{mix.map(([l, v, col]) => <span key={l}><i style={{ background: col }} />{l} {v}%</span>)}</div>
    </div>
  );
}

function Waterfall() {
  const gross = 15900 * 100;
  const net = Math.round(gross / 1.1);
  const vc = Math.round(net * 0.25);
  const cogs = 450000;
  const cm = net - vc - cogs;
  const rows: [string, number, number, string, number][] = [
    ['판매 금액', 0, gross, 'var(--muted)', gross],
    ['− 부가세', net, gross, 'var(--faint)', -(gross - net)],
    ['= 순매출', 0, net, 'var(--sky)', net],
    ['− 변동비 25%', net - vc, net, 'var(--warn)', -vc],
    ['− 원가', cm, net - vc, 'var(--danger)', -cogs],
    ['= 공헌이익', 0, cm, 'var(--ok)', cm],
  ];
  return (
    <div className="viz">
      <div className="wf">
        {rows.map(([l, from, to, col, amt]) => (
          <div key={l} className="r">
            <span className="wl">{l}</span>
            <div className="t"><div style={{ left: `${(from / gross) * 100}%`, width: `${((to - from) / gross) * 100}%`, background: col }} /></div>
            <span className="amt">{amt < 0 ? '−' : ''}{fmt(Math.abs(amt))}</span>
          </div>
        ))}
      </div>
      <p className="viz-cap">실매출단가 15,900 · 100개 · 원가 4,500 · 변동비율 25% → 공헌이익 {fmt(cm)} · CM% {(Math.round((cm / net) * 1000) / 10).toFixed(1)}%</p>
    </div>
  );
}

// ── 조각 ──
function Section({ id, eyebrow, color, title, lede, children }: { id: SectionId; eyebrow: string; color: string; title: string; lede?: string; children: ReactNode }) {
  return (
    <section className="doc" id={id}>
      <div className="sec-eyebrow" style={{ color }}><span className="dot" />{eyebrow}</div>
      <h2 className="sec-title">{title}</h2>
      {lede && <p className="sec-lede">{lede}</p>}
      {children}
    </section>
  );
}

function Card({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="card">
      {title && <h4>{title}</h4>}
      {children}
    </div>
  );
}

function Easy({ children }: { children: ReactNode }) {
  return <div className="easy"><span className="tag">쉽게</span><span>{children}</span></div>;
}

function Mini({ title, children }: { title: ReactNode; children: ReactNode }) {
  return <div className="mini"><b>{title}</b><div className="mini-body">{children}</div></div>;
}

function Callout({ tone, icon, title, children }: { tone: 'warn' | 'tip' | 'note'; icon: string; title: string; children: ReactNode }) {
  return (
    <div className={`callout ${tone}`}>
      <span className="ic">{icon}</span>
      <div><b className="t">{title}</b>{children}</div>
    </div>
  );
}

function Steps({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <div className="steps">
      {items.map(([h, d], i) => (
        <div key={i} className="step"><div className="no">{i + 1}</div><div><h5>{h}</h5><p>{d}</p></div></div>
      ))}
    </div>
  );
}

function Pill({ c, children }: { c: string; children: ReactNode }) {
  return <span className="chip" style={{ background: `var(--${c}-soft)`, color: `var(--${c})` }}>{children}</span>;
}

function Sample() {
  return <span className="sample">예시</span>;
}

/** 표 — 좁은 화면에선 표만 가로 스크롤, 셀은 단어 단위 줄바꿈 */
function Tbl({ head, rows, cols = [], minW = 520 }: { head: string[]; rows: ReactNode[][]; cols?: string[]; minW?: number }) {
  return (
    <div className="tw">
      <table style={{ minWidth: minW }}>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((cell, j) => <td key={j} className={cols[j] ?? ''}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MANUAL_CSS = `
.pman {
  --bg: #f6f6fb; --surface: #ffffff; --sunken: #eeeef6; --border: #e2e2ee;
  --text: #22212e; --muted: #646378; --faint: #9696aa;
  --accent: #4f46e5; --accent-soft: #eceafe;
  --sky: #0284c7; --sky-soft: #e0f2fe; --violet: #7c3aed; --violet-soft: #f1eafe;
  --amber: #b45309; --amber-soft: #fdf1dc; --teal: #0f766e; --teal-soft: #dcf5f1;
  --rose: #be123c; --rose-soft: #fde7ec; --ok: #059669; --ok-soft: #dff6ec;
  --warn: #c2410c; --warn-soft: #fdeedd; --danger: #dc2626; --danger-soft: #fde6e6;
  --shadow: 0 1px 2px rgba(34,33,46,.04), 0 10px 26px -14px rgba(34,33,46,.18);
  --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace;
  background: var(--bg); color: var(--text); line-height: 1.6; word-break: keep-all; overflow-wrap: anywhere;
}
.pman h1, .pman h2, .pman h4, .pman h5 { margin: 0; text-wrap: balance; letter-spacing: -0.02em; }
.pman p { margin: 0; }
.pman ul { margin: 0; padding-left: 19px; list-style: disc; display: flex; flex-direction: column; gap: 5px; }
.pman code { font-family: var(--mono); font-size: .92em; background: var(--sunken); border: 1px solid var(--border); border-radius: 5px; padding: 0 5px; }
.pman .num { font-variant-numeric: tabular-nums; }

.pman .hero { padding: 36px 16px 24px; }
.pman .hero-inner { max-width: 880px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.pman .eyebrow-top { font-family: var(--mono); font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--faint); }
.pman .hero h1 { font-size: clamp(24px, 3.6vw, 34px); font-weight: 800; }
.pman .lede { color: var(--muted); font-size: 15px; max-width: 620px; }
.pman .flow-hero { display: flex; align-items: stretch; gap: 6px; overflow-x: auto; padding-bottom: 6px; }
.pman .fh-wrap { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.pman .fh { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 9px 12px; min-width: 120px; display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
.pman .fh b { font-size: 13px; }
.pman .fh > span:not(.rb) { font-size: 11.5px; color: var(--muted); }
.pman .arr { color: var(--faint); }
.pman .role-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.pman .role-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px 18px; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 8px; }
.pman .role-card li { font-size: 13px; }
.pman .rbs { display: flex; flex-wrap: wrap; gap: 4px; }
.pman .go { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.pman .jump { background: var(--sunken); border: 1px solid var(--border); color: var(--text); border-radius: 999px; padding: 3px 10px; font-size: 11.5px; font-weight: 600; }
.pman .jump:hover { border-color: var(--accent); color: var(--accent); }

.pman .rb { display: inline-flex; align-items: center; font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 999px; white-space: nowrap; }
.pman .rb.master { background: #e0e7ff; color: #4338ca; }
.pman .rb.pm { background: #ede9fe; color: #6d28d9; }
.pman .rb.pmd { background: #d1fae5; color: #047857; }
.pman .rb.bmd { background: #fef3c7; color: #b45309; }
.pman .rb.gl { background: #e0f2fe; color: #0369a1; }
.pman .rb.vw { background: #f3f4f6; color: #4b5563; }

.pman .nav { position: sticky; z-index: 9; background: color-mix(in srgb, var(--bg) 94%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
.pman .nav-inner { max-width: 880px; margin: 0 auto; display: flex; gap: 6px; overflow-x: auto; padding: 10px 16px; scrollbar-width: none; }
.pman .nav-inner::-webkit-scrollbar { display: none; }
.pman .tab { background: transparent; border: 1px solid var(--border); color: var(--muted); border-radius: 999px; padding: 6px 13px; font-size: 12.5px; font-weight: 600; white-space: nowrap; }
.pman .tab.current { background: var(--text); color: var(--bg); border-color: var(--text); }

.pman .body { max-width: 840px; margin: 0 auto; padding: 32px 16px 100px; display: flex; flex-direction: column; gap: 56px; }
.pman section.doc { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.pman .sec-eyebrow { font-family: var(--mono); font-size: 11px; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; display: flex; align-items: center; gap: 8px; }
.pman .sec-eyebrow .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.pman .sec-title { font-size: 22px; font-weight: 800; }
.pman .sec-lede { color: var(--muted); font-size: 14.5px; }
.pman .easy { display: flex; gap: 10px; align-items: flex-start; background: var(--accent-soft); border-radius: 12px; padding: 11px 14px; font-size: 14px; }
.pman .easy .tag { flex: 0 0 auto; font-size: 11px; font-weight: 800; color: var(--accent); background: var(--surface); border-radius: 999px; padding: 2px 9px; margin-top: 1px; }

.pman .card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pman .card h4 { font-size: 16px; font-weight: 800; display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
.pman .card p, .pman .card li { font-size: 13.5px; }
.pman .sub { color: var(--muted); font-size: 12.5px; font-weight: 500; }
.pman .card p.sub { font-size: 12.5px; }
.pman .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
.pman .mini { background: var(--sunken); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.pman .mini > b { font-size: 13.5px; }
.pman .mini-body { font-size: 12.8px; color: var(--muted); display: flex; flex-direction: column; gap: 4px; }
.pman .mini-body li { font-size: 12.8px; }
.pman .mini-body ul { padding-left: 17px; gap: 3px; }

.pman .callout { border-radius: 12px; padding: 12px 15px; font-size: 13.5px; display: flex; gap: 10px; border: 1px solid transparent; }
.pman .callout .ic { flex: 0 0 auto; }
.pman .callout b.t { display: block; font-size: 14px; margin-bottom: 3px; }
.pman .callout ul { margin-top: 4px; padding-left: 18px; }
.pman .callout li { font-size: 13.5px; }
.pman .callout.warn { background: var(--warn-soft); border-color: color-mix(in srgb, var(--warn) 28%, transparent); }
.pman .callout.tip { background: var(--ok-soft); border-color: color-mix(in srgb, var(--ok) 28%, transparent); }
.pman .callout.note { background: var(--sky-soft); border-color: color-mix(in srgb, var(--sky) 28%, transparent); }
.pman .perm { display: inline-flex; gap: 4px; flex-wrap: wrap; align-items: center; font-size: 11.5px; color: var(--muted); }
.pman .perm::before { content: "권한"; font-weight: 800; color: var(--faint); }

.pman .tw { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
.pman table { width: 100%; border-collapse: collapse; font-size: 12.8px; }
.pman th { text-align: left; font-size: 11.5px; font-weight: 800; color: var(--muted); background: var(--sunken); padding: 8px 11px; white-space: nowrap; border-bottom: 1px solid var(--border); }
.pman td { padding: 8px 11px; border-bottom: 1px solid var(--border); vertical-align: top; line-height: 1.55; }
.pman tbody tr:last-child td { border-bottom: none; }
.pman td.k { font-weight: 700; min-width: 7em; }
.pman td.f { font-family: var(--mono); font-size: 11.8px; min-width: 14em; }
.pman td.e { color: var(--muted); }
.pman td.c { text-align: center; }
.pman td.nw, .pman th.nw { white-space: nowrap; }
.pman td.r, .pman th.r { text-align: right; white-space: nowrap; }
.pman td.strong { font-weight: 800; }
.pman td.why { font-size: 11.5px; min-width: 13em; }
.pman tr.sep td { border-top: 2px solid var(--border); }
.pman .y { color: var(--ok); font-weight: 800; }
.pman .n { color: var(--faint); }
.pman .part { color: var(--amber); font-weight: 700; font-size: 11.5px; }

.pman .chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pman .chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; background: var(--sunken); color: var(--text); }
.pman .chip .d { width: 7px; height: 7px; border-radius: 50%; }
.pman .stepper { display: flex; align-items: center; gap: 4px; overflow-x: auto; padding-bottom: 4px; }
.pman .stepper-item { display: inline-flex; align-items: center; gap: 4px; flex: 0 0 auto; }
.pman .ar { color: var(--faint); font-size: 12px; }
.pman .steps { display: flex; flex-direction: column; }
.pman .step { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.pman .step:first-child { border-top: none; padding-top: 2px; }
.pman .step .no { font-family: var(--mono); font-size: 12px; font-weight: 800; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; background: var(--accent-soft); color: var(--accent); }
.pman .step h5 { font-size: 14px; margin-bottom: 2px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.pman .step p { font-size: 13px; color: var(--muted); }

.pman .viz { background: var(--sunken); border-radius: 12px; padding: 14px; min-width: 0; }
.pman .viz-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; font-size: 13px; }
.pman .viz-title { font-size: 12.5px; display: block; margin-bottom: 8px; }
.pman .viz-cap { font-size: 11.5px; color: var(--muted); margin-top: 8px; }
.pman .bar-stack { display: flex; height: 30px; border-radius: 8px; overflow: hidden; }
.pman .bar-stack div { display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 800; color: #fff; white-space: nowrap; overflow: hidden; }
.pman .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 9px; font-size: 12px; color: var(--muted); }
.pman .legend span { display: inline-flex; align-items: center; gap: 5px; }
.pman .legend i { width: 9px; height: 9px; border-radius: 3px; display: inline-block; }
.pman .matrix { border-collapse: separate; border-spacing: 3px; font-size: 11.5px; min-width: 460px; }
.pman .matrix th, .pman .matrix td { border: none; padding: 5px 6px; text-align: center; border-radius: 6px; background: transparent; }
.pman .matrix th { color: var(--muted); }
.pman .matrix td { background: var(--surface); font-variant-numeric: tabular-nums; }
.pman .matrix td.rh { text-align: left; font-weight: 800; background: transparent; white-space: nowrap; }
.pman .matrix td.sum, .pman .matrix th.sum { background: var(--accent-soft); color: var(--accent); font-weight: 800; white-space: nowrap; }
.pman .matrix td.cf { background: var(--ok-soft); color: var(--ok); font-weight: 700; }
.pman .cover { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; align-items: end; height: 170px; position: relative; padding-top: 6px; }
.pman .cover .col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; gap: 4px; min-width: 0; }
.pman .cover .b { width: 100%; max-width: 46px; border-radius: 6px 6px 3px 3px; background: var(--accent); }
.pman .cover .b.over { background: var(--warn); }
.pman .cover .v { font-size: 10.5px; font-weight: 700; color: var(--muted); }
.pman .cover .m { font-size: 11px; color: var(--faint); line-height: 17px; }
.pman .cover .line { position: absolute; left: 0; right: 0; border-top: 2px dashed var(--danger); }
.pman .cover .line span { position: absolute; right: 0; top: -19px; font-size: 10.5px; font-weight: 800; color: var(--danger); background: var(--sunken); padding: 0 4px; }
.pman .ladder { display: flex; flex-direction: column; gap: 7px; }
.pman .rung { display: grid; grid-template-columns: 120px 1fr 72px; gap: 10px; align-items: center; font-size: 12.5px; }
.pman .rung .lbl { font-weight: 700; }
.pman .rung .lbl small { display: block; font-weight: 500; color: var(--muted); font-size: 10.5px; }
.pman .rung .track { background: var(--surface); border-radius: 6px; height: 22px; overflow: hidden; }
.pman .rung .fill { height: 100%; border-radius: 6px; display: flex; align-items: center; justify-content: flex-end; padding-right: 7px; font-size: 10.5px; font-weight: 800; color: #fff; }
.pman .rung .val { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }
.pman .timeline { display: grid; grid-template-columns: repeat(14, minmax(34px, 1fr)); gap: 3px; font-size: 10px; text-align: center; color: var(--faint); overflow-x: auto; }
.pman .timeline .c { padding: 5px 0; border-radius: 4px; background: var(--surface); white-space: nowrap; }
.pman .timeline .on { background: var(--accent); color: #fff; font-weight: 800; }
.pman .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 9px; overflow: hidden; }
.pman .seg button { border: none; background: var(--surface); color: var(--muted); font-size: 12px; font-weight: 700; padding: 5px 12px; }
.pman .seg button[aria-pressed="true"] { background: var(--text); color: var(--bg); }
.pman .wf { display: flex; flex-direction: column; gap: 6px; }
.pman .wf .r { display: grid; grid-template-columns: 96px 1fr 88px; gap: 10px; align-items: center; font-size: 12.5px; }
.pman .wf .wl { font-weight: 700; white-space: nowrap; }
.pman .wf .t { height: 20px; position: relative; }
.pman .wf .t div { position: absolute; top: 0; bottom: 0; border-radius: 5px; }
.pman .wf .amt { text-align: right; font-weight: 800; font-variant-numeric: tabular-nums; }

.pman .calc { display: grid; grid-template-columns: minmax(0, 200px) minmax(0, 1fr); gap: 16px; align-items: start; }
.pman .calc-form { display: flex; flex-direction: column; gap: 10px; }
.pman .calc-form label { font-size: 12px; font-weight: 700; color: var(--muted); display: flex; flex-direction: column; gap: 4px; }
.pman .calc-form input[type=number], .pman .calc-form select { font-size: 14px; padding: 6px 10px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); color: var(--text); width: 100%; font-variant-numeric: tabular-nums; }
.pman .calc-form .row { display: flex; gap: 8px; flex-wrap: wrap; }
.pman .calc-form label.tg { flex-direction: row; align-items: center; gap: 6px; font-size: 12.5px; color: var(--text); padding: 6px 10px; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); }
.pman .cr-g { color: var(--ok); font-weight: 700; } .pman .cr-y { color: var(--amber); font-weight: 700; } .pman .cr-r { color: var(--danger); font-weight: 700; }
.pman .sample { font-size: 10.5px; font-weight: 800; color: var(--warn); background: var(--warn-soft); padding: 1px 7px; border-radius: 999px; }
.pman .foot { text-align: center; color: var(--faint); font-size: 12px; padding-bottom: 40px; }
@media (max-width: 640px) {
  .pman .calc { grid-template-columns: 1fr; }
  .pman .rung { grid-template-columns: 92px 1fr 60px; }
  .pman .card { padding: 14px 14px; }
}
@media (prefers-reduced-motion: reduce) { .pman * { transition: none !important; } }
`;
