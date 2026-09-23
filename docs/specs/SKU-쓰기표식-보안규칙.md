# SKU 쓰기 표식(_writeAt) + Firestore 보안 규칙

## 왜 필요한가

2026-09-23, 다른 PC에 켜둔 채 방치된 **구버전 코드 탭**이 CPO 자동 동기화(가격 등) 때문에 SKU를 저장하면서
문서 전체를 옛날 값으로 덮어써, 산리오 헤잇미 밴드_27 등 8개 SKU의 수량·메모가 유실됐다.

코드 배포만으로는 이미 열려 있는 구버전 탭을 멈출 수 없다. 그래서 **서버(보안 규칙)에서** 구버전 탭의 쓰기를 거부한다.

- 새 코드는 `skus` 문서에 쓸 때마다 `_writeAt: serverTimestamp()`를 함께 보낸다 (`src/store/index.ts`의 `stamped()`).
- 보안 규칙이 `request.resource.data._writeAt == request.time`을 요구한다.
- 구버전 코드는 이 표식을 모르므로 merge 결과의 `_writeAt`이 옛 시각 그대로 → 거부된다.

## ⚠️ 게시 순서 (반드시 지킬 것)

1. 이 PR 머지 → Vercel 배포 완료 확인
2. 팀 전체 공지: 대시보드 탭을 모두 닫고 새로 열기
3. 새 코드 탭에서 아래 "게시 전 점검" 수행 (표식이 모든 저장 경로에 붙었는지)
4. Firebase 콘솔(`md-dashboard-6fd45` → Firestore → 규칙)에 규칙 게시
5. "게시 후 검증" 스크립트 실행

규칙을 코드 배포보다 먼저 게시하면 **새 코드가 아닌 기존 운영 코드 전체의 저장이 막힌다.**

## 규칙 템플릿

⚠️ Firestore 규칙은 여러 `allow`가 매칭되면 **하나라도 허용하면 허용**이다. 전체 컬렉션을 허용하는
catch-all(`match /{document=**}`)이 있으면 skus 제한이 무력화되므로, catch-all이 skus를 제외하도록 바꿔야 한다.

현재 규칙이 아래처럼 catch-all 하나라면:

```
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

다음으로 교체한다 (인증 조건 `request.auth != null`은 현재 규칙의 조건을 그대로 쓸 것):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // SKU: 쓰기 표식 필수 — 구버전 코드 탭의 덮어쓰기 차단 (docs/specs/SKU-쓰기표식-보안규칙.md)
    match /skus/{skuId} {
      allow read, delete: if request.auth != null;
      allow create, update: if request.auth != null
        && request.resource.data._writeAt == request.time;
    }

    // 그 외 컬렉션은 기존과 동일 — skus는 위 규칙만 적용되도록 제외
    match /{collection}/{docId=**} {
      allow read, write: if request.auth != null && collection != 'skus';
    }
  }
}
```

- `delete`는 제한하지 않는다 (휴지통 이동은 사용자의 명시적 행동).
- CPO 대시보드는 Product를 **읽기만** 하므로 영향 없음 (`read` 조건 유지).

## 게시 전 점검 (새 코드 탭에서, 규칙 게시 전)

표식이 빠진 저장 경로가 있으면 규칙 게시 후 그 기능만 저장이 거부된다. 코드상 skus 쓰기 11곳 모두 `stamped()` 적용 완료:

| 기능 | 코드 위치 (store/index.ts) |
|---|---|
| 일반 저장(수량·메모·가격 등 모든 persistSku) + 확정·프라이싱 등 단일 필드 액션 | `writeSkuChanges` |
| 로드 시 비활성 채널 수량 정리 | `loadSkus` 마이그레이션 |
| CPO 기획 → SKU 카드 자동 생성 | `createSkuFromCpo` |
| 휴지통 복원 | `restoreFromTrash` |
| 초기화(현재 UI 미사용) | `resetSku` |
| 채널비중 일괄 복사 | 채널비중 복사 액션 |
| 일괄 등록 | `importSkus` |
| 전체 교체 | `replaceAllSkus` |
| 발주량 확정/취소 | `setFinalOrderConfirmed` |
| 관리 탭 글로벌/일본 비운영 | `setChannelDisabled` |
| 관리 탭 데이터 정리(_initialSnapshot 제거) | `cleanupInitialSnapshots` |

**새로 skus에 쓰는 코드를 추가할 때는 반드시 `stamped()`를 거칠 것.**
로컬 스크립트로 skus를 직접 수정할 때도 `_writeAt: serverTimestamp()`를 포함해야 한다.

## 게시 후 검증

익명 로그인으로 기존 SKU 하나에 대해:

1. 표식 **없이** `updateDoc(ref, { memo: <현재 memo 그대로> })` → `permission-denied` 기대
2. 표식 **포함** `updateDoc(ref, { _writeAt: serverTimestamp() })` → 성공 기대 (다른 필드 변경 없음)

## 롤백

문제가 생기면 Firebase 콘솔 → 규칙 → 이전 버전 탭에서 직전 규칙으로 되돌린다 (즉시 반영).
코드는 표식을 계속 보내도 규칙이 없으면 아무 영향이 없으므로 코드 롤백은 불필요.

## 남는 한계

- 구버전 탭에서 사용자가 직접 입력한 내용은 저장이 거부되어 새로고침 시 사라진다 (화면엔 입력된 것처럼 보임). 다른 사람 데이터를 지우는 것보다는 안전한 방향.
- 구버전 탭의 관리자 메모(`config/adminMemo`)·권한 설정 저장, CPO로 보내는 오픈일 동기화는 이 규칙 대상이 아니다 (명시적 사용자 행동이라 위험 낮음).
- 이 PR부터 새 버전 배포 시 열린 탭이 자동 새로고침된다 (`src/hooks/useVersionCheck.ts`) — 다음 배포부터는 구버전 탭 문제 자체가 줄어든다.
