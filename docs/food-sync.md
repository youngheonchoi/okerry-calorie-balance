# 음식 정보 공유 DB 등록

음식 등록·수정에서 개인 Storage 저장이 성공한 뒤에만 별도 백그라운드 요청을 시작합니다. 캘린더에서도 같은 기록 화면을 사용하므로 동일하게 적용됩니다. 운동 저장·삭제는 전송하지 않습니다.

1. `/api/health`가 정상 응답하는지 확인합니다.
2. SDK `User.createAnonymousKeyAuthCode()`로 일회용 인증 코드를 발급받습니다.
3. API에 코드와 음식명 원문·1개 기준 칼로리·수량만 보냅니다. 서버가 mTLS로 코드를 교환하여 사용자 ID를 정합니다.
4. DB에 같은 음식명이 있으면 아무것도 수정하지 않습니다. 없으면 새 행을 등록합니다.

API 기본 주소는 `https://okerry-calorie-balance-api.vercel.app`입니다. 다른 환경은 `VITE_CALORIE_API_URL`로 지정할 수 있습니다. 비밀키·인증서는 이 변수나 앱 번들에 넣지 않습니다.

API/SDK 오류는 화면에 노출하지 않습니다. 오류 정보는 코드·실패 단계·요청 ID·발생 시각만 최대 20개 Storage에 임시 저장하고, 다음 등록 성공 시 서버의 오류 테이블에 전달합니다. 음식명·인증 코드·개인 키를 오류 버퍼에 넣지 않습니다. 네트워크가 복구되지 않으면 DB 로그도 즉시 전송할 수 없습니다.

## 서버 선행 설정

API 저장소의 `DATABASE_URL`, `TOSS_MTLS_CERT`, `TOSS_MTLS_KEY` 설정과 재배포가 필요합니다. mTLS 인증서가 없으면 health는 503이며 개인 기록만 저장합니다. 코드가 반영되기 전의 기존 API는 새 요청 형식과 호환되지 않으므로 서버를 먼저 배포해야 합니다.

로컬 `npm run dev`에서 배포 API를 호출하려면 테스트 중 Vercel에 `ALLOW_LOCAL_DEV_ORIGINS=true`를 설정하고 재배포합니다. 사용자 인증은 계속 필요하며 mock 코드는 실제 토스 사용자 코드가 아닙니다. 로컬 자동 검증은 API/SDK를 가짜 응답으로 주입하고, 실제 식별·DB 저장은 토스앱의 QR 테스트로 확인합니다.

공식 SDK/API 문서:
- https://developers-apps-in-toss.toss.im/documentation/sdk/domains-api/user/user.createanonymouskeyauthcode
- https://developers-apps-in-toss.toss.im/api/user-key
- https://developers-apps-in-toss.toss.im/documentation/integration/server-api
