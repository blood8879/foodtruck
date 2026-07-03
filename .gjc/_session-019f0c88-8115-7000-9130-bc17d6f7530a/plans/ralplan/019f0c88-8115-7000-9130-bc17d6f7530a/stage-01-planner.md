# 푸드트럭 메뉴·매출 관리 앱 (MVP) — 구현 계획 (deliberate)

> spec: deep-interview-foodtruck-menu-sales-mvp.md · greenfield · ambiguity 9.2%

---

## RALPLAN-DR 요약

### Principles
1. **이벤트소싱 우선**: 주문/취소는 append-only 불변 이벤트, 일집계·메뉴현황 등 현재값은 fold 파생. 화면 표시값은 절대 1차 저장하지 않는다.
2. **로컬 우선(offline-first)**: 모든 쓰기는 로컬에 먼저 커밋되고 즉시 동작한다. 동기화는 백그라운드 멱등 작업이며 UX를 절대 막지 않는다.
3. **박제 불변성(snapshot immutability)**: 주문라인은 생성 시점의 판매가·원가를 복사 보관하며, 이후 마스터(메뉴) 변경이 과거 주문에 소급되지 않는다.
4. **멱등 병합**: 동일 이벤트의 재전송·중복 수신은 결과를 바꾸지 않는다(union-by-id). 충돌은 '병합' 대상이지 '덮어쓰기' 대상이 아니다.
5. **권한 최소노출**: 알바 역할은 주문·취소만 가능하고 매출/관리 화면은 라우팅·API 양쪽에서 차단(클라 숨김만으로 끝내지 않음).

### Decision Drivers (top 3)
1. **오프라인 다중기기 무손실 병합** — 두 기기 오프라인 주문이 연결 시 모두 합산(AC 핵심). 데이터 모델·동기화 선택을 지배.
2. **분석 정합성 = 박제 + 보상이벤트** — 순이익(매출−재료원가) 재집계가 가격변경/취소/지각동기화에도 항상 일관.
3. **MVP 출시 속도/유지보수 단순성** — 1인 사장+소수 알바 규모. 운영 부담 적고 단일 스택으로 모바일+웹 공유 가능해야 함.

### Viable Options

#### (a) 동기화 엔진: Build vs Buy
- **Opt A-1 — Buy: 로컬-퍼스트 동기화 백엔드 (권장)**
  - 후보: PowerSync(+Postgres), ElectricSQL, Couchbase/Couchbase Lite, RxDB+replication.
  - pros: 오프라인 큐·재전송·충돌해결·델타동기화가 검증된 형태로 제공 → MVP 핵심 리스크를 외주화. 모바일+웹 SDK 동시 지원.
  - cons: 벤더 데이터 모델·종속, 비용, 이벤트소싱 의미론을 라이브러리 위에 얹어야 함(추상화 누수 가능).
- **Opt A-2 — Buy: 문서DB 동기화 (CouchDB/PouchDB 계열)**
  - pros: append-only 문서 + revision 기반 복제가 이벤트소싱과 자연스럽게 맞음. 멱등 union이 doc-id로 자명. 오픈소스.
  - cons: 분석 쿼리(기간별 집계)가 약함 → 별도 read-model/집계 파이프 필요. 운영 노하우 요구.
- **Opt A-3 — Build: 커스텀 이벤트 로그 + push/pull 엔드포인트**
  - pros: 이벤트소싱에 100% 맞춤. 멱등 병합이 곧 'event_id 중복제거'로 단순(append-only라 진짜 충돌 거의 없음). 종속 없음.
  - cons: 동기화 큐/재시도/백오프/시계스큐/부분실패 복구를 직접 구현·테스트. 출시 지연 리스크.
  - **권장: A-3 (커스텀, 단 최소형) + A-1을 폴백 후보로 평가.** 근거: 우리 도메인은 append-only 이벤트라 일반적 양방향 충돌해결(CRDT/LWW)이 불필요하고, '이벤트 봉투 + event_id 멱등 + last_seq 커서 pull/push'만으로 무손실·멱등 병합이 성립한다. 범용 sync 라이브러리는 mutable row 충돌을 위한 무게이며, 우리는 그 복잡도를 안 쓴다. 다만 M2 진입 시점에 A-1(PowerSync 등) 스파이크로 '직접 구현 비용 > 도입 비용' 판정나면 전환. → architect/critic 합의 필요 항목.

#### (b) 기술 스택
- **Opt B-1 — RN/Expo(모바일) + React(웹) + 공유 TS 코어 + Postgres/Node 백엔드 (권장)**
  - pros: 모바일+웹이 TS 단일 언어, 도메인 로직(이벤트 fold·원가율·집계)을 플랫폼 무관 순수 코어로 공유. SQLite(expo-sqlite/op-sqlite)로 로컬 저장. 인력 풀·생태계 넓음.
  - cons: RN 네이티브 빌드 환경 관리, 웹/모바일 UI 컴포넌트는 분리 작성.
- **Opt B-2 — Flutter(모바일+웹 단일코드) + Dart 백엔드/Supabase**
  - pros: 단일 코드로 모바일+웹 UI까지 공유, 오프라인 SQLite(drift) 성숙.
  - cons: 분석 그래프/웹 조회 UX는 Flutter Web이 React 대비 약함. 백엔드/동기화 생태계가 TS 대비 좁음. 도메인 코어를 JS 백엔드와 공유 불가.
- **Opt B-3 — PWA 단일(React + 백엔드 Node)**, 네이티브 미사용
  - pros: 한 코드베이스로 모바일/PC 모두 커버, 배포 단순.
  - cons: 현장 POS의 오프라인 신뢰성(스토리지 영속·백그라운드)이 네이티브 대비 약함 → '오프라인 필수' 제약 리스크. 탈락 사유.
  - **권장: B-1.** 근거: (1)도메인 순수 코어 TS 공유가 박제·fold·집계 정합성 테스트를 1곳에 모아 검증 가능, (2)현장 모바일은 네이티브 SQLite로 오프라인 신뢰성 확보, (3)PC 웹 분석 UX는 React 생태계가 가장 강함. B-3는 오프라인 제약 때문에, B-2는 백엔드/분석 약점과 코어 공유 불가로 탈락.

### Pre-mortem (실패 시나리오)
1. **무손실 병합 실패** — 원인: 동기화 큐 중복/유실, event_id 비결정적 생성, 부분 업로드 후 크래시. 신호: 두 기기 합산 매출 ≠ 개별 합, 재연결 후 주문 누락/중복. 완화: event_id를 클라 생성 UUIDv7(시간순)+기기id로 전역유일, push는 멱등 upsert, pull은 last_seq 커서 기반, 로컬 outbox에 미확인 이벤트 영속 후 ACK 시 제거. integration 테스트로 '오프라인 2기기→병합' 골든.
2. **박제 깨짐/소급 오염** — 원인: 주문라인이 메뉴를 FK 참조만 하고 가격을 join으로 표시, 또는 집계가 현재 메뉴원가를 사용. 신호: 과거 일매출이 메뉴 가격 수정 후 변동. 완화: OrderLine에 unit_price/unit_cost 값복사 컬럼 필수, 집계 fold는 라인 박제값만 사용, '가격변경 후 과거불변' 회귀 테스트.
3. **권한 우회** — 원인: 알바 화면 숨김만 하고 API 미검증. 신호: 알바 토큰으로 매출 API 200 응답. 완화: 역할을 서버측 미들웨어+로컬 라우트가드 양쪽 검증, 매출/메뉴/직원 엔드포인트 role=owner 강제. e2e로 알바 토큰 403 확인.

### 확장 테스트 계획
- **Unit (도메인 코어 — 플랫폼 무관)**: 원가율 계산, 레시피 재료단가 합산→원가, 이벤트 fold(주문+취소→일집계 매출/원가/순이익), 보상이벤트가 매출에서 제외되는지, 박제값 우선 사용.
- **Integration (로컬DB+동기화)**: outbox push 멱등(같은 event 2회→1건), pull 커서 누적, 오프라인 2기기 주문→병합 무손실/무중복 골든, 지각 동기화분이 해당 '날짜'(이벤트 발생시각 기준)에 자동 합산.
- **e2e (앱 흐름)**: 알바 초대코드/PIN 합류→주문 탭만 노출→주문/취소 가능·매출 차단(UI+API 403), 사장 4탭, 오프라인 주문 후 재연결 동기화, 매출 탭 레이아웃(큰숫자→그래프→순위→내역), 메뉴 품절토글→POS 비활성.
- **Observability**: 동기화 outbox 깊이/재시도/실패 카운터, 마지막 동기화 시각·last_seq, 병합 시 중복제거 건수 로그, 집계 재계산 트리거 로그. 클라 동기화 상태 배지(온라인/대기N건/충돌0).
- **불변성 가드(상시)**: 이벤트 테이블 update/delete 금지(테스트로 검증), 집계는 항상 이벤트에서 재생성 가능(rebuild 일치 테스트).

---

## 계획 본문

### 구성요소 & 구현 순서 (의존성)
1. **메뉴 관리** (기반: POS·집계가 메뉴 박제값 의존)
2. **주문 등록(POS)** (메뉴 의존, 이벤트 생산)
3. **매출·수익 분석** (이벤트 fold 의존)
- **직원·계정·권한**은 1~3에 교차(cross-cutting): 인증/역할가드/입력자 기록을 각 단계에 주입. M1은 단일 사장 로컬로 시작, M3에서 알바·권한 완성.

순서 근거: 메뉴(마스터)→POS(이벤트 생성, 박제 소스)→분석(fold). 권한은 모든 쓰기·조회 경로에 걸치므로 별도 마지막 모듈이 아니라 단계별로 얇게 삽입.

### 데이터 모델 / 이벤트 스키마 개요
- **Truck**: id, 트럭명, owner_account_id, invite_code. (마스터)
- **Staff**: id, truck_id, 이름, role(owner|staff), pin_hash, joined_at. (마스터)
- **Menu**: id, truck_id, 이름, sell_price, cost(직접입력 또는 레시피파생), category, sold_out(bool), updated_at. (가변 마스터)
  - **Ingredient/RecipeItem**: id, menu_id, 이름, unit_price, unit, qty. → cost 파생(선택).
- **Order (이벤트, append-only)**: event_id(UUIDv7), truck_id, device_id, created_at(발생시각=집계 날짜 기준), entered_by(staff_id), discount_memo, manual_total(nullable 수동조정), status 파생.
  - **OrderLine (불변, 주문에 종속)**: order_event_id, menu_id, menu_name(박제), qty, unit_price(박제), unit_cost(박제).
- **OrderVoid (보상 이벤트, append-only)**: event_id, target_order_event_id, voided_by, created_at.
- **DailySummary (derived, fold)**: truck_id, date, gross(매출), cost(재료원가), net(순이익=gross−cost), late_synced(bool 표시), 메뉴별 순위 집계. 항상 이벤트에서 재생성 가능.
- 공통 동기화 봉투: 모든 이벤트에 event_id, truck_id, device_id, seq(서버 부여), created_at. 클라 outbox = 미ACK 이벤트.

### 동기화 / 오프라인 전략
- **로컬 우선 저장**: SQLite에 이벤트·마스터 모두 보관, 쓰기 즉시 로컬 커밋+화면 반영. UI는 동기화 상태와 무관히 동작.
- **Outbox push**: 미ACK 이벤트를 서버에 멱등 upsert(event_id 충돌→무시). 부분실패 시 재시도(지수백오프), ACK 시 outbox에서 제거.
- **Cursor pull**: 클라가 보관한 last_seq 이후 이벤트만 수신, 로컬에 union merge(event_id 중복제거). append-only라 row 충돌 없음 → 멱등.
- **박제 보장**: 동기화는 이벤트(박제값 포함)만 전파, 집계는 각 노드에서 fold 재생성.
- **지각 동기화**: 이벤트 created_at 기준으로 날짜 귀속 → 늦게 도착해도 올바른 날짜에 합산, late_synced 플래그로 화면 표시. lock 없음(자동 재집계).
- **권장 구현**: 커스텀 최소 sync(이벤트 로그 + push/pull). M2 시작 시 PowerSync/Electric 스파이크로 build vs buy 최종판정(architect/critic 합의).

### 마일스톤 (계층화)
- **M1 — 로컬 단독 (메뉴 + POS + 일매출)**
  - 메뉴 CRUD(판매가·원가·원가율·카테고리·품절토글, 선택 레시피→원가파생).
  - POS: 카테고리별 메뉴버튼 그리드+장바구니(수량·수동총액·할인메모)+주문완료, 품절 비활성.
  - 주문/취소 이벤트 로컬 append, OrderLine 박제.
  - 일매출 화면: 큰숫자(매출·순이익) 로컬 fold. 단일 사장 계정, 동기화 없음.
- **M2 — 동기화 + PC 웹 조회**
  - 백엔드 이벤트 수신/배포, outbox push + cursor pull, 멱등 union 병합.
  - 다중기기 오프라인→재연결 무손실 병합. 지각 동기화 날짜귀속·표시.
  - PC 웹: 매출·분석 조회(큰 그래프), 메뉴·설정 조회/편집.
  - build vs buy 최종 판정 게이트.
- **M3 — 직원·권한 + 분석 완성**
  - 사장 초대코드/PIN 발급, 알바 합류, 입력자 기록.
  - 역할가드(라우트+API): 알바=주문 탭만, 매출/메뉴/직원 차단.
  - 매출 탭 완성: 큰숫자→추이그래프→메뉴별순위→주문내역(취소·지각반영 표시). 일/월/연 토글.

### Acceptance Criteria 매핑 (명세 AC → 마일스톤/검증)
| 명세 AC | 마일스톤 | 검증 |
|---|---|---|
| 판매가·원가→원가율 자동 | M1 | unit: 원가율 계산 |
| 카테고리+품절토글→POS 판매중지 | M1 | e2e: 품절→버튼 비활성 |
| (선택)레시피→원가 자동계산 | M1 | unit: 재료단가 합산 |
| 초대코드/PIN 알바 합류 | M3 | e2e: 합류 플로우 |
| 알바 주문·취소만, 매출/관리 차단 | M3 | e2e: UI 숨김+API 403 |
| 오프라인 메뉴버튼 탭+수량 주문 | M1 | e2e: 비행기모드 주문 |
| 2기기 오프라인 주문 무손실 합산 | M2 | integration: 병합 골든 |
| 박제+가격변경 과거 미소급 | M1/M2 | regression: 가격수정후 과거불변 |
| 취소 시 이력보존+매출제외 | M1/M3 | unit: 보상이벤트 fold |
| 총액 수동조정+할인메모 | M1 | unit/e2e: manual_total |
| PC·폰 일/월/연 매출·순이익 | M2/M3 | e2e: 토글 조회 |
| 지각 동기화분 날짜 자동반영+표시 | M2 | integration: 날짜귀속 |
| 사장 4탭 / 알바 주문탭만 | M3 | e2e: 역할별 탭 |
| 매출탭 큰숫자→그래프→순위→내역 | M3 | e2e: 레이아웃 순서 |

### 위험 / 완화
- **동기화 무손실(최상위 리스크)**: 커스텀이라면 outbox 영속·멱등 upsert·커서 pull을 M2 초반에 골든 테스트로 고정. 의심 시 buy로 전환(게이트).
- **박제 누수**: OrderLine 값복사 강제 + 집계가 마스터 join 금지, 회귀 테스트 상시.
- **권한 우회**: 서버 미들웨어 role 강제, 클라 숨김만 신뢰 금지.
- **이벤트소싱 복잡도 과다**: MVP는 read-model을 SQLite fold로 단순 유지, CQRS/별도 프로젝션 인프라 도입 보류.
- **build vs buy 미결**: M2 진입 게이트에서 스파이크 후 architect/critic 합의로 확정.

### 후속 작업 (handoff)
- **architect**: (a)동기화 build vs buy 최종판정, (b)이벤트 봉투/스키마·집계 read-model 설계 리뷰. M2 게이트 차단형.
- **critic**: 마일스톤별 acceptance·테스트 골든이 '추측 없이 실행 가능'한지 검증.
- **executor**: M1부터 슬라이스 위임(도메인 코어 → 로컬DB → POS UI → 메뉴 UI). 통합·최종검증은 부모 책임.
- **ultragoal/team**: M1~M3 다단계·장기 실행 시 골든 원장으로 채택 고려.
- v2 백로그: 재고·레시피 자동차감, 실시간 위치, 외부결제·결제수단별 매출, 세무용 매출.
