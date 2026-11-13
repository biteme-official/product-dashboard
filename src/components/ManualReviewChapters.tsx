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
  <p className="sec-lede">SKU별 발주량을 정하는 화면 · 결정 패널에서 발주량 → 표 하나에서 ① 대응SKU 실적 → ② 월 계획 → ③ 채널 · 판매가 · 수익 → 옵션 확인 → 저장 → 발주 확정 · 필요하면 채널 담당에게 검토 요청.</p>
  <div className="easy"><span className="tag">쉽게</span><span>예전 채널 목표량과 STEP 2가 여기로 합쳐짐 · 어느 칸을 고치든 <b>같은 표</b>를 고치는 거라 카드 · 채널별 요약 숫자가 함께 바뀜.</span></div>
  <div className="callout note"><span className="ic">📍</span><div><b className="t">어디에 있나</b>프로젝션 › <b>발주량 검토</b> (예전 채널 목표량 자리) · 전 역할이 볼 수 있고 수정은 권한대로</div></div>

  <div className="card">
    <h4>🪟 보기 3개</h4>
    <div className="tw"><table style={{ minWidth: '600px' }}><thead><tr><th>보기</th><th>이럴 때</th><th>내용</th></tr></thead><tbody>
      <tr><td className="k">SKU별 결정</td><td className="e">한 SKU씩 정할 때</td><td>왼쪽 목록(오픈일로 묶음 · 상태 필터 · ↑↓ 이동) + 결정 패널(결정 · 결과 · 수익) · 통합 표(① 기준 → ② 월 계획 → ③ 채널 배분 · 그룹 띠마다 확정) · 아래 접는 구역(근거 · 옵션) · 채널 이름 ▸ 펼치면 대응SKU · 증감 · 실 판매가</td></tr>
      <tr><td className="k">월 계획 일괄</td><td className="e">월 계획을 SKU마다</td><td>SKU별 결정 표의 ② 월 계획을 SKU마다 쌓아 보기 · 대응SKU 실적 · 판매 목표 · 비중(입력) · 누적 vs 발주 · 증감률 · <b>MASTER · PM에게만 보임</b></td></tr>
      <tr><td className="k">전체 합계</td><td className="e">결정 후 전체 확인</td><td>오픈월 × 카테고리 표 · 판매월별 순매출 · 공헌이익 차트 · 월 목표 비교 (관리 › SKU 관리 › 월 목표)</td></tr>
    </tbody></table></div>
    <p className="sub">* SKU별 결정 · 월 계획 일괄 표는 같은 모양 — 첫 열 고정 · 월별 수량(개) | 판매가 · 수익(원) · ▼ 소진월 · 그 뒤 엷은 주황 빗금 = 리오더(시즌 한정은 품절) 구간 · 청록 줄 = 내 담당 채널 · 채널 일괄 보기는 없어짐(2026-11-13) — 채널은 SKU별 결정 표 ③에서</p>
    <p className="sub">* 공통 필터는 서브탭 줄 오른쪽: 카테고리 ▾ · 브랜드 ▾ · 오픈/완료 제외 · 오픈월 ▾ · 검색 · 검토 요청을 열면 요청 SKU 안에서만 적용</p>
  </div>

  <div className="card">
    <h4>👀 SKU별 결정 한눈에 <span className="sample">예시</span></h4>
    <div className="rv-split"><div className="viz rv-shot-wrap"><div className="rv-shot">
      <div className="rv-bar"><span className="chip">LIST VIEW</span><span className="chip">채널별 오픈일정</span><span className="chip on">발주량 검토</span><span className="chip">프라이싱</span><span className="rv-div"></span><span className="rv-pin">1</span><span className="rq-dd">카테고리 ▾</span><span className="rq-dd">브랜드 ▾</span><span className="chip">오픈/완료 제외</span><span className="rv-grow"></span><span className="rq-dd">오픈월 ▾</span></div>
      <div className="rv-bar"><span className="chip on">SKU별 결정</span><span className="chip">월 계획 일괄</span><span className="chip">전체 합계</span><span className="rv-pin">2</span><span className="rq-dd teal">검토 요청 · 진행 1 ▾</span></div>
      <div className="rs-sum"><span className="rv-pin">3</span><div><small>결정 · 확정</small><b>12 · 3 / 26</b></div><div><small>발주금액</small><b>4.2억</b></div><div><small>순매출 · 공헌이익</small><b>12억 · 4.1억</b></div><div><small>위험 SKU</small><b>2</b></div><span className="rv-grow"></span><span className="chip on">초도 발주량만</span><span className="chip">시즌 목표 · 리오더 포함</span><span className="chip c-amber">오류 0 · 경고 2 ▾</span></div>
      <div className="rs-main rq-main">
        <div className="rs-list"><span className="rv-pin">4</span><small>전체 · 검토 전 · 저장 · 확정</small><div className="rs-it on rq-ck"><i>☑</i><span>예시 메쉬백<small>1안 저장</small></span></div><div className="rs-it rq-ck"><i>☑</i><span>예시 니트 토이<small>검토 전</small></span></div><div className="rs-it rq-ck"><i>☐</i><span>예시 간식<small>발주 확정</small></span></div><div className="rq-pick">2개 선택 · 검토 요청 만들기</div></div>
        <div className="rs-right">
          <div className="rv-bar"><b>예시 메쉬백</b><span className="rv-pin">5</span><span className="chip on">1안 · 지금</span><span className="chip">2안</span><span className="rv-grow"></span><span className="rc-go light">SKU카드 →</span></div>
          <div className="rs-plans" style={{ gridTemplateColumns: '1.2fr 1fr 1.2fr' }}><span className="rv-pin abs">6</span>
            <div className="rs-plan on"><b>결정 · 1안</b><div>발주량 <b>1,000</b> · MOQ 800</div><span className="chip c-green">MOQ 충족</span></div>
            <div className="rs-plan"><b>결과 <span className="chip c-blue">리오더 약 120</span></b><div>소진 <b>27.3월</b> · 판매 목표 1,120</div><small>리오더 · 시즌 후 잔여</small></div>
            <div className="rs-plan"><b>수익 · 1안 전체</b><div>순매출 · 공헌이익 · CM%</div><small>발주금액</small></div>
          </div>
          <div className="rs-box"><span className="rv-pin abs">7</span><b>1안 월 계획 · 채널 배분 (표 하나)</b><small>① 기준 대응SKU 실적 [변경 · 근거] → ② 월 계획 판매 목표 · 누적 vs 발주 → ③ 채널 배분 플랫폼 · 브랜드 · 글로벌 띠(합계 · 비중 · [확정]) · 채널 줄(월 수량 · 비중 ▲▼p · 판매가 · 순매출 · 공헌이익 · CM%) → 합계</small><div className="rs-strip"><i className="g"></i><i className="g"></i><i className="g"></i><i className="g"></i><i className="d"></i><i className="o"></i><i className="o"></i><i className="o"></i></div></div>
          <div className="rs-mid" style={{ gridTemplateColumns: '1fr 1fr' }}><div className="rs-box"><span className="rv-pin abs">8</span><b>▾ 근거 · 대응SKU</b><small>기간 · 8개월 실적 · 채널 비중(실적 ↔ 판매 목표)</small></div><div className="rs-box"><b>▾ 옵션 · 컬러 × 사이즈</b><small>컬러 수량 · 사이즈 비중 · 옵션별 최종 발주량</small></div></div>
          <div className="rs-foot"><span className="rv-pin">9</span><span className="chip c-green">1안 저장</span><small>저장해도 수정 가능 · 최종은 발주 확정</small><span className="rv-grow"></span><span className="rc-go light">1안으로 저장</span><span className="rc-go">발주 확정</span></div>
        </div>
      </div>
    </div></div><div className="rv-lg"><div className="rv-li"><span className="rv-pin">1</span><div><b>필터</b><span>서브탭 줄 오른쪽 · 카테고리 · 브랜드는 드롭다운</span></div></div><div className="rv-li"><span className="rv-pin">2</span><div><b>검토 요청 고르기</b><span>진행 중 · 닫힘 요청 · 고르면 그 SKU만 보임</span></div></div><div className="rv-li"><span className="rv-pin">3</span><div><b>요약 · 금액 기준</b><span>전체 합계 · 초도 ↔ 리오더 포함 · 오류 · 경고 칩</span></div></div><div className="rv-li"><span className="rv-pin">4</span><div><b>왼쪽 목록</b><span>SKU 고르기 · 상태 필터 · ↑↓ 이동 · 체크박스(MASTER · PM)로 검토 요청</span></div></div><div className="rv-li"><span className="rv-pin">5</span><div><b>[1안 | 2안] 전환</b><span>SKU명 옆 · 없는 안은 [+ 2안 만들기](현재 값 복사) · MASTER · PM</span></div></div><div className="rv-li"><span className="rv-pin">6</span><div><b>결정 패널</b><span>결정(발주량 · MOQ) → 결과(소진 · 판정 · 리오더) → 수익 · 2안이 있으면 아래 보관안 한 줄 + 차이</span></div></div><div className="rv-li"><span className="rv-pin">7</span><div><b>통합 표</b><span>월 열 위아래 맞춤 · ▼ 소진 · 빗금 = 리오더 구간 · 그룹 띠 [확정] · MD는 내 그룹만 펼침 · 내 채널 청록</span></div></div><div className="rv-li"><span className="rv-pin">8</span><div><b>접는 구역</b><span>근거 · 옵션 좌우 2분할 · 표 ① [변경 · 근거]로 근거 열기 · 채널 도구는 표 ③ 띠로 합침</span></div></div><div className="rv-li"><span className="rv-pin">9</span><div><b>아래 고정 줄</b><span>저장 · 발주 확정 · 안 되는 이유 표시</span></div></div></div></div>
  </div>

  <div className="card" id="review-request">
    <h4>📨 검토 요청 <span className="sub">SKU를 골라 채널 담당에게 “여기서부터 여기까지” 검토 맡기기</span></h4>
    <div className="easy"><span className="tag">쉽게</span><span>MASTER · PM이 SKU를 골라 <b>요청 묶음</b>을 만들고 <b>링크</b>를 보냄 → 받은 사람은 링크를 열면 그 SKU만 순서대로 보임 → 각자 <b>그룹 확정</b>을 누르면 그게 곧 검토 완료.</span></div>
    <div className="steps flow">
      <div className="step"><div className="no">1</div><div><span className="rq-who">MASTER · PM</span><h5>SKU 고르기</h5><p>SKU별 결정 왼쪽 목록 체크박스 → 아래 [검토 요청 만들기]</p></div></div>
      <div className="step"><div className="no">2</div><div><span className="rq-who">MASTER · PM</span><h5>요청 만들기 · 링크 보내기</h5><p>이름 · 대상 그룹 · 기한 · 메모 → [만들고 링크 복사] → 슬랙 등에 직접 붙여넣기 · 자동 알림 없음</p></div></div>
      <div className="step"><div className="no">3</div><div><span className="rq-who">채널 담당 MD</span><h5>링크 열고 검토</h5><p>요청 SKU만 01부터 순서대로 · 요약 줄에 내 그룹 소계 · 채널별은 [채널별 ▾] · 끝나면 표의 내 그룹 띠 [○○ 확정]</p></div></div>
      <div className="step"><div className="no">4</div><div><span className="rq-who">MASTER</span><h5>닫기 · 삭제</h5><p>기한 지남 또는 전부 확정이면 [요청 닫기] · 잘못 만든 요청은 [삭제]</p></div></div>
    </div>
    <div className="rv-split"><div className="viz rv-shot-wrap"><div className="rv-shot">
      <div className="rq-banner">
        <div className="rv-bar"><span className="rv-pin">1</span><span className="rq-badge">검토 요청 D-3</span><b>여름 신상 1차</b><small>PM · 기한 11/14 · SKU 4개</small><span className="rv-grow"></span><span className="rc-go light">링크 복사</span><span className="rc-go light">요청 닫기</span><span className="rc-go light rq-del">삭제</span></div>
        <div className="rv-bar"><span className="rv-pin">2</span><small>플랫폼</small><span className="rq-bar"><i style={{ width: '25%' }} /></span><b>1/4</b><small>브랜드</small><span className="rq-bar"><i style={{ width: '50%' }} /></span><b>2/4</b><small>완료 SKU</small><b>1/4</b><span className="rv-grow"></span><span className="rc-go light">메모 · 쿠팡 비중 높은 2개 먼저…</span></div>
      </div>
      <div className="rs-box rq-sumtbl"><span className="rv-pin abs">3</span>
        <div className="rv-bar"><b>채널별 요약</b><small>요청 SKU 4개</small><span className="rv-grow"></span><span className="chip on">전체</span><span className="chip">플랫폼</span><span className="chip">브랜드</span><span className="chip">글로벌</span></div>
        <table className="rc-t"><thead><tr><th></th><th>자사몰</th><th>스스</th><th>위탁</th><th>B2B</th><th>글로벌</th><th>합계</th></tr></thead><tbody>
          <tr><td>판매 수량</td><td>2,718</td><td>3,365</td><td>611</td><td>2,015</td><td>2,041</td><td><b>15,000</b></td></tr>
          <tr><td>순매출</td><td>3,434만</td><td>3,573만</td><td>713만</td><td>1,429만</td><td>2,023만</td><td><b>1.46억</b></td></tr>
          <tr><td>공헌이익 · CM%</td><td>1,355만 · 39%</td><td>1,017만 · 28%</td><td>372만 · 52%</td><td>648만 · 45%</td><td>1,157만 · 57%</td><td><b>6,262만 · 43%</b></td></tr>
        </tbody></table>
      </div>
      <div className="rs-main rq-main">
        <div className="rs-list"><span className="rv-pin">4</span><small>요청 순서 · 01부터 04까지</small>
          <div className="rs-it on rq-ord"><span><i>01</i>예시 메쉬백</span><span className="rq-gc"><em className="ok">플✓</em><em>브</em></span></div>
          <div className="rs-it rq-ord"><span><i>02</i>예시 니트 토이</span><span className="rq-gc"><em>플</em><em className="ok">브✓</em></span></div>
          <div className="rs-it rq-ord"><span><i>03</i>예시 간식</span><span className="rq-gc"><em>플</em><em>브</em></span></div>
        </div>
        <div className="rs-right"><div className="rv-bar"><b>예시 메쉬백</b><span className="rv-grow"></span><span className="rv-pin">5</span><span className="rq-btn pl on">플랫폼 확정 ✓</span><span className="rq-btn br">브랜드 확정</span></div><div className="rs-box"><small>아래는 평소 SKU별 결정 화면 그대로 · 결정 패널 · 통합 표(내 그룹 띠 펼침 · 내 채널 청록) · 근거 · 옵션 접는 구역</small></div></div>
      </div>
    </div></div><div className="rv-lg"><div className="rv-li"><span className="rv-pin">1</span><div><b>요청 바 (한 줄)</b><span>기한(D-n) · 이름(요청자 · 대상 그룹은 마우스 올리면) · [메모] 첫 줄 · [링크 복사] · [⋯] 닫기 · 삭제(MASTER)</span></div></div><div className="rv-li"><span className="rv-pin">2</span><div><b>그룹별 진행률</b><span>확정 SKU / 대상 SKU · 완료 = 대상 그룹 전부 확정</span></div></div><div className="rv-li"><span className="rv-pin">3</span><div><b>채널별 요약</b><span>처음엔 접힘 · 요약 줄 [채널별 ▾]로 펼침 · 그룹 칩으로 소계 · MD는 요약 줄에 내 그룹 소계가 먼저</span></div></div><div className="rv-li"><span className="rv-pin">4</span><div><b>요청 순서 목록</b><span>고른 순서 01~n · 플 · 브 · 글 칩 = 확정 여부</span></div></div><div className="rv-li"><span className="rv-pin">5</span><div><b>그룹 확정 = 검토 완료</b><span>따로 완료 버튼 없음 · 누르면 진행률 바로 반영</span></div></div></div></div>
    <p className="sub">* 채널별 요약에 발주금액은 없음 · 상단 요약의 발주금액(총 발주량 기준)만 · 칩에 취소선 = 그 채널 운영 안 함</p>
    <div className="tw"><table style={{ minWidth: '520px' }}><thead><tr><th>할 일</th><th>누가</th><th>언제</th></tr></thead><tbody>
      <tr><td className="k">요청 만들기</td><td className="e">MASTER · PM</td><td>SKU별 결정 · 요청을 열지 않은 상태</td></tr>
      <tr><td className="k">링크로 보기 · 그룹 확정</td><td className="e">보기는 전 역할 · 확정은 담당 그룹</td><td>언제든</td></tr>
      <tr><td className="k">요청 닫기</td><td className="e">MASTER</td><td>기한 지남 또는 전부 확정 · 닫아도 링크는 열림 · 드롭다운 ‘닫힘’으로</td></tr>
      <tr><td className="k">요청 삭제</td><td className="e">MASTER</td><td>언제든 · 되돌릴 수 없음 · 요청 묶음만 지움(SKU · 그룹 확정값은 그대로)</td></tr>
    </tbody></table></div>
    <div className="callout warn"><span className="ic">⚠️</span><div><b className="t">링크를 열면 필터가 풀림</b>월 · 브랜드 · 검색 · 오픈/완료 제외가 풀린 채로 열림 · 다시 걸면 요청 SKU 안에서만 적용 · 숨은 SKU 수는 배너에 표시</div></div>
  </div>

  <div className="card">
    <h4>🪜 처음이라면 이 순서로</h4>
    <div className="steps flow">
      <div className="step"><div className="no">1</div><div><h5>범위 좁히고 상태 칩 확인</h5><p>필터로 SKU를 추리고 요약의 오류 · 경고 칩 확인 · 오류 SKU는 공헌이익 합계에서 빠지고 확정도 막힘</p></div></div>
      <div className="step"><div className="no">2</div><div><h5>대응SKU 확인</h5><p>표 ① 기준 [변경 · 근거]로 대응SKU · 기간 확인 · 판매 목표가 비었으면 표 아래 [대응SKU 동일수량 반영]</p></div></div>
      <div className="step"><div className="no">3</div><div><h5>1안 발주량 정하기</h5><p>결정 패널에 발주량 입력 → 결과 · 수익 · 표의 ▼ 소진월이 바로 바뀜 · 판매 목표도 기존 비중대로 함께 변경</p></div></div>
      <div className="step"><div className="no">4</div><div><h5>월 계획 · 채널 다듬기</h5><p>표 ② 판매 목표 · ③ 채널 칸 수정 · 발주량은 그대로라 리오더 · 잔여가 어떻게 달라지는지 확인</p></div></div>
      <div className="step"><div className="no">5</div><div><h5>옵션 · 판매가 확인</h5><p>옵션 구역에서 사이즈 비중 100% 확인 · 필요하면 [최종 수량 수정] · 판매가는 표 ③ 판매가 열 · 수익은 같은 줄 오른쪽</p></div></div>
      <div className="step"><div className="no">6</div><div><h5>필요하면 [2안 만들기]</h5><p>[1안 | 2안]에서 만들기 · 현재 값 복사로 시작 · 수량 · 판매가만 바꿔 보관안 줄의 차이로 비교</p></div></div>
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
      <tr><td className="k">결정 패널 발주량</td><td><span className="chip c-blue">바뀜</span></td><td><span className="chip c-blue">같은 비율로 바뀜</span></td><td className="e">기존 월 · 채널 비중 유지 · 확정 채널 · 비운영 채널 제외 · 판매 목표가 비었으면 발주량만</td></tr>
      <tr><td className="k">표 ② 판매 목표</td><td><span className="chip">그대로</span></td><td><span className="chip c-blue">바뀜</span></td><td className="e">리오더 시점 · 수량 · 잔여량 확인 · 그 달 채널 구성비대로 나눔</td></tr>
      <tr><td className="k">표 ③ 채널 칸</td><td><span className="chip">그대로</span></td><td><span className="chip c-blue">바뀜</span></td><td className="e">② 판매 목표 · 합계 줄에 바로 반영</td></tr>
      <tr><td className="k">옵션 최종 수량</td><td><span className="chip c-blue">합계로 바뀜</span></td><td><span className="chip c-blue">같은 비율로 바뀜</span></td><td className="e">옵션 합계 = 발주량 · 수기 수정 칩 표시 · [비율대로 되돌리기]로 비중 계산값으로 복귀</td></tr>
      <tr><td className="k">컬러 수량</td><td><span className="chip c-blue">합계로 바뀜</span></td><td><span className="chip c-blue">같은 비율로 바뀜</span></td><td className="e">컬러 합계 = 발주량 · 옵션 수기값은 해제됨</td></tr>
      <tr><td className="k">사이즈 비중</td><td><span className="chip">그대로</span></td><td><span className="chip">그대로</span></td><td className="e">옵션별 배분만 바뀜 · 옵션 수기값은 해제됨 · 합계가 100%가 아니면 “100% 미달!” 또는 “100% 초과!”</td></tr>
      <tr><td className="k">판매가</td><td><span className="chip">그대로</span></td><td><span className="chip">그대로</span></td><td className="e">순매출 · 공헌이익만 바뀜 · 판매가는 채널별 하나(표 ③ 판매가 열 · 월별로 다르게 넣었던 채널은 “월별 다름”)</td></tr>
      <tr><td className="k">대응SKU</td><td><span className="chip">그대로</span></td><td><span className="chip">그대로</span></td><td className="e">“대응SKU 변경됨 · 월 계획 유지” 표시 · 새 기준을 쓰려면 [대응SKU 동일수량 반영]</td></tr>
    </tbody></table></div>
  </div>

  <div className="card">
    <h4>🔎 대응SKU <span className="sub">표 ① [변경 · 근거] → 근거 구역에서 수정</span></h4>
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
      <div className="step"><div className="no">1</div><div><h5>표 ③ 띠 [대응SKU 기준 채우기]</h5><p>총 발주량을 8개월 균등 → 대응SKU 채널 비중대로 나눔</p></div></div>
      <div className="step"><div className="no">2</div><div><h5>또는 표 아래 [대응SKU 동일수량 반영]</h5><p>대응SKU 월별 실적 수량을 그대로 판매 목표로</p></div></div>
      <div className="step"><div className="no">3</div><div><h5>또는 표 아래 [대응SKU 월별비중 반영]</h5><p>지금 고른 안의 발주량을 대응SKU 월별 실적 비중으로 나눔 · 판매 목표 합계 = 발주량 · 확정 채널 · 마케팅은 그대로</p></div></div>
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
    <div className="legend"><span><i style={{ background: '#d1fae5' }}></i>발주량으로 판매</span><span><i style={{ background: '#047857' }}></i>소진월</span><span><i style={{ backgroundImage: 'repeating-linear-gradient(135deg, rgba(234, 88, 12, 0.35) 0 1px, transparent 1px 5px)' }}></i>리오더 · 품절 구간 (엷은 빗금)</span></div>
    <ul><li><b>소진월</b> — 누적 판매 목표가 발주량에 닿는 달 · 안 닿으면 미소진</li><li><b>MOQ 미달</b> — 발주량이 MOQ보다 적을 때 결정 패널에 표시 · MOQ 0(미입력)이면 표시 안 함 · 위험 SKU에도 안 셈</li><li>시즌 한정 SKU만 [판매 목표를 발주량에 맞추기] 표시 · 월 · 채널 모양 유지 · 크기만 맞춤 (확정 채널 제외)</li></ul>
    <div className="callout warn"><span className="ic">⚠️</span><div><b className="t">시즌 한정 ≠ SKU 구분 “시즈널”</b><ul><li>리오더 여부 = <b>관리 › SKU 관리 › 시즌 한정</b>에서 SKU별 지정</li><li>SKU 구분(시즈널 · 스테디 · 미해당)은 분류 표시용</li><li>시즌 한정 지정한 적 없는 SKU → <b>카테고리 의류</b> · SKU 구분 시즈널이면 시즌 한정으로 봄 (관리 탭에서 해제 가능)</li></ul></div></div>
  </div>

  <div className="card">
    <h4>🎛️ 채널별 목표량 조정 방법 <span className="sub">표 ③ 채널 배분 띠 버튼 · 예전 채널 상세 구역은 표로 합침(2026-11-13)</span></h4>
    <div className="tw"><table style={{ minWidth: '680px' }}><thead><tr><th>방법</th><th>하는 법</th><th>결과</th><th className="nw">권한</th></tr></thead><tbody>
      <tr><td className="k">칸 직접 수정</td><td>표 ③ 채널 줄 월 칸 입력</td><td className="e">그 칸만 · 월 · 채널 비중 자동 재계산</td><td className="e nw">담당 채널</td></tr>
      <tr><td className="k">채널 비중 수정</td><td>③ 띠 [채널 비중 수정] → 비중 열이 입력칸 · 여러 채널 % 입력 → [저장]</td><td className="e">월 합계 유지 · 안 고친 채널이 남은 % 나눠 가짐 · 수정+확정 합계 100% 초과 시 저장 불가</td><td className="e nw">MASTER · PM</td></tr>
      <tr><td className="k">대응SKU 채널비중 반영</td><td>③ 띠 버튼 · 대응SKU가 바뀌면 주황</td><td className="e">월 합계 유지 · 대응SKU 비중으로 다시 · 손으로 고친 값도 재계산</td><td className="e nw">MASTER · PM</td></tr>
      <tr><td className="k">되돌리기</td><td>③ 띠 [↩ 되돌리기 (n)] · 칸 수정 · 비중 수정 · 반영 후</td><td className="e">직전 상태로 · 이 SKU 화면에서만 기록</td><td className="e nw">—</td></tr>
    </tbody></table></div>
    <div className="grid2">
      <div className="mini"><b>채널 줄</b><div className="mini-body"><ul><li>월 수량 · 합계 · 비중(대응 대비 ▲▼p) · 판매가</li><li>순매출 · 공헌이익 · 25% 대체 · 기간 대체 칩</li><li>CM% — <span className="cr-g">≥40%</span> · <span className="cr-y">≥30%</span> · <span className="cr-r">&lt;30%</span></li></ul></div></div>
      <div className="mini"><b>채널 이름 ▸ 펼침</b><div className="mini-body"><ul><li>대응SKU(월별) · 증감 · 기존 세팅값 대비 · 변동비율</li><li>실 판매가(보기만) · 글로벌 · 일본은 외화 · 환율 함께</li><li>옵션별 채널 수량은 옵션 구역 [채널 ▾] · 시뮬레이션 엑셀은 표 제목 줄 오른쪽</li></ul></div></div>
    </div>
    <p className="sub">* 변동비율 데이터 없으면 25% · 채널 수수료율 입력값은 참고용(계산 미반영)</p>
  </div>

  <div className="rv-pair">
  <div className="card">
    <h4>🧩 옵션별 검토 <span className="sub">표 아래 옵션 · 컬러 × 사이즈 구역 · 예전 STEP 2 역할</span></h4>
    <ul><li><b>컬러 수량 · 사이즈 비중</b> — 왼쪽에서 입력 · 막대로 비중 확인 · 컬러 수량 합계가 새 발주량 · 고치면 수기값 해제</li>
      <li><b>옵션별 최종 발주량</b> — 총 발주량 × 컬러 비중 × 사이즈 비중 · [복사]로 표 복사</li>
      <li><b>[최종 수량 수정]</b> — 칸을 직접 입력 · 합계가 새 발주량이 됨 · 수기값은 안마다 따로 보관</li>
      <li><b>채널별 옵션 수량</b> — 채널 표를 펼치면 채널 월 수량 × 컬러 비중 × 사이즈 비중으로 보임 <span className="sub">예: 100개 × 블랙 60% × M 50% = 30개</span></li></ul>
    <p className="sub">* 옵션 구성(사이즈 개수 · 컬러명 · MOQ)은 SKU 카드에서 · CPO 연동 SKU의 사이즈 · 컬러는 CPO에서 · MOQ는 Product에서만 입력</p>
  </div>

  <div className="card">
    <h4>🔐 채널 확정 — 그룹 3개</h4>
    <div className="tw"><table style={{ minWidth: '520px' }}><thead><tr><th>확정 그룹</th><th>대상 채널</th><th>누가</th></tr></thead><tbody>
      <tr><td><span className="rb pmd">플랫폼 확정</span></td><td>자사몰 · 마케팅</td><td className="e">플랫폼MD · MASTER · PM</td></tr>
      <tr><td><span className="rb bmd">브랜드 확정</span></td><td>스스 · 위탁 · 팝업/페어 · B2B · 쿠팡 · 사입</td><td className="e">브랜드MD · MASTER · PM</td></tr>
      <tr><td><span className="rb gl">글로벌 확정</span></td><td>글로벌 · 일본</td><td className="e">글로벌 · MASTER · PM</td></tr>
    </tbody></table></div>
    <p className="sub">* 확정 = 그 그룹 수량 잠금 · 발주량 · 월 · 채널 비중 변경에서 빠지고 나머지만 조정 · 안을 바꿔도 지금 값 유지 · 전부 확정되면 월별 목표량 입력 잠김</p>
    <p className="sub">* 누르는 곳: SKU 카드 · SKU별 결정 표의 그룹 띠 · 검토 요청에서는 이 확정이 검토 완료 · 확정된 그룹은 “확정 ✓”, 다시 누르면 해제</p>
  </div>

  </div>
  <div className="rv-pair">
  <div className="card">
    <h4>🎁 마케팅 채널 <span className="sub">B2C 아래 별도 · 협찬 · 샘플용</span></h4>
    <ul><li>판매 아님 → 매출 0 · <b>원가 × 수량만큼 비용</b></li><li>합계 공헌이익 = B2C+B2B 공헌이익 − 원가 × 마케팅 수량</li><li>합계 CM% = 위 공헌이익 ÷ B2C+B2B 순매출</li></ul>
  </div>

  <div className="card">
    <h4>⚡ 여러 SKU 한꺼번에 <span className="sub">월 계획 일괄 · MASTER · PM</span></h4>
    <div className="grid2">
      <div className="mini"><b>일괄 작업</b><div className="mini-body"><span>SKU 체크 → 대응SKU 실적 대비 %로 월 계획 · 판매 목표 일괄 ±% · 다른 SKU 월 비중 복사 · 판매가 일괄(채널 하나 · 전 월 같은 값) · 대응SKU 기준 채우기(빈 SKU)</span><span>그룹 확정은 SKU마다 표를 보고 누름 (일괄 확정 없음)</span><span>미리보기 → 적용 → 되돌리기 · 확정 · 비운영 · 권한 없는 채널 자동 제외</span></div></div>
      <div className="mini"><b>👥 동시 수정</b><div className="mini-body"><span>채널 칸 — 내가 바꾼 칸만 저장 · 같은 칸은 나중 저장 우선</span><span>발주량 · 옵션 · 안 저장 — 다른 사람이 먼저 고쳤으면 내 변경 취소 → 최신값 확인 후 다시 입력</span></div></div>
    </div>
  </div>

  </div>
  <div className="card">
    <h4>🔑 누가 무엇을 <span className="sub">전 역할 표시 · 수정은 권한대로</span></h4>
    <div className="tw"><table style={{ minWidth: '520px' }}><thead><tr><th>할 일</th><th>필요한 권한</th><th>기본값</th></tr></thead><tbody>
      <tr><td className="k">안 전환 · 저장</td><td>역할 고정</td><td className="e">MASTER · PM</td></tr>
      <tr><td className="k">발주량 · 대응SKU · 옵션별 검토</td><td>SKU 기본정보</td><td className="e">MASTER · PM</td></tr>
      <tr><td className="k">판매 목표(표 ②)</td><td>월 계획</td><td className="e">MASTER · PM · 월 계획 일괄 탭도 이 둘만 보임</td></tr>
      <tr><td className="k">채널별 목표량 · 판매가</td><td>채널별 목표량 + 담당 채널</td><td className="e">담당 채널 MD · 글로벌 · MASTER · PM</td></tr>
      <tr><td className="k">발주 확정 · 해제</td><td>발주 확정</td><td className="e">MASTER · PM</td></tr>
      <tr><td className="k">검토 요청 만들기</td><td>역할 고정</td><td className="e">MASTER · PM</td></tr>
      <tr><td className="k">검토 요청 닫기 · 삭제</td><td>역할 고정</td><td className="e">MASTER</td></tr>
    </tbody></table></div>
    <p className="sub">* 잠기는 경우: 발주 확정된 SKU 전체 · 운영 채널 전부 확정된 SKU의 월별 목표량 · 가격 확정 SKU도 판매가(할인율)는 고를 수 있음 — 확정 가격 기준으로 계산</p>
  </div>
</section>
  );
}
