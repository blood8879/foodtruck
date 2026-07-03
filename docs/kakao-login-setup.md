# 카카오 로그인 설정 가이드

앱 코드(카카오 로그인 버튼 + Supabase OAuth 웹 플로우)는 이미 구현되어 있습니다.
실제로 동작하게 하려면 **Kakao Developers 콘솔**과 **Supabase 대시보드** 설정이 필요합니다.
아래 순서대로 진행하세요. (이 앱은 **Android 전용**입니다.)

---

## 1. Kakao Developers 콘솔

https://developers.kakao.com

1. **애플리케이션 생성**
   - 내 애플리케이션 → 애플리케이션 추가하기 → 앱 이름/사업자명 입력.
2. **REST API 키 확보**
   - 앱 설정 → 앱 키 → **REST API 키**를 복사해 둡니다. (Supabase에 입력할 값)
3. **카카오 로그인 활성화**
   - 제품 설정 → 카카오 로그인 → **활성화 설정 ON**.
4. **Redirect URI 등록**
   - 제품 설정 → 카카오 로그인 → Redirect URI에 아래 값을 그대로 등록합니다.
     ```
     https://vqbykamxdwkamzqamoht.supabase.co/auth/v1/callback
     ```
   - 이 주소는 카카오가 로그인 후 돌려보내는 **Supabase 콜백**입니다. (앱 딥링크가 아님)
5. **동의항목 설정**
   - 제품 설정 → 카카오 로그인 → 동의항목에서
     - **닉네임(profile_nickname)**: 필수 또는 선택 동의로 설정.
     - **카카오계정(이메일)(account_email)**: 필요 시 설정. 이메일 제공에는 카카오 심사가 필요할 수 있으며, 미승인 시 이메일 없이도 로그인은 동작합니다.
6. **Client Secret 발급**
   - 제품 설정 → 카카오 로그인 → 보안 → **Client Secret 코드 생성** 후 **활성화 상태 ON**.
   - 생성된 시크릿 값을 복사해 둡니다. (Supabase에 입력할 값)

---

## 2. Supabase 대시보드

https://supabase.com/dashboard → 해당 프로젝트

1. **Kakao 공급자 활성화**
   - Authentication → Providers → **Kakao** → Enable ON.
   - **REST API 키**(1-2에서 복사) → *Client ID(또는 API Key)* 칸.
   - **Client Secret**(1-6에서 복사) → *Client Secret* 칸.
   - 저장.
2. **앱 딥링크를 Redirect URL 허용목록에 추가**
   - Authentication → URL Configuration → **Redirect URLs**에 앱 스킴을 추가합니다.
     ```
     ftapp://**
     ```
   - 앱이 로그인 후 브라우저에서 **앱으로 돌아올 때** 사용하는 딥링크입니다.
   - Expo Go/개발 빌드로 테스트한다면 Expo가 만들어 주는 개발용 리다이렉트 URL(예: `exp://...`)도 함께 허용해야 합니다.
     실행 로그에 찍히는 실제 redirect 값을 확인해 추가하세요.

> 참고: 앱의 스킴은 `app.json`의 `expo.scheme` 값(`ftapp`)입니다.
> 이미 존재하므로 새로 추가하지 않았습니다. 스킴을 바꾸면 위 Redirect URL과 재빌드가 함께 바뀌어야 합니다.

---

## 3. 앱 빌드

- `app.json`의 `scheme`(`ftapp`)은 **변경하지 않았으므로** 스킴 때문에 재빌드할 필요는 없습니다.
- 단, 카카오 로그인 버튼이 추가된 이번 변경을 반영하려면 앱을 다시 실행/빌드해야 합니다.
  - 개발: `npx expo start` (개발 빌드 또는 Expo Go).
  - 배포용: 딥링크(커스텀 스킴)는 네이티브 설정에 포함되므로 **개발 빌드/EAS 빌드**에서 정상 동작합니다.
    (Expo Go에서는 커스텀 스킴 대신 Expo 개발 URL로 리다이렉트되니 2-2의 개발용 URL 허용이 필요합니다.)

---

## 동작 방식 요약 (참고)

1. 사용자가 "카카오로 시작하기" 클릭.
2. 앱이 `supabase.auth.signInWithOAuth({ provider: "kakao" })`로 인증 URL을 받아 인앱 브라우저(`expo-web-browser`)로 엽니다.
3. 카카오 로그인 → 카카오가 **Supabase 콜백**(1-4)으로 리다이렉트.
4. Supabase가 세션 토큰을 앱 **딥링크**(`ftapp://auth/callback#access_token=...`)로 리다이렉트.
5. 앱이 토큰을 받아 `supabase.auth.setSession()`으로 세션을 확립 → 이후 트럭 멤버십 조회/온보딩 흐름은 이메일 로그인과 동일하게 진행됩니다.
