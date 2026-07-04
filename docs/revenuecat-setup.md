# RevenueCat 구독 결제 설정 가이드

이 앱은 [RevenueCat](https://www.revenuecat.com/)으로 프로 구독(월간/연간)을 처리합니다.
아래 설정을 마치고 `.env`에 Android API 키를 넣으면 페이월과 결제가 활성화됩니다.
키가 없으면 앱은 크래시 없이 로컬/데모 모드로 동작합니다(설정 화면의 개발용 플랜 토글로 테스트).

대상 스토어는 **Google Play(Android 전용)** 입니다.

---

## 1. Google Play Console — 구독 상품 2개 등록

Play Console > 앱 선택 > 수익 창출 > 구독에서 구독 상품 2개를 만듭니다.

| 구분 | 상품 ID (Product ID) | 가격 | 기본 결제 주기 |
| --- | --- | --- | --- |
| 월간 | `pro_monthly` | ₩9,900 | 1개월 |
| 연간 | `pro_yearly` | ₩99,000 | 1년 |

각 구독에 **기본 요금제(base plan)** 를 만들고 위 가격/주기를 설정합니다.

### 7일 무료 체험 (스토어 상품 설정)

> **중요:** 7일 무료 체험은 **앱 코드가 아니라 Google Play의 상품 설정**입니다.
> 각 구독의 기본 요금제에 **무료 체험(free trial) 혜택(offer)** 을 추가하세요.
> - 유형: 무료 체험(Free trial)
> - 기간: 7일
> - 자격: 신규 구독자
>
> 앱에는 체험 기간을 다루는 별도 로직이 없습니다. 결제 화면에서 Google Play가
> "7일 무료 후 청구"를 자동으로 표시하고, 체험 종료 시 자동으로 청구합니다.
> (앱 내부의 "광고 보고 24시간 체험"은 이와 무관한 별개의 리워드 광고 체험입니다.)

상품을 저장하고 **활성화(Activate)** 합니다.

---

## 2. RevenueCat 프로젝트 생성 및 Play 연동

1. [app.revenuecat.com](https://app.revenuecat.com/)에서 프로젝트를 만듭니다.
2. **Apps**에 Google Play 앱을 추가합니다.
   - 앱의 패키지명을 입력합니다.
   - Google Play Service Account 자격 증명(JSON)을 업로드해 RevenueCat이
     Play와 통신하도록 연동합니다. (Play Console에서 서비스 계정 생성 후
     "재무 데이터" 및 구독 조회 권한 부여)

---

## 3. Entitlement "pro" 만들기

RevenueCat > **Entitlements** > New:

- Identifier: **`pro`**  ← 앱 코드(`src/purchases/purchasesPort.native.ts`)가 이 이름을 그대로 사용합니다. 반드시 일치시켜야 합니다.
- 이 entitlement에 위에서 만든 두 상품(`pro_monthly`, `pro_yearly`)을 **Attach** 합니다.

RevenueCat > **Products**에서 `pro_monthly`, `pro_yearly`가 Play와 매핑됐는지 확인합니다.

---

## 4. Offering에 패키지 연결

RevenueCat > **Offerings**:

1. 기본 Offering을 하나 만들고 **Current(현재)** 로 지정합니다.
2. 이 Offering에 패키지 2개를 추가합니다.
   - **Monthly** 패키지 → `pro_monthly` 상품
   - **Annual** 패키지 → `pro_yearly` 상품

> 앱은 현재(current) Offering의 `monthly` / `annual` 패키지를 읽어 페이월에
> 표시합니다. 표준 패키지 타입(Monthly/Annual)으로 넣어야 자동 인식됩니다.
> 가격은 앱에 하드코딩되지 않고 **스토어의 실제 가격 문자열**(예: "₩9,900")로
> 표시되므로, Play Console에서 가격을 바꾸면 앱에도 그대로 반영됩니다.

---

## 5. Android API 키를 .env에

RevenueCat > **Project settings > API keys**에서 Google Play용
**공개 SDK 키(Public app-specific key)** 를 복사합니다.

프로젝트 루트의 `.env`(gitignore됨)에 넣습니다:

```
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxxxxxxxxxxxxxxxxxxxxx
```

- `.env`가 없으면 `.env.example`을 복사해서 만듭니다.
- 키를 넣지 않으면 결제가 비활성화되고 페이월은 "결제 준비 중이에요"를 표시합니다(크래시 없음).
- `EXPO_PUBLIC_*` 접두사는 클라이언트에 노출되어도 안전한 공개 키에만 사용합니다.
  (Play 서비스 계정 JSON 같은 비밀 값은 절대 앱에 넣지 마세요.)

---

## 6. 동작 확인

1. `.env`에 키를 넣고 개발 빌드(`expo run:android`)를 실행합니다.
   - RevenueCat 네이티브 SDK가 필요하므로 **Expo Go에서는 결제가 동작하지 않습니다.**
2. 설정 화면 > 요금제 카드 > **프로 업그레이드**, 또는 매출 화면의
   **광고 없이 모든 기능 — 구독하기** 링크로 페이월에 진입합니다.
3. 월간/연간 상품 가격이 스토어 가격으로 표시되는지 확인합니다.
4. 라이선스 테스터 계정으로 구매/복원을 테스트합니다.
   - 구매 성공 시 `pro` entitlement가 활성화되고, 앱의 플랜이 자동으로 유료로 전환되며
     광고가 사라집니다.
   - "구매 복원"으로 기존 구독을 되살릴 수 있습니다.

## 참고

- 결제/청구/해지는 모두 Google Play 계정에서 관리됩니다.
- entitlement 상태 변화는 RevenueCat 리스너를 통해 앱의 플랜(`planTier`)에 자동 반영됩니다.
- 키가 설정되지 않은 환경에서는 앱이 절대 플랜 상태를 건드리지 않으므로,
  개발용 데모 토글(설정 화면, `__DEV__` 빌드 전용)과 충돌하지 않습니다.
