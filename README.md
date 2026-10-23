# 칼로리 잔고 (Calorie Wallet)

React + Vite + TypeScript strict 모드로 구현한 Apps in Toss 웹 미니앱입니다. SDK 3.8.0과 TDS를 사용합니다. 서버, 로그인, 외부 DB 없이 기기에 기록합니다.

## 실행과 검증

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

`npm run build`는 TypeScript 검사, Vite 프로덕션 빌드, 앱인토스 번들 생성을 순서대로 실행합니다. 결과는 `dist/`와 `okerry-calorie-balance.ait`에 있습니다. `npm run dev`에서는 공식 devtools 플러그인이 SDK를 mock하며, 실제 SDK와 같은 기기 저장을 검증하는 환경은 아닙니다. 테스트는 별도 브라우저 컨텍스트와 메모리 저장소를 사용하며 사용자 데이터나 예시 기록을 앱에 심지 않습니다.

## 구현한 흐름

- 저장 데이터 확인 → 환영/최초 설정 또는 홈
- 단계별 신체·생활·이동·운동 입력, 임시 저장, 계산 근거·직접 보정
- 감량·유지·증량 목표와 일별·주별·사용자 지정 주기
- 4개 플로팅 탭: 홈, 식단, 운동, 마이
- 식단 추가·수정·삭제·다시 기록, 운동 추가·수정·삭제
- 일별 목표 잔고와 실제 예상 에너지 수지, 주기·전체 통계 및 이전 주기 조회
- 기록을 저장할 때마다 날짜별 잔고와 누적 통계를 자동 갱신합니다. 기록이 없는 과거 날짜도 섭취량 0kcal로 누적 통계에 포함합니다.
- 로컬 메뉴 데이터 기반 저녁 추천
- TDEE 재계산, 목표·주기 변경 이력, 체중 기록
- 확인 문구 입력 후 데이터 초기화
- 기기 테마와 관계없는 흰 배경·초록 포인트, 빈 상태·로딩·오류·재시도

## 계산 규칙

`src/domain/calculations.ts`는 UI·SDK를 참조하지 않는 순수 함수 모음입니다.

- BMR: 명세의 Mifflin-St Jeor 공식 또는 직접 입력값
- NEAT 입력: 운동하지 않는 평일의 걸음 수 구간, 근무일 앉은 시간, 출퇴근 일수와 출근·퇴근별 이동 방식, 주말 활동량을 받습니다. 걸음 수 구간은 대표값(1,500·4,000·6,500·9,000보)으로 바꾸고, 앉은 시간 구간은 중간값으로 추정합니다.
- NEAT 계산: 평일 입력과 주말 활동을 주간 평균으로 환산합니다. 도보 거리는 시속 5km로 시간으로 바꾸고, 걸음 수와 도보 출퇴근은 큰 쪽 하나만 사용해 중복을 막습니다. 주말 활동 단계는 하루 0·60·120·180분 걷기 추정으로 반영합니다. 자전거는 출근·퇴근별 시간과 출퇴근 일수를 반영합니다. 과거 저장 데이터의 기존 계산 방식은 유지합니다.
- 최초 설정: 신체 정보 → NEAT → 운동 → 계산 결과 → 목표 → 매주 관리의 6단계입니다. 감량·증량은 하루 300kcal 적자·흑자로 안내하고, 관리 주기는 시작 요일만 선택합니다.
- 비운동 활동: BMR의 8% 기본 움직임에 앉기·걷기·자전거·기타 활동의 단순 추가 소비 추정값을 합산합니다. 이 계수와 입력 구간 환산은 MVP의 가정이며 개인별 측정값이 아닙니다.
- 운동: `(MET - 1) × 3.5 × 체중 / 200 × 시간(분)`으로 안정 시 소비량을 뺀 순소비량을 추정합니다. 직접 입력은 순소비량을 의미합니다. 거리·페이스는 참고용으로 저장합니다.
- TEF: `(BMR + 비운동 활동) / 9`로 유지 섭취량의 약 10%를 한 번 반영합니다. 식사 구성·양에 따른 변화를 측정하지 않는 추정입니다.
- 정기 운동 계획은 운동일·주간 평균 TDEE 예측에 사용합니다. **날짜별 잔고는 비운동일 TDEE + 그 날짜에 기록한 정기/추가 운동**으로 계산합니다. 일상 활동에 포함 표시한 운동은 다시 더하지 않습니다. 정기 운동을 하지 않은 날에는 예상 계획량을 자동 가산하지 않습니다.
- 목표 섭취량 = 해당 날짜 예상 소비량 + 해당 날짜 목표 수지
- 남은 칼로리 = 목표 섭취량 - 기록한 섭취량
- 예상 에너지 수지 = 기록한 섭취량 - 예상 소비량
- 기록 시작일부터 오늘까지 모든 날짜를 주기·전체 누적 수지에 포함합니다. 미기록 날짜는 섭취량 0kcal로 계산하며, 나중에 식단·운동을 추가하면 해당 날짜의 통계가 다시 계산됩니다. 미래 날짜 소비량은 합산하지 않습니다.

모든 계산은 추정이며 의료 진단·식이 처방이 아닙니다. 성인용이며 무리한 섭취 목표를 경고합니다. 자동 체중 감량 예측이나 칼로리 수치를 체지방량으로 환산하는 기능은 없습니다.

계산 참고: [Mifflin 원 논문](https://pubmed.ncbi.nlm.nih.gov/2305711/), [2024 Adult Compendium](https://pacompendium.com/adult-compendium/). MET는 대표 활동을 단순화한 강도 구간이며 개인별 정확도를 보장하지 않습니다.

## 날짜와 설정 이력

날짜는 로컬 달력의 `YYYY-MM-DD`, 생성·수정 시각은 ISO 문자열입니다. 일자를 UTC로 변환해 기록하지 않습니다. TDEE·주기 변경은 내일부터 적용하고, 목표 변경은 오늘부터 적용합니다. 같은 적용일의 예약 변경은 대체하며, 이미 지난 날짜의 설정을 고치지 않습니다. 주기 변경일에서는 이전 주기를 닫고 새 기준의 주기를 시작하므로 과거 통계가 재해석되지 않습니다.

## Storage와 복구

`src/data/repository.ts`는 SDK를 주입받는 저장 접근 계층입니다. 다음 8개 키 각각에 `{ schemaVersion: 1, data: ... }` JSON 문자열을 저장합니다.

- `calorie_wallet_profile`
- `calorie_wallet_tdee_history`
- `calorie_wallet_goal_history`
- `calorie_wallet_cycle_history`
- `calorie_wallet_meals`
- `calorie_wallet_exercises`
- `calorie_wallet_weights`
- `calorie_wallet_meta`

추가 내부 키 `calorie_wallet_draft`는 온보딩 임시 입력, `calorie_wallet_transaction`은 여러 키를 바꾸기 전의 복구 스냅샷입니다. 쓰기는 직렬화하며 오류가 발생하면 스냅샷을 복원합니다. 저장 도중 앱이 종료되면 다음 실행에서 먼저 복구합니다. 복구도 실패하면 저널을 남기고 재시도 안내를 표시합니다. SDK Storage 자체에 다중 키 원자 트랜잭션을 가정하지 않습니다. 초기화는 이 앱의 키만 제거합니다.

## 공식 SDK 지원과 기기 검증 범위

- 저장: 공식 [`Storage`](https://developers-apps-in-toss.toss.im/documentation/common/file-storage/storage)
- 하단 탭: 전용 TDS 하단 탭 API 대신 공식 [플로팅 탭 가이드](https://developers-apps-in-toss.toss.im/design/consumer-ux-guide)에 맞춰 구현했습니다. 주요 버튼은 TDS, 영역은 웹 DOM으로 구성합니다.
- SDK SafeArea와 backEvent를 연결합니다. iOS swipe-back과 React 화면 상태의 자동 동기화는 문서에 보장되지 않아 가정하지 않습니다.

확대·축소는 [공식 WebView 안내](https://developers-apps-in-toss.toss.im/documentation/integration/props)에 따라 viewport에 `maximum-scale=1, user-scalable=no`를 지정했습니다. `touch-action: pan-x pan-y`로 일반 스크롤을 허용하면서 핀치 제스처를 제한합니다.

실제 iOS·Android 토스 앱에서 Storage 지속성, 시스템 뒤로가기·스와이프, Safe Area 및 확대 차단을 확인해야 합니다. 이 저장소의 브라우저 테스트 통과는 실기기 검증을 대체하지 않습니다. 테스트 번들 업로드·본인 푸시는 수행했으며 검수 요청·출시는 수행하지 않았습니다.
