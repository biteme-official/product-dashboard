export function ManualTab() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-10 text-sm text-gray-700">

      {/* 1. 데이터 소스 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">1. 데이터 소스</h2>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              <Th>데이터</Th>
              <Th>Tableau 뷰</Th>
              <Th>사용처</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>SKU 월별 출고량</Td>
              <Td>출고데이터 MCP 연결용 (SKU 토탈)</Td>
              <Td>대응SKU 자동완성 · STEP2 채널 비중 기준값 산출</Td>
            </Tr>
            <Tr>
              <Td>채널별 출고량</Td>
              <Td>채널별 출고 뷰 (VITE_TABLEAU_CHANNEL_VIEW_ID)</Td>
              <Td>STEP2 채널 비중 기본값 자동 세팅</Td>
            </Tr>
            <Tr>
              <Td>팀카테 공헌이익</Td>
              <Td>MCP / sheet0 (팀카테 공헌이익)</Td>
              <Td>STEP2 변동비 비중 역산 — contribution 항목</Td>
            </Tr>
            <Tr>
              <Td>팀카테 순매출·원가</Td>
              <Td>MCP / sheet1 (팀카테 순매출·원가)</Td>
              <Td>STEP2 변동비 비중 역산 — revenue·cost 항목</Td>
            </Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* Tableau REST API v3.21. PAT 인증 후 뷰 CSV 다운로드 방식으로 수집. 세션 내 캐싱(maxAge 60분).</p>
      </section>

      {/* 2. 채널 매핑 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">2. 채널 매핑</h2>

        <p className="text-xs text-gray-500 mb-2">Tableau 원본 채널명 → 대시보드 채널명 변환 규칙</p>
        <table className="w-full border-collapse text-xs mb-4">
          <thead>
            <tr className="bg-gray-50">
              <Th>Tableau 채널명</Th>
              <Th>대시보드 채널</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>SSFW 스스</Td><Td>스스</Td><Td></Td></Tr>
            <Tr><Td>SSFW 자사몰</Td><Td>스스</Td><Td></Td></Tr>
            <Tr><Td>바잇미 자사몰</Td><Td>자사몰</Td><Td></Td></Tr>
            <Tr><Td>사입</Td><Td>사입및페어</Td><Td></Td></Tr>
            <Tr><Td>페어</Td><Td>사입및페어</Td><Td></Td></Tr>
            <Tr><Td>해외</Td><Td>글로벌 · 일본</Td><Td>동일 수량을 두 채널 각각 100% 반영 (분배 아님)</Td></Tr>
            <Tr><Td>협찬 · 기타 · CS · 공구 · 팝업</Td><Td>—</Td><Td>집계에서 제외</Td></Tr>
          </tbody>
        </table>

        <p className="text-xs text-gray-500 mb-2">대시보드 채널 → Tableau 채널ROI용 변환 (변동비 비중 조회용)</p>
        <table className="w-full border-collapse text-xs">
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
      </section>

      {/* 3. 카테고리 매핑 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">3. 카테고리 매핑</h2>
        <p className="text-xs text-gray-500 mb-2">대시보드 카테고리 → Tableau 팀 구분카테 (변동비 조회용)</p>
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

      {/* 4. 집계 기간 모드 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">4. 집계 기간 모드</h2>
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
      </section>

      {/* 5. STEP1 계산식 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">5. STEP 1 — 월별 발주 계획</h2>
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
              <Td>월별 발주 수량</Td>
              <Td>PM이 각 월의 목표 수량을 직접 입력</Td>
              <Td>STEP2 채널 배분의 월별 기준이 됨</Td>
            </Tr>
            <Tr>
              <Td>카테고리 B2C 비중 (기본값)</Td>
              <Td>의류 60% · 용품 55% · 잡화 65% · 장난감 35% · 식품 65%</Td>
              <Td>대응SKU 없을 시 기본값</Td>
            </Tr>
          </tbody>
        </table>
      </section>

      {/* 6. STEP2 계산식 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">6. STEP 2 — 채널별 목표량 설정</h2>
        <table className="w-full border-collapse text-xs mb-3">
          <thead>
            <tr className="bg-gray-50">
              <Th>항목</Th>
              <Th>계산식</Th>
              <Th>비고</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>채널별 초기 수량</Td>
              <Td>총 발주량 × 대응SKU 채널 비중</Td>
              <Td>대응SKU 선택 시 자동 세팅. 없으면 카테고리 기본 비중 사용</Td>
            </Tr>
            <Tr>
              <Td>월별 배분</Td>
              <Td>채널 수량 × STEP1 월별 비율</Td>
              <Td>STEP1 미입력 시 균등 배분</Td>
            </Tr>
            <Tr>
              <Td>실매출단가</Td>
              <Td>∑(월수량 × 시나리오가격) ÷ 총수량</Td>
              <Td>수수료 미반영</Td>
            </Tr>
            <Tr>
              <Td>순매출</Td>
              <Td>실매출단가 ÷ 1.1 × 총수량</Td>
              <Td>부가세 제외</Td>
            </Tr>
            <Tr>
              <Td>변동비 비중</Td>
              <Td>(순매출 − 원가 − 공헌이익) ÷ 순매출</Td>
              <Td>Tableau 팀카테 데이터 역산. 데이터 없으면 25% fallback</Td>
            </Tr>
            <Tr>
              <Td>공헌이익</Td>
              <Td>순매출 × (1 − 변동비 비중) − 원가 × 수량</Td>
              <Td></Td>
            </Tr>
            <Tr>
              <Td>CM율</Td>
              <Td>공헌이익 ÷ 순매출 × 100</Td>
              <Td>≥ 40% 초록 / ≥ 30% 노랑 / &lt; 30% 빨강</Td>
            </Tr>
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mb-4">* 변동비 비중은 수수료를 포함한 Tableau 실적 데이터 기반 역산값입니다. 수수료를 별도 반영하지 않습니다.</p>

        <p className="text-xs font-semibold text-gray-600 mb-2">채널 토글 펼침 — 월별 상세 테이블</p>
        <table className="w-full border-collapse text-xs mb-2">
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
              <Td>순매출 × (1 − 변동비 비중) − 원가 × 수량. FY26/FY27 합계 별도 표시</Td>
            </Tr>
          </tbody>
        </table>
      </section>

      {/* 7. STEP3 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">7. STEP 3 — 채널별 수량 확정</h2>
        <p className="text-xs text-gray-600 mb-3">채널×월별 수량과 상세 옵션(사이즈별, 컬러별 등)을 최종 확인하는 페이지입니다. 별도 재무 계산은 없습니다.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              <Th>표시 항목</Th>
              <Th>설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>채널별 수량</Td><Td>채널×월 조합의 목표 수량</Td></Tr>
            <Tr><Td>26년 연간 합계</Td><Td>7~12월 수량 합산 (익년 1~2월 제외)</Td></Tr>
            <Tr><Td>전체 합계</Td><Td>7월~익년 2월 전체 수량 합산</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 8. 시나리오 가격 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">8. 판매가 시나리오 계산식</h2>
        <p className="text-xs text-gray-500 mb-2">* base = 채널 판매가 (채널별 설정 없으면 SKU 기본 판매가)</p>
        <p className="text-xs text-gray-500 mb-3">* floor10(x) = x를 10원 단위 내림. calcOpenSpecialPrice(base) = floor10(base × 0.80)을 1000원 단위로 내림한 값에 +900</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              <Th>시나리오</Th>
              <Th>계산식 (KRW)</Th>
              <Th>외화 보조 표시</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>오픈특가</Td><Td>calcOpenSpecialPrice(base)   =   floor((floor10(base × 0.80) − 901) ÷ 1000) × 1000 + 900</Td><Td>—</Td></Tr>
            <Tr><Td>신상위크</Td><Td>max(0, 오픈특가 − 1,000)</Td><Td>—</Td></Tr>
            <Tr><Td>신상위크 라이브</Td><Td>max(0, 오픈특가 − 2,000)</Td><Td>—</Td></Tr>
            <Tr><Td>선단독</Td><Td>max(0, 오픈특가 − 1,000)</Td><Td>—</Td></Tr>
            <Tr><Td>상시 최대할인율</Td><Td>floor10(base × 0.85)</Td><Td>—</Td></Tr>
            <Tr><Td>특가 최대할인율</Td><Td>floor10(base × 0.80)</Td><Td>—</Td></Tr>
            <Tr><Td>시즌오프 (의류전용)</Td><Td>floor10(base × 0.75)</Td><Td>—</Td></Tr>
            <Tr><Td>B2B 오픈 할인</Td><Td>floor10(base × 0.65 × 0.90)</Td><Td>—</Td></Tr>
            <Tr><Td>B2B 상시 운영</Td><Td>floor10(base × 0.65)</Td><Td>—</Td></Tr>
            <Tr><Td>사입 공급가</Td><Td>floor10(base × 0.50)</Td><Td>—</Td></Tr>
            <Tr>
              <Td>글로벌 공급가</Td>
              <Td>floor10( (base ÷ 1250 × 1.6) ÷ 2 × USD/KRW )</Td>
              <Td>USD $ = (base ÷ 1250 × 1.6) ÷ 2  (소수점 2자리)<br/>USD/KRW: open.er-api.com 자동 갱신 (하루 1회, fallback 1,400)</Td>
            </Tr>
            <Tr>
              <Td>일본 공급가</Td>
              <Td>floor10( (base ÷ 950 × 1.3) ÷ 2 × JPY/KRW )</Td>
              <Td>JPY ¥ = (base ÷ 950 × 1.3) ÷ 2  (정수)<br/>JPY/KRW: USD/KRW ÷ USD/JPY 교차 계산 (fallback 9.0)</Td>
            </Tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">* 쿠팡·B2B·사입및페어는 시나리오 미설정 시 'B2B 상시 운영' 자동 적용. 글로벌은 '글로벌 공급가', 일본은 '일본 공급가' 자동 적용.</p>
        <p className="mt-1 text-xs text-gray-400">* 글로벌·일본 공급가 선택 시 실 판매가 행에 KRW 금액 아래 외화 금액(USD $ / JPY ¥)이 보조 표시됩니다.</p>
        <p className="mt-1 text-xs text-gray-400">* 실 판매가 행 라벨에 현재 적용 중인 환율($1,380 · ¥9.2 형식)이 표시됩니다. 라이브 환율 수신 시 인디고색, fallback 시 회색으로 표시됩니다.</p>
      </section>

      {/* 9. 환율 자동 갱신 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">9. 환율 자동 갱신</h2>
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
            <Tr><Td>Fallback</Td><Td>API 실패 또는 캐시 만료 전 재요청 실패 시 USD 1,400 · JPY 9.0 고정값 사용</Td></Tr>
            <Tr><Td>JPY/KRW 계산 방법</Td><Td>API에서 받은 USD/KRW와 USD/JPY를 교차 계산 → JPY/KRW = (USD/KRW) ÷ (USD/JPY)</Td></Tr>
            <Tr><Td>적용 범위</Td><Td>STEP2 채널별 목표량 설정 — 글로벌 공급가(USD) · 일본 공급가(JPY) 시나리오 계산에 사용</Td></Tr>
            <Tr><Td>UI 표시</Td><Td>실 판매가 행 라벨에 현재 환율 표시 (라이브: 인디고색 / fallback: 회색)</Td></Tr>
          </tbody>
        </table>
      </section>

      {/* 10. UI 동작 */}
      <section>
        <h2 className="text-base font-bold text-gray-900 mb-3 pb-1 border-b border-gray-200">10. UI 동작 — 페이지 상태 유지</h2>
        <p className="text-xs text-gray-600 mb-2">새로고침 후에도 직전 상태가 복원됩니다. sessionStorage 기반으로 브라우저 탭 단위로 유지되며, 탭을 닫으면 초기화됩니다.</p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gray-50">
              <Th>유지되는 상태</Th>
              <Th>설명</Th>
            </tr>
          </thead>
          <tbody>
            <Tr><Td>메인 탭 (SKU 리스트 / 채널별 요약 / 프라이싱)</Td><Td>마지막으로 열었던 탭으로 복원</Td></Tr>
            <Tr><Td>카테고리 필터</Td><Td>SKU 리스트 및 프라이싱 탭의 카테고리 선택값 복원</Td></Tr>
            <Tr><Td>브랜드 필터</Td><Td>선택된 브랜드 복원</Td></Tr>
            <Tr><Td>프라이싱 카테고리</Td><Td>프라이싱 탭 카테고리 필터 복원</Td></Tr>
          </tbody>
        </table>
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
