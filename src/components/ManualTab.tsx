const TOC_ITEMS = [
  { id: 'manual-s1',  label: '1. 개요' },
  { id: 'manual-s2',  label: '2. 사용자 역할 및 권한' },
  { id: 'manual-s3',  label: '3. CPO 대시보드 연동' },
  { id: 'manual-s4',  label: '4. 화면 구성' },
  { id: 'manual-s5',  label: '5. 데이터 소스' },
  { id: 'manual-s6',  label: '6. 채널·카테고리 매핑' },
  { id: 'manual-s7',  label: '7. 집계 기간 모드' },
  { id: 'manual-s8',  label: '8. STEP 1 — 월별 발주 계획' },
  { id: 'manual-s9',  label: '9. STEP 2 — 채널별 목표량 설정' },
  { id: 'manual-s10', label: '10. STEP 3 — 채널별 수량 확인' },
  { id: 'manual-s11', label: '11. 프라이싱 시나리오' },
  { id: 'manual-s12', label: '12. 마케팅 브리프' },
  { id: 'manual-s13', label: '13. 대응 SKU 패널' },
  { id: 'manual-s14', label: '14. 핵심 계산 수식' },
  { id: 'manual-s15', label: '15. 환율 자동 갱신' },
  { id: 'manual-s16', label: '16. 데이터 저장 및 동기화' },
  { id: 'manual-s17', label: '17. 채널별 요약 뷰' },
  { id: 'manual-s18', label: '18. UI 동작' },
  { id: 'manual-s19', label: '19. 향후 개선 방향' },
];

type PartColor = 'indigo' | 'sky' | 'violet' | 'amber' | 'teal' | 'gray';

const PARTS: { emoji: string; title: string; color: PartColor; ids: string[] }[] = [
  { emoji: '🚀', title: '시작하기', color: 'indigo', ids: ['manual-s1', 'manual-s2', 'manual-s3'] },
  { emoji: '🖥️', title: '화면과 데이터 기반', color: 'sky', ids: ['manual-s4', 'manual-s5', 'manual-s6', 'manual-s7'] },
  { emoji: '📋', title: 'SKU 계획 프로세스', color: 'violet', ids: ['manual-s8', 'manual-s9', 'manual-s10'] },
  { emoji: '💰', title: '프라이싱', color: 'amber', ids: ['manual-s11', 'manual-s12', 'manual-s13'] },
  { emoji: '🧮', title: '계산과 인프라', color: 'teal', ids: ['manual-s14', 'manual-s15', 'manual-s16', 'manual-s17'] },
  { emoji: '🧭', title: '참고', color: 'gray', ids: ['manual-s18', 'manual-s19'] },
];

const PART_STYLES: Record<PartColor, { dot: string; label: string; toc: string }> = {
  indigo: { dot: 'bg-indigo-500', label: 'text-indigo-700', toc: 'hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200' },
  sky:    { dot: 'bg-sky-500',    label: 'text-sky-700',    toc: 'hover:bg-sky-50 hover:text-sky-700 hover:border-sky-200' },
  violet: { dot: 'bg-violet-500', label: 'text-violet-700', toc: 'hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200' },
  amber:  { dot: 'bg-amber-500',  label: 'text-amber-700',  toc: 'hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200' },
  teal:   { dot: 'bg-teal-500',   label: 'text-teal-700',   toc: 'hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200' },
  gray:   { dot: 'bg-gray-400',   label: 'text-gray-600',   toc: 'hover:bg-gray-50 hover:text-gray-700 hover:border-gray-300' },
};

// 로그인 화면(LoginScreen.tsx ROLE_META)과 동일한 배색을 그대로 씀 — 앱 전체에서 같은 역할은 항상 같은 색
const ROLE_BADGE_STYLES: Record<string, string> = {
  master: 'bg-indigo-100 text-indigo-700',
  pm: 'bg-violet-100 text-violet-700',
  viewer: 'bg-gray-100 text-gray-600',
  platform_md: 'bg-emerald-100 text-emerald-700',
  brand_md: 'bg-amber-100 text-amber-700',
  global: 'bg-sky-100 text-sky-700',
};

const CPO_STAGES = [
  { label: '기획/아이디어', bg: 'bg-rose-100', text: 'text-rose-700' },
  { label: '시안/샘플링', bg: 'bg-orange-100', text: 'text-orange-700' },
  { label: '제작 시작', bg: 'bg-amber-100', text: 'text-amber-700' },
  { label: '상세 작성', bg: 'bg-lime-100', text: 'text-lime-700' },
  { label: '사진 촬영', bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { label: '상세 작업중', bg: 'bg-teal-100', text: 'text-teal-700' },
  { label: '상세 완료', bg: 'bg-sky-100', text: 'text-sky-700' },
  { label: '오픈/완료', bg: 'bg-indigo-100', text: 'text-indigo-700' },
];

const FIELD_STATUS_STYLES: Record<'lock' | 'both' | 'open', string> = {
  lock: 'bg-amber-100 text-amber-700',
  both: 'bg-sky-100 text-sky-700',
  open: 'bg-emerald-100 text-emerald-700',
};

export function ManualTab() {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6 text-sm text-gray-700">

      {/* 목차로 돌아가기 (스크롤 시 항상 보이는 고정 버튼) */}
      <button
        onClick={() => scrollTo('manual-toc')}
        className="fixed top-14 right-4 z-40 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
        목차
      </button>

      {/* 목차 — Part 색상별 그룹핑 */}
      <section id="manual-toc" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">목차</h2>
        </div>
        <div className="p-4 space-y-4">
          {PARTS.map((part) => {
            const style = PART_STYLES[part.color];
            const items = TOC_ITEMS.filter((it) => part.ids.includes(it.id));
            return (
              <div key={part.title}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span className={`text-[11px] font-bold uppercase tracking-wider ${style.label}`}>{part.emoji} {part.title}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {items.map((item) => {
                    const [, num, title] = item.label.match(/^(\d+)\.\s*(.*)$/) ?? [null, '', item.label];
                    return (
                      <button
                        key={item.id}
                        onClick={() => scrollTo(item.id)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-200 text-left text-xs text-gray-600 transition-colors ${style.toc}`}
                      >
                        <span className="flex-shrink-0 w-5 h-5 rounded bg-gray-100 text-gray-400 text-[10px] font-bold flex items-center justify-center">
                          {num}
                        </span>
                        <span className="truncate">{title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 1. 개요 */}
      <section id="manual-s1" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="indigo">PART 1 · 시작하기</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">📋 1. 개요</h2>
        <Callout>
          쉽게 말하면 — 신규 SKU 하나가 세상에 나오기까지 필요한 계획(발주 수량·채널별 목표·판매가)을 한 화면에
          모아두고, 전략팀·MD팀·마케팅팀·CPO가 각자 자기 파트만 입력하면 예상 매출·이익이 자동 계산되는 협업 도구.
        </Callout>
        <p className="text-sm text-gray-600 mb-3">
          신규 SKU 출시 전 발주 수량·채널별 목표량·예상 매출/공헌이익을 한 화면에서 검토하는 내부 의사결정 도구.
          전략팀·MD팀·마케팅팀·CPO가 함께 사용.
        </p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100">
              <Th>용어</Th>
              <Th>의미</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>SKU</Td><Td>개별 제품 단위. 판매가가 다르면 별도 SKU로 관리</Td></Tr>
            <Tr><Td>대응 SKU</Td><Td>새 SKU와 비슷한 기존 판매 SKU. 실적을 참고 기준으로 사용</Td></Tr>
            <Tr><Td>발주량</Td><Td>제조사에 주문하는 수량 (생산 수량)</Td></Tr>
            <Tr><Td>MOQ</Td><Td>Minimum Order Quantity — 최소 발주 수량 (제조사 조건)</Td></Tr>
            <Tr><Td>채널</Td><Td>자사몰·스스·위탁·쿠팡·B2B·글로벌 등 판매 경로</Td></Tr>
            <Tr><Td>공헌이익</Td><Td>순매출에서 변동비와 원가를 뺀 실질 이익</Td></Tr>
            <Tr><Td>CM%</Td><Td>Contribution Margin % — 공헌이익 ÷ 순매출 × 100</Td></Tr>
            <Tr><Td>변동비율</Td><Td>순매출 대비 변동비(원가+영업비용) 비중. Tableau에서 팀카테 기준 산출</Td></Tr>
            <Tr><Td>FY26 / FY27</Td><Td>2026 회계연도(7~12월) / 2027 회계연도(1~2월) 구분</Td></Tr>
            <Tr><Td>CPO 연동</Td><Td>제품이 CPO 대시보드의 기획 문서와 연결된 상태. 연동 시 일부 필드가 CPO 쪽에서 자동으로 채워지고 잠김 — 3장 참고 (역할 표시명 "CPO"와는 다른 개념)</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 2. 사용자 역할 및 권한 */}
      <section id="manual-s2" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="indigo">PART 1 · 시작하기</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🔑 2. 사용자 역할 및 권한</h2>
        <p className="text-sm text-gray-500 mb-3">역할별 4자리 PIN으로 로그인. (구 marketing·cs 역할은 viewer로 통합, 기존 PIN 자동 승계)</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
          <RoleCard roleKey="master" label="MASTER">
            모든 기능 편집 가능. PIN 관리·권한 설정·백업/복원·확정 로그 조회. 권한 항상 전체 고정
          </RoleCard>
          <RoleCard roleKey="pm" label="PM · CPO">
            SKU 기본 정보·월별 계획(STEP 1) 입력, 프라이싱 시나리오 편집, 최종 발주 확정, SKU 일괄 추가
          </RoleCard>
          <RoleCard roleKey="platform_md" label="플랫폼MD">
            채널별 목표량(STEP 2) 입력, 프라이싱 시나리오 편집, 자사몰 채널·오픈일정 확정
          </RoleCard>
          <RoleCard roleKey="brand_md" label="브랜드MD">
            채널별 목표량(STEP 2) 입력, 프라이싱 시나리오 편집, 스스·위탁·B2B 채널·오픈일정 확정
          </RoleCard>
          <RoleCard roleKey="global" label="글로벌">
            채널별 목표량(STEP 2) 입력, 일본·글로벌 채널·오픈일정 확정
          </RoleCard>
          <RoleCard roleKey="viewer" label="VIEWER">
            뷰어 전용. 모든 정보 열람 가능, 편집 불가 (구 마케팅·CS/경영지원 역할 통합)
          </RoleCard>
        </div>

        <Callout tone="warn" title="⚠️ pm 역할 표시명이 화면마다 다름">
          로그인·상단 배지 = <strong>PM</strong>, 확정 이력·휴지통 화면 = <strong>CPO</strong>. 내부 값은 항상{' '}
          <code className="bg-white px-1 py-0.5 rounded border border-amber-200">'pm'</code>로 동일한 역할 — 3장의
          "CPO 대시보드 연동"과는 무관한 표시상의 차이일 뿐.
        </Callout>
        <NoteList items={[
          <>위 권한은 고정값 아님 — <strong>관리 탭 &gt; 권한 관리</strong>에서 역할별 5개 항목(SKU 기본정보 / STEP1 / STEP2 / 오픈일정 확정 / 발주 확정) 언제든 on/off 가능. master 행만 항상 전체 고정.</>,
          <>프라이싱 시나리오(할인율 선택·자동/수동 전환·가격확정)는 <Perm>마스터·PM·플랫폼MD·브랜드MD</Perm>만 편집 — 11장.</>,
          <>STEP2 채널 확정 버튼은 "STEP2 권한 보유 여부"만 확인 — 담당 채널 그룹이 달라도(예: 글로벌 담당이 브랜드 확정) 버튼은 노출될 수 있음.</>,
        ]} />
      </section>

      {/* 3. CPO 대시보드 연동 */}
      <section id="manual-s3" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="indigo">PART 1 · 시작하기</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🔗 3. CPO 대시보드 연동</h2>
        <Callout>
          쉽게 말하면 — 요즘 새 SKU는 대부분 <strong>CPO 대시보드</strong>(별도 기획 관리 도구)에서 먼저 기획되고,
          그 정보가 자동으로 여기까지 흘러들어옵니다. 그래서 일부 항목은 CPO 쪽에서만 고칠 수 있어요 —
          CPO가 "원본", 여기는 그 원본을 보여주는 "사본"인 셈.
        </Callout>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">기획 상태 8단계</h3>
        <Pipeline />

        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">SKU 카드 자동 생성·정리</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-2">
          <FeatureCard title="🆕 자동 생성">
            CPO 기획이 활성 상태(위 8단계 중 하나)가 되고 여기 대응 카드가 없으면 자동 생성
          </FeatureCard>
          <FeatureCard title="🙈 목록 숨김">
            CPO 상태가 Holding·Cancel이거나 오픈일이 없으면 LIST VIEW 등에서 숨김 (데이터는 안 지워짐, 조건 풀리면 자동 재노출)
          </FeatureCard>
          <FeatureCard title="🗑️ 자동 휴지통 이동">
            CPO 쪽 기획이 사라지면 카드도 자동 휴지통 이동(15일 뒤 영구삭제). 이미 직접 휴지통으로 보낸 카드는 되살아나지 않음
          </FeatureCard>
        </div>
        <NoteList items={[
          <>관리 탭은 숨김 규칙과 무관하게 항상 전체 SKU 표시 (숨겨진 데이터도 점검 가능하도록 둔 의도적 예외).</>,
        ]} />

        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">필드별 CPO 연동 현황 (SKU가 CPO 기획과 연결된 경우)</h3>
        <div className="rounded-xl border border-gray-200 overflow-hidden mb-3">
          <FieldRow name="오픈일" status="both" statusLabel="↔ 양방향" desc="어느 쪽에서 고쳐도 서로 반영" />
          <FieldRow name="SKU명" status="lock" statusLabel="🔒 CPO 전용" desc="입력칸 잠금, [기획 보러가기 ↗] 링크로 대체" />
          <FieldRow name="판매가·원가·정가" status="lock" statusLabel="🔒 CPO 전용" desc={'회색 읽기전용 박스, 미확정 시 "CPO 미확정" 표시. [기획 대시보드에서 수정 가능 ↗] 링크'} />
          <FieldRow name="입고·촬영예정일" status="lock" statusLabel="🔒 CPO 전용" desc="날짜 입력칸 잠금" />
          <FieldRow name="컬러·사이즈 옵션" status="lock" statusLabel="🔒 CPO 전용" desc="CPO에서 등록한 구성 그대로 표시" />
          <FieldRow name="썸네일 이미지" status="lock" statusLabel="🔒 CPO 전용" desc="CPO 쪽 썸네일 자동 반영 (단방향)" />
          <FieldRow name="그 외 필드" status="open" statusLabel="✏️ 직접 편집" desc="총 발주량·MOQ·STEP1~3 계획·프라이싱 설정 등은 CPO와 무관하게 편집 가능" />
        </div>

        <Callout tone="warn" title="⚠️ 가격 잠금은 두 가지가 서로 다름">
          "CPO 잠금"(판매가·원가·정가, CPO 연동 여부로 결정)과 "가격확정 잠금"(8·11장 🔒 토글, 역할 권한으로 확정)은
          별개 메커니즘. CPO 연동 SKU도 가격확정 가능 — 걸면 프라이싱 모달 시나리오 표까지 추가로 잠김. 두 잠금
          동시 적용 가능.
        </Callout>

        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">기타</h3>
        <TermList items={[
          { term: '진행상태·담당자 표시', desc: '카드 상단 CPO 진행상태 뱃지(예: "상세 작업중") + 기획 담당자 이름 (읽기전용, CPO가 원본)' },
          { term: '마케팅 브리프', desc: 'CPO 연동 SKU는 브리프 패널 대신 [기획 보러가기 ↗] 링크로 대체 — 12장' },
          { term: 'CPO 미연동 SKU (레거시)', desc: '위 잠금이 하나도 적용되지 않고, 예전 방식 그대로 모든 필드 직접 입력' },
          { term: 'SKU 일괄 추가', desc: <>상단 [+ 일괄 추가], CSV(엑셀 붙여넣기)로 여러 SKU 한 번에 생성 — <Perm>SKU 기본정보 권한 보유자</Perm></> },
        ]} />
      </section>

      {/* 4. 화면 구성 */}
      <section id="manual-s4" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="sky">PART 2 · 화면과 데이터 기반</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🖥️ 4. 화면 구성</h2>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">상단 메인 탭 <span className="font-normal text-gray-400">(로그인 직후 기본 진입 탭: 프로젝션)</span></h3>
        <TermList items={[
          { term: '프로젝션', desc: 'LIST VIEW / 채널별 오픈일정 두 서브탭. 로그인 시 항상 LIST VIEW로 초기화' },
          { term: 'SKU 리스트', desc: 'SKU 카드 목록. SKU별 3단계 계획 진행, 카드↔목록(테이블) 뷰 토글 (프로젝션 LIST VIEW와 별개)' },
          { term: '채널별 요약', desc: '전체 SKU의 채널별 출고·매출 요약 뷰 (MD·전략 대상)' },
          { term: '메뉴얼', desc: '대시보드 사용 가이드 (현재 페이지)' },
          { term: '관리', desc: 'PIN 관리 / 권한 관리 / 채널 관리(쿠팡·글로벌·일본) / 데이터 정리 / 관리자 메모 5개 서브탭 (MASTER 전용)' },
        ]} />

        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">SKU 카드 구성</h3>
        <TermList items={[
          { term: '카드 상단 기본 정보', desc: 'SKU명 / 브랜드 / 카테고리 / 제품 유형 / 출시일 / 원가 / 판매가 / 총 발주량 / MOQ / 사이즈·컬러 수. CPO 연동 SKU는 진행상태·담당자 뱃지 추가(3장)' },
          { term: '가격확정 토글', desc: <>프라이싱 모달 시나리오 표(할인율·자동/수동 편집) 잠금. SKU 카드 판매가·원가·정가 입력과는 별개 — CPO 연동 SKU는 확정 여부 무관하게 항상 CPO 전용 읽기전용(3장). <Perm>마스터·PM·플랫폼MD·브랜드MD</Perm>만 조작</> },
          { term: '프라이싱 시나리오 버튼', desc: '판매가·원가 위 위치. 클릭 시 전체 B2C/B2B 시나리오 모달' },
          { term: '대응 SKU 패널', desc: '기존 SKU 검색·선택, Tableau 실적 자동 로드, 비교 기간 설정' },
          { term: '마케팅 브리프 버튼', desc: 'SKU별 마케팅 전략 작성 패널 (CPO 연동 SKU는 [기획 보러가기]로 대체 — 12장)' },
          { term: 'STEP 탭', desc: '월별 계획(STEP 1) / 채널별 목표량 설정(STEP 2) / 채널별 수량 확인(STEP 3)' },
        ]} />

        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">프로젝션 &gt; LIST VIEW</h3>
        <p className="text-sm text-gray-600 mb-2">
          전체 SKU 테이블 조회. 오픈일 → 브랜드 → 카테고리(식품 → 장난감 → 용품 → 잡화 → 의류 고정 순서) → SKU명
          순 자동 정렬.
        </p>
        <p className="text-xs text-gray-500 mb-1.5">지원 필터</p>
        <ChipList items={['카테고리', "브랜드 ('그외' 항상 노출)", '오픈/완료 제외', '오픈월 (연도별 그룹, 연도 헤더 클릭 시 일괄선택)', '검색어']} />
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <Th>컬럼</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>기본 정보</Td><Td>카테고리·브랜드·SKU명·판매가·원가·MOQ·총 발주량</Td></Tr>
            <Tr><Td>오픈일 / 자사몰 세팅</Td><Td>오픈일(확정 뱃지 포함) · 자사몰 세팅 완료 여부 체크(계산에는 영향 없는 진행상황 표시용)</Td></Tr>
            <Tr><Td>입고예정일 / 촬영예정일</Td><Td>준비 일정 표시</Td></Tr>
            <Tr><Td>프라이싱 / 가격확정</Td><Td>[프라이싱] 버튼 — 클릭 시 해당 SKU 프라이싱 시나리오 모달 팝업. 가격확정 상태도 이 컬럼에서 토글</Td></Tr>
            <Tr><Td>채널 목표량 확정</Td><Td>각 채널 그룹(플랫폼·브랜드·글로벌)별 확정 여부 뱃지 표시</Td></Tr>
            <Tr><Td>발주 확정</Td><Td>PM(또는 MASTER) 최종 발주 확정 상태 표시 ("PM확정" 뱃지)</Td></Tr>
          </tbody>
        </table>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">프로젝션 &gt; 채널별 오픈일정</h3>
        <p className="text-sm text-gray-600 mb-2">
          채널(플랫폼·스스·위탁·B2B·글로벌·기타)별 오픈 예정일 개별 입력, SKU 오픈일 대비 선오픈/동시오픈 자동 배지
          표시. 기타 채널은 이름 직접 입력 + 메모란 제공. 캘린더 팝업의 [미판매로 표시] 버튼으로 "이 채널엔 안 판다"
          상태 지정 가능.
        </p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>항목</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>편집 권한</Td><Td>STEP2 권한 보유자(master·PM·MD 역할)</Td></Tr>
            <Tr><Td>확정 권한</Td><Td>오픈일정 확정 권한 보유자. 확정 후에는 모든 역할에서 날짜·기타 입력 잠금</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 5. 데이터 소스 */}
      <section id="manual-s5" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="sky">PART 2 · 화면과 데이터 기반</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">📊 5. 데이터 소스</h2>
        <table className="w-full border-collapse text-xs mb-2">
          <thead>
            <tr className="bg-gray-100">
              <Th>데이터</Th>
              <Th>Tableau 뷰</Th>
              <Th>사용처</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>SKU 월별 출고량</Td><Td>출고데이터 MCP 연결용 (SKU 토탈)</Td><Td>대응SKU 자동완성 · STEP2 채널 비중 기준값 산출</Td></Tr>
            <Tr><Td>채널별 출고량</Td><Td>채널별 출고 뷰</Td><Td>STEP2 채널 비중 기본값 자동 세팅</Td></Tr>
            <Tr><Td>팀카테 공헌이익</Td><Td>MCP / sheet0 (팀카테 공헌이익)</Td><Td>STEP2 변동비 비중 역산 — contribution 항목</Td></Tr>
            <Tr><Td>팀카테 순매출·원가</Td><Td>MCP / sheet1 (팀카테 순매출·원가)</Td><Td>STEP2 변동비 비중 역산 — revenue·cost 항목</Td></Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400">* Tableau REST API v3.21. PAT 인증 후 뷰 CSV 다운로드로 수집. 세션 내 캐싱(maxAge 60분).</p>
      </section>

      {/* 6. 채널·카테고리 매핑 */}
      <section id="manual-s6" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="sky">PART 2 · 화면과 데이터 기반</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🗂️ 6. 채널·카테고리 매핑</h2>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">Tableau 원본 채널명 → 대시보드 채널명</h3>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <Th>Tableau 채널명</Th>
              <Th>대시보드 채널</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>SSFW 스스 / SSFW 자사몰</Td><Td>스스</Td><Td></Td></Tr>
            <Tr><Td>바잇미 자사몰</Td><Td>자사몰</Td><Td></Td></Tr>
            <Tr><Td>사입 / 페어</Td><Td>사입및페어</Td><Td></Td></Tr>
            <Tr><Td>위탁</Td><Td>위탁</Td><Td>원본 채널명 그대로 사용 (별도 정규화 없음)</Td></Tr>
            <Tr><Td>쿠팡</Td><Td>쿠팡</Td><Td>SKU별 관리자 설정(coupangEnabled)이 켜진 SKU만 집계 포함. 기본은 비활성(수량 0) — 아래 참고</Td></Tr>
            <Tr><Td>해외</Td><Td>글로벌 · 일본</Td><Td>글로벌 40% / 일본 60% 임의 분배. 한쪽만 비운영인 SKU는 해외 실적 전부를 남은 쪽으로 반영</Td></Tr>
            <Tr><Td>협찬 · 기타 · CS · 공구 · 팝업</Td><Td>—</Td><Td>집계에서 제외</Td></Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mb-1">* 쿠팡은 기본 비활성 채널. 관리 탭 &gt; 채널 관리 &gt; 쿠팡에서 SKU별 활성화 시 STEP2·대응SKU 실적/비중·채널별 요약 뷰에 정상 포함.</p>
        <p className="text-xs text-gray-400 mb-4">* 글로벌·일본은 기본 활성 채널. 관리 탭 &gt; 채널 관리 &gt; 글로벌/일본에서 운영하지 않는 SKU만 골라 끌 수 있음(여러 개 한 번에 가능). 끈 SKU는 해당 채널 목표량 0 고정·비중은 나머지 채널로 배분, 끄기 전 수량은 백업돼 다시 켤 때 복원 가능. 발주량 확정·글로벌 확정 SKU는 잠김.</p>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">대시보드 채널 → Tableau 채널ROI용 (변동비 조회)</h3>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <Th>대시보드 채널</Th>
              <Th>Tableau 채널ROI용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>자사몰</Td><Td>바잇미 자사몰</Td></Tr>
            <Tr><Td>스스</Td><Td>스스</Td></Tr>
            <Tr><Td>쿠팡</Td><Td>쿠팡</Td></Tr>
            <Tr><Td>B2B</Td><Td>B2B</Td></Tr>
            <Tr><Td>사입및페어 · 위탁</Td><Td>그외</Td></Tr>
            <Tr><Td>글로벌 · 일본</Td><Td>해외</Td></Tr>
          </tbody>
        </table>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">대시보드 카테고리 → Tableau 팀 구분카테 (변동비 조회)</h3>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>대시보드 카테고리</Th>
              <Th>Tableau 팀 구분카테</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>의류 · 잡화</Td><Td>의류/잡화</Td></Tr>
            <Tr><Td>식품</Td><Td>영양제/식품</Td></Tr>
            <Tr><Td>장난감</Td><Td>장난감</Td></Tr>
            <Tr><Td>용품</Td><Td>용품</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 7. 집계 기간 모드 */}
      <section id="manual-s7" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="sky">PART 2 · 화면과 데이터 기반</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">📅 7. 집계 기간 모드</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>모드</Th>
              <Th>기간 정의</Th>
              <Th>사용처</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>직전 12개월 (rolling12)</Td>
              <Td>데이터 내 가장 최근 월 기준으로 역순 최대 12개월</Td>
              <Td>대응SKU 출고 기준값 산출 · STEP2 변동비 기본 모드</Td>
            </Tr>
            <Tr>
              <Td>동기간 (samePeriod)</Td>
              <Td>출시월 ~ 12월, 전년도 동기간</Td>
              <Td>동기간으로 설정된 경우 해당 기간의 변동비 비중 계산에 적용</Td>
            </Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* 비교 기간 선택은 변동비율 계산 기간과도 동기화.</p>
      </section>

      {/* 8. STEP 1 */}
      <section id="manual-s8" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="violet">PART 3 · SKU 계획 프로세스</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">1️⃣ 8. STEP 1 — 월별 발주 계획 (PM 담당)</h2>
        <p className="text-sm text-gray-600 mb-3">7월~익년 2월 8개월 기준 월별 발주 수량 입력. STEP 2 초기값의 기준이 됨.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>항목</Th>
              <Th>설명</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>총 발주량</Td>
              <Td>SKU 기본 정보에서 입력</Td>
              <Td></Td>
            </Tr>
            <Tr>
              <Td>월별 수량 입력</Td>
              <Td>각 월의 비중(%)으로 입력. 월별 수량은 비중에 따라 자동 계산되는 읽기 전용 값 (직접 수량 입력 필드는 없음)</Td>
              <Td>STEP2 채널 배분의 월별 기준이 됨</Td>
            </Tr>
            <Tr>
              <Td>가격확정</Td>
              <Td>프라이싱 모달 시나리오 표(할인율·자동/수동 편집) 잠금. <Perm>마스터·PM·플랫폼MD·브랜드MD</Perm>만 조작</Td>
              <Td>판매가·정가 자체는 CPO 연동 여부로 별도 결정 — 3장</Td>
            </Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* "MOQ 미달!" 배지 기준은 공급사 MOQ 아님 — STEP2 채널 합계가 STEP1 목표보다 적을 때 표시(STEP2 참고).</p>
      </section>

      {/* 9. STEP 2 */}
      <section id="manual-s9" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="violet">PART 3 · SKU 계획 프로세스</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">2️⃣ 9. STEP 2 — 채널별 목표량 설정 (MD 담당)</h2>
        <p className="text-sm text-gray-600 mb-3">MD가 채널·월별 목표 수량과 판매가 시나리오를 설정, 예상 순매출·공헌이익을 실시간 확인.</p>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">자동 초기값 세팅 순서</h3>
        <StepFlow steps={[
          { label: '대응 SKU 설정 시', desc: '채널별 출고 비중 기준으로 배분' },
          { label: '대응 SKU 없을 시', desc: '고정 기본 채널비중 사용 (아래)' },
          { label: '항상', desc: 'STEP 1 월별 수량 기준으로 월별 배분' },
        ]} />
        <p className="text-xs text-gray-500 mb-1.5">고정 기본 채널비중 (카테고리 무관, 모든 SKU 동일 적용)</p>
        <ChipList items={['자사몰 20%', '스스 30%', '위탁 5%', '쿠팡 10%', 'B2B 15%', '사입및페어 5%', '글로벌 5%', '일본 10%']} className="mb-2" />
        <NoteList items={[
          <>쿠팡이 비활성화된 SKU는 이 자동 배분에서 제외(대응SKU 실적·비중 계산에도 미포함). 관리 탭에서 활성화한 SKU만 배분 대상.</>,
          <>글로벌·일본을 관리 탭에서 끈 SKU도 동일하게 자동 배분에서 제외되고, 그 비중은 나머지 채널로 배분.</>,
        ]} />

        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">채널 요약 테이블 (토글 닫힌 상태)</h3>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <Th>컬럼</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>채널</Td><Td>채널명 + 토글 버튼 (클릭 시 상세 펼침)</Td></Tr>
            <Tr><Td>비중</Td><Td>전체 목표량 대비 해당 채널 수량 비율 (%). 마케팅 행은 판매 채널이 아니므로 –</Td></Tr>
            <Tr><Td>총수량</Td><Td>해당 채널의 월별 수량 합산. 기준 대비 변화량(Δ) 표시</Td></Tr>
            <Tr><Td>실매출단가</Td><Td>∑(월별 수량 × 시나리오 가격) ÷ 총 수량 (부가세 제외). 마케팅 행은 –</Td></Tr>
            <Tr><Td>순매출</Td><Td>실매출단가 × 수량 합산. 마케팅 행은 – (판매 없음, 매출 0 처리)</Td></Tr>
            <Tr><Td>공헌이익</Td><Td>순매출 × (1 − 변동비율) − 원가 × 수량. 마케팅 행은 –(원가 × 총수량). 합계 행은 B2C+B2B 공헌이익에서 마케팅 비용 차감</Td></Tr>
            <Tr><Td>변동비율</Td><Td>Tableau 팀카테 기준 역산값 (%). ~ 표시: 근사값. 마케팅 행은 –</Td></Tr>
            <Tr><Td>CM%</Td><Td>공헌이익 ÷ 순매출 × 100 (≥40% 초록 / ≥30% 노랑 / &lt;30% 빨강). 합계 행은 마케팅 비용 차감 후 공헌이익 기준 (순매출은 B2C+B2B 그대로)</Td></Tr>
          </tbody>
        </table>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">채널 상세 테이블 (토글 열린 상태 — B2C·B2B 채널)</h3>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100">
              <Th>행</Th>
              <Th>설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>대응SKU 비교 (회색)</Td>
              <Td>대응SKU의 채널×월 출고량 표시. 스큐카드 상단 기간 설정에 따라 '직전 12개월' 또는 '동기간' 데이터 사용. 참고용으로만 표시되며 계산에 영향 없음</Td>
            </Tr>
            <Tr>
              <Td>목표 수량 입력</Td>
              <Td>월별 목표 수량 직접 입력. 입력칸 우측에 대응SKU 대비 증감율(소수점 1자리) 표시</Td>
            </Tr>
            <Tr>
              <Td>판매가 설정</Td>
              <Td>월별 판매가 시나리오 선택. 채널·월별 개별 설정 가능. 일괄반영 버튼으로 전체 월에 동일 시나리오 적용 가능</Td>
            </Tr>
            <Tr>
              <Td>실 판매가</Td>
              <Td>시나리오 적용 후 KRW 판매가 표시. 글로벌·일본 공급가 시나리오 선택 시 KRW 아래 외화 금액 (USD $ / JPY ¥) 추가 표시</Td>
            </Tr>
            <Tr>
              <Td>예상 순매출 (파란색)</Td>
              <Td>실 판매가 ÷ 1.1 × 월 수량. FY26(7–12월) 합계 / FY27(1–2월) 합계 별도 표시</Td>
            </Tr>
            <Tr>
              <Td>예상 공헌이익 (초록색)</Td>
              <Td>순매출 × (1 − 변동비율) − 원가 × 수량. FY26/FY27 합계 별도 표시</Td>
            </Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mb-1">* 변동비율 = 수수료 포함 Tableau 실적 기반 역산값. 데이터 없으면 25% fallback.</p>
        <p className="text-xs text-gray-400 mb-4">* channelPricing의 수수료율 입력값은 참고용 — 실제 순매출·공헌이익 계산엔 미반영.</p>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">채널 확정 프로세스</h3>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <Th>확정 그룹</Th>
              <Th>대상 채널</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>플랫폼 확정</Td><Td>자사몰</Td><Td>해당 채널 그룹 수량 잠금. 잠긴 그룹이 하나라도 있으면 초기화·비례반영 등 일괄 조정 버튼 비활성화</Td></Tr>
            <Tr><Td>브랜드 확정</Td><Td>스스 · 위탁 · B2B</Td><Td>위와 동일</Td></Tr>
            <Tr><Td>글로벌 확정</Td><Td>일본 · 글로벌</Td><Td>위와 동일</Td></Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mb-4">* "MD 확정"은 버튼 1개가 아니라 위 3그룹으로 분리 — STEP2 편집 권한만 있으면 그룹-역할이 안 맞아도 버튼 노출. 수정 후 [되돌리기]로 직전 상태 복구 가능(카드 닫으면 불가).</p>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">마케팅 채널 (B2C 하단 별도 섹션)</h3>
        <p className="text-sm text-gray-500 mb-2">
          협찬·샘플 등 판매 외 목적 수량을 기록하는 비용 채널. 판매가/수수료 개념 없음 — 입력한 수량만큼 원가가
          순매출·공헌이익에서 차감.
        </p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100">
              <Th>항목</Th>
              <Th>수식 / 설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>월별 수량 입력</Td><Td>토글 열면 월별 입력칸 표시 (master·PM·MD 편집 가능)</Td></Tr>
            <Tr><Td>예상 비용 (빨간색)</Td><Td>원가 × 월 수량. 순매출에는 영향 없으며, 공헌이익에서 차감되는 비용 확인용</Td></Tr>
            <Tr><Td>STEP2 합계 행 순매출</Td><Td>B2C + B2B 순매출 합산 (마케팅은 매출 0 처리, 포함 안 됨)</Td></Tr>
            <Tr><Td>STEP2 합계 행 공헌이익</Td><Td>(B2C + B2B 공헌이익 합산) − (원가 × 마케팅 총수량)</Td></Tr>
            <Tr><Td>CM% (합계 행)</Td><Td>마케팅 비용 차감 후 공헌이익 ÷ B2C+B2B 순매출 × 100</Td></Tr>
            <Tr><Td>SKU 카드 상단 스코어카드</Td><Td>예상 순매출은 B2C+B2B 기준 그대로, 공헌이익만 마케팅 비용 차감 후 반영 (STEP3 기준 표시)</Td></Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400">* 마케팅 채널 수량은 Firestore 저장 — 새로고침 후에도 유지.</p>
      </section>

      {/* 10. STEP 3 */}
      <section id="manual-s10" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="violet">PART 3 · SKU 계획 프로세스</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">3️⃣ 10. STEP 3 — 채널별 수량 확인 (MD 확인용)</h2>
        <p className="text-sm text-gray-600 mb-3">STEP 2 채널별 목표량 기반 월별·옵션별 최종 수량 확인. 별도 재무 계산 없음.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>표시 항목</Th>
              <Th>설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>채널별 수량</Td><Td>채널×월 조합의 목표 수량 (B2C, 마케팅, B2B 순으로 표시)</Td></Tr>
            <Tr><Td>마케팅 행 (분홍색)</Td><Td>STEP2에서 입력한 마케팅 수량 읽기 전용 표시. 비중(%)은 전체 합계 기준으로 산출</Td></Tr>
            <Tr><Td>옵션별 수량</Td><Td>채널 월별 수량 × 컬러 비중 × 사이즈 비중으로 자동 분배 (B2C·B2B 채널만 해당)</Td></Tr>
            <Tr><Td>FY26 합계</Td><Td>7~12월 수량 합산 (B2C + 마케팅 + B2B 포함)</Td></Tr>
            <Tr><Td>전체 합계 (하단 합계 행)</Td><Td>7월~익년 2월 전체 수량 합산. 마케팅 수량 포함</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 11. 프라이싱 시나리오 */}
      <section id="manual-s11" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="amber">PART 4 · 프라이싱</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">💰 11. 프라이싱 시나리오</h2>
        <Callout>
          쉽게 말하면 — 오픈특가·세일·B2B 납품·일본/글로벌 공급 등 "이 상황이면 얼마" 를 미리 다 계산해서 한 번에
          보여주는 시뮬레이터. STEP 2처럼 채널별로 하나씩 고르지 않고, <strong>모든 시나리오를 동시에</strong> 봄.
        </Callout>
        <p className="text-sm text-gray-600 mb-3">
          [프라이싱 시나리오](SKU 카드) 또는 [프라이싱](LIST VIEW) 클릭 → 모든 판매가 시나리오를 보여주는 모달.
          STEP 2 채널별 설정과 달리 <strong>전체 B2C/B2B를 동시에 조회</strong>하는 참고용 뷰.
        </p>

        <FeatureGrid>
          <FeatureCard title="모달 상단 KPI">
            원가·판매가·정가·상시할인율·원가율 표시. 모든 시나리오의 base 가격 = SKU 판매가.
          </FeatureCard>

          <FeatureCard title="자동 · 수동 모드">
            [자동]/[수동] 토글로 표시 방식 전환. 자동 = 계산식 값 그대로. 수동 전환 시 그 시점 자동값을 스냅샷해서
            채움 → 이후 시나리오명·가격 자유 편집(자동값이 바뀌어도 수동값은 독립 유지). 할인율 3종 + 글로벌
            공급가는 수동에서도 자동계산 고정. 행 추가·삭제 가능(+ 항목 추가 / 행 옆 ×).
            <br /><Perm>마스터·PM·플랫폼MD·브랜드MD</Perm>
          </FeatureCard>

          <FeatureCard title="가격확정 시 잠금">
            가격확정 토글 ON → 시나리오 표 전체(할인율·자동/수동·수동값) 잠김 + "🔒 가격이 확정되어..." 안내 +
            [확정 해제] 버튼. CPO 잠금(3장)과는 별개 메커니즘, 동시 적용 가능.
            <br /><Perm>마스터·PM·플랫폼MD·브랜드MD</Perm> (확정·해제 모두)
          </FeatureCard>

          <FeatureCard title="메모">
            B2C 표 상단, 프라이싱 관련 자유 메모(최대 200자).
            <br /><Perm>마스터·PM·플랫폼MD·브랜드MD</Perm>만 입력, 나머지는 열람만.
          </FeatureCard>

          <FeatureCard title="행 숨기기 · 복원">
            6개 행(상시/특가/시즌오프 할인율, 사입/글로벌/일본 공급가) SKU별 숨김 가능(행 옆 × → "숨긴 항목: OOO
            복원" 칩으로 복원). 이 모달만의 표시 옵션 — STEP 2 선택지·실제 계산엔 무영향.
          </FeatureCard>

          <FeatureCard title="B2C 오픈 프로모션 토글">
            B2C 테이블 상단 <span className="text-red-600 font-medium">[신상위크]</span>·<span className="text-orange-500 font-medium">[라이브]</span>·<span className="text-emerald-600 font-medium">[선단독]</span> 버튼.
            기본값은 3행 모두 비활성(흐리게). [신상위크] = 신상위크+라이브 동시 ON, [라이브] = 라이브만 단독 ON.
            세 토글 독립 작동, 선택 상태 Firestore 저장(새로고침 유지).
          </FeatureCard>
        </FeatureGrid>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">B2C 시나리오 계산식</h3>
        <p className="text-xs text-gray-500 mb-1">* ceil10(x) = x를 10원 단위 올림 (B2B 오픈 할인·B2B 상시 운영만 예외적으로 round10 유지) &nbsp;|&nbsp; 오픈특가 = floor((ceil10(base × (1 − 특가최대할인율)) − 901) ÷ 1000) × 1000 + 900</p>
        <p className="text-sm text-gray-500 mb-2">
          특가 최대할인율(20/15/10%)·상시 최대할인율(15/10/5%)·시즌오프 할인율(25/30%)은 SKU별 직접 선택.
          {' '}<Perm>마스터·PM·플랫폼MD·브랜드MD</Perm> (해당 SKU에만 반영). 계산식 기본값: 20%/15%/25%.
        </p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <Th>시나리오</Th>
              <Th>계산식 (KRW)</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>오픈특가</Td><Td>floor((ceil10(base × (1 − 특가최대할인율)) − 901) ÷ 1000) × 1000 + 900</Td><Td>[오픈특가] 토글 활성 시 (기본 ON) · 특가 최대할인율 연동</Td></Tr>
            <Tr><Td>신상위크</Td><Td>오픈특가 ≤ 10,000: ceil10(오픈특가 × 0.95) / 오픈특가 {'>'} 10,000: max(0, 오픈특가 − 1,000)</Td><Td>[신상위크] 토글 활성 시</Td></Tr>
            <Tr><Td>라이브 할인</Td><Td>기준가(신상위크 or 오픈특가)에서 min(round(기준가×0.05), 1,000) 차감 후 ceil10</Td><Td>[신상위크] ON → 신상위크 기준 / [라이브] ON → 오픈특가 기준</Td></Tr>
            <Tr><Td>선단독</Td><Td>오픈특가 ≤ 10,000: ceil10(오픈특가 × 0.95) / 오픈특가 {'>'} 10,000: max(0, 오픈특가 − 1,000)</Td><Td>[선단독] 토글 활성 시</Td></Tr>
            <Tr><Td>상시 최대할인율</Td><Td>ceil10(base × (1 − 상시최대할인율))</Td><Td>항상 활성 · 15%/10%/5% 중 SKU별 선택</Td></Tr>
            <Tr><Td>특가 최대할인율</Td><Td>ceil10(base × (1 − 특가최대할인율))</Td><Td>항상 활성 · 20%/15%/10% 중 SKU별 선택</Td></Tr>
            <Tr><Td>시즌오프 (의류전용)</Td><Td>ceil10(base × (1 − 시즌오프할인율))</Td><Td>항상 활성 · 25%/30% 중 SKU별 선택</Td></Tr>
          </tbody>
        </table>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">B2B 시나리오 계산식</h3>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-100">
              <Th>시나리오</Th>
              <Th>계산식 (KRW)</Th>
              <Th>외화 보조 표시</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>B2B 오픈 할인</Td><Td>round10(base × 0.65 × 0.90)</Td><Td>— (반올림 유지)</Td></Tr>
            <Tr><Td>B2B 상시 운영</Td><Td>round10(base × 0.65)</Td><Td>— (반올림 유지)</Td></Tr>
            <Tr><Td>사입 공급가</Td><Td>ceil10(base × 0.50)</Td><Td>—</Td></Tr>
            <Tr>
              <Td>글로벌 공급가</Td>
              <Td>ceil10( (base ÷ 1250 × 1.6) ÷ 2 × USD/KRW )</Td>
              <Td>USD $ = (base ÷ 1250 × 1.6) ÷ 2</Td>
            </Tr>
            <Tr>
              <Td>일본 공급가</Td>
              <Td>ceil10( (base ÷ JPY/KRW × 1.3) ÷ 2 × JPY/KRW )</Td>
              <Td>JPY ¥ = (base ÷ JPY/KRW × 1.3) ÷ 2</Td>
            </Tr>
          </tbody>
        </table>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">원가율 색상 기준 (프라이싱 모달 내)</h3>
        <table className="w-full border-collapse text-xs mb-2">
          <thead>
            <tr className="bg-gray-100">
              <Th>원가율 범위</Th>
              <Th>색상</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>30% 이하</Td><Td>초록색</Td></Tr>
            <Tr><Td>30.1% ~ 40%</Td><Td>노란색</Td></Tr>
            <Tr><Td>40% 초과</Td><Td>빨간색</Td></Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400">* 할인율은 반올림 정수 표시. 비활성 시나리오(신상위크·라이브 할인·선단독)는 회색 흐리게.</p>
        <p className="mt-1 text-xs text-gray-400">* 쿠팡·B2B·사입및페어는 시나리오 미설정 시 'B2B 상시 운영' 자동 적용. 글로벌은 '글로벌 공급가', 일본은 '일본 공급가' 자동 적용.</p>
      </section>

      {/* 12. 마케팅 브리프 */}
      <section id="manual-s12" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="amber">PART 4 · 프라이싱</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">📣 12. 마케팅 브리프</h2>
        <Callout tone="warn" title="⚠️ 현재는 대부분 CPO 대시보드에서 확인">
          CPO 연동 SKU(현재 대부분)는 이 패널 대신 카드에 [기획 보러가기 ↗] 버튼만 뜹니다 — 마케팅 관련 내용은
          CPO 대시보드의 기획 문서에서 확인. 아래는 <strong>CPO 미연동 레거시 SKU</strong>에서만 쓰이는 예전 방식.
        </Callout>
        <div className="opacity-50">
          <p className="text-sm text-gray-500 mb-3">
            [마케팅 브리프](SKU 카드) → SKU별 마케팅 전략 작성. 800ms 디바운스 자동 저장, Firestore 영구 보관.
          </p>
          <TermList items={[
            { term: '① 경쟁사 타겟 제품', desc: '경쟁 제품명·판매가·주간 예상 매출 입력. 당사 판매가 대비 가격 경쟁력 자동 산정' },
            { term: '② 타겟 고객', desc: '목표 고객층 자유 텍스트 입력' },
            { term: '③ 마케팅 제안', desc: '마케팅 전략·채널 활용 방안 자유 텍스트 입력' },
            { term: '④ PSP / KSP / USP', desc: '구매자극요소 / 판매핵심요소 / 차별화요소 입력' },
            { term: '⑤ 비고', desc: '기타 메모' },
          ]} />
          <NoteList items={[
            <>마케팅(뷰어) 역할은 열람만 가능, 편집 불가.</>,
          ]} />
        </div>
      </section>

      {/* 13. 대응 SKU 패널 */}
      <section id="manual-s13" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="amber">PART 4 · 프라이싱</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🔍 13. 대응 SKU 패널</h2>
        <p className="text-sm text-gray-600 mb-3">비교할 기존 SKU 설정 시 Tableau 데이터 자동 로드 → 참고 지표로 활용.</p>
        <TermList items={[
          { term: 'SKU 검색 및 다중 선택', desc: '복수 SKU 선택 시 출고량 합산하여 비교 기준으로 사용' },
          { term: '비교 기간 선택', desc: '"직전 12개월" 또는 "동기간 (전년도 동월)" 중 선택. 변동비율 계산 기간과도 동기화' },
          { term: '월평균·연간 출고량', desc: '선택한 기간 기준 자동 표시' },
          { term: '채널별 출고 비중', desc: '차트 시각화. STEP 2 초기값 세팅에 활용' },
        ]} />
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>비교 기간 모드</Th>
              <Th>의미</Th>
              <Th>예시</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>직전 12개월</Td><Td>대응 SKU의 가장 최근 12개월 출고 데이터 기준</Td><Td>2025년 7월 ~ 2026년 6월</Td></Tr>
            <Tr><Td>동기간</Td><Td>출시 예정 연도의 전년도 동월 데이터 기준</Td><Td>출시월이 9월이면 2025년 9~12월</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 14. 핵심 계산 수식 */}
      <section id="manual-s14" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="teal">PART 5 · 계산과 인프라</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🧮 14. 핵심 계산 수식</h2>
        <Callout>
          쉽게 말하면 — 매출·이익이 뜨는 화면은 전부 이 5개 수식 위에서 돌아갑니다. STEP2·SKU 카드·채널별 요약
          뷰까지 동일 공식.
        </Callout>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>항목</Th>
              <Th>계산식</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>순매출</Td>
              <Td>실매출단가 ÷ 1.1 × 총수량</Td>
              <Td>부가세 제외</Td>
            </Tr>
            <Tr>
              <Td>실매출단가</Td>
              <Td>∑(월별 수량 × 시나리오 가격) ÷ 총 수량</Td>
              <Td>수량 기준 가중평균</Td>
            </Tr>
            <Tr>
              <Td>변동비율</Td>
              <Td>(순매출 − 원가 − 공헌이익) ÷ 순매출</Td>
              <Td>Tableau 팀카테 역산. 없으면 25% fallback</Td>
            </Tr>
            <Tr>
              <Td>공헌이익</Td>
              <Td>순매출 × (1 − 변동비율) − 원가 × 수량</Td>
              <Td></Td>
            </Tr>
            <Tr>
              <Td>CM%</Td>
              <Td>공헌이익 ÷ 순매출 × 100</Td>
              <Td>≥40% 초록 / ≥30% 노랑 / &lt;30% 빨강</Td>
            </Tr>
            <Tr>
              <Td>옵션별 수량</Td>
              <Td>채널 월별 수량 × 컬러 비중 × 사이즈 비중</Td>
              <Td>STEP 3 분배 기준</Td>
            </Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* 이 변동비율 공식은 채널×월 손익을 계산하는 모든 화면(STEP2·SKU카드·채널별 요약 뷰 등)에 동일 적용.</p>
      </section>

      {/* 15. 환율 자동 갱신 */}
      <section id="manual-s15" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="teal">PART 5 · 계산과 인프라</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">💱 15. 환율 자동 갱신</h2>
        <table className="w-full border-collapse text-xs mb-2">
          <thead>
            <tr className="bg-gray-100">
              <Th>항목</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>데이터 출처</Td><Td>open.er-api.com (무료 · API 키 없음 · ECB 기반 집계)</Td></Tr>
            <Tr><Td>갱신 주기</Td><Td>API 제공 기준 하루 1회 (UTC 기준). 주말·공휴일은 직전 영업일 환율 유지</Td></Tr>
            <Tr><Td>캐싱 방식</Td><Td>브라우저 localStorage에 24시간 TTL로 저장. 캐시 유효 시 API 호출 없음</Td></Tr>
            <Tr><Td>Fallback</Td><Td>API 실패 시 USD 1,400 · JPY 9.0 고정값 사용</Td></Tr>
            <Tr><Td>JPY/KRW 계산</Td><Td>USD/KRW ÷ USD/JPY 교차 계산</Td></Tr>
            <Tr><Td>적용 범위</Td><Td>STEP 2 글로벌·일본 공급가 시나리오 / 프라이싱 시나리오 모달</Td></Tr>
            <Tr><Td>UI 표시</Td><Td>실 판매가 행 라벨에 현재 환율 표시 (라이브: 인디고색 / fallback: 회색)</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 16. 데이터 저장 및 동기화 */}
      <section id="manual-s16" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="teal">PART 5 · 계산과 인프라</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">💾 16. 데이터 저장 및 동기화</h2>
        <h3 className="text-sm font-semibold text-gray-600 mb-2">Firestore 저장 항목 <span className="font-normal text-gray-400">(새로고침 후에도 유지)</span></h3>
        <ChipList items={['SKU 기본 정보', '사이즈·컬러 구성 및 수량', '월별 발주 계획', '채널별 월별 목표 수량', '채널별 판매가 시나리오 설정', '채널별 오픈일정', '가격확정·자사몰세팅 여부', 'SKU별 쿠팡 활성화 · 글로벌/일본 비운영 여부', '발주 확정 상태 및 확정 이력', '마케팅 브리프 내용']} />
        <NoteList items={[
          <>CPO 연동 필드(SKU명·판매가·원가·정가·입고/촬영예정일·컬러/사이즈 옵션·썸네일)는 여기도 저장되지만 원본은 CPO 대시보드 — 3장.</>,
        ]} />

        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">발주 확정 프로세스</h3>
        <NoteList items={[
          <>pm 역할이 일부 화면에서 "CPO"로 표시되지만(2장) 발주 확정 권한과는 무관. 최종 발주 확정은 <Perm>master·PM</Perm>(기본값)이 수행, 화면엔 "PM확정" 뱃지로 표시.</>,
        ]} className="mb-2" />
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <Th>단계</Th>
              <Th>담당</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>① STEP 2 채널 확정</Td><Td>플랫폼·브랜드·글로벌 MD</Td><Td>채널 그룹별(자사몰 / 스스·위탁·B2B / 일본·글로벌) 목표량 확정. 이후 해당 그룹 수량 잠금</Td></Tr>
            <Tr><Td>② 채널별 오픈일정 확정</Td><Td>오픈일정 확정 권한 보유자</Td><Td>프로젝션 탭에서 채널별 오픈일정 확정. 이후 날짜·기타 입력 잠금</Td></Tr>
            <Tr><Td>③ 최종 발주 확정</Td><Td>PM (또는 MASTER)</Td><Td>월별 발주 계획 최종 확정. 확정 후 STEP2 수량이 달라지면 "발주량 변경됨" 경고 배너 표시</Td></Tr>
            <Tr><Td>확정 이력 조회</Td><Td>MASTER</Td><Td>확정 일시·역할 이력을 모달에서 확인 가능</Td></Tr>
          </tbody>
        </table>

        <h3 className="text-sm font-semibold text-gray-600 mb-2">백업 · 복원</h3>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-100">
              <Th>기능</Th>
              <Th>접근</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>↓ 백업</Td><Td>전체 역할</Td><Td>모든 SKU 데이터를 JSON 파일로 다운로드. 이미지 URL 포함</Td></Tr>
            <Tr><Td>↑ 복원</Td><Td>MASTER 전용</Td><Td>백업 JSON 파일로 Firestore 전체 교체. 기존 데이터 삭제 후 재삽입</Td></Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* 이미지 URL = Firebase Storage 주소 — 동일 Firebase 프로젝트 내에서만 정상 표시.</p>
      </section>

      {/* 17. 채널별 요약 뷰 */}
      <section id="manual-s17" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="teal">PART 5 · 계산과 인프라</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">📈 17. 채널별 요약 뷰</h2>
        <p className="text-sm text-gray-600 mb-3">
          전체 SKU의 채널별 출고·매출 현황을 요약 테이블로 확인. LIST VIEW와 동일한 필터(카테고리·브랜드
          다중선택, 오픈/완료 제외, 오픈월) 이식 — 원하는 범위만 조회 가능.
        </p>
        <TermList items={[
          { term: '전체 요약', desc: '전체 SKU의 채널별 총 수량·순매출·공헌이익 집계. 월별 트렌드 차트 포함' },
          { term: '채널별 탭', desc: '채널 다중선택(체크) → 선택 채널 합산 수치 조회. SKU별 수량·매출·공헌이익 상세, 채널별 월별 트렌드 차트 포함' },
        ]} />
        <p className="mt-2 text-xs text-gray-400">* 공헌이익 계산 = 14장과 동일한 Tableau 팀카테 역산 변동비율(없으면 25% fallback). 정상 연동 시 파란 "Tableau 변동비 비중 연동중" 배지 표시. 단 SKU별 비교기간(직전 12개월/동기간) 선택은 반영 못 하고 항상 "직전 12개월" 고정 — 카드에서 동기간으로 보는 값과 소폭 차이 가능.</p>
        <p className="mt-3 text-sm text-gray-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
          <strong className="text-indigo-700">이 뷰와 STEP2(SKU카드) 계산 일치 범위</strong><br />
          <strong>판매가 시나리오·환율은 STEP2와 100% 동일.</strong> 같은 <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-indigo-100">pricingScenarios.ts</code>, 같은 실시간 환율(useExchangeRates) 사용 — 어떤 시나리오든 STEP2와 단가 일치.<br />
          <strong>변동비율만 근사치.</strong> STEP2는 SKU별 대응SKU·비교기간을 반영해 계산하지만, 이 뷰는 SKU 수백 건을 한 번에 다뤄야 해서 <strong>카테고리×채널 단위 공통값</strong>(직전 12개월 고정)을 전체 SKU에 동일 적용. 순매출은 100% 일치, <strong>공헌이익·CM%는 대응SKU가 "동기간"인 SKU에서 소폭 차이 가능.</strong>
        </p>
      </section>

      {/* 18. UI 동작 */}
      <section id="manual-s18" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="gray">PART 6 · 참고</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🧭 18. UI 동작 — 페이지 상태 유지</h2>
        <p className="text-sm text-gray-600 mb-3">새로고침 후 직전 상태 복원(sessionStorage, 탭 단위 — 탭 닫으면 초기화). 단 로그인 직후엔 무조건 프로젝션 &gt; LIST VIEW로 초기화.</p>
        <TermList items={[
          { term: '메인 탭', desc: '마지막으로 열었던 탭 (프로젝션 / SKU 리스트 / 채널별 요약 / 메뉴얼 / 관리)으로 복원' },
          { term: '프로젝션 서브탭', desc: 'LIST VIEW / 채널별 오픈일정 중 마지막 선택값 복원' },
          { term: '카테고리 필터', desc: 'SKU 리스트 탭의 카테고리 선택값 복원' },
          { term: '브랜드 필터', desc: '선택된 브랜드 복원' },
        ]} />
        <h3 className="text-sm font-semibold text-gray-600 mb-2 mt-4">뒤로가기 (내비게이션 히스토리)</h3>
        <p className="text-sm text-gray-600">SKU 카드 이동 시 이전 상태(탭·필터·검색어·펼쳐진 카드·스크롤, 최대 20단계) 기록 → 상단 [뒤로가기]로 정확히 복원. 새로고침 유지와는 별개 — 새로고침 시 필터·검색어·스크롤은 초기화.</p>
      </section>

      {/* 19. 향후 개선 방향 */}
      <section id="manual-s19" className="scroll-mt-20 bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
        <Eyebrow color="gray">PART 6 · 참고</Eyebrow>
        <h2 className="text-lg font-bold text-gray-900 mb-3">🚀 19. 향후 개선 방향</h2>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Tableau 팀카테 뷰에 2025년 이전 데이터 추가 → 변동비율 계산 정확도 향상 [가능여부 검토중]</li>
          <li>SKU별 실시간 판매 실적 연동 (출시 후 추적 기능)</li>
          <li>채널별 목표 대비 실적 달성률 모니터링 탭 추가</li>
          <li>모바일 최적화 레이아웃</li>
        </ul>
      </section>

    </div>
  );
}

function Eyebrow({ color, children }: { color: PartColor; children: React.ReactNode }) {
  const style = PART_STYLES[color];
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      <span className={`text-[11px] font-bold uppercase tracking-wider ${style.label}`}>{children}</span>
    </div>
  );
}

function Callout({
  tone = 'tip', title, children,
}: {
  tone?: 'tip' | 'warn';
  title?: string;
  children?: React.ReactNode;
}) {
  const boxCls = tone === 'warn'
    ? 'bg-amber-50 border-amber-200'
    : 'bg-indigo-50 border-indigo-100';
  const titleCls = tone === 'warn' ? 'text-amber-700' : 'text-indigo-700';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed text-gray-600 mb-3 ${boxCls}`}>
      {title && <p className={`font-bold mb-1 ${titleCls}`}>{title}</p>}
      {children}
    </div>
  );
}

function Perm({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-[11px]">
      <span className="font-bold text-gray-400">권한</span>
      <span className="text-gray-500">{children}</span>
    </span>
  );
}

function RoleCard({ roleKey, label, children }: { roleKey: string; label: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${ROLE_BADGE_STYLES[roleKey]}`}>{label}</span>
      <p className="text-xs text-gray-500 mt-2 leading-relaxed">{children}</p>
    </div>
  );
}

function Pipeline() {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        {CPO_STAGES.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${s.bg} ${s.text}`}>{s.label}</span>
            {i < CPO_STAGES.length - 1 && <span className="text-gray-300 text-xs">→</span>}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400 mt-1">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />Holding — 잠시 보류 (카드 숨김)</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />Cancel — 완전 취소 (카드 숨김)</span>
      </div>
    </div>
  );
}

function FieldRow({
  name, status, statusLabel, desc,
}: {
  name: string;
  status: 'lock' | 'both' | 'open';
  statusLabel: string;
  desc: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap px-3.5 py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-gray-700 w-[140px] flex-shrink-0">{name}</span>
      <span className={`inline-flex flex-shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-bold whitespace-nowrap ${FIELD_STATUS_STYLES[status]}`}>{statusLabel}</span>
      <span className="text-xs text-gray-500 flex-1 min-w-[140px]">{desc}</span>
    </div>
  );
}

function TermList({ items }: { items: { term: string; desc: React.ReactNode }[] }) {
  return (
    <div className="space-y-2 mb-3">
      {items.map((it, i) => (
        <p key={i} className="text-sm text-gray-600 leading-relaxed">
          <strong className="text-gray-800">{it.term}</strong> — {it.desc}
        </p>
      ))}
    </div>
  );
}

function StepFlow({ steps }: { steps: { label: string; desc: string }[] }) {
  return (
    <div className="flex flex-wrap items-stretch gap-2 mb-3">
      {steps.map((s, i) => (
        <div key={i} className="flex items-stretch gap-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 min-w-[150px]">
            <p className="flex items-center gap-1.5 text-xs font-bold text-gray-700 mb-0.5 whitespace-nowrap">
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">{i + 1}</span>
              {s.label}
            </p>
            <p className="text-xs text-gray-500">{s.desc}</p>
          </div>
          {i < steps.length - 1 && <span className="self-center text-gray-300 text-sm">→</span>}
        </div>
      ))}
    </div>
  );
}

function ChipList({ items, className = 'mb-3' }: { items: string[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {items.map((it) => (
        <span key={it} className="px-2 py-1 rounded-full bg-gray-100 border border-gray-200 text-xs text-gray-600 whitespace-nowrap">
          {it}
        </span>
      ))}
    </div>
  );
}

function NoteList({ items, className = 'mb-3' }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={`text-xs text-gray-400 space-y-1 pl-4 list-disc marker:text-gray-300 ${className}`}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

function FeatureGrid({ children }: { children?: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">{children}</div>;
}

function FeatureCard({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2.5">
      <p className="text-xs font-bold text-gray-700 mb-1">{title}</p>
      <div className="text-xs text-gray-500 leading-relaxed">{children}</div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-bold text-gray-600 border border-gray-200 border-b-2 border-b-gray-300 bg-gray-100">
      {children}
    </th>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return (
    <td className="px-3 py-2 text-[11px] text-gray-700 border border-gray-200 align-top">
      {children}
    </td>
  );
}

function Tr({ children }: { children?: React.ReactNode }) {
  return <tr className="even:bg-gray-50/40">{children}</tr>;
}
