# 배너 광고

홈·활동·기록·달력·마이의 콘텐츠 아래에 공통 `InlineBannerAd`를 하나씩 배치한다.
배너는 콘텐츠와 함께 스크롤된다. 본문 스크롤 영역과 하단 메뉴 영역을 분리해
광고·기록 내용이 메뉴 뒤에 가려지지 않게 한다.
스크롤이 없는 짧은 화면, 초기 정보 입력, 미지원 환경에는 광고를 표시하지 않는다.
광고가 없거나 초기화·렌더링에 실패하면 광고 여백을 남기지 않는다.

SDK 초기화는 앱 실행 중 한 번만 진행한다. 메뉴를 바꾸면 이전 슬롯을 제거한다.
광고 내부 DOM·라벨·클릭·노출 이벤트는 SDK가 관리한다. 자체 새로고침은 하지 않는다.

## 광고 그룹

- 개발 서버: 공식 테스트 ID `ait-ad-test-banner-id`.
- 운영 빌드: `.env.production`의 `VITE_TOSS_BANNER_AD_GROUP_ID`.
- 콘솔에 등록된 기존 배너 그룹을 사용한다. 광고 그룹 ID는 공개 식별자이며 인증키가 아니다.

## 휴대폰에서 광고 테스트하기

실제 광고 ID로 개발 테스트를 하지 않는다. 콘솔 QR 테스트 번들을 만들 때는
아래처럼 환경변수로 테스트 ID를 지정한 뒤 빌드한다(PowerShell).

```powershell
$env:VITE_TOSS_BANNER_AD_GROUP_ID = 'ait-ad-test-banner-id'
npm run build
Remove-Item Env:VITE_TOSS_BANNER_AD_GROUP_ID
```

실제 광고의 렌더링·클릭·복귀 동작은 토스 앱에서 별도 확인한다.
로컬 브라우저에서는 devtools mock의 부착·제거와 화면 배치만 확인할 수 있다.

근거: [배너 광고 가이드](https://developers-apps-in-toss.toss.im/documentation/common/monetization/iaa/web-banner),
[비게임 출시 가이드](https://developers-apps-in-toss.toss.im/checklist/app-nongame).
