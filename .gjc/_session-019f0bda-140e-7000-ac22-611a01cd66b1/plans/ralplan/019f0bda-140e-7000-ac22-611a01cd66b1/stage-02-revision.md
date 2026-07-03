# 푸드트럭 메뉴·매출 관리 앱 (MVP) — 구현 계획 rev.2 (deliberate)

> spec: deep-interview-foodtruck-menu-sales-mvp.md · greenfield · stage-02 revision
> rev.2 변경: Architect WATCH/REQUEST-CHANGES(H1~H3) + Critic ITERATE(M-*/LOW) 전수 반영 + 신규요구(영업세션·수익화·광고·M4) 통합

---

## 변경 요약 (rev.1 → rev.2)
- **H1 다운로드 정합성**: last_seq 단순 커서 폐기 → 단조 high-water-mark 커서로 재설계. 기본 기울기 BUY 전환.
- **H2 날짜귀속**: device/server 이중 타임스탬프 + BusinessSession open/close를 영업일 경계 anchor로 채택(신규요구1과 결합).
- **H3 권한 스코프**: 서버측 역할별 pull 필터 명문화(알바=마스터+자기주문만, 원가박제/타기기주문 미전송).
- **M-ORD/M-OBX/M-VOID/M-MTL/M-GATE** 전수 반영, pre-mortem 6+ 시나리오, 골든 전수 매핑.
- **신규**: BusinessSession 도메인(M1), entitlement/plan tier seam(M1~M3 설계, M4 활성), 광고 슬롯(장사 시작/종료만), 마일스톤 M4(수익화).

---

## RALPLAN-DR 요약

### Principles
1. **이벤트소싱 우선**: 주문/취소/세션open·close는 append-only 불변 이벤트, 현재값(일집계·세션집계·메뉴현황)은 fold 파생.
2. **로컬 우선 offline-first**: 모든 쓰기는 로컬 단일 트랜잭션 커밋 후 즉시 동작. 동기화는 백그라운드 멱등 작업, UX 차단 금지.
3. **박제 불변성**: OrderLine은 생성시점 판매가·원가를 값복사 보관, 마스터 변경 과거 미소급.
4. **멱등·단조 동기화**: event_id union 멱등 + 단조 high-water-mark 커서로 무손실. 충돌은 병합 대상.
5. **권한 최소노출(데이터 경계까지)**: 알바는 주문·취소만 + 서버 pull이 역할별로 데이터를 필터해 알바 기기에 매출 산출 가능한 이벤트(타기기 주문/원가 박제)를 아예 보내지 않는다.
6. **수익화 seam 선매립**: entitlement(plan tier)·광고 슬롯을 데이터모델·서비스 경계에 지금 심고, 실제 SDK/결제는 M4로 분리. MVP는 전체 무료 개방.

### Decision Drivers (top 3)
1. **오프라인 다중기기 무손실·정합 다운로드** — concurrent commit에도 유실0(H1). 동기화 build/buy를 지배.
2. **분석·권한 정합성** — 박제+보상이벤트+세션경계 날짜귀속(H2)+역할별 데이터 필터(H3)로 매출/순이익/권한 항상 일관.
3. **MVP 속도 + 수익화 확장성** — 소규모 운영, 단일 TS 스택, 수익화 seam 선매립으로 후속 비용 최소.

### Viable Options

#### (a) 동기화 엔진: Build vs Buy — **기본 기울기 BUY로 전환**
- **Opt A-1 — Buy: 로컬퍼스트 동기화 백엔드 (권장)**
  - 후보: PowerSync(+Postgres), ElectricSQL, Couchbase Lite.
  - pros: 논리복제/단조 커서·오프라인 큐·재전송·델타동기화가 검증 제공 → H1(commit-order 비단조 유실) 리스크를 외주화. 역할별 동기화 규칙(H3) 선언 지원(PowerSync sync rules).
  - cons: 벤더 데이터모델 종속, 비용, 이벤트소싱 의미론을 위에 얹어야 함.
- **Opt A-2 — Build: 커스텀 이벤트 로그 + 단조 커서**
  - 설계: last_seq 단순 커서 폐기. 다음 중 택1 — (i) Postgres 논리복제 슬롯 기반 순서보장, (ii) commit_ts + overlap window(재조회 안전구간)로 비단조 보정, (iii) high-water-mark = min(아직 미commit인 seq) 미만만 '확정' 노출. push는 event_id 멱등 upsert.
  - pros: append-only 도메인에 100% 맞춤, 종속 없음.
  - cons: 단조성·부분실패·시계스큐를 직접 구현·골든화. H1/M-OBX/H3 골든 통과가 전제.
  - **권장: A-1(BUY) 기본, A-2는 H1/M-OBX/H3 골든 전수 통과 시에만 조건부 채택.** 근거: rev.1은 'append-only라 충돌없음'을 근거로 BUILD를 기울였으나, 무충돌은 '병합'에만 성립하고 **다운로드 정합성(commit-order 비단조 → 동시 commit 이벤트가 커서 사이로 누락)** 은 별개 문제다. 이건 일반적 분산 로그의 어려운 부분이며 검증된 BUY가 리스크를 낮춘다. sync port 추상화로 결정을 늦추되 기본은 BUY.

#### (b) 기술 스택
- **Opt B-1 — RN/Expo(모바일) + React(웹) + 공유 TS 코어 + Postgres/Node 백엔드 (권장)**
  - pros: 모바일+웹 단일 TS, 도메인 코어(fold·원가율·집계·entitlement) 공유, 네이티브 SQLite로 오프라인 신뢰성, React 분석 UX 강점. PowerSync RN/web SDK 지원으로 (a)와 정합.
  - cons: RN 네이티브 빌드 관리, UI는 플랫폼별 작성.
- **Opt B-2 — Flutter 단일 + Supabase** (탈락): 백엔드/동기화 생태계 좁고 도메인 코어를 JS 백엔드와 공유 불가, 분석 웹 UX 약점.
- **Opt B-3 — PWA 단일** (탈락): 현장 오프라인 신뢰성 약점으로 '오프라인 필수' 제약 위배.
  - **권장: B-1.** 근거 동일(도메인 코어 1곳 검증 + 네이티브 오프라인 + React 분석).

### Pre-mortem (6+ 시나리오)
1. **다운로드 유실(H1)** — 원인: last_seq 단순 커서가 commit-order 비단조에서 동시 commit 이벤트를 건너뜀. 신호: 기기합산 매출≠개별합, 재연결 후 특정 이벤트 영구 누락(중복 아님). 완화: **단조 high-water-mark 커서**(min 미commit seq 미만만 확정) 또는 commit_ts+overlap window 재조회, 또는 논리복제 슬롯. 골든: 'concurrent commit 누락0'. 불가 시 BUY 확정.
2. **시계스큐 날짜귀속(H2)** — 원인: device created_at만으로 날짜 귀속 시 기기 시계 오차로 엉뚱한 영업일. 신호: 심야 주문이 다음날로 튐, 일매출 경계 흔들림. 완화: device_created_at + server_received_at 이중 보관, 오프셋 추정·임계초과 플래그, **BusinessSession open~close를 영업일 경계 anchor로 사용**, 타임존 명문화. 골든: '시계 +6h 스큐에도 같은 세션 귀속'.
3. **권한 데이터 유출(H3)** — 원인: 동기화가 truck 전체 이벤트를 알바 기기로 복제 → 클라에서 매출 산출(원칙5 위배). 신호: 알바 로컬DB에 타기기 주문/원가 박제 존재. 완화: **서버 역할별 pull 필터** — 알바=메뉴 마스터 + 자기 작성 주문만, 타기기 주문·원가 박제·집계 미전송. 골든/e2e: '알바 pull 응답에 매출 산출 가능 필드 0'.
4. **비원자 주문(M-ORD)** — 원인: 주문 헤더와 라인을 별도 전송 → 부분도착으로 라인 없는 주문/유령 라인. 신호: 라인합≠총액, 라인0 주문. 완화: 주문+라인을 **단일 불변 이벤트 봉투(payload에 라인 배열)** 로 원자 전송, 라인 테이블은 프로젝션. 골든: '라인배열 원자 적용'.
5. **이중쓰기(M-OBX)** — 원인: 이벤트 테이블과 outbox를 분리 write → 크래시 시 불일치. 신호: 전송됐는데 로컬 미반영(또는 반대). 완화: event(seq=null)에서 outbox를 **파생**, **단일 SQLite 트랜잭션**으로 커밋(dual-write 제거). 골든: '커밋 직후 크래시→재기동 정합'.
6. **orphan/중복 void(M-VOID)** — 원인: void가 target보다 먼저 도착, 또는 void 중복 수신. 신호: 적용 안 된 취소, 이중 차감. 완화: orphan void는 **보류 큐→target 도착 시 적용**, 동일 void event_id는 멱등(1회만 차감). unit 골든: 'orphan→적용·중복→1회'.
7. (추가) **manual_total fold 모호(M-MTL)** — 완화 규칙 확정(아래 fold 규칙).

### 확장 테스트 골든 (HIGH/MEDIUM/LOW 전수 커버)
- **Unit (도메인 코어)**: 원가율, 레시피 원가합산, 이벤트 fold(매출/원가/순이익), 보상이벤트 제외, 박제값 우선, **M-MTL fold 규칙**(gross=manual_total 우선 없으면 라인합, cost=라인 unit_cost 합), 메뉴순위 지표(수량/매출 택1·박제 menu 기준 LOW), orphan/중복 void(M-VOID), entitlement 게이팅 판정.
- **Integration (로컬DB+동기화)**: push 멱등, **단조 커서 concurrent-commit 누락0(H1)**, **이중쓰기 제거 크래시 정합(M-OBX)**, **시계스큐 날짜귀속(H2)**, per-event lateness 표시(LOW), truck_id 스코프 강제(LOW), 지각 동기화 날짜귀속.
- **e2e**: **알바 pull 유출0(H3)** + 알바 주문탭만·매출 API 403, 사장 4탭, 오프라인 2기기 무손실 합산, 비원자주문 방지(M-ORD), 매출탭 레이아웃, 품절토글 비활성, **영업세션 open/close→세션집계·날짜경계**, **광고 슬롯이 세션 open/close에만·POS/매출/알바엔 0**, **entitlement 게이팅(무료/유료 경계)**.
- **Observability**: outbox 깊이/재시도/실패, 커서 high-water-mark·last server_received, 중복제거 건수, 시계 오프셋·임계 플래그, 역할별 pull 필터 적용 카운터, 재집계 트리거, 동기화 상태 배지, 광고 노출/entitlement 결정 로그.
- **불변성 가드(상시)**: 이벤트 update/delete 금지, 집계 rebuild 일치, 박제 불변 회귀.

---

## 계획 본문

### 구성요소 & 구현 순서
1. **메뉴 관리** → 2. **주문 등록(POS)** → 3. **매출·수익 분석**. **영업세션**은 POS와 함께 M1(날짜경계 anchor). **직원·권한**과 **entitlement seam**은 전 단계 교차삽입(M1 설계, M3 권한 완성, M4 수익화 활성).

### 데이터 모델 / 이벤트 스키마 개요
- **Truck**: id, 트럭명, owner_account_id, invite_code, **plan_tier(free|paid 기본 free)**.
- **Staff**: id, truck_id, 이름, role(owner|staff), pin_hash, joined_at.
- **Menu** (가변 마스터): id, truck_id, 이름, sell_price, cost, category, sold_out, updated_at. **RecipeItem**: menu_id, 이름, unit_price, unit, qty → cost 파생(선택).
- **BusinessSession (이벤트, 신규)**: open 이벤트(event_id, truck_id, device_id, opened_by, device_created_at, server_received_at), close 이벤트(target_session_id, closed_by, ts). open~close = 명시적 영업일 경계 anchor.
- **Order (단일 불변 이벤트 봉투, M-ORD)**: event_id(UUIDv7), truck_id, session_id, device_id, device_created_at, server_received_at, entered_by, discount_memo, manual_total(nullable), **payload.lines[] = OrderLine 배열**. status 파생.
  - **OrderLine (프로젝션, 박제)**: menu_id, menu_name, qty, unit_price, unit_cost (값복사 불변).
- **OrderVoid (보상 이벤트)**: event_id, target_order_event_id, voided_by, ts (orphan 보류·멱등).
- **PlanTier/Entitlement (신규)**: tier(free|paid), 기능 플래그(다중직원·기간분석·그래프·PC웹·내보내기·ad_free). MVP는 전체 개방(seam만), M4 활성.
- **DailySummary / SessionSummary (derived, fold)**: 날짜·세션별 gross/cost/net, late_synced 플래그, 메뉴별 순위(박제 menu 기준). 항상 이벤트에서 재생성.
- 공통 동기화 봉투: event_id, truck_id, session_id, device_id, server seq, device_created_at, server_received_at. outbox는 event(seq=null)에서 파생, 단일 트랜잭션.

### 동기화 / 오프라인 전략
- **로컬 우선 단일 트랜잭션**: 이벤트+프로젝션+outbox를 한 SQLite 트랜잭션으로 커밋(M-OBX, dual-write 제거).
- **Push**: outbox 미ACK 이벤트를 event_id 멱등 upsert, 지수백오프, ACK 시 제거.
- **Pull(단조, H1)**: last_seq 단순 커서 폐기. high-water-mark = min(미commit seq) 미만만 확정 노출(또는 commit_ts+overlap window 재조회, 또는 논리복제 슬롯). concurrent commit 누락0 보장.
- **역할별 필터(H3)**: 서버 pull이 역할로 데이터 절단 — 알바는 메뉴 마스터 + 자기 작성 주문만, 타기기 주문·원가 박제·집계 미전송.
- **날짜귀속(H2)**: device_created_at + server_received_at 이중 보관, 오프셋 추정·임계 플래그, **BusinessSession 경계로 영업일 확정**, 타임존(심야영업) 명문화. 지각분 자동합산+표시(per-event lateness, LOW).
- **박제**: 이벤트(박제 포함)만 전파, 집계는 각 노드 fold 재생성.
- **truck_id 스코프 강제(LOW)**: 모든 쿼리·동기화 규칙에 truck_id 필수.

### M-GATE (build vs buy 게이트 — 느슨한 'M2 판정' 제거)
- **sync port 추상화 + vendor-neutral 이벤트 스키마를 M1부터 적용**(BUY든 BUILD든 동일 도메인 코어).
- 사전 판정기준 문서화: H1(누락0)/M-OBX(크래시 정합)/H3(역할 필터) 골든 + 운영비용/SDK 정합.
- **M2 착수 즉시 time-box 스파이크**(PowerSync 등). 기본 기울기 **BUY**, 커스텀(A-2)은 위 골든 전수 통과 시에만.

### fold 규칙 (M-MTL 확정)
- gross = manual_total 있으면 manual_total, 없으면 Σ(line unit_price×qty).
- cost = Σ(line unit_cost×qty).
- net = gross − cost. void된 주문은 gross/cost/net 전부 제외.
- 메뉴순위 = 박제 menu 기준, 지표는 **매출액 기준**(수량은 보조 표시).

### 마일스톤 (계층화)
- **M1 — 로컬 단독 (메뉴 + POS + 영업세션 + 일/세션 매출)**: 메뉴 CRUD(원가율·카테고리·품절·선택레시피), POS(그리드+장바구니+수동총액+할인메모, 품절 비활성), **BusinessSession open/close(영업일 경계 anchor)**, 주문/취소 단일이벤트 봉투 로컬 append, 박제, 로컬 fold 일/세션 매출. 단일 사장. **entitlement seam 설계(전체 무료 개방)**, **광고 슬롯 위치만 표시(SDK 없음)**.
- **M2 — 동기화 + PC 웹 조회**: sync port + 단조 커서(H1) + 단일트랜잭션 outbox(M-OBX) + 역할별 필터 골격(H3), 다중기기 무손실 병합, 시계스큐 날짜귀속(H2), 지각분 표시. PC 웹 매출·분석 조회/편집. **M-GATE 스파이크·확정**.
- **M3 — 직원·권한 + 분석 완성**: 초대코드/PIN 합류, 입력자 기록, 역할가드(라우트+API+**pull 필터 H3 완성**), 알바 주문탭만. 매출탭 완성(큰숫자→그래프→메뉴순위→내역, 일/월/연 토글, 취소·지각 표시).
- **M4 — 수익화(MVP 외)**: entitlement 게이팅 **활성화**(무료 경계: 트럭1·메뉴N·당일매출 / 유료: 다중직원·기간분석·그래프·PC웹·내보내기), 광고 SDK를 **ad port 어댑터**로 연동(장사 시작/종료 인터스티셜 1회씩 하루2회, POS/매출/알바 절대 금지), 유료=ad-free, 구독 결제. M1~M3엔 seam·슬롯 위치만, 실제 SDK/결제는 M4.

### Acceptance Criteria 매핑
| AC | 마일스톤 | 검증 |
|---|---|---|
| 판매가·원가→원가율 자동 | M1 | unit |
| 카테고리+품절토글 POS 중지 | M1 | e2e |
| (선택)레시피→원가 자동 | M1 | unit |
| 초대코드/PIN 알바 합류 | M3 | e2e |
| 알바 주문·취소만, 매출/관리 차단 | M3 | e2e UI+API403 |
| 오프라인 메뉴탭+수량 주문 | M1 | e2e |
| 2기기 오프라인 무손실 합산 | M2 | integration 병합+단조커서 골든(H1) |
| 박제+가격변경 미소급 | M1/M2 | regression |
| 취소 이력보존+매출제외 | M1/M3 | unit fold + orphan/중복 void(M-VOID) |
| 총액 수동조정+할인메모 | M1 | unit M-MTL |
| PC·폰 일/월/연 매출·순이익 | M2/M3 | e2e |
| 지각분 날짜 자동반영+표시 | M2 | integration H2 시계스큐 골든 |
| 사장4탭/알바 주문탭만 | M3 | e2e |
| 매출탭 큰숫자→그래프→순위→내역 | M3 | e2e |
| (신규)영업세션 open/close→세션집계·날짜경계 | M1 | e2e/integration |
| (신규)광고 슬롯 세션 open/close에만, POS/매출/알바 0 | M4(슬롯 위치 M1) | e2e |
| (신규)entitlement 무료/유료 게이팅 | M4(seam M1) | unit/e2e |
| (신규)비원자 주문 방지(라인 원자) | M1/M2 | integration M-ORD |
| (신규)알바 pull 데이터 유출0 | M3 | e2e H3 |

### Ontology 추가
- **BusinessSession** (core, 이벤트): open/close, 영업일 경계 anchor, has many 주문(session_id).
- **PlanTier/Entitlement** (core): tier(free|paid) + 기능 플래그, belongs to 트럭.

### 위험 / 완화
- **다운로드 정합성(최상위)**: 단조 커서 골든 고정, 미통과 시 BUY. (H1)
- **날짜 흔들림**: 세션 경계 anchor + 이중 타임스탬프. (H2)
- **권한 유출**: 서버 역할별 pull 필터(클라 숨김 불신뢰). (H3)
- **비원자/이중쓰기**: 단일 이벤트 봉투 + 단일 트랜잭션. (M-ORD/M-OBX)
- **수익화 침습**: seam만 선매립, 광고는 세션 경계로 격리, 결제는 M4 분리.
- **build vs buy 미결**: sync port로 결정 격리 + time-box 스파이크. (M-GATE)

### 후속 작업 (handoff)
- **architect**: M-GATE 스파이크 후 build vs buy 확정, 단조 커서·역할별 pull 필터·이벤트 봉투 스키마 리뷰(M2 차단형).
- **critic**: HIGH/MEDIUM 골든이 추측 없이 실행가능한지, 수익화 seam이 MVP 침습 없는지 검증.
- **executor**: M1 슬라이스 위임(코어→로컬DB/단일트랜잭션→POS+세션→메뉴UI→entitlement seam). 통합·검증 부모.
- **ultragoal/team**: M1~M4 장기실행 시 원장 채택.
- v2/향후 백로그: 재고·레시피 자동차감, 실시간 위치, 외부결제·결제수단별 매출, 세무용 매출.
