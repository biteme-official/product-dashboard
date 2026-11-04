import type { ReactNode } from 'react';
import { ManualOrderSim } from './ManualOrderSim';

/** 메뉴얼 › SKU 카드 장 */
export function ManualCardChapter() {
  return (
<section className="doc" id="card">
  <div className="sec-eyebrow" style={{ color: 'var(--sky)' }}><span className="dot"></span>Anatomy</div>
  <h2 className="sec-title">🪪 SKU 카드</h2>
  <p className="sec-lede">SKU 하나의 기본 정보와 발주 결과를 보는 카드 · SKU 리스트 탭에서 열림.</p>
  <div className="easy"><span className="tag">쉽게</span><span>카드는 <b>확인하는 곳</b>, 수량 결정은 <b>발주량 검토에서</b> · 카드 아래쪽 발주 결과는 발주량 검토에서 정한 값을 보여주기만 함.</span></div>
  <div className="card">
    <h4>🧩 카드 구성 <span className="sample">예시</span></h4>
    <div className="rv-split"><div className="viz rv-shot-wrap"><div className="rv-shot">
      <div className="rc-top">
        <div className="rc-thumb"><span className="rv-pin">1</span><div className="rc-img">🐾</div><div className="rc-link">기획 보러가기 ↗</div></div>
        <div className="rc-basic"><div className="rc-h"><span className="rv-pin">2</span><b>기본 정보</b><span className="chip c-amber">시안/샘플링</span><small>기획 담당자: 담당자명</small></div>
          <div className="rc-fields"><span className="w2">SKU명</span><span>카테고리</span><span>SKU 구분</span><span>브랜드</span><span>출시일</span><span>입고예정일</span><span>촬영예정일</span><span>판매가</span><span>원가</span><span>정가</span><span>상시할인율</span></div></div>
        <div className="rc-side"><div className="rc-h"><span className="rv-pin">3</span><b>옵션 구성</b></div><div className="rc-fields two"><span>사이즈 개수</span><span>MOQ</span></div><div className="rc-colors"><span>블랙</span><span>아이보리</span><span>핑크</span></div><div className="rc-h" style={{ marginTop: '6px' }}><span className="rv-pin">4</span><b>메모</b></div><div className="rc-memo"></div></div>
      </div>
      <div className="rc-result">
        <div className="rc-h"><span className="rv-pin">5</span><b>발주 결과</b><span className="chip c-green">1안 저장</span><small>보기 전용</small><span className="rv-grow"></span><span className="rc-go">발주량 검토에서 열기 →</span></div>
        <div className="rc-two"><div className="rc-kpi"><div><small>1안 발주량 · MOQ 500</small><b>1,000개</b></div><div><small>소진월 · 판정</small><b>8월</b></div><div><small>예상 순매출</small><b>1,481만</b></div><div><small>예상 공헌이익</small><b>503만</b></div></div>
        <div><div className="rc-h"><span className="rv-pin">6</span><b>옵션별 최종 발주량</b></div><table className="rc-t"><tr><th>컬러 \ 사이즈</th><th>S</th><th>M</th><th>L</th><th>합계</th></tr><tr><td>블랙</td><td>180</td><td>240</td><td>180</td><td><b>600</b></td></tr><tr><td>아이보리</td><td>120</td><td>160</td><td>120</td><td><b>400</b></td></tr></table></div></div>
        <div className="rc-h"><span className="rv-pin">7</span><b>채널 · 월 표</b><small>채널을 펼치면 옵션별 수량 · 맨 아래 합계와 월 출고 비중</small></div>
        <div className="rc-h"><span className="rv-pin">8</span><b>예상 금액</b><small>월별 순매출 · 공헌이익 · 판매 목표 전체 기준</small></div>
      </div>
    </div></div><div className="rv-lg"><small className="rv-lg-h">✏️ 카드에서 수정</small><div className="rv-li"><span className="rv-pin">1</span><div><b>썸네일 · 바로가기</b><span>이미지 교체 · CPO 기획 문서로 이동</span></div></div><div className="rv-li"><span className="rv-pin">2</span><div><b>기본 정보</b><span>분류 · 일정 · 가격 확인 · CPO 연동 칸은 잠김</span></div></div><div className="rv-li"><span className="rv-pin">3</span><div><b>옵션 구성</b><span>사이즈 개수 · 컬러명 · MOQ</span></div></div><div className="rv-li"><span className="rv-pin">4</span><div><b>메모</b><span>길면 칸 안에서 스크롤</span></div></div><small className="rv-lg-h">👀 보기 전용 · 발주량 검토 결과</small><div className="rv-li"><span className="rv-pin">5</span><div><b>발주 결과 요약</b><span>상태 · 발주량 · 소진월 · 판정 · 금액</span></div></div><div className="rv-li"><span className="rv-pin">6</span><div><b>옵션별 최종 발주량</b><span>컬러 · 사이즈별 총 수량 · 비중</span></div></div><div className="rv-li"><span className="rv-pin">7</span><div><b>채널 · 월 표</b><span>펼치면 옵션별 · 맨 아래 월 출고 비중</span></div></div><div className="rv-li"><span className="rv-pin">8</span><div><b>예상 금액</b><span>월별 순매출 · 공헌이익</span></div></div></div></div>
    <p className="sub">* 수량 · 대응SKU · 판매가는 [발주량 검토에서 열기] → 해당 SKU가 바로 열림 · 카드를 열기만 해서는 값이 저장되지 않음</p>
  </div>
  <div className="callout note"><span className="ic">💡</span><div><b className="t">숫자가 발주량 검토와 달라 보일 때</b>
    <ul><li><b>금액</b> — 카드는 판매 목표 전체 기준 · 발주량 검토 기본값은 초도 발주량만 · [시즌 목표 · 리오더 포함]으로 바꾸면 같은 기준</li>
    <li><b>수량</b> — 채널 표 합계는 판매 목표 · 옵션 표 합계는 발주량 · 리오더를 계획하면 둘이 다른 게 정상</li></ul></div></div>
</section>
  );
}

/** 메뉴얼 › 발주량 검토 장 (옛 월 계획 · 채널별 목표량 · STEP 2 통합) */
export function ManualReviewChapter({ period, mix }: { period: ReactNode; mix: ReactNode }) {
  return (
<section className="doc" id="review">
  <div className="sec-eyebrow" style={{ color: 'var(--violet)' }}><span className="dot"></span>Decide · 1안 vs 2안</div>
  <h2 className="sec-title">⚖️ 발주량 검토</h2>
  <p className="sec-lede">SKU별 발주량을 정하는 화면 · 1안 · 2안 비교 → 월별 목표량 · 채널 · 옵션 · 판매가 확인 → 저장 → 발주 확정.</p>
  <div className="easy"><span className="tag">쉽게</span><span>예전 채널 목표량과 STEP 2가 여기로 합쳐짐 · 어느 칸을 고치든 <b>같은 표</b>를 고치는 거라 카드 · 채널별 요약 숫자가 함께 바뀜.</span></div>
  <div className="callout note"><span className="ic">📍</span><div><b className="t">어디에 있나</b>프로젝션 › <b>발주량 검토</b> (예전 채널 목표량 자리) · 전 역할이 볼 수 있고 수정은 권한대로</div></div>

  <div className="card">
    <h4>🪟 보기 4개</h4>
    <div className="tw"><table style={{ minWidth: '600px' }}><thead><tr><th>보기</th><th>이럴 때</th><th>내용</th></tr></thead><tbody>
      <tr><td className="k">SKU별 결정</td><td className="e">한 SKU씩 정할 때</td><td>왼쪽 목록(오픈일로 묶음 · 상태 필터 · ↑↓ 이동) + 안 카드 · 월별 목표량 · 대응SKU · 옵션 비중 · 채널 / 옵션 / 판매가 탭</td></tr>
      <tr><td className="k">채널별 설정</td><td className="e">한 채널을 SKU마다 비교</td><td>채널 하나 골라 수량 · 비중 · 대응SKU · 증감 · 판매가 · 순매출 · 공헌이익을 쌓아 보기 · 담당 채널만 수정</td></tr>
      <tr><td className="k">월별 비중설정</td><td className="e">월 계획을 SKU마다</td><td>대응SKU 실적 · 수량 · 발주량 대비 비중 · 증감률을 쌓아 보기 · 월 계획 권한</td></tr>
      <tr><td className="k">전체 합계</td><td className="e">결정 후 전체 확인</td><td>오픈월 × 카테고리 표 · 판매월별 순매출 · 공헌이익 차트 · 월 목표 비교 (관리 › SKU 관리 › 월 목표)</td></tr>
    </tbody></table></div>
    <p className="sub">* 공통 필터: 카테고리 · 브랜드 · 오픈월 · 오픈/완료 제외 · 검색</p>
  </div>

  <div className="card">
    <h4>👀 SKU별 결정 한눈에 <span className="sample">예시</span></h4>
    <div className="rv-split"><div className="viz rv-shot-wrap"><div className="rv-shot">
      <div className="rs-sum"><span className="rv-pin">1</span><div><small>결정 · 확정</small><b>12 · 3 / 26</b></div><div><small>발주금액</small><b>4.2억</b></div><div><small>순매출 · 공헌이익</small><b>12억 · 4.1억</b></div><div><small>위험 SKU</small><b>2</b></div><span className="rv-grow"></span><span className="chip on">초도 발주량만</span><span className="chip">시즌 목표 · 리오더 포함</span><span className="chip c-amber">오류 0 · 경고 2 ▾</span></div>
      <div className="rs-main">
        <div className="rs-list"><span className="rv-pin">2</span><small>전체 · 검토 전 · 저장 · 확정</small><div className="rs-it on">예시 메쉬백<small>1안 저장</small></div><div className="rs-it">예시 니트 토이<small>검토 전</small></div><div className="rs-it">예시 간식<small>발주 확정</small></div></div>
        <div className="rs-right">
          <div className="rs-plans"><span className="rv-pin abs">3</span><div className="rs-plan on"><b>1안</b> <span className="chip c-blue">리오더 약 120</span><div>발주량 <b>1,000</b>개 · 소진 <b>8월</b></div><div className="rs-strip"><i className="g"></i><i className="g"></i><i className="g"></i><i className="g"></i><i className="d"></i><i className="o"></i><i className="o"></i><i className="o"></i></div><small>순매출 · 공헌이익 · CM% · 발주금액 · 리오더 · 시즌 후 잔여</small></div><div className="rs-plan dash"><b>2안 없음</b><small>현재 값 복사 후 수량 · 판매가만 바꿔 비교</small><span className="rc-go light">2안 만들기</span></div></div>
          <div className="rs-mid"><div className="rs-box"><span className="rv-pin abs">4</span><b>📈 1안 월별 목표량</b><small>대응SKU 실적 · 판매 목표 · 증감 · 누적 vs 발주 · 일괄 ±10 · 20%</small></div><div className="rs-box"><span className="rv-pin abs">5</span><b>🔎 대응SKU · 🎨 옵션 비중</b><small>기간 · 실적 · 채널 비중 · 컬러 · 사이즈 비중</small></div></div>
          <div className="rs-box"><span className="rv-pin abs">6</span><b>📦 채널별 목표량 · 🧩 옵션별 검토 · 💰 판매가 · 수익</b><small>탭으로 전환해 자세히 수정</small></div>
          <div className="rs-foot"><span className="rv-pin">7</span><span className="chip c-green">1안 저장</span><small>저장해도 수정 가능 · 최종은 발주 확정</small><span className="rv-grow"></span><span className="rc-go light">1안으로 저장</span><span className="rc-go">발주 확정</span></div>
        </div>
      </div>
    </div></div><div className="rv-lg"><div className="rv-li"><span className="rv-pin">1</span><div><b>요약 · 금액 기준</b><span>전체 합계 · 초도 ↔ 리오더 포함 · 오류 · 경고 칩</span></div></div><div className="rv-li"><span className="rv-pin">2</span><div><b>왼쪽 목록</b><span>SKU 고르기 · 상태 필터 · ↑↓ 이동</span></div></div><div className="rv-li"><span className="rv-pin">3</span><div><b>1안 · 2안 카드</b><span>발주량 입력 · 소진 · 금액 비교 · 안 전환</span></div></div><div className="rv-li"><span className="rv-pin">4</span><div><b>월별 목표량</b><span>달별 판매 목표 · 대응SKU 비교 · 리오더 시점</span></div></div><div className="rv-li"><span className="rv-pin">5</span><div><b>대응SKU · 옵션 비중</b><span>[변경]으로 대응SKU · 기간 수정</span></div></div><div className="rv-li"><span className="rv-pin">6</span><div><b>자세히 탭</b><span>채널 × 월 · 컬러 · 사이즈 · 판매가와 수익</span></div></div><div className="rv-li"><span className="rv-pin">7</span><div><b>아래 고정 줄</b><span>저장 · 발주 확정 · 안 되는 이유 표시</span></div></div></div></div>
  </div>

  <div className="card">
    <h4>🪜 처음이라면 이 순서로</h4>
    <div className="steps flow">
      <div className="step"><div className="no">1</div><div><h5>범위 좁히고 상태 칩 확인</h5><p>필터로 SKU를 추리고 요약의 오류 · 경고 칩 확인 · 오류 SKU는 공헌이익 합계에서 빠지고 확정도 막힘</p></div></div>
      <div className="step"><div className="no">2</div><div><h5>대응SKU 확인</h5><p>[변경]으로 대응SKU · 기간 확인 · 월별 목표량이 비었으면 [대응SKU 실적으로 채우기]</p></div></div>
      <div className="step"><div className="no">3</div><div><h5>1안 발주량 정하기</h5><p>발주량을 입력하면 소진월 · 판정 · 금액이 바로 바뀜 · 판매 목표도 기존 비중대로 함께 변경</p></div></div>
      <div className="step"><div className="no">4</div><div><h5>월별 목표량 · 채널 다듬기</h5><p>달별 · 채널별 수량 수정 · 발주량은 그대로라 리오더 · 잔여가 어떻게 달라지는지 확인</p></div></div>
      <div className="step"><div className="no">5</div><div><h5>옵션 · 판매가 확인</h5><p>사이즈 비중 100% 확인 · 필요하면 [최종 수량 수정] · 판매가 탭에서 수익 확인</p></div></div>
      <div className="step"><div className="no">6</div><div><h5>필요하면 [2안 만들기]</h5><p>현재 값 복사로 시작 · 수량 · 판매가만 바꿔 1안 카드와 비교</p></div></div>
      <div className="step"><div className="no">7</div><div><h5>저장 → 전체 합계 → 발주 확정</h5><p>고른 안을 저장하고 [전체 합계] 보기에서 금액 확인 · 이상 없으면 PM이 SKU별 [발주 확정]</p></div></div>
    </div>
  </div>

  <div className="card" id="sim">
    <h4>🎮 직접 해보기 <span className="sample">예시</span> <span className="sub">연습용 · 운영 데이터에 저장 안 됨</span></h4>
    <ManualOrderSim />
    <p className="sub">* 연습용 가정 · 채널 3개 · 변동비율 25% 고정 · 마케팅 수량 없음 · 할인가 10원 올림 · 실제 화면보다 단순화</p>
  </div>

  <div className="card">
    <h4>🔗 어디를 고치면 뭐가 바뀌나</h4>
    <div className="tw"><table style={{ minWidth: '640px' }}><thead><tr><th>고치는 곳</th><th>발주량</th><th>판매 목표</th><th>이렇게 쓰세요</th></tr></thead><tbody>
      <tr><td className="k">안 카드 발주량</td><td><span className="chip c-blue">바뀜</span></td><td><span className="chip c-blue">같은 비율로 바뀜</span></td><td className="e">기존 월 · 채널 비중 유지 · 확정 채널 · 비운영 채널 제외 · 판매 목표가 비었으면 발주량만</td></tr>
      <tr><td className="k">월별 목표량</td><td><span className="chip">그대로</span></td><td><span className="chip c-blue">바뀜</span></td><td className="e">리오더 시점 · 수량 · 잔여량 확인 · 그 달 채널 구성비대로 나눔</td></tr>
      <tr><td className="k">채널별 목표량</td><td><span className="chip">그대로</span></td><td><span className="chip c-blue">바뀜</span></td><td className="e">월별 목표량에 바로 반영</td></tr>
      <tr><td className="k">옵션 최종 수량</td><td><span className="chip c-blue">합계로 바뀜</span></td><td><span className="chip c-blue">같은 비율로 바뀜</span></td><td className="e">옵션 합계 = 발주량 · 수기 수정 칩 표시 · [비율대로 되돌리기]로 비중 계산값으로 복귀</td></tr>
      <tr><td className="k">컬러 수량</td><td><span className="chip c-blue">합계로 바뀜</span></td><td><span className="chip c-blue">같은 비율로 바뀜</span></td><td className="e">컬러 합계 = 발주량 · 옵션 수기값은 해제됨</td></tr>
      <tr><td className="k">사이즈 비중</td><td><span className="chip">그대로</span></td><td><span className="chip">그대로</span></td><td className="e">옵션별 배분만 바뀜 · 옵션 수기값은 해제됨 · 합계가 100%가 아니면 “100% 미달!” 또는 “100% 초과!”</td></tr>
      <tr><td className="k">판매가</td><td><span className="chip">그대로</span></td><td><span className="chip">그대로</span></td><td className="e">순매출 · 공헌이익만 바뀜 · 월별로 다른 가격은 채널별 목표량 펼침에서</td></tr>
      <tr><td className="k">대응SKU</td><td><span className="chip">그대로</span></td><td><span className="chip">그대로</span></td><td className="e">“대응SKU 변경됨 · 월 계획 유지” 표시 · 새 기준을 쓰려면 [대응SKU 실적으로 채우기]</td></tr>
    </tbody></table></div>
  </div>

  <div className="card">
    <h4>🔎 대응SKU <span className="sub">[변경]을 누르면 수정</span></h4>
    <ul><li><b>여러 개 선택 가능</b> — 태블로 SKU 검색 · 출고량 합산해서 기준으로 사용</li>
      <li><b>비교 기간</b> — 동기간 ↔ 직전 12개월 · 동기간은 SKU별 기준연도 선택 가능</li>
      <li><b>8개월 실적 · 목표 대비</b> — 대응SKU 실적 대비 우리 판매 목표 증감</li>
      <li><b>채널 비중</b> — 비운영 채널 제외 · 채널별 목표량 첫 배분에 사용</li></ul>
    {period}
    <p className="sub">* 변동비는 카테고리 × 채널 팀카테 기준 · 대응SKU는 기간만 결정</p>
  </div>
  <div className="rv-pair">
  <div className="card">
    <h4>⚖️ 1안 · 2안 규칙</h4>
    <div className="grid2">
      <div className="mini"><b>안마다 따로</b><div className="mini-body"><span>발주량 · 채널 × 월 수량 · 판매가 · 옵션 수기 수량</span></div></div>
      <div className="mini"><b>안과 무관하게 같음</b><div className="mini-body"><span>컬러 · 사이즈 비율 · 대응SKU · 확정 채널 수량</span></div></div>
      <div className="mini"><b>안 전환 · 저장</b><div className="mini-body"><span>MASTER · PM만 · 전체 숫자가 고른 안으로 함께 바뀜 · 카드 · 채널별 요약도 같은 안 기준</span></div></div>
      <div className="mini"><b>저장 ≠ 확정</b><div className="mini-body"><span>[N안으로 저장]은 언제든 수정 가능 · 최종 결정은 [발주 확정] · 확정하면 입력 잠김</span></div></div>
    </div>
  </div>

  <div className="card">
    <h4>💵 금액 기준 두 가지</h4>
    <div className="grid2">
      <div className="mini"><b>초도 발주량만 (기본)</b><div className="mini-body"><span>이번 발주분까지만 팔린다고 보고 계산 · 이번 발주 결정용</span></div></div>
      <div className="mini"><b>시즌 목표 · 리오더 포함</b><div className="mini-body"><span>판매 목표 전체로 계산 · SKU 카드 · 채널별 요약과 같은 기준</span></div></div>
    </div>
    <p className="sub">* 잔여 재고는 공헌이익에 넣지 않고 “시즌 후 잔여”로 따로 표시</p>
  </div>

  </div>
  <div className="rv-pair">
  <div className="card">
    <h4>🧱 표 하나, 손잡이 둘 <span className="sample">예시</span></h4>
    <p>수량의 원본은 <b>채널 × 월 표 하나</b> · PM은 <b>세로 합계(월)</b>, MD는 <b>가로 합계(채널)</b>를 만지는 손잡이 · 어디를 고쳐도 같은 표라 숫자가 안 어긋남.</p>
    <div className="viz" style={{ overflowX: 'auto' }}><table className="matrix"><thead><tr><th></th><th>10월</th><th>11월</th><th>12월</th><th>…</th><th className="sum">채널 합계 → MD</th></tr></thead><tbody>
      <tr><td className="rh">자사몰</td><td>60</td><td>40</td><td>30</td><td>…</td><td className="sum">200</td></tr>
      <tr><td className="rh">스스</td><td>90</td><td>60</td><td>45</td><td>…</td><td className="sum">300</td></tr>
      <tr><td className="rh">B2B</td><td className="cf">45 🔒</td><td className="cf">30 🔒</td><td className="cf">22 🔒</td><td>…</td><td className="sum">150</td></tr>
      <tr><td className="rh" style={{ color: 'var(--accent)' }}>월 합계 → PM</td><td className="sum">300</td><td className="sum">200</td><td className="sum">150</td><td className="sum">…</td><td className="sum">1,000</td></tr>
    </tbody></table><p className="viz-cap">초록 🔒 = 확정된 채널 · 월 · 채널 수량을 바꿔도 그대로 · 나머지 채널만 움직임</p></div>
  </div>

  <div className="card">
    <h4>🌱 판매 목표를 처음 채우는 법 <span className="sub">자동으로 채워지지 않음 · 버튼을 눌러야 저장</span></h4>
    <div className="steps">
      <div className="step"><div className="no">1</div><div><h5>채널별 목표량 탭 [대응SKU 기준 채우기]</h5><p>총 발주량을 8개월 균등 → 대응SKU 채널 비중대로 나눔</p></div></div>
      <div className="step"><div className="no">2</div><div><h5>또는 월별 목표량 [대응SKU 실적으로 채우기]</h5><p>대응SKU 월별 실적을 그대로 판매 목표로</p></div></div>
    </div>
    <ul><li>대응SKU 채널 비중이 없으면 기본 채널비중 사용</li><li>쿠팡 비활성 SKU · 글로벌/일본 OFF SKU → 배분에서 빠지고 그 비중은 나머지 채널로</li><li>대응SKU 비중 · 증감도 같은 기준 — 비운영 채널 제외 · 글로벌/일본 한쪽만 OFF면 해외 실적 전부 남은 쪽으로</li></ul>
    {mix}
  </div>

  </div>
  <div className="card">
    <h4>🏷️ 판정 읽는 법</h4>
    <div className="tw"><table style={{ minWidth: '600px' }}><thead><tr><th>판매 목표 vs 발주량</th><th>리오더 가능 (기본)</th><th>시즌 한정</th></tr></thead><tbody>
      <tr><td className="k">목표 &gt; 발주량</td><td><span className="chip c-blue">리오더 약 N</span></td><td><span className="chip c-red">품절 위험 N</span></td></tr>
      <tr><td className="k">목표 = 발주량</td><td><span className="chip c-green">판매 목표 = 발주량</span></td><td><span className="chip c-green">판매 목표 = 발주량</span></td></tr>
      <tr><td className="k">목표 &lt; 발주량</td><td><span className="chip c-amber">잔여 N</span></td><td><span className="chip c-red">과재고 위험 N</span></td></tr>
    </tbody></table></div>
    <div className="legend"><span><i style={{ background: '#d1fae5' }}></i>발주량으로 판매</span><span><i style={{ background: '#047857' }}></i>소진월</span><span><i style={{ background: '#ffedd5' }}></i>리오더 · 품절 구간</span></div>
    <ul><li><b>소진월</b> — 누적 판매 목표가 발주량에 닿는 달 · 안 닿으면 미소진</li><li><b>MOQ 미달</b> — 발주량이 MOQ보다 적을 때 안 카드에 표시</li><li>시즌 한정 SKU만 [판매 목표를 발주량에 맞추기] 표시 · 월 · 채널 모양 유지 · 크기만 맞춤 (확정 채널 제외)</li></ul>
    <div className="callout warn"><span className="ic">⚠️</span><div><b className="t">시즌 한정 ≠ SKU 구분 “시즈널”</b><ul><li>리오더 여부 = <b>관리 › SKU 관리 › 시즌 한정</b>에서 SKU별 지정</li><li>SKU 구분(시즈널 · 스테디 · 미해당)은 분류 표시용</li><li>시즌 한정 지정한 적 없는 SKU → <b>카테고리 의류</b> · SKU 구분 시즈널이면 시즌 한정으로 봄 (관리 탭에서 해제 가능)</li></ul></div></div>
  </div>

  <div className="card">
    <h4>🎛️ 채널별 목표량 조정 방법 <span className="sub">📦 채널별 목표량 탭</span></h4>
    <div className="tw"><table style={{ minWidth: '680px' }}><thead><tr><th>방법</th><th>하는 법</th><th>결과</th><th className="nw">권한</th></tr></thead><tbody>
      <tr><td className="k">칸 직접 수정</td><td>채널 펼침 → 월별 수량 입력</td><td className="e">그 칸만 · 월 · 채널 비중 자동 재계산</td><td className="e nw">담당 채널</td></tr>
      <tr><td className="k">채널 비중 수정</td><td>[채널 비중 수정] → 여러 채널 % 입력 → [저장]</td><td className="e">월 합계 유지 · 안 고친 채널이 남은 % 나눠 가짐 · 수정+확정 합계 100% 초과 시 저장 불가</td><td className="e nw">MASTER · PM</td></tr>
      <tr><td className="k">대응SKU 비중으로 다시 나누기</td><td>버튼 클릭</td><td className="e">월 합계 유지 · 대응SKU 비중으로 다시 · 손으로 고친 값도 재계산</td><td className="e nw">MASTER · PM</td></tr>
      <tr><td className="k">되돌리기</td><td>조정 직후 버튼</td><td className="e">직전 상태로</td><td className="e nw">—</td></tr>
    </tbody></table></div>
    <div className="grid2">
      <div className="mini"><b>접힌 상태 (채널 요약)</b><div className="mini-body"><ul><li>비중 · 총수량 · 실매출단가</li><li>순매출 · 공헌이익 · 변동비율(~ = 근사값)</li><li>CM% — <span className="cr-g">≥40%</span> · <span className="cr-y">≥30%</span> · <span className="cr-r">&lt;30%</span></li></ul></div></div>
      <div className="mini"><b>펼친 상태 (채널 상세)</b><div className="mini-body"><ul><li>대응SKU 비교(회색) · 목표 수량 · 증감율</li><li>월별 판매가 시나리오 · [일괄반영]</li><li>실 판매가 · 글로벌 · 일본은 외화 함께</li><li>예상 순매출 · 공헌이익 · 연도별 합계</li></ul></div></div>
    </div>
    <p className="sub">* 변동비율 데이터 없으면 25% · 채널 수수료율 입력값은 참고용(계산 미반영)</p>
  </div>

  <div className="rv-pair">
  <div className="card">
    <h4>🧩 옵션별 검토 <span className="sub">🧩 옵션별 검토 탭 · 예전 STEP 2 역할</span></h4>
    <ul><li><b>컬러 수량 · 사이즈 비중</b> — 왼쪽에서 입력 · 막대로 비중 확인 · 컬러 수량 합계가 새 발주량 · 고치면 수기값 해제</li>
      <li><b>옵션별 최종 발주량</b> — 총 발주량 × 컬러 비중 × 사이즈 비중 · [복사]로 표 복사</li>
      <li><b>[최종 수량 수정]</b> — 칸을 직접 입력 · 합계가 새 발주량이 됨 · 수기값은 안마다 따로 보관</li>
      <li><b>채널별 옵션 수량</b> — 채널 표를 펼치면 채널 월 수량 × 컬러 비중 × 사이즈 비중으로 보임 <span className="sub">예: 100개 × 블랙 60% × M 50% = 30개</span></li></ul>
    <p className="sub">* 옵션 구성(사이즈 개수 · 컬러명 · MOQ)은 SKU 카드에서 · CPO 연동 SKU의 사이즈 · 컬러는 CPO에서</p>
  </div>

  <div className="card">
    <h4>🔐 채널 확정 — 그룹 3개</h4>
    <div className="tw"><table style={{ minWidth: '520px' }}><thead><tr><th>확정 그룹</th><th>대상 채널</th><th>누가</th></tr></thead><tbody>
      <tr><td><span className="rb pmd">플랫폼 확정</span></td><td>자사몰 · 마케팅</td><td className="e">플랫폼MD · MASTER · PM</td></tr>
      <tr><td><span className="rb bmd">브랜드 확정</span></td><td>스스 · 위탁 · 팝업/페어 · B2B · 쿠팡 · 사입</td><td className="e">브랜드MD · MASTER · PM</td></tr>
      <tr><td><span className="rb gl">글로벌 확정</span></td><td>글로벌 · 일본</td><td className="e">글로벌 · MASTER · PM</td></tr>
    </tbody></table></div>
    <p className="sub">* 확정 = 그 그룹 수량 잠금 · 발주량 · 월 · 채널 비중 변경에서 빠지고 나머지만 조정 · 안을 바꿔도 지금 값 유지 · 전부 확정되면 월별 목표량 입력 잠김</p>
  </div>

  </div>
  <div className="rv-pair">
  <div className="card">
    <h4>🎁 마케팅 채널 <span className="sub">B2C 아래 별도 · 협찬 · 샘플용</span></h4>
    <ul><li>판매 아님 → 매출 0 · <b>원가 × 수량만큼 비용</b></li><li>합계 공헌이익 = B2C+B2B 공헌이익 − 원가 × 마케팅 수량</li><li>합계 CM% = 위 공헌이익 ÷ B2C+B2B 순매출</li></ul>
  </div>

  <div className="card">
    <h4>⚡ 여러 SKU 한꺼번에 <span className="sub">채널별 설정 · 월별 비중설정</span></h4>
    <div className="grid2">
      <div className="mini"><b>일괄 작업</b><div className="mini-body"><span>SKU 체크 → 대응SKU 대비 % · 다른 SKU 월별 수량 복사 · 일괄 증감 % · 판매가 시나리오 일괄반영 · 대응SKU 기준 채우기 · 월 비중 복사 · 그룹 확정</span><span>미리보기 → 적용 → 되돌리기 · 확정 · 비운영 · 권한 없는 채널 자동 제외</span></div></div>
      <div className="mini"><b>👥 동시 수정</b><div className="mini-body"><span>채널 칸 — 내가 바꾼 칸만 저장 · 같은 칸은 나중 저장 우선</span><span>발주량 · 옵션 · 안 저장 — 다른 사람이 먼저 고쳤으면 내 변경 취소 → 최신값 확인 후 다시 입력</span></div></div>
    </div>
  </div>

  </div>
  <div className="card">
    <h4>🔑 누가 무엇을 <span className="sub">전 역할 표시 · 수정은 권한대로</span></h4>
    <div className="tw"><table style={{ minWidth: '520px' }}><thead><tr><th>할 일</th><th>필요한 권한</th><th>기본값</th></tr></thead><tbody>
      <tr><td className="k">안 전환 · 저장</td><td>역할 고정</td><td className="e">MASTER · PM</td></tr>
      <tr><td className="k">발주량 · 대응SKU · 옵션별 검토</td><td>SKU 기본정보</td><td className="e">MASTER · PM</td></tr>
      <tr><td className="k">월별 목표량</td><td>월 계획</td><td className="e">MASTER · PM</td></tr>
      <tr><td className="k">채널별 목표량 · 판매가</td><td>채널별 목표량 + 담당 채널</td><td className="e">담당 채널 MD · 글로벌 · MASTER · PM</td></tr>
      <tr><td className="k">발주 확정 · 해제</td><td>발주 확정</td><td className="e">MASTER · PM</td></tr>
    </tbody></table></div>
    <p className="sub">* 잠기는 경우: 발주 확정된 SKU 전체 · 가격 확정 SKU의 판매가 · 운영 채널 전부 확정된 SKU의 월별 목표량</p>
  </div>
</section>
  );
}
