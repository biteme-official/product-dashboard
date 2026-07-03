const TOC_ITEMS = [
  { id: 'manual-s1',  label: '1. 개요' },
  { id: 'manual-s2',  label: '2. 사용자 역할 및 권한' },
  { id: 'manual-s3',  label: '3. 화면 구성' },
  { id: 'manual-s4',  label: '4. 데이터 소스' },
  { id: 'manual-s5',  label: '5. 채널·카테고리 매핑' },
  { id: 'manual-s6',  label: '6. 집계 기간 모드' },
  { id: 'manual-s7',  label: '7. STEP 1 — 월별 발주 계획' },
  { id: 'manual-s8',  label: '8. STEP 2 — 채널별 목표량 설정' },
  { id: 'manual-s9',  label: '9. STEP 3 — 채널별 수량 확인' },
  { id: 'manual-s10', label: '10. 프라이싱 시나리오' },
  { id: 'manual-s11', label: '11. 마케팅 브리프' },
  { id: 'manual-s12', label: '12. 대응 SKU 패널' },
  { id: 'manual-s13', label: '13. 핵심 계산 수식' },
  { id: 'manual-s14', label: '14. 환율 자동 갱신' },
  { id: 'manual-s15', label: '15. 데이터 저장 및 동기화' },
  { id: 'manual-s16', label: '16. 채널별 요약 뷰' },
  { id: 'manual-s17', label: '17. UI 동작' },
  { id: 'manual-s18', label: '18. 향후 개선 방향' },
];

export function ManualTab() {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-10 text-sm text-gray-700">

      {/* 목차 */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <h2 className="text-xs font-bold text-gray-500 uppercase tracking-widest">목차</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-gray-200">
          {TOC_ITEMS.map((item) => {
            const [, num, title] = item.label.match(/^(\d+)\.\s*(.*)$/) ?? [null, '', item.label];
            return (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className="flex items-center gap-2.5 px-4 py-2.5 border-b border-r border-gray-200 text-left text-xs text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                <span className="flex-shrink-0 w-5 h-5 rounded bg-gray-100 text-gray-400 text-[10px] font-bold flex items-center justify-center">
                  {num}
                </span>
                <span className="truncate">{title}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 1. 개요 */}
      <section id="manual-s1" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">1. 개요</h2>
        <p className="text-xs text-gray-600 mb-3">
          Product Dashboard는 신규 SKU(제품)를 출시하기 전, 전략팀·MD팀·마케팅팀·CPO가 한 화면에서
          발주 수량 계획, 채널별 목표량, 예상 매출과 공헌이익을 동시에 검토하고 협업할 수 있도록 만들어진
          내부 의사결정 도구입니다.
        </p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
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
          </tbody>
        </table>
      </section>

      {/* 2. 사용자 역할 및 권한 */}
      <section id="manual-s2" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">2. 사용자 역할 및 권한</h2>
        <p className="text-xs text-gray-500 mb-2">역할별로 4자리 PIN 코드를 입력해 로그인합니다. (구 marketing·cs 역할은 viewer로 통합되었으며, 기존 PIN은 자동 승계됩니다.)</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              <Th>역할</Th>
              <Th>표시명</Th>
              <Th>주요 권한 (기본값)</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>master</Td><Td>MASTER</Td><Td>모든 기능 편집 가능. PIN 관리, 권한 설정, 백업·복원, 확정 로그 조회. 권한이 항상 전체 고정</Td></Tr>
            <Tr><Td>pm</Td><Td>PM</Td><Td>SKU 기본 정보·월별 계획(STEP 1) 입력. 최종 발주 확정. SKU 일괄 추가</Td></Tr>
            <Tr><Td>viewer</Td><Td>VIEWER</Td><Td>뷰어 전용. 모든 정보 열람 가능, 편집 불가 (구 마케팅·CS/경영지원 역할 통합)</Td></Tr>
            <Tr><Td>platform_md</Td><Td>플랫폼MD</Td><Td>채널별 목표량(STEP 2) 입력. 자사몰 채널 확정, 오픈일정 확정</Td></Tr>
            <Tr><Td>brand_md</Td><Td>브랜드MD</Td><Td>채널별 목표량(STEP 2) 입력. 스스·위탁·B2B 채널 확정, 오픈일정 확정</Td></Tr>
            <Tr><Td>global</Td><Td>글로벌</Td><Td>채널별 목표량(STEP 2) 입력. 일본·글로벌 채널 확정, 오픈일정 확정</Td></Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* 위 권한은 고정 값이 아니라 <strong>관리 탭 &gt; 권한 관리</strong>에서 역할별로 5개 항목(SKU 기본정보 / STEP1 / STEP2 / 오픈일정 확정 / 발주 확정)을 언제든 켜고 끌 수 있습니다. master 행만 항상 전체 편집 가능으로 고정됩니다.</p>
        <p className="mt-1 text-xs text-gray-400">* STEP2 채널 확정 버튼은 "STEP2 권한 보유 여부"만 확인하므로, 역할과 담당 채널 그룹이 다르더라도(예: 글로벌 담당이 브랜드 확정) 버튼 자체는 노출될 수 있습니다.</p>
      </section>

      {/* 3. 화면 구성 */}
      <section id="manual-s3" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">3. 화면 구성</h2>
        <p className="text-xs font-semibold text-gray-600 mb-2">상단 메인 탭 (로그인 직후 기본 진입 탭: 프로젝션)</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
              <Th>탭명</Th>
              <Th>대상</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>프로젝션</Td><Td>전체</Td><Td>LIST VIEW / 채널별 오픈일정 두 서브탭으로 구성. 로그인 시 항상 이 탭(LIST VIEW)으로 초기화됨</Td></Tr>
            <Tr><Td>SKU 리스트</Td><Td>전체</Td><Td>SKU 카드 목록. 각 SKU별 3단계 계획 진행. 카드↔목록(테이블) 뷰 토글 가능 (프로젝션의 LIST VIEW와는 별개 기능)</Td></Tr>
            <Tr><Td>채널별 요약</Td><Td>MD·전략</Td><Td>전체 SKU의 채널별 출고·매출 요약 뷰</Td></Tr>
            <Tr><Td>메뉴얼</Td><Td>전체</Td><Td>대시보드 사용 방법 가이드 (현재 페이지)</Td></Tr>
            <Tr><Td>관리</Td><Td>MASTER 전용</Td><Td>PIN 관리 / 권한 관리 / 쿠팡 채널 / 데이터 정리 4개 서브탭</Td></Tr>
          </tbody>
        </table>

        <p className="text-xs font-semibold text-gray-600 mb-2">SKU 카드 구성</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
              <Th>영역</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>카드 상단 기본 정보</Td><Td>SKU명 / 브랜드 / 카테고리 / 제품 유형(시즈널·스테디·미해당) / 출시일 / 원가 / 판매가 / 총 발주량 / MOQ / 사이즈 수·컬러 수</Td></Tr>
            <Tr><Td>가격확정 토글</Td><Td>판매가·정가 입력을 잠금. SKU 기본정보 권한 보유자(기본값: master·PM)만 조작 가능</Td></Tr>
            <Tr><Td>프라이싱 시나리오 버튼</Td><Td>판매가·원가 정보 위에 위치. 클릭 시 전체 B2C/B2B 시나리오 모달 팝업</Td></Tr>
            <Tr><Td>대응 SKU 패널</Td><Td>기존 SKU 검색·선택, Tableau 실적 데이터 자동 로드, 비교 기간 설정</Td></Tr>
            <Tr><Td>마케팅 브리프 버튼</Td><Td>클릭 시 SKU별 마케팅 전략 작성 패널 팝업</Td></Tr>
            <Tr><Td>STEP 탭</Td><Td>월별 계획(STEP 1) / 채널별 목표량 설정(STEP 2) / 채널별 수량 확인(STEP 3)</Td></Tr>
          </tbody>
        </table>

        <p className="text-xs font-semibold text-gray-600 mb-2">프로젝션 &gt; LIST VIEW</p>
        <p className="text-xs text-gray-600 mb-2">전체 SKU를 테이블 형태로 조회. 오픈일 → 브랜드 → 카테고리 → SKU명 순으로 자동 정렬. 카테고리·브랜드·월·검색어 필터 지원.</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
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

        <p className="text-xs font-semibold text-gray-600 mb-2">프로젝션 &gt; 채널별 오픈일정</p>
        <p className="text-xs text-gray-600 mb-2">채널(플랫폼·스스·위탁·B2B·글로벌·기타)별 오픈 예정일을 개별 입력하고, SKU 오픈일 대비 선오픈/동시오픈 여부를 자동 배지로 표시합니다. 기타 채널은 이름을 직접 입력할 수 있고, 메모 입력란도 제공됩니다.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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

      {/* 4. 데이터 소스 */}
      <section id="manual-s4" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">4. 데이터 소스</h2>
        <table className="w-full border-collapse text-xs mb-2">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="text-xs text-gray-400">* Tableau REST API v3.21. PAT 인증 후 뷰 CSV 다운로드 방식으로 수집. 세션 내 캐싱(maxAge 60분).</p>
      </section>

      {/* 5. 채널·카테고리 매핑 */}
      <section id="manual-s5" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">5. 채널·카테고리 매핑</h2>

        <p className="text-xs font-semibold text-gray-600 mb-2">Tableau 원본 채널명 → 대시보드 채널명</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
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
            <Tr><Td>해외</Td><Td>글로벌 · 일본</Td><Td>글로벌 40% / 일본 60% 임의 분배</Td></Tr>
            <Tr><Td>협찬 · 기타 · CS · 공구 · 팝업</Td><Td>—</Td><Td>집계에서 제외</Td></Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mb-4">* 쿠팡은 기본적으로 모든 SKU에서 비활성 채널입니다. 관리 탭 &gt; 쿠팡 채널에서 개별 SKU를 활성화하면 그 SKU에 한해 STEP2 채널별 목표량·대응SKU 실적/비중·채널별 요약 뷰에 쿠팡이 정상 포함됩니다.</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">대시보드 채널 → Tableau 채널ROI용 (변동비 조회)</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
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

        <p className="text-xs font-semibold text-gray-600 mb-2">대시보드 카테고리 → Tableau 팀 구분카테 (변동비 조회)</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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

      {/* 6. 집계 기간 모드 */}
      <section id="manual-s6" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">6. 집계 기간 모드</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="mt-2 text-xs text-gray-400">* 선택한 비교 기간은 변동비율 계산 기간과도 동기화됩니다.</p>
      </section>

      {/* 7. STEP 1 */}
      <section id="manual-s7" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">7. STEP 1 — 월별 발주 계획 (PM 담당)</h2>
        <p className="text-xs text-gray-600 mb-3">7월부터 익년 2월까지 8개월을 기준으로 월별 발주 수량을 입력합니다. 입력한 월별 수량은 STEP 2 초기값의 기준이 됩니다.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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
              <Td>카테고리 B2C 비중 기본값</Td>
              <Td>의류 60% · 용품 55% · 잡화 65% · 장난감 35% · 식품 65%</Td>
              <Td>대응SKU 없을 시 사용</Td>
            </Tr>
            <Tr>
              <Td>가격확정</Td>
              <Td>SKU 카드의 [가격확정] 토글로 판매가·정가 입력을 잠금. SKU 기본정보 권한 보유자(기본값: master·PM)만 조작 가능</Td>
              <Td>원가는 잠기지 않음</Td>
            </Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* "MOQ 미달!" 배지는 공급사 MOQ(sku.moq) 기준이 아니라, STEP2 채널 합계가 STEP1 목표 수량보다 적을 때 표시됩니다 (STEP2 섹션 참고).</p>
      </section>

      {/* 8. STEP 2 */}
      <section id="manual-s8" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">8. STEP 2 — 채널별 목표량 설정 (MD 담당)</h2>
        <p className="text-xs text-gray-600 mb-3">MD가 각 채널별·월별 목표 수량을 직접 설정하고, 판매가 시나리오를 설정해 예상 순매출과 공헌이익을 실시간으로 확인합니다.</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">자동 초기값 세팅 순서</p>
        <p className="text-xs text-gray-500 mb-2">① 대응 SKU 설정 시 → 채널별 출고 비중 기준으로 배분 &nbsp;② 대응 SKU 없을 시 → 카테고리 기본 비중 사용 &nbsp;③ STEP 1 월별 수량 기준으로 월별 배분</p>
        <p className="text-xs text-gray-400 mb-3">* 쿠팡이 비활성화된 SKU는 이 자동 배분 대상에서 제외됩니다 (대응SKU 실적·비중 계산에도 미포함). 관리 탭에서 쿠팡을 활성화한 SKU만 배분에 포함됩니다.</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">채널 요약 테이블 (토글 닫힌 상태)</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
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

        <p className="text-xs font-semibold text-gray-600 mb-2">채널 상세 테이블 (토글 열린 상태 — B2C·B2B 채널)</p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="text-xs text-gray-400 mb-1">* 변동비율은 수수료를 포함한 Tableau 실적 데이터 기반 역산값입니다. 데이터 없을 시 기본값 25% fallback.</p>
        <p className="text-xs text-gray-400 mb-4">* 채널별 판매가(channelPricing)에 표시되는 수수료율 입력값은 참고용으로만 저장되며, 실제 순매출·공헌이익 계산에는 반영되지 않습니다.</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">채널 확정 프로세스</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="text-xs text-gray-400 mb-4">* "MD 확정"은 하나의 버튼이 아니라 위 3개 그룹으로 나뉘어 있으며, STEP2 편집 권한이 있으면 그룹-역할이 정확히 일치하지 않아도 버튼이 노출됩니다. 채널 목표량 수정 후에는 [되돌리기] 버튼으로 직전 상태로 복구할 수 있습니다 (카드를 닫으면 되돌리기 불가).</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">마케팅 채널 (B2C 하단 별도 섹션)</p>
        <p className="text-xs text-gray-500 mb-2">
          마케팅 협찬·샘플 등 판매 외 목적으로 사용되는 수량을 기록하는 비용 채널입니다. B2C·B2B 판매 채널과 달리 판매가/수수료 개념이 없으며, 수량 입력 시 발생하는 비용이 SKU의 순매출과 공헌이익에서 차감됩니다.
        </p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="text-xs text-gray-400">* 마케팅 채널 수량은 Firestore에 저장되며 새로고침 후에도 유지됩니다.</p>
      </section>

      {/* 9. STEP 3 */}
      <section id="manual-s9" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">9. STEP 3 — 채널별 수량 확인 (MD 확인용)</h2>
        <p className="text-xs text-gray-600 mb-3">STEP 2에서 입력한 채널별 목표량을 기반으로, 월별·옵션별 최종 수량을 확인합니다. 별도 재무 계산은 없습니다.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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

      {/* 10. 프라이싱 시나리오 */}
      <section id="manual-s10" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">10. 프라이싱 시나리오</h2>
        <p className="text-xs text-gray-600 mb-3">
          SKU 카드 내 [프라이싱 시나리오] 버튼, 또는 LIST VIEW의 [프라이싱] 버튼을 클릭하면 해당 SKU의 모든 판매가 시나리오를 한눈에 확인할 수 있는 모달이 열립니다.
          STEP 2에서 채널별로 설정한 시나리오와 달리, 여기서는 <strong>전체 B2C/B2B 시나리오를 동시에 조회</strong>하는 참고용 뷰입니다.
        </p>

        <p className="text-xs font-semibold text-gray-600 mb-1">모달 상단 KPI</p>
        <p className="text-xs text-gray-500 mb-3">원가 / 판매가 / 정가 / 상시할인율 / 원가율이 표시됩니다. 모든 시나리오의 base 가격은 SKU 판매가 기준입니다.</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">B2C 시나리오 — 오픈 프로모션 토글</p>
        <p className="text-xs text-gray-500 mb-2">
          B2C 테이블 상단에 <span className="text-red-600 font-medium">[신상위크]</span> · <span className="text-orange-500 font-medium">[라이브]</span> · <span className="text-emerald-600 font-medium">[선단독]</span> 토글 버튼이 있습니다.
          기본 상태에서 신상위크·라이브 할인·선단독 행은 비활성화(흐리게)로 표시됩니다. [신상위크] 버튼은 신상위크+라이브 할인을 동시 활성화하며, [라이브] 버튼은 라이브 할인만 단독 활성화합니다. 세 토글은 독립적으로 작동합니다.
        </p>

        <p className="text-xs font-semibold text-gray-600 mb-2">B2C 시나리오 계산식</p>
        <p className="text-xs text-gray-500 mb-2">* floor10(x) = x를 10원 단위 내림 &nbsp;|&nbsp; 오픈특가 = floor((floor10(base × 0.80) − 901) ÷ 1000) × 1000 + 900</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
              <Th>시나리오</Th>
              <Th>계산식 (KRW)</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>오픈특가</Td><Td>floor((floor10(base × 0.80) − 901) ÷ 1000) × 1000 + 900</Td><Td>항상 활성</Td></Tr>
            <Tr><Td>신상위크</Td><Td>오픈특가 ≤ 10,000: floor10(오픈특가 × 0.95) / 오픈특가 {'>'} 10,000: max(0, 오픈특가 − 1,000)</Td><Td>[신상위크] 토글 활성 시</Td></Tr>
            <Tr><Td>라이브 할인</Td><Td>기준가(신상위크 or 오픈특가)에서 min(round(기준가×0.05), 1,000) 차감 후 floor10</Td><Td>[신상위크] ON → 신상위크 기준 / [라이브] ON → 오픈특가 기준</Td></Tr>
            <Tr><Td>선단독</Td><Td>오픈특가 ≤ 10,000: floor10(오픈특가 × 0.95) / 오픈특가 {'>'} 10,000: max(0, 오픈특가 − 1,000)</Td><Td>[선단독] 토글 활성 시</Td></Tr>
            <Tr><Td>상시 최대할인율</Td><Td>floor10(base × 0.85)</Td><Td>항상 활성</Td></Tr>
            <Tr><Td>특가 최대할인율</Td><Td>floor10(base × 0.80)</Td><Td>항상 활성</Td></Tr>
            <Tr><Td>시즌오프 (의류전용)</Td><Td>floor10(base × 0.75)</Td><Td>항상 활성</Td></Tr>
          </tbody>
        </table>

        <p className="text-xs font-semibold text-gray-600 mb-2">B2B 시나리오 계산식</p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
              <Th>시나리오</Th>
              <Th>계산식 (KRW)</Th>
              <Th>외화 보조 표시</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>B2B 오픈 할인</Td><Td>floor10(base × 0.65 × 0.90)</Td><Td>—</Td></Tr>
            <Tr><Td>B2B 상시 운영</Td><Td>floor10(base × 0.65)</Td><Td>—</Td></Tr>
            <Tr><Td>사입 공급가</Td><Td>floor10(base × 0.50)</Td><Td>—</Td></Tr>
            <Tr>
              <Td>글로벌 공급가</Td>
              <Td>floor10( (base ÷ 1250 × 1.6) ÷ 2 × USD/KRW )</Td>
              <Td>USD $ = (base ÷ 1250 × 1.6) ÷ 2</Td>
            </Tr>
            <Tr>
              <Td>일본 공급가</Td>
              <Td>floor10( (base ÷ 950 × 1.3) ÷ 2 × JPY/KRW )</Td>
              <Td>JPY ¥ = (base ÷ 950 × 1.3) ÷ 2</Td>
            </Tr>
          </tbody>
        </table>

        <p className="text-xs font-semibold text-gray-600 mb-2">원가율 색상 기준 (프라이싱 모달 내)</p>
        <table className="w-full border-collapse text-xs mb-2">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="text-xs text-gray-400">* 할인율은 소수점 반올림 정수 표시. 비활성화된 시나리오(신상위크·라이브 할인·선단독)는 회색으로 흐리게 표시됩니다.</p>
        <p className="mt-1 text-xs text-gray-400">* 쿠팡·B2B·사입및페어는 시나리오 미설정 시 'B2B 상시 운영' 자동 적용. 글로벌은 '글로벌 공급가', 일본은 '일본 공급가' 자동 적용.</p>
      </section>

      {/* 11. 마케팅 브리프 */}
      <section id="manual-s11" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">11. 마케팅 브리프 (Marketing Brief)</h2>
        <p className="text-xs text-gray-600 mb-3">
          SKU 카드에서 [마케팅 브리프] 버튼을 클릭하면 SKU별 마케팅 전략을 작성할 수 있습니다.
          입력 후 800ms 디바운스 자동 저장되며, Firestore에 영구 보관됩니다.
        </p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
              <Th>항목</Th>
              <Th>설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>① 경쟁사 타겟 제품</Td>
              <Td>경쟁 제품명·판매가·주간 예상 매출 입력. 당사 판매가 대비 가격 경쟁력 자동 산정</Td>
            </Tr>
            <Tr>
              <Td>② 타겟 고객</Td>
              <Td>목표 고객층 자유 텍스트 입력</Td>
            </Tr>
            <Tr>
              <Td>③ 마케팅 제안</Td>
              <Td>마케팅 전략·채널 활용 방안 자유 텍스트 입력</Td>
            </Tr>
            <Tr>
              <Td>④ PSP / KSP / USP</Td>
              <Td>구매자극요소 / 판매핵심요소 / 차별화요소 입력</Td>
            </Tr>
            <Tr>
              <Td>⑤ 비고</Td>
              <Td>기타 메모</Td>
            </Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400">* 마케팅(뷰어) 역할은 마케팅 브리프 내용을 열람만 가능하며 편집할 수 없습니다.</p>
      </section>

      {/* 12. 대응 SKU 패널 */}
      <section id="manual-s12" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">12. 대응 SKU 패널</h2>
        <p className="text-xs text-gray-600 mb-3">새 SKU와 비교할 기존 SKU를 설정하면 Tableau에서 데이터를 자동으로 불러와 참고 지표로 활용합니다.</p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
              <Th>기능</Th>
              <Th>설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>SKU 검색 및 다중 선택</Td><Td>복수 SKU 선택 시 출고량 합산하여 비교 기준으로 사용</Td></Tr>
            <Tr><Td>비교 기간 선택</Td><Td>"직전 12개월" 또는 "동기간 (전년도 동월)" 중 선택. 변동비율 계산 기간과도 동기화</Td></Tr>
            <Tr><Td>월평균·연간 출고량</Td><Td>선택한 기간 기준 자동 표시</Td></Tr>
            <Tr><Td>채널별 출고 비중</Td><Td>차트 시각화. STEP 2 초기값 세팅에 활용</Td></Tr>
          </tbody>
        </table>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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

      {/* 13. 핵심 계산 수식 */}
      <section id="manual-s13" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">13. 핵심 계산 수식</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="mt-2 text-xs text-gray-400">* 이 변동비율 공식은 STEP2·SKU카드·채널별 요약 뷰 등 채널×월 손익을 계산하는 모든 화면에 동일하게 적용됩니다.</p>
      </section>

      {/* 14. 환율 자동 갱신 */}
      <section id="manual-s14" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">14. 환율 자동 갱신</h2>
        <table className="w-full border-collapse text-xs mb-2">
          <thead>
            <tr className="bg-gray-50">
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

      {/* 15. 데이터 저장 및 동기화 */}
      <section id="manual-s15" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">15. 데이터 저장 및 동기화</h2>
        <p className="text-xs font-semibold text-gray-600 mb-2">Firestore 저장 항목 (새로고침 후에도 유지)</p>
        <p className="text-xs text-gray-500 mb-3">SKU 기본 정보 / 사이즈·컬러 구성 및 수량 / 월별 발주 계획 / 채널별 월별 목표 수량 / 채널별 판매가 시나리오 설정 / 채널별 오픈일정 / 가격확정·자사몰세팅 여부 / SKU별 쿠팡 활성화 여부 / 발주 확정 상태 및 확정 이력 / 마케팅 브리프 내용</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">발주 확정 프로세스</p>
        <p className="text-xs text-gray-400 mb-2">* 이 시스템에는 "CPO" 역할이 존재하지 않습니다. 최종 발주 확정은 발주 확정 권한 보유자(기본값: master·PM)가 수행하며, 화면에도 "PM확정" 뱃지로 표시됩니다.</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
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

        <p className="text-xs font-semibold text-gray-600 mb-2">백업 · 복원</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
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
        <p className="mt-2 text-xs text-gray-400">* 이미지 URL은 Firebase Storage 주소이므로, 동일 Firebase 프로젝트 내에서만 이미지가 정상 표시됩니다.</p>
      </section>

      {/* 16. 채널별 요약 뷰 */}
      <section id="manual-s16" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">16. 채널별 요약 뷰</h2>
        <p className="text-xs text-gray-600 mb-3">모든 SKU의 채널별 출고·매출 현황을 요약 테이블로 확인할 수 있습니다.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              <Th>항목</Th>
              <Th>내용</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>전체 요약</Td><Td>전체 SKU의 채널별 총 수량·순매출·공헌이익 집계. 월별 트렌드 차트 포함</Td></Tr>
            <Tr><Td>채널별 탭</Td><Td>채널 단위로 SKU별 수량·매출·공헌이익 상세 조회. 채널별 월별 트렌드 차트 포함</Td></Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* 공헌이익 계산은 섹션 13과 동일하게 Tableau 팀카테 역산 변동비율을 사용합니다 (없으면 25% fallback). 단, 이 뷰는 SKU 카드별 비교기간(직전 12개월/동기간) 선택을 알 수 없으므로 항상 "직전 12개월" 기준으로 고정 계산됩니다 — 카드에서 동기간으로 보고 있는 값과 소폭 차이가 날 수 있습니다.</p>
      </section>

      {/* 17. UI 동작 */}
      <section id="manual-s17" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">17. UI 동작 — 페이지 상태 유지</h2>
        <p className="text-xs text-gray-600 mb-2">새로고침 후에도 직전 상태가 복원됩니다. sessionStorage 기반으로 브라우저 탭 단위로 유지되며, 탭을 닫으면 초기화됩니다. 단, 로그인 직후에는 이 복원 규칙과 무관하게 항상 프로젝션 &gt; LIST VIEW로 초기화됩니다.</p>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
              <Th>유지되는 상태</Th>
              <Th>설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>메인 탭</Td><Td>마지막으로 열었던 탭 (프로젝션 / SKU 리스트 / 채널별 요약 / 메뉴얼 / 관리)으로 복원</Td></Tr>
            <Tr><Td>프로젝션 서브탭</Td><Td>LIST VIEW / 채널별 오픈일정 중 마지막 선택값 복원</Td></Tr>
            <Tr><Td>카테고리 필터</Td><Td>SKU 리스트 탭의 카테고리 선택값 복원</Td></Tr>
            <Tr><Td>브랜드 필터</Td><Td>선택된 브랜드 복원</Td></Tr>
          </tbody>
        </table>
        <p className="text-xs font-semibold text-gray-600 mb-2">뒤로가기 (내비게이션 히스토리)</p>
        <p className="text-xs text-gray-600">LIST VIEW 등에서 SKU 카드로 이동하면 이동 전 상태(탭·필터·검색어·펼쳐진 카드·스크롤 위치, 최대 20단계)가 기록됩니다. 상단의 [뒤로가기] 버튼을 누르면 이동 전 화면으로 정확히 복원됩니다. 이 기능은 새로고침 유지와는 별개로, 새로고침 시에는 필터·검색어·스크롤 위치가 초기화됩니다.</p>
      </section>

      {/* 18. 향후 개선 방향 */}
      <section id="manual-s18" className="scroll-mt-20">
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">18. 향후 개선 방향</h2>
        <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
          <li>Tableau 팀카테 뷰에 2025년 이전 데이터 추가 → 변동비율 계산 정확도 향상 [가능여부 검토중]</li>
          <li>SKU별 실시간 판매 실적 연동 (출시 후 추적 기능)</li>
          <li>채널별 목표 대비 실적 달성률 모니터링 탭 추가</li>
          <li>모바일 최적화 레이아웃</li>
        </ul>
      </section>

    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500 border border-gray-200 bg-gray-50">
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
